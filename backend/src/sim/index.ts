import mqtt from 'mqtt';
import { z } from 'zod';
import { commandSchema, type Telemetry } from '../schemas.js';
import { Simulator } from './logic.js';

const env = z
  .object({
    MQTT_URL: z.url().default('mqtt://localhost:1883'),
    SIM_MQTT_USERNAME: z.string().default('device'),
    SIM_MQTT_PASSWORD: z.string().default('dev'),
    DEVICE_ID: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/)
      .default('kos-01'),
    SIM_SCENARIO: z
      .enum(['normal', 'naik-ke-bahaya', 'offline'])
      .default('normal'),
  })
  .parse({
    ...process.env,
    SIM_SCENARIO: process.argv[2] ?? process.env.SIM_SCENARIO,
  });
const base = `simondara/${env.DEVICE_ID}`;
const simulator = new Simulator();
let state = simulator.state;
let telemetry: Telemetry = { t: 27, h: 52, ppm: 650 };
let count = 0;
let closing = false;
const client = mqtt.connect(env.MQTT_URL, {
  clientId: `simondara-device-${env.DEVICE_ID}`,
  username: env.SIM_MQTT_USERNAME,
  password: env.SIM_MQTT_PASSWORD,
  reconnectPeriod: 2000,
  will: {
    topic: `${base}/online`,
    payload: Buffer.from('0'),
    qos: 1,
    retain: true,
  },
});
const publishState = () =>
  client.publish(`${base}/state`, JSON.stringify(state), {
    qos: 1,
    retain: true,
  });
const tick = () => {
  if (!client.connected || closing) return;
  count++;
  const rising = env.SIM_SCENARIO === 'naik-ke-bahaya';
  const walk = (value: number, amount: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value + (Math.random() - 0.5) * amount));
  telemetry = {
    t: Number(walk(telemetry.t, 0.4, 24, 29).toFixed(1)),
    h: Number(walk(telemetry.h, 1.5, 42, 58).toFixed(1)),
    ppm: rising
      ? Math.min(3500, 650 + count * 200)
      : Math.round(walk(telemetry.ppm, 60, 450, 850)),
    ts: Math.floor(Date.now() / 1000),
  };
  client.publish(`${base}/telemetry`, JSON.stringify(telemetry), {
    qos: 0,
    retain: false,
  });
  const next = simulator.evaluate(telemetry);
  const changed = JSON.stringify(next) !== JSON.stringify(state);
  state = next;
  if (changed) publishState();
  console.log(JSON.stringify({ scenario: env.SIM_SCENARIO, telemetry, state }));
  // Abrupt network loss exercises the broker's retained LWT after 30 seconds.
  if (env.SIM_SCENARIO === 'offline' && count === 4) {
    closing = true;
    clearInterval(timer);
    void client.endAsync(true);
  }
};
client.on('connect', () => {
  console.log('Simulator MQTT terhubung');
  client.subscribe(`${base}/cmd`, { qos: 1 }, (err) => {
    if (err) console.error('Subscribe cmd gagal');
  });
  client.publish(`${base}/online`, '1', { qos: 1, retain: true });
  tick();
  publishState();
});
client.on('message', (topic, raw) => {
  if (topic !== `${base}/cmd`) return;
  try {
    const command = commandSchema.parse(JSON.parse(raw.toString()));
    const next = simulator.applyCommand(command);
    if (JSON.stringify(next) !== JSON.stringify(state)) {
      state = next;
      publishState();
    }
  } catch {
    console.warn('Perintah tidak valid; diabaikan');
  }
});
client.on('error', () =>
  console.warn('Koneksi simulator MQTT gagal; mencoba ulang'),
);
const timer = setInterval(tick, 10_000);
const shutdown = async () => {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  if (client.connected)
    await client.publishAsync(`${base}/online`, '0', { qos: 1, retain: true });
  await client.endAsync(true);
};
process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});
