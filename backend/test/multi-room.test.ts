import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import mqtt, { type MqttClient } from 'mqtt';
import pino from 'pino';
import { Store } from '../src/store.js';
import { Bridge } from '../src/bridge.js';
import {
  Telegram,
  parseTelegramCommand,
  resolveRoom,
} from '../src/telegram.js';
import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/password.js';
import { initialState } from '../src/sim/logic.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  cleanups
    .splice(0)
    .reverse()
    .forEach((clean) => clean());
});
const log = pino({ enabled: false });
const normal = { t: 27, h: 52, ppm: 650 };
const at = '2026-11-06T00:00:00.000Z';
const oldSnapshot = {
  online: true,
  state: { status: 0, fan: 0, mode: 0, led: 1, buzzer: 0, mute: 0 },
  telemetry: { ...normal, at },
  updatedAt: at,
};

function legacyDb() {
  const dir = mkdtempSync(join(tmpdir(), 'simondara-v1-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'test.db');
  const db = new Database(path);
  db.exec(`
    CREATE TABLE telemetry (at INTEGER NOT NULL, t REAL NOT NULL, h REAL NOT NULL, ppm INTEGER NOT NULL);
    CREATE INDEX telemetry_at ON telemetry(at);
    CREATE TABLE events (at INTEGER NOT NULL, type TEXT NOT NULL CHECK(type IN ('status','online')), value INTEGER NOT NULL);
    CREATE INDEX events_at ON events(at);
    CREATE TABLE snapshot (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    PRAGMA user_version=1;
  `);
  db.prepare('INSERT INTO telemetry VALUES (?,?,?,?)').run(
    Date.parse(at),
    normal.t,
    normal.h,
    normal.ppm,
  );
  db.prepare('INSERT INTO events VALUES (?,?,?)').run(
    Date.parse(at),
    'online',
    1,
  );
  db.prepare('INSERT INTO snapshot VALUES (1,?)').run(
    JSON.stringify(oldSnapshot),
  );
  db.prepare('INSERT INTO sessions VALUES (?,?)').run(
    'session-hash',
    9999999999999,
  );
  return { db, path };
}

describe('schema v2 migration', () => {
  it('preserves v1 history, events, snapshot and sessions, seeds the configured room once and reopens idempotently', () => {
    const legacy = legacyDb();
    legacy.db.close();
    let store = new Store(legacy.path, 'migrated-01');
    expect(store.db.pragma('user_version', { simple: true })).toBe(2);
    expect(store.room('migrated-01')).toMatchObject({
      name: 'Kamar 1',
      ...oldSnapshot,
    });
    expect(store.room('migrated-01')?.state?.fault).toBe(0);
    expect(
      store.history('migrated-01', at, '2026-11-06T01:00:00Z', '1m'),
    ).toEqual([{ ...normal, at }]);
    expect(store.events('migrated-01', 50)).toEqual([
      { at, type: 'online', value: 1 },
    ]);
    expect(store.db.prepare('SELECT * FROM sessions').get()).toEqual({
      id: 'session-hash',
      expires: 9999999999999,
    });
    store.renameRoom('migrated-01', 'Lantai Atas');
    store.close();
    store = new Store(legacy.path, 'different-id');
    expect(store.rooms()).toHaveLength(1);
    expect(store.room('migrated-01')?.name).toBe('Lantai Atas');
    store.deleteRoom('migrated-01');
    store.close();
    store = new Store(legacy.path, 'migrated-01');
    cleanups.push(() => store.close());
    expect(store.rooms()).toEqual([]);
  });
  it('rolls back every schema and data change if migration fails', () => {
    const legacy = legacyDb();
    legacy.db.exec('CREATE TABLE rooms (dummy TEXT)');
    legacy.db.close();
    expect(() => new Store(legacy.path, 'migrated-01')).toThrow();
    const db = new Database(legacy.path);
    cleanups.push(() => db.close());
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    expect(db.prepare('SELECT * FROM telemetry').get()).toEqual({
      at: Date.parse(at),
      ...normal,
    });
    expect(db.prepare('SELECT * FROM snapshot').get()).toEqual({
      id: 1,
      data: JSON.stringify(oldSnapshot),
    });
  });
});

describe('MQTT routing', () => {
  it('isolates devices, persists valid unregistered devices and ignores invalid topic identities', () => {
    const store = new Store(':memory:');
    cleanups.push(() => store.close());
    const bridge = new Bridge(store, log);
    const update = vi.fn();
    bridge.events.on('update', update);
    for (const topic of [
      'simondara/Bad_ID/online',
      'simondara/-bad/online',
      `simondara/${'a'.repeat(33)}/online`,
      'other/kos-01/online',
      'simondara/kos-01/online/extra',
    ])
      bridge.ingest(topic, '1');
    expect(update).not.toHaveBeenCalled();
    bridge.ingest(
      'simondara/kos-01/telemetry',
      JSON.stringify(normal),
      new Date(at),
    );
    bridge.ingest(
      'simondara/kos-01/state',
      JSON.stringify(initialState),
      new Date(at),
    );
    bridge.ingest('simondara/kos-01/online', '1', new Date(at));
    bridge.ingest(
      'simondara/kamar-02/telemetry',
      JSON.stringify({ ...normal, ppm: 2500 }),
      new Date(at),
    );
    bridge.ingest(
      'simondara/kamar-02/state',
      JSON.stringify({ ...initialState, status: 2 }),
      new Date(at),
    );
    expect(bridge.snapshot('kos-01').telemetry?.ppm).toBe(650);
    expect(bridge.snapshot('kamar-02').telemetry?.ppm).toBe(2500);
    expect(store.events('kos-01', 50)).toHaveLength(2);
    expect(store.events('kamar-02', 50)).toEqual([
      { at, type: 'status', value: 2 },
    ]);
    expect(
      store.history('kamar-02', at, '2026-11-06T01:00:00Z', '1m')[0]?.ppm,
    ).toBe(2500);
    expect(
      update.mock.calls.filter(([, data]) => data.deviceId === 'kamar-02'),
    ).toEqual([]);
    expect(store.roomList().unregistered).toEqual([
      { deviceId: 'kamar-02', lastSeen: at, online: false },
    ]);
    store.createRoom('kamar-02', 'Kamar 2');
    bridge.ingest('simondara/kamar-02/online', '1', new Date(at));
    expect(update).toHaveBeenLastCalledWith('online', {
      deviceId: 'kamar-02',
      online: true,
    });
  });
  it('subscribes to wildcard topics and publishes commands to the selected device only', async () => {
    const client = Object.assign(new EventEmitter(), {
      connected: true,
      subscribe: vi.fn(),
      publishAsync: vi.fn().mockResolvedValue(undefined),
      endAsync: vi.fn().mockResolvedValue(undefined),
    });
    vi.spyOn(mqtt, 'connect').mockReturnValue(client as unknown as MqttClient);
    const store = new Store(':memory:');
    cleanups.push(() => store.close());
    const bridge = new Bridge(store, log);
    const config = await testConfig();
    bridge.start(config);
    client.emit('connect');
    expect(client.subscribe).toHaveBeenCalledWith(
      ['simondara/+/telemetry', 'simondara/+/state', 'simondara/+/online'],
      { qos: 1 },
      expect.any(Function),
    );
    client.emit('message', 'simondara/kamar-02/online', Buffer.from('1'));
    expect(bridge.snapshot('kamar-02').online).toBe(true);
    await bridge.publish('kamar-02', { mode: 1, fan: 1 });
    expect(client.publishAsync).toHaveBeenCalledExactlyOnceWith(
      'simondara/kamar-02/cmd',
      expect.any(String),
      { qos: 1, retain: false },
    );
    expect(JSON.parse(client.publishAsync.mock.calls[0]![1])).toEqual({
      mode: 1,
      fan: 1,
    });
    client.connected = false;
    await expect(bridge.publish('kos-01', { mute: 1 })).rejects.toThrow();
    expect(client.publishAsync).toHaveBeenCalledTimes(1);
    await bridge.close();
  });
});
async function testConfig() {
  return loadConfig({
    NODE_ENV: 'test',
    DB_PATH: ':memory:',
    MQTT_URL: 'mqtt://localhost:1883',
    MQTT_USERNAME: 'backend',
    MQTT_PASSWORD: 'dev',
    ADMIN_PASSWORD_HASH: await hashPassword('test-password'),
    SESSION_SECRET: 'x'.repeat(32),
    WEB_ORIGIN: 'http://localhost:5173',
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_CHAT_ID: '123',
  });
}

describe('Telegram room commands and notifications', () => {
  it('suppresses startup and registration alerts, then reports fault changes and offline transitions per room', async () => {
    const config = await testConfig();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(at));
    const store = new Store(':memory:');
    cleanups.push(() => store.close());
    const bridge = new Bridge(store, log);
    for (const device of ['kos-01', 'kamar-02']) {
      bridge.ingest(
        `simondara/${device}/state`,
        JSON.stringify({ ...initialState, fault: 1 }),
        new Date(Date.parse(at) - 120_000),
      );
      bridge.ingest(
        `simondara/${device}/online`,
        '0',
        new Date(Date.parse(at) - 120_000),
      );
    }
    const messages: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.endsWith('/getUpdates'))
          return new Promise<Response>((_resolve, reject) => {
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
    const telegram = new Telegram(config, bridge, log);
    telegram.start();
    try {
      await vi.advanceTimersByTimeAsync(61_000);
      expect(messages).toEqual([]);
      store.createRoom('kamar-02', 'Kamar 2');
      bridge.roomsChanged();
      await vi.advanceTimersByTimeAsync(61_000);
      expect(messages).toEqual([]);
      bridge.ingest(
        'simondara/kos-01/state',
        JSON.stringify({ ...initialState, fault: 3 }),
      );
      bridge.ingest(
        'simondara/kamar-02/state',
        JSON.stringify({ ...initialState, fault: 5 }),
      );
      expect(messages).toEqual([
        'Kamar 1: Gangguan Sensor gas (MQ-135)',
        'Kamar 2: Gangguan Layar LCD',
      ]);
      bridge.ingest(
        'simondara/unregistered/state',
        JSON.stringify({ ...initialState, fault: 7 }),
      );
      expect(messages).toHaveLength(2);
      bridge.ingest(
        'simondara/kamar-02/state',
        JSON.stringify({ ...initialState, fault: 1 }),
      );
      expect(messages.at(-1)).toBe('Kamar 2: Layar LCD normal kembali');
      await telegram.handleCommand('/status');
      expect(messages.at(-1)).toContain(
        'Gangguan: Sensor suhu/kelembapan (DHT11), Sensor gas (MQ-135).',
      );
      const count = messages.length;
      bridge.ingest('simondara/kamar-02/online', '1');
      expect(messages).toHaveLength(count);
      bridge.ingest('simondara/kamar-02/online', '0');
      await vi.advanceTimersByTimeAsync(59_999);
      expect(messages).toHaveLength(count);
      await vi.advanceTimersByTimeAsync(1);
      expect(messages.at(-1)).toMatch(/^Kamar 2: .*offline/);
      bridge.ingest('simondara/kamar-02/online', '1');
      expect(messages.at(-1)).toBe(
        'Kamar 2: Perangkat SIMONDARA kembali online.',
      );
    } finally {
      await telegram.close();
    }
  });
  it('notifies registered rooms independently, prefixes names, and ignores unregistered devices', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(at));
    const store = new Store(':memory:');
    cleanups.push(() => store.close());
    store.createRoom('kamar-02', 'Kamar 2');
    const bridge = new Bridge(store, log);
    for (const device of ['kos-01', 'kamar-02']) {
      bridge.ingest(`simondara/${device}/state`, JSON.stringify(initialState));
      bridge.ingest(`simondara/${device}/online`, '1');
    }
    const messages: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.endsWith('/getUpdates'))
          return new Promise<Response>((_resolve, reject) => {
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
    const telegram = new Telegram(await testConfig(), bridge, log);
    telegram.start();
    try {
      bridge.ingest(
        'simondara/kos-01/state',
        JSON.stringify({ ...initialState, status: 2 }),
      );
      bridge.ingest(
        'simondara/unknown/state',
        JSON.stringify({ ...initialState, status: 2 }),
      );
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatch(/^Kamar 1: BAHAYA!/);
      bridge.ingest('simondara/kamar-02/online', '0');
      await vi.advanceTimersByTimeAsync(59_999);
      expect(messages).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(messages.at(-1)).toMatch(/^Kamar 2: .*offline/);
      bridge.ingest('simondara/kamar-02/online', '1');
      expect(messages.at(-1)).toBe(
        'Kamar 2: Perangkat SIMONDARA kembali online.',
      );
      bridge.ingest('simondara/kos-01/state', JSON.stringify(initialState));
      expect(messages.at(-1)).toMatch(/^Kamar 1: .*Aman/);
      store.deleteRoom('kamar-02');
      bridge.roomsChanged();
      const count = messages.length;
      bridge.ingest(
        'simondara/kamar-02/state',
        JSON.stringify({ ...initialState, status: 2 }),
      );
      bridge.ingest('simondara/kamar-02/online', '0');
      await vi.advanceTimersByTimeAsync(61_000);
      expect(messages).toHaveLength(count);
    } finally {
      await telegram.close();
    }
  });
  it('parses arguments with spaces and bot mentions, resolves case-insensitive names and IDs, and requires a target with multiple rooms', async () => {
    expect(
      parseTelegramCommand(' /kipas_on@SimondaraBot  Lantai Atas '),
    ).toEqual({ command: '/kipas_on', argument: 'Lantai Atas' });
    const store = new Store(':memory:');
    cleanups.push(() => store.close());
    const bridge = new Bridge(store, log);
    const publish = vi.spyOn(bridge, 'publish').mockResolvedValue();
    const messages: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        messages.push(JSON.parse(init.body as string).text);
        return Response.json({ ok: true, result: {} });
      }),
    );
    const telegram = new Telegram(await testConfig(), bridge, log);
    await telegram.handleCommand('/kipas_on');
    expect(publish).toHaveBeenLastCalledWith('kos-01', { mode: 1, fan: 1 });
    store.createRoom('kamar-02', 'Lantai Atas');
    expect(resolveRoom(store.rooms(), 'KAMAR-02')?.deviceId).toBe('kamar-02');
    expect(resolveRoom(store.rooms(), 'lANTAI aTAS')?.deviceId).toBe(
      'kamar-02',
    );
    publish.mockClear();
    await telegram.handleCommand('/kipas_off');
    expect(publish).not.toHaveBeenCalled();
    expect(messages.at(-1)).toContain('Lantai Atas (kamar-02)');
    await telegram.handleCommand('/kipas_off lantai ATAS');
    expect(publish).toHaveBeenLastCalledWith('kamar-02', { mode: 1, fan: 0 });
    await telegram.handleCommand('/otomatis KAMAR-02');
    expect(publish).toHaveBeenLastCalledWith('kamar-02', { mode: 0 });
    await telegram.handleCommand('/status');
    expect(messages.at(-1)).toContain('Kamar 1: SIMONDARA:');
    expect(messages.at(-1)).toContain('Lantai Atas: SIMONDARA:');
    await telegram.handleCommand('/status lantai atas');
    expect(messages.at(-1)).toMatch(/^Lantai Atas:/);
    expect(messages.at(-1)).not.toContain('Kamar 1');
    publish.mockClear();
    await telegram.handleCommand('/kipas_on unknown');
    expect(publish).not.toHaveBeenCalled();
    expect(messages.at(-1)).toContain('Kamar tidak ditemukan');
    await telegram.close();
  });
});
