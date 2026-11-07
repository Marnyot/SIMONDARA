import { afterEach, expect, it } from 'vitest';
import { request } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/password.js';
import { initialState } from '../src/sim/logic.js';

let ctx: Awaited<ReturnType<typeof buildApp>> | undefined;
afterEach(async () => {
  await ctx?.app.close();
});
it('streams contract snapshots and updates, removes disconnected listeners, and closes active streams on shutdown', async () => {
  ctx = await buildApp(
    loadConfig({
      NODE_ENV: 'test',
      DB_PATH: ':memory:',
      MQTT_URL: 'mqtt://localhost:1883',
      MQTT_USERNAME: 'backend',
      MQTT_PASSWORD: 'dev',
      ADMIN_PASSWORD_HASH: await hashPassword('test-password'),
      SESSION_SECRET: 'b'.repeat(32),
      WEB_ORIGIN: 'http://localhost:5173',
    }),
    { connectMqtt: false, logger: false },
  );
  const address = await ctx.app.listen({ port: 0, host: '127.0.0.1' });
  ctx.bridge.ingest(
    'simondara/kos-01/telemetry',
    JSON.stringify({ t: 27, h: 52, ppm: 650 }),
  );
  ctx.bridge.ingest(
    'simondara/kos-01/state',
    JSON.stringify({ ...initialState, fault: 5 }),
  );
  ctx.bridge.ingest('simondara/kos-01/online', '1');
  const login = await ctx.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { password: 'test-password' },
  });
  const cookie = (login.headers['set-cookie'] as string).split(';')[0]!;
  const connect = async () => {
    const req = request(`${address}/api/stream`, { headers: { cookie } });
    req.end();
    const [response] = await once(req, 'response');
    return response as import('node:http').IncomingMessage;
  };
  const response = await connect();
  let data = '';
  response.on('data', (chunk) => {
    data += String(chunk);
  });
  const waitFor = async (predicate: () => boolean) => {
    for (let i = 0; i < 100; i++) {
      if (predicate()) return;
      await delay(10);
    }
    throw new Error('Stream expectation timed out');
  };
  await waitFor(() => data.includes('event: telemetry'));
  expect(data).toContain(
    'event: notifications\ndata: {"enabled":true,"snoozedUntil":null}',
  );
  ctx.bridge.updateNotifications({ enabled: false });
  await waitFor(() =>
    data.includes('event: notifications\ndata: {"enabled":false'),
  );
  ctx.bridge.updateRoom('kos-01', { notify: false });
  await waitFor(() => data.includes('"notify":false'));
  expect(response.headers['content-type']).toBe('text/event-stream');
  expect(data.startsWith('event: rooms\n')).toBe(true);
  expect(data).toContain(
    `event: state\ndata: ${JSON.stringify({ ...initialState, fault: 5, deviceId: 'kos-01' })}`,
  );
  expect(data).toContain(
    'event: online\ndata: {"deviceId":"kos-01","online":true}',
  );
  expect(ctx.bridge.events.listenerCount('update')).toBe(1);
  ctx.bridge.ingest('simondara/kos-01/state', JSON.stringify(initialState));
  await waitFor(() =>
    data.includes(
      `event: state\ndata: ${JSON.stringify({ ...initialState, deviceId: 'kos-01' })}`,
    ),
  );
  ctx.bridge.ingest('simondara/kos-01/online', '0');
  await waitFor(() => data.includes('"online":false'));
  ctx.bridge.ingest(
    'simondara/new-device/telemetry',
    JSON.stringify({ t: 28, h: 51, ppm: 777 }),
  );
  await waitFor(() =>
    data.includes('"unregistered":[{"deviceId":"new-device"'),
  );
  expect(data).not.toContain('"ppm":777');
  expect(data).not.toContain(
    'event: telemetry\ndata: {"deviceId":"new-device"',
  );
  const room = await ctx.app.inject({
    method: 'POST',
    url: '/api/rooms',
    headers: { cookie },
    payload: { deviceId: 'new-device', name: 'Kamar 2' },
  });
  expect(room.statusCode).toBe(201);
  await waitFor(() => data.includes('"name":"Kamar 2"'));
  ctx.bridge.ingest(
    'simondara/new-device/telemetry',
    JSON.stringify({ t: 29, h: 51, ppm: 888 }),
  );
  await waitFor(() => data.includes('"ppm":888'));
  expect(data).toContain('"deviceId":"new-device"');
  const removed = await ctx.app.inject({
    method: 'DELETE',
    url: '/api/rooms/new-device',
    headers: { cookie },
  });
  expect(removed.statusCode).toBe(204);
  await waitFor(() => data.endsWith('"unregistered":[]}\n\n'));
  data = '';
  ctx.bridge.ingest(
    'simondara/new-device/telemetry',
    JSON.stringify({ t: 28, h: 51, ppm: 999 }),
  );
  await waitFor(() =>
    data.includes('"unregistered":[{"deviceId":"new-device"'),
  );
  expect(data).not.toContain('"ppm":999');
  response.destroy();
  await waitFor(() => ctx!.bridge.events.listenerCount('update') === 0);
  const second = await connect();
  second.resume();
  const ended = once(second, 'end');
  await ctx.app.close();
  await ended;
  expect(ctx.bridge.events.listenerCount('update')).toBe(0);
  ctx = undefined;
});
