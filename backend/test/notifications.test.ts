import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { Store } from '../src/store.js';
import { Bridge } from '../src/bridge.js';
import { Telegram, parseTelegramCommand } from '../src/telegram.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/password.js';
import { initialState } from '../src/sim/logic.js';

const log = pino({ enabled: false });
const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const config = () =>
  loadConfig({
    NODE_ENV: 'test',
    DB_PATH: ':memory:',
    MQTT_URL: 'mqtt://localhost:1883',
    MQTT_USERNAME: 'backend',
    MQTT_PASSWORD: 'dev',
    ADMIN_PASSWORD_HASH: `scrypt$${'a'.repeat(32)}$${'b'.repeat(128)}`,
    SESSION_SECRET: 'a'.repeat(32),
    WEB_ORIGIN: 'http://localhost:5173',
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_CHAT_ID: '123',
  });
function fixture() {
  const store = new Store(':memory:');
  const bridge = new Bridge(store, log);
  cleanups.push(
    () => store.close(),
    () => bridge.close(),
  );
  return { store, bridge };
}
function mockTelegram() {
  const messages: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/getUpdates'))
        return new Promise<Response>((_, reject) => {
          init.signal!.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            { once: true },
          );
        });
      messages.push(JSON.parse(init.body as string).text);
      return Response.json({ ok: true, result: {} });
    }),
  );
  return messages;
}

describe('persistent notification settings', () => {
  it('migrates v2 defaults without losing rooms, then preserves settings on repeated restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'simondara-notify-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, 'test.db');
    const db = new Database(path);
    db.exec(`CREATE TABLE rooms (device_id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
      CREATE TABLE snapshot (device_id TEXT PRIMARY KEY, data TEXT NOT NULL);
      INSERT INTO rooms VALUES ('existing','Existing','existing','2026-11-01T00:00:00Z');
      PRAGMA user_version=2;`);
    db.close();
    let store = new Store(path);
    expect(store.db.pragma('user_version', { simple: true })).toBe(3);
    expect(store.rooms()).toHaveLength(1);
    expect(store.room('existing')?.notify).toBe(true);
    expect(store.notifications()).toEqual({
      enabled: true,
      snoozedUntil: null,
    });
    store.updateRoom('existing', { notify: false });
    const settings = store.updateNotifications({
      enabled: false,
      snoozeMinutes: 60,
    });
    store.close();
    store = new Store(path);
    cleanups.push(() => store.close());
    expect(store.room('existing')?.notify).toBe(false);
    expect(store.notifications()).toEqual(settings);
  });

  it('restores a deadline after restart, emits expiry once, and cancels/reschedules the timer', async () => {
    vi.useFakeTimers();
    const { store, bridge } = fixture();
    bridge.updateNotifications({ snoozeMinutes: 15 });
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await bridge.close();
    const restored = new Bridge(store, log);
    cleanups.push(() => restored.close());
    const update = vi.fn();
    restored.events.on('update', update);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(update).toHaveBeenCalledExactlyOnceWith('notifications', {
      enabled: true,
      snoozedUntil: null,
    });
    restored.updateNotifications({ snoozeMinutes: 15 });
    restored.updateNotifications({ snoozeMinutes: 30 });
    update.mockClear();
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(update).not.toHaveBeenCalled();
    restored.updateNotifications({ snoozeMinutes: 0 });
    update.mockClear();
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(update).not.toHaveBeenCalled();
    store.updateNotifications({ snoozeMinutes: 15 });
    await vi.advanceTimersByTimeAsync(16 * 60_000);
    expect(store.notifications().snoozedUntil).toBeNull();
  });
});

it('validates authenticated notification and room PATCH requests and emits contract events', async () => {
  const cfg = config();
  cfg.ADMIN_PASSWORD_HASH = await hashPassword('test-password');
  const { app, bridge, store } = await buildApp(cfg, {
    connectMqtt: false,
    logger: false,
  });
  cleanups.push(() => app.close());
  expect((await app.inject('/api/notifications')).statusCode).toBe(401);
  expect(
    (
      await app.inject({
        method: 'PATCH',
        url: '/api/notifications',
        payload: { enabled: false },
      })
    ).statusCode,
  ).toBe(401);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { password: 'test-password' },
  });
  const headers = {
    cookie: (login.headers['set-cookie'] as string).split(';')[0]!,
  };
  const patch = (url: string, payload: object) =>
    app.inject({ method: 'PATCH', url, headers, payload });
  expect(
    (await app.inject({ url: '/api/notifications', headers })).json(),
  ).toEqual({ enabled: true, snoozedUntil: null });
  for (const payload of [
    {},
    { enabled: 1 },
    { snoozeMinutes: '15' },
    { snoozeMinutes: -1 },
    { snoozeMinutes: 14 },
    { snoozeMinutes: 1441 },
    { snoozeMinutes: 15.5 },
    { unknown: true },
  ]) {
    expect((await patch('/api/notifications', payload)).statusCode).toBe(400);
  }
  const update = vi.fn();
  bridge.events.on('update', update);
  for (const minutes of [15, 1440, 0]) {
    const response = await patch('/api/notifications', {
      enabled: false,
      snoozeMinutes: minutes,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      enabled: false,
      snoozedUntil: minutes ? expect.any(String) : null,
    });
    expect(update).toHaveBeenLastCalledWith('notifications', response.json());
  }
  for (const payload of [
    {},
    { notify: 0 },
    { notify: 'false' },
    { extra: true },
  ])
    expect((await patch('/api/rooms/kos-01', payload)).statusCode).toBe(400);
  const room = await patch('/api/rooms/kos-01', {
    name: 'Renamed',
    notify: false,
  });
  expect(room.statusCode).toBe(200);
  expect(room.json()).toMatchObject({ name: 'Renamed', notify: false });
  expect(update).toHaveBeenLastCalledWith('rooms', store.roomList());
  expect(
    (await patch('/api/rooms/missing', { notify: false })).statusCode,
  ).toBe(404);
  store.createRoom('second', 'Second');
  expect(
    (await patch('/api/rooms/kos-01', { name: 'Second', notify: true }))
      .statusCode,
  ).toBe(409);
  expect(store.room('kos-01')?.notify).toBe(false);
});

it.each(['global', 'snooze', 'room'])(
  'discards all automatic transitions while %s blocks delivery without replaying on enable',
  async (gate) => {
    vi.useFakeTimers();
    const { store, bridge } = fixture();
    bridge.ingest('simondara/kos-01/state', JSON.stringify(initialState));
    bridge.ingest('simondara/kos-01/online', '1');
    const messages = mockTelegram();
    const telegram = new Telegram(config(), bridge, log);
    cleanups.push(() => telegram.close());
    telegram.start();
    if (gate === 'global') bridge.updateNotifications({ enabled: false });
    if (gate === 'snooze') bridge.updateNotifications({ snoozeMinutes: 15 });
    if (gate === 'room') bridge.updateRoom('kos-01', { notify: false });
    bridge.ingest(
      'simondara/kos-01/state',
      JSON.stringify({ ...initialState, status: 2, fault: 7 }),
    );
    bridge.ingest('simondara/kos-01/online', '0');
    await vi.advanceTimersByTimeAsync(61_000);
    bridge.ingest('simondara/kos-01/state', JSON.stringify(initialState));
    bridge.ingest('simondara/kos-01/online', '1');
    expect(messages).toEqual([]);
    bridge.ingest(
      'simondara/kos-01/state',
      JSON.stringify({ ...initialState, status: 2 }),
    );
    bridge.updateNotifications({ enabled: true, snoozeMinutes: 0 });
    bridge.updateRoom('kos-01', { notify: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(messages).toEqual([]);
    bridge.ingest('simondara/kos-01/state', JSON.stringify(initialState));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('aman lagi');
    expect(
      store.events('kos-01', 50).filter((event) => event.type === 'status'),
    ).toHaveLength(5);
  },
);

it('handles bot switches, room names/mentions, snooze bounds and status/help even while disabled', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-07T10:40:00Z'));
  const { store, bridge } = fixture();
  store.createRoom('upstairs', 'Lantai Atas');
  const messages = mockTelegram();
  const telegram = new Telegram(config(), bridge, log);
  cleanups.push(() => telegram.close());
  expect(parseTelegramCommand('/notif_off@SimondaraBot Lantai Atas')).toEqual({
    command: '/notif_off',
    argument: 'Lantai Atas',
  });
  await telegram.handleCommand('/notif_off');
  expect(store.notifications().enabled).toBe(false);
  expect(store.room('kos-01')?.notify).toBe(true);
  await telegram.handleCommand('/notif_off@SimondaraBot lantai ATAS');
  expect(store.room('upstairs')?.notify).toBe(false);
  await telegram.handleCommand('/notif_jeda');
  expect(messages.at(-1)).toContain('Dijeda sampai 18.40 WIB.');
  await telegram.handleCommand('/status upstairs');
  expect(messages.at(-1)).toContain('Dijeda sampai 18.40 WIB.');
  expect(
    Date.parse(store.notifications().snoozedUntil!) - Date.now(),
  ).toBeGreaterThan(59 * 60_000);
  for (const invalid of ['14', '1441', '-1', '15.5', '15abc', '15 20']) {
    await telegram.handleCommand(`/notif_jeda ${invalid}`);
    expect(messages.at(-1)).toContain('15 sampai 1440 menit');
  }
  await telegram.handleCommand('/notif_jeda 1440');
  await telegram.handleCommand('/status');
  expect(messages.at(-1)).toContain('Notifikasi: mati');
  expect(messages.at(-1)).toContain('Dijeda sampai Min, 8 Nov 17.40 WIB.');
  expect(messages.at(-1)).toContain('Dimatikan untuk: Lantai Atas');
  await telegram.handleCommand('/notif_on UPSTAIRS');
  expect(store.room('upstairs')?.notify).toBe(true);
  await telegram.handleCommand('/notif_on unknown');
  expect(messages.at(-1)).toContain('Kamarnya tidak ada');
  await telegram.handleCommand('/notif_jeda 0');
  expect(store.notifications().snoozedUntil).toBeNull();
  await telegram.handleCommand('/notif_on');
  expect(store.notifications().enabled).toBe(true);
  await telegram.handleCommand('/help');
  expect(messages.at(-1)).toContain('/notif_jeda');
});
