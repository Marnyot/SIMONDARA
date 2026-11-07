import { EventEmitter } from 'node:events';
import mqtt, { type MqttClient } from 'mqtt';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from './config.js';
import {
  commandSchema,
  deviceIdSchema,
  onlineSchema,
  stateSchema,
  telemetrySchema,
  type Command,
  updateNotificationsSchema,
  updateRoomSchema,
} from './schemas.js';
import type { Store } from './store.js';

export class Bridge {
  readonly events = new EventEmitter();
  private snoozeTimer: ReturnType<typeof setTimeout> | undefined;
  private client: MqttClient | undefined;
  constructor(
    readonly store: Store,
    private readonly log: FastifyBaseLogger,
  ) {
    // Each SSE client owns one listener and removes it on close.
    this.events.setMaxListeners(0);
    this.scheduleSnooze();
  }
  start(config: Config) {
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
        ['simondara/+/telemetry', 'simondara/+/state', 'simondara/+/online'],
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
      this.ingest(topic, payload.toString('utf8'));
    });
  }
  snapshot(deviceId: string) {
    return this.store.restore(deviceId);
  }
  updateRoom(deviceId: string, patch: unknown) {
    const room = this.store.updateRoom(deviceId, updateRoomSchema.parse(patch));
    this.roomsChanged();
    return room;
  }
  updateNotifications(patch: unknown) {
    const settings = this.store.updateNotifications(
      updateNotificationsSchema.parse(patch),
    );
    this.scheduleSnooze();
    this.events.emit('update', 'notifications', settings);
    return settings;
  }
  private scheduleSnooze() {
    if (this.snoozeTimer) clearTimeout(this.snoozeTimer);
    const { snoozedUntil } = this.store.notifications();
    if (snoozedUntil) {
      this.snoozeTimer = setTimeout(
        () => {
          // Recheck the clock in case it moved backwards while the timer ran.
          if (this.store.notifications().snoozedUntil) this.scheduleSnooze();
          else this.updateNotifications({ snoozeMinutes: 0 });
        },
        Math.max(1, Date.parse(snoozedUntil) - Date.now()),
      );
      this.snoozeTimer.unref();
    }
  }
  roomsChanged() {
    this.events.emit('update', 'rooms', this.store.roomList());
  }
  ingest(topic: string, raw: string, now = new Date()) {
    const parts = topic.split('/');
    if (parts.length !== 3 || parts[0] !== 'simondara') return;
    const [, deviceId, kind] = parts;
    if (!deviceIdSchema.safeParse(deviceId).success || !deviceId || !kind)
      return;
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
    const snapshot = this.snapshot(deviceId);
    try {
      this.store.db.transaction(() => {
        if (kind === 'telemetry') {
          const telemetry = telemetrySchema.parse(parsed.data);
          const point = {
            ...telemetry,
            at: telemetry.ts ? new Date(telemetry.ts * 1000).toISOString() : at,
          };
          this.store.telemetry(deviceId, point);
          snapshot.telemetry = point;
        } else if (kind === 'state') {
          const state = stateSchema.parse(parsed.data);
          if (snapshot.state?.status !== state.status)
            this.store.event(deviceId, at, 'status', state.status);
          snapshot.state = state;
        } else {
          const online = parsed.data === '1';
          if (snapshot.online !== online || snapshot.updatedAt === null)
            this.store.event(deviceId, at, 'online', Number(online));
          snapshot.online = online;
        }
        snapshot.updatedAt = at;
        this.store.save(deviceId, snapshot);
      })();
    } catch (err) {
      this.log.error({ err }, 'Gagal menyimpan pesan MQTT');
      return;
    }
    const value =
      kind === 'online'
        ? { online: snapshot.online }
        : snapshot[kind as 'state' | 'telemetry'];
    if (this.store.room(deviceId))
      this.events.emit('update', kind, { ...value, deviceId });
    else this.roomsChanged();
  }
  async publish(deviceId: string, command: Command): Promise<void> {
    deviceIdSchema.parse(deviceId);
    const valid = commandSchema.parse(command);
    if (!this.client?.connected) throw new Error('Broker MQTT belum terhubung');
    // Never queue stale actuator commands while disconnected.
    await this.client.publishAsync(
      `simondara/${deviceId}/cmd`,
      JSON.stringify(valid),
      {
        qos: 1,
        retain: false,
      },
    );
  }
  async close() {
    if (this.snoozeTimer) clearTimeout(this.snoozeTimer);
    if (this.client) await this.client.endAsync(true);
  }
}
