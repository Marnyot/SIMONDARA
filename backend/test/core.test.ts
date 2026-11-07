import { describe, expect, it, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import {
  commandSchema,
  historySchema,
  onlineSchema,
  snapshotSchema,
  stateSchema,
  telemetrySchema,
  type Snapshot,
} from '../src/schemas.js';
import { Store } from '../src/store.js';
import { Bridge } from '../src/bridge.js';
import { Notifications, statusText } from '../src/telegram.js';
import { initialState, statusFor, Simulator } from '../src/sim/logic.js';
import { loadConfig } from '../src/config.js';

const normal = { t: 27, h: 52, ppm: 650 };
const snapshot = (): Snapshot => ({
  online: true,
  state: { ...initialState },
  telemetry: { ...normal, at: new Date().toISOString() },
  updatedAt: null,
});
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn());
});

describe('trust boundary validation', () => {
  it('accepts contract payloads and rejects sensor failures and unsupported values', () => {
    expect(telemetrySchema.parse(normal)).toEqual(normal);
    expect(telemetrySchema.safeParse({ ...normal, ts: 0 }).success).toBe(true);
    for (const payload of [
      { ...normal, t: null },
      { ...normal, h: 101 },
      { ...normal, ppm: 2.5 },
      { ...normal, ts: -1 },
      { ...normal, t: Infinity },
    ])
      expect(telemetrySchema.safeParse(payload).success).toBe(false);
    expect(stateSchema.safeParse(initialState).success).toBe(true);
    expect(stateSchema.safeParse({ ...initialState, status: 3 }).success).toBe(
      false,
    );
    expect(onlineSchema.safeParse('1').success).toBe(true);
    expect(onlineSchema.safeParse('true').success).toBe(false);
  });
  it('allows only nonempty strict command subsets with integer enum values', () => {
    expect(commandSchema.parse({ mode: 1, fan: 1 })).toEqual({
      mode: 1,
      fan: 1,
    });
    for (const payload of [
      {},
      { status: 1 },
      { fault: 1 },
      { mode: 1, fault: 0 },
      { mode: '1' },
      { fan: true },
      { fan: 2 },
      { led: 4 },
      { buzzer: -1 },
      { mute: null },
    ])
      expect(commandSchema.safeParse(payload).success).toBe(false);
  });
  it('defaults legacy state and snapshots to fault 0 and accepts only valid fault bitmasks', () => {
    const legacy = { status: 0, fan: 0, mode: 0, led: 1, buzzer: 0, mute: 0 };
    expect(stateSchema.parse(legacy)).toEqual({ ...legacy, fault: 0 });
    expect(
      snapshotSchema.parse({ ...snapshot(), state: legacy }).state?.fault,
    ).toBe(0);
    for (let fault = 0; fault <= 7; fault++)
      expect(stateSchema.parse({ ...legacy, fault }).fault).toBe(fault);
    for (const fault of [-1, 8, 1.5, '1', null])
      expect(stateSchema.safeParse({ ...legacy, fault }).success).toBe(false);
  });
  it('fails config startup with field names but without leaking values', () => {
    expect(() => loadConfig({ SESSION_SECRET: 'private-value' })).toThrow(
      'SESSION_SECRET:',
    );
    expect(() => loadConfig({ SESSION_SECRET: 'private-value' })).not.toThrow(
      'private-value',
    );
  });
  it('requires a positive ISO history range of at most seven days', () => {
    const valid = {
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-08T00:00:00Z',
      bucket: '1h',
    };
    expect(historySchema.safeParse(valid).success).toBe(true);
    for (const payload of [
      { ...valid, to: valid.from },
      { ...valid, to: '2026-01-09T00:00:00Z' },
      { ...valid, bucket: '1s' },
      { ...valid, from: 'yesterday' },
    ])
      expect(historySchema.safeParse(payload).success).toBe(false);
  });
});

describe('SQLite history, retention and MQTT recovery', () => {
  it.each(['1m', '5m', '1h'] as const)(
    'averages samples per %s bucket, excludes upper endpoint and sorts',
    (bucket) => {
      const store = new Store(':memory:');
      cleanup.push(() => store.close());
      const size = { '1m': 60_000, '5m': 300_000, '1h': 3_600_000 }[bucket];
      const start = Date.parse('2026-01-01T00:00:00Z');
      for (const [offset, t] of [
        [size + 1, 30],
        [1000, 20],
        [2000, 24],
        [2 * size, 99],
      ]) {
        store.telemetry('kos-01', {
          at: new Date(start + offset!).toISOString(),
          t: t!,
          h: 50,
          ppm: t! * 10,
        });
      }
      const points = store.history(
        'kos-01',
        new Date(start).toISOString(),
        new Date(start + 2 * size).toISOString(),
        bucket,
      );
      expect(points).toHaveLength(2);
      expect(points[0]).toEqual({
        at: new Date(start).toISOString(),
        t: 22,
        h: 50,
        ppm: 220,
      });
      expect(points[1]?.t).toBe(30);
    },
  );
  it('ignores invalid MQTT, persists snapshots, records transitions only and prunes old telemetry', () => {
    const dir = mkdtempSync(join(tmpdir(), 'simondara-'));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, 'nested', 'test.db');
    let store = new Store(path);
    const bridge = new Bridge(store, pino({ enabled: false }));
    const listener = vi.fn();
    bridge.events.on('update', listener);
    bridge.ingest('simondara/kos-01/telemetry', 'broken');
    bridge.ingest('simondara/kos-01/state', '{}');
    bridge.ingest('simondara/kos-01/online', 'true');
    expect(listener).not.toHaveBeenCalled();
    bridge.ingest(
      'simondara/kos-01/telemetry',
      JSON.stringify({ ...normal, ts: 0 }),
    );
    bridge.ingest(
      'simondara/kos-01/state',
      JSON.stringify({ ...initialState, fault: 7 }),
    );
    bridge.ingest(
      'simondara/kos-01/state',
      JSON.stringify({ ...initialState, fault: 7 }),
    );
    bridge.ingest('simondara/kos-01/online', '1');
    bridge.ingest('simondara/kos-01/online', '1');
    expect(store.events('kos-01', 50)).toHaveLength(2);
    const expected = structuredClone(bridge.snapshot('kos-01'));
    store.close();
    store = new Store(path);
    cleanup.push(() => store.close());
    expect(store.restore('kos-01')).toEqual(expected);
    expect(store.room('kos-01')?.state?.fault).toBe(7);
    store.telemetry('kos-01', { ...normal, at: '2020-01-01T00:00:00Z' });
    store.prune();
    expect(
      store.db.prepare('SELECT COUNT(*) AS n FROM telemetry').get(),
    ).toEqual({ n: 1 });
  });
});

describe('Telegram transitions', () => {
  it('reports each changed fault bit once, including partial recovery while other faults remain', () => {
    const current = snapshot();
    current.state!.fault = 1;
    const tracker = new Notifications(current);
    expect(tracker.update(current)).toEqual([]);
    current.state!.fault = 7;
    expect(tracker.update(current)).toEqual([
      'Sensor gas (MQ-135) bermasalah',
      'Layar LCD bermasalah',
    ]);
    expect(tracker.update(current)).toEqual([]);
    current.state!.fault = 2;
    expect(tracker.update(current)).toEqual([
      'Sensor suhu/kelembapan (DHT11) sudah normal lagi',
      'Layar LCD sudah normal lagi',
    ]);
    current.state!.fault = 1;
    expect(tracker.update(current)).toEqual([
      'Sensor suhu/kelembapan (DHT11) bermasalah',
      'Sensor gas (MQ-135) sudah normal lagi',
    ]);
    current.state!.fault = 0;
    expect(tracker.update(current)).toEqual([
      'Sensor suhu/kelembapan (DHT11) sudah normal lagi',
    ]);
    expect(tracker.update(current)).toEqual([]);
  });
  it('includes only active faults in status text', () => {
    const current = snapshot();
    expect(statusText(current)).not.toContain('Bermasalah');
    current.state!.fault = 5;
    expect(statusText(current)).toContain(
      'Bermasalah: Sensor suhu/kelembapan (DHT11), Layar LCD.',
    );
    expect(statusText(current)).not.toContain('MQ-135');
  });
  it('ignores existing offline snapshots until an online-to-offline transition is observed', () => {
    const current = snapshot();
    current.online = false;
    current.updatedAt = new Date(0).toISOString();
    const tracker = new Notifications(current);
    expect(tracker.update(current, 120_000)).toEqual([]);
    current.updatedAt = new Date(180_000).toISOString();
    expect(tracker.update(current, 300_000)).toEqual([]);
    current.online = true;
    expect(tracker.update(current, 310_000)).toEqual([]);
    current.online = false;
    expect(tracker.update(current, 320_000)).toEqual([]);
    expect(tracker.update(current, 379_999)).toEqual([]);
    expect(tracker.update(current, 380_000)[0]).toContain(
      'terputus lebih dari 1 menit',
    );
  });
  it('alerts danger and normal only after a danger episode, including recovery through warning', () => {
    const current = snapshot();
    const tracker = new Notifications(current);
    current.state!.status = 1;
    expect(tracker.update(current)).toEqual([]);
    current.state!.status = 0;
    expect(tracker.update(current)).toEqual([]);
    current.state!.status = 2;
    expect(tracker.update(current)[0]).toBe(
      'BAHAYA! Udara di kamar sedang buruk. Kipas exhaust sudah nyala otomatis. Suhu 27.0 °C, kelembapan 52.0%, gas 650 ppm.',
    );
    expect(tracker.update(current)).toEqual([]);
    current.state!.status = 1;
    expect(tracker.update(current)).toEqual([]);
    current.state!.status = 0;
    expect(tracker.update(current)[0]).toBe(
      'Udara sudah aman lagi. Suhu 27.0 °C, kelembapan 52.0%, gas 650 ppm.',
    );
    expect(tracker.update(current)).toEqual([]);
  });
  it('does not claim automatic fan activation when danger begins in manual mode', () => {
    const current = snapshot();
    const tracker = new Notifications(current);
    current.state!.mode = 1;
    current.state!.status = 2;
    const message = tracker.update(current)[0];
    expect(message).toContain(
      'BAHAYA! Udara di kamar sedang buruk. Mode manual aktif, nyalakan kipas exhaust dari aplikasi atau /kipas_on.',
    );
    expect(message).not.toContain('diaktifkan otomatis');
    expect(message).toContain('650 ppm');
  });
  it('suppresses short disconnects and sends one offline and one recovery after 60 seconds', () => {
    const current = snapshot();
    const tracker = new Notifications(current);
    current.online = false;
    expect(tracker.update(current, 0)).toEqual([]);
    expect(tracker.update(current, 59_999)).toEqual([]);
    current.online = true;
    expect(tracker.update(current, 60_000)).toEqual([]);
    current.online = false;
    tracker.update(current, 70_000);
    expect(tracker.update(current, 130_000)[0]).toContain(
      'terputus lebih dari 1 menit',
    );
    expect(tracker.update(current, 140_000)).toEqual([]);
    current.online = true;
    expect(tracker.update(current, 150_000)[0]).toContain('tersambung lagi');
  });
});

describe('simulator firmware rules', () => {
  it.each([
    [{ t: 18, h: 40, ppm: 1000 }, 0],
    [{ t: 30, h: 60, ppm: 1000 }, 0],
    [{ t: 17, h: 50, ppm: 500 }, 1],
    [{ t: 33, h: 70, ppm: 2000 }, 1],
    [{ t: 34, h: 50, ppm: 500 }, 2],
    [{ t: 25, h: 29, ppm: 500 }, 2],
    [{ t: 25, h: 71, ppm: 500 }, 2],
    [{ t: 25, h: 50, ppm: 2001 }, 2],
  ] as const)('uses the worst parameter for %j', (telemetry, expected) => {
    expect(statusFor(telemetry)).toBe(expected);
  });
  it('holds a separate gas latch across both directions of the 900–1000 band', () => {
    const sim = new Simulator();
    expect(sim.evaluate({ ...normal, ppm: 1000 }).fan).toBe(0);
    expect(sim.evaluate({ ...normal, ppm: 1001 }).fan).toBe(1);
    for (const ppm of [1000, 950, 900])
      expect(sim.evaluate({ ...normal, ppm }).fan).toBe(1);
    expect(sim.evaluate({ ...normal, ppm: 899 }).fan).toBe(0);
    expect(sim.evaluate({ ...normal, ppm: 950 }).fan).toBe(0);
    // A fan forced on by danger must not set the independent gas latch.
    expect(sim.evaluate({ ...normal, t: 34, ppm: 950 }).fan).toBe(1);
    expect(sim.evaluate({ ...normal, ppm: 950 }).fan).toBe(0);
  });
  it('preserves a running fan for temperature warning even with gas below 900', () => {
    const sim = new Simulator();
    sim.evaluate({ ...normal, t: 34 });
    expect(sim.evaluate({ ...normal, t: 31 })).toMatchObject({
      status: 1,
      fan: 1,
      led: 2,
      buzzer: 0,
    });
    expect(sim.evaluate(normal).fan).toBe(0);
  });
  it('resets mute only on return to safe and applies commands after mode selection', () => {
    const sim = new Simulator();
    expect(sim.evaluate({ ...normal, t: 34 })).toMatchObject({
      fan: 1,
      led: 3,
      buzzer: 1,
    });
    expect(
      sim.applyCommand({ fan: 0, led: 0, buzzer: 0, mute: 1 }),
    ).toMatchObject({ fan: 1, led: 3, buzzer: 0, mute: 1 });
    expect(sim.evaluate({ ...normal, t: 31 }).mute).toBe(1);
    expect(sim.evaluate(normal).mute).toBe(0);
    expect(sim.applyCommand({ mute: 1 }).mute).toBe(1);
    expect(sim.evaluate(normal).mute).toBe(1);
    expect(
      sim.applyCommand({ mode: 1, fan: 1, led: 2, buzzer: 1 }),
    ).toMatchObject({ mode: 1, fan: 1, led: 2, buzzer: 1 });
    sim.evaluate({ ...normal, ppm: 1500 });
    sim.evaluate({ ...normal, ppm: 950 });
    expect(sim.applyCommand({ mode: 0, fan: 0 })).toMatchObject({
      mode: 0,
      fan: 1,
      led: 1,
      buzzer: 0,
    });
    sim.applyCommand({ mode: 1, mute: 1 });
    sim.evaluate({ ...normal, t: 31 });
    expect(sim.evaluate(normal).mute).toBe(0);
  });
});
