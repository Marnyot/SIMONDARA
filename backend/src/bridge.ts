import { EventEmitter } from 'node:events';
import mqtt, { type MqttClient } from 'mqtt';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from './config.js';
import {
  commandSchema,
  onlineSchema,
  stateSchema,
  telemetrySchema,
  type Command,
  type Snapshot,
} from './schemas.js';
import type { Store } from './store.js';

export class Bridge {
  readonly events = new EventEmitter();
  readonly snapshot: Snapshot;
  private client: MqttClient | undefined;
  private commandTopic = '';
  constructor(
    private readonly store: Store,
    private readonly log: FastifyBaseLogger,
  ) {
    this.snapshot = store.restore();
    // Each SSE client owns one listener and removes it on close.
    this.events.setMaxListeners(0);
  }
  start(config: Config) {
    const base = `simondara/${config.DEVICE_ID}`;
    this.commandTopic = `${base}/cmd`;
    this.client = mqtt.connect(config.MQTT_URL, {
      username: config.MQTT_USERNAME,
      password: config.MQTT_PASSWORD,
      clientId: `simondara-backend-${config.DEVICE_ID}`,
      reconnectPeriod: 2000,
      connectTimeout: 15_000,
      keepalive: 30,
      queueQoSZero: false,
    });
    this.client.on('connect', () => {
      this.log.info('MQTT terhubung');
      this.client!.subscribe(
        [`${base}/telemetry`, `${base}/state`, `${base}/online`],
        { qos: 1 },
        (err, granted) => {
          if (err || granted?.some((item) => Number(item.qos) === 128))
            this.log.error('Subscribe MQTT gagal');
        },
      );
    });
    this.client.on('reconnect', () => this.log.info('MQTT reconnect'));
    this.client.on('error', () =>
      this.log.warn('Koneksi MQTT gagal; akan dicoba ulang'),
    );
    this.client.on('message', (topic, payload) => {
      if (!topic.startsWith(`${base}/`)) return;
      this.ingest(topic.slice(base.length + 1), payload.toString('utf8'));
    });
  }
  ingest(kind: string, raw: string, now = new Date()) {
    if (!['telemetry', 'state', 'online'].includes(kind)) return;
    if (Buffer.byteLength(raw) > 16_384) {
      this.log.warn({ kind }, 'Payload MQTT terlalu besar; diabaikan');
      return;
    }
    const at = now.toISOString();
    let data: unknown;
    try {
      data = kind === 'online' ? raw : JSON.parse(raw);
    } catch {
      this.log.warn({ kind }, 'Payload MQTT bukan JSON valid; diabaikan');
      return;
    }
    const parsed = (
      kind === 'online'
        ? onlineSchema
        : kind === 'state'
          ? stateSchema
          : telemetrySchema
    ).safeParse(data);
    if (!parsed.success) {
      this.log.warn(
        { kind, issues: parsed.error.issues },
        'Payload MQTT tidak valid; diabaikan',
      );
      return;
    }
    try {
      this.store.db.transaction(() => {
        if (kind === 'telemetry') {
          const telemetry = telemetrySchema.parse(parsed.data);
          const point = {
            ...telemetry,
            at: telemetry.ts ? new Date(telemetry.ts * 1000).toISOString() : at,
          };
          this.store.telemetry(point);
          this.snapshot.telemetry = point;
        } else if (kind === 'state') {
          const state = stateSchema.parse(parsed.data);
          if (this.snapshot.state?.status !== state.status)
            this.store.event(at, 'status', state.status);
          this.snapshot.state = state;
        } else {
          const online = parsed.data === '1';
          if (
            this.snapshot.online !== online ||
            this.snapshot.updatedAt === null
          )
            this.store.event(at, 'online', Number(online));
          this.snapshot.online = online;
        }
        this.snapshot.updatedAt = at;
        this.store.save(this.snapshot);
      })();
    } catch (err) {
      this.log.error({ err }, 'Gagal menyimpan pesan MQTT');
      Object.assign(this.snapshot, this.store.restore());
      return;
    }
    const value =
      kind === 'online'
        ? { online: this.snapshot.online }
        : this.snapshot[kind as 'state' | 'telemetry'];
    this.events.emit('update', kind, value);
  }
  async publish(command: Command): Promise<void> {
    const valid = commandSchema.parse(command);
    if (!this.client?.connected) throw new Error('Broker MQTT belum terhubung');
    // Never queue stale actuator commands while disconnected.
    await this.client.publishAsync(this.commandTopic, JSON.stringify(valid), {
      qos: 1,
      retain: false,
    });
  }
  async close() {
    if (this.client) await this.client.endAsync(true);
  }
}
