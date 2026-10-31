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
  ctx.bridge.ingest('telemetry', JSON.stringify({ t: 27, h: 52, ppm: 650 }));
  ctx.bridge.ingest('state', JSON.stringify(initialState));
  ctx.bridge.ingest('online', '1');
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
  expect(response.headers['content-type']).toBe('text/event-stream');
  expect(data).toContain(`event: state\ndata: ${JSON.stringify(initialState)}`);
  expect(data).toContain('event: online\ndata: {"online":true}');
  expect(ctx.bridge.events.listenerCount('update')).toBe(1);
  ctx.bridge.ingest('online', '0');
  await waitFor(() => data.includes('"online":false'));
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
