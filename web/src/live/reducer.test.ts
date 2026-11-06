import { describe, expect, it, vi } from 'vitest';
import type { Room } from '../api/types';
import { initialLiveState, liveReducer, parseLiveEvent } from './reducer';
import type { LiveState } from './reducer';

const at = '2026-10-31T00:00:00.000Z';
const later = '2026-11-01T00:00:00.000Z';
const state = {
  status: 0,
  fan: 0,
  mode: 0,
  led: 1,
  buzzer: 0,
  mute: 0,
  fault: 0,
} as const;
const room = (deviceId: string, overrides: Partial<Room> = {}): Room => ({
  deviceId,
  name: deviceId,
  createdAt: at,
  online: true,
  state,
  telemetry: { t: 28, h: 55, ppm: 800 },
  updatedAt: at,
  ...overrides,
});
const withRooms = (...rooms: Room[]): LiveState =>
  liveReducer(initialLiveState, {
    type: 'rooms',
    data: { rooms, unregistered: [] },
    source: 'snapshot',
  });
const find = (live: LiveState, deviceId: string) =>
  live.rooms.find((item) => item.deviceId === deviceId);

describe('state per kamar', () => {
  it('event hanya mengubah kamar sesuai deviceId dan mempertahankan identitas kamar lain', () => {
    const before = withRooms(room('kamar-01'), room('kamar-02'));
    const after = liveReducer(before, {
      type: 'telemetry',
      deviceId: 'kamar-02',
      data: { t: 31, h: 60, ppm: 2400, at: later },
      at,
    });
    expect(find(after, 'kamar-02')).toMatchObject({
      telemetry: { ppm: 2400 },
      updatedAt: later,
    });
    expect(find(after, 'kamar-01')).toBe(find(before, 'kamar-01'));
  });
  it('mengabaikan event perangkat yang tidak terdaftar', () => {
    const before = withRooms(room('kamar-01'));
    expect(
      liveReducer(before, {
        type: 'online',
        deviceId: 'asing',
        online: false,
        at,
      }),
    ).toBe(before);
  });
  it('snapshot ulang saat connect tidak menganggap nilai sama sebagai data baru', () => {
    const before = withRooms(room('kamar-01'));
    const replayed = liveReducer(
      liveReducer(before, {
        type: 'state',
        deviceId: 'kamar-01',
        data: state,
        at: later,
      }),
      { type: 'online', deviceId: 'kamar-01', online: true, at: later },
    );
    expect(replayed).toBe(before);
    expect(
      find(
        liveReducer(before, {
          type: 'state',
          deviceId: 'kamar-01',
          data: { ...state, fan: 1 },
          at: later,
        }),
        'kamar-01',
      ),
    ).toMatchObject({ state: { fan: 1 }, updatedAt: later });
  });
  it('koneksi berubah tanpa menghapus data kamar', () => {
    const before = withRooms(room('kamar-01'));
    const after = liveReducer(before, {
      type: 'connection',
      value: 'reconnecting',
    });
    expect(after.connection).toBe('reconnecting');
    expect(after.rooms).toBe(before.rooms);
  });
});

describe('daftar kamar', () => {
  it('daftar kosong tetap siap', () => {
    expect(withRooms()).toMatchObject({ ready: true, rooms: [] });
  });
  it('REST mengisi data awal, tetapi tidak menimpa daftar dari stream', () => {
    const rest = liveReducer(initialLiveState, {
      type: 'rooms',
      data: { rooms: [room('kamar-01')], unregistered: [] },
      source: 'rest',
    });
    expect(rest).toMatchObject({ ready: true, streamedRooms: false });
    const streamed = withRooms(room('kamar-02'));
    expect(
      liveReducer(streamed, {
        type: 'rooms',
        data: { rooms: [room('kamar-01')], unregistered: [] },
        source: 'rest',
      }),
    ).toBe(streamed);
  });
  it('event rooms mengikuti anggota terbaru dan mempertahankan pembacaan terakhir', () => {
    const before = withRooms(room('kamar-01'), room('kamar-02'));
    const after = liveReducer(before, {
      type: 'rooms',
      data: {
        rooms: [
          room('kamar-02', {
            name: 'Kamar Dua',
            state: null,
            telemetry: null,
            updatedAt: null,
          }),
        ],
        unregistered: [{ deviceId: 'kamar-03', lastSeen: at, online: true }],
      },
      source: 'stream',
    });
    expect(after.rooms).toHaveLength(1);
    expect(find(after, 'kamar-02')).toMatchObject({
      name: 'Kamar Dua',
      state,
      telemetry: { ppm: 800 },
      updatedAt: at,
    });
    expect(after.unregistered[0]?.deviceId).toBe('kamar-03');
  });
  it('hasil simpan dan hapus langsung berlaku walau stream terputus', () => {
    const before = liveReducer(withRooms(room('kamar-01')), {
      type: 'rooms',
      data: {
        rooms: [room('kamar-01')],
        unregistered: [{ deviceId: 'kamar-02', lastSeen: at, online: true }],
      },
      source: 'stream',
    });
    const added = liveReducer(before, {
      type: 'roomSaved',
      room: room('kamar-02', { state: null }),
    });
    expect(added.rooms.map(({ deviceId }) => deviceId)).toEqual([
      'kamar-01',
      'kamar-02',
    ]);
    expect(added.unregistered).toEqual([]);
    const renamed = liveReducer(added, {
      type: 'roomSaved',
      room: room('kamar-01', { name: 'Baru', telemetry: null }),
    });
    expect(find(renamed, 'kamar-01')).toMatchObject({
      name: 'Baru',
      telemetry: { ppm: 800 },
    });
    expect(
      liveReducer(renamed, { type: 'roomDeleted', deviceId: 'kamar-01' }).rooms,
    ).toHaveLength(1);
  });
});

describe('pemicu notifikasi', () => {
  const telemetry = (ppm: number) => ({
    type: 'telemetry' as const,
    deviceId: 'kamar-01',
    data: { t: 25, h: 50, ppm },
    at,
  });
  const danger = { telemetry: { t: 25, h: 50, ppm: 2500 } };
  const kinds = (live: LiveState) => live.notices.map(({ kind }) => kind);

  it('snapshot dan REST tidak memicu notifikasi, walau kondisinya Bahaya atau terputus', () => {
    const data = {
      rooms: [room('kamar-01', { ...danger, online: false })],
      unregistered: [{ deviceId: 'kamar-02', lastSeen: at, online: true }],
    };
    for (const source of ['rest', 'snapshot'] as const)
      expect(
        liveReducer(initialLiveState, { type: 'rooms', data, source }).notices,
      ).toEqual([]);
  });
  it('putaran ulang nilai setelah snapshot tidak memicu notifikasi', () => {
    const before = withRooms(room('kamar-01', { ...danger, online: false }));
    const replayed = [
      { type: 'state', deviceId: 'kamar-01', data: state, at },
      { type: 'online', deviceId: 'kamar-01', online: false, at },
      telemetry(2500),
    ] as const;
    expect(replayed.reduce(liveReducer, before).notices).toEqual([]);
  });
  it('naik ke Bahaya memberi satu notifikasi per episode sampai kembali Aman', () => {
    const live = [
      telemetry(2500),
      telemetry(2600),
      telemetry(1500),
      telemetry(2500),
    ].reduce(liveReducer, withRooms(room('kamar-01')));
    expect(kinds(live)).toEqual(['danger']);
    expect(live.notices[0]?.message).toMatch(/^kamar-01: BAHAYA — Kadar gas/);
    expect(
      kinds(liveReducer(liveReducer(live, telemetry(1500)), telemetry(500))),
    ).toEqual(['danger', 'safe']);
  });
  it('kembali Aman juga diumumkan bila Bahaya sudah berlangsung sejak snapshot', () => {
    const before = withRooms(room('kamar-01', danger));
    expect(kinds(liveReducer(before, telemetry(500)))).toEqual(['safe']);
  });
  it('Waspada biasa kembali Aman tanpa notifikasi', () => {
    const live = [telemetry(1500), telemetry(500)].reduce(
      liveReducer,
      withRooms(room('kamar-01')),
    );
    expect(live.notices).toEqual([]);
  });
  it('terputus dan kembali online memberi notifikasi', () => {
    const offline = liveReducer(withRooms(room('kamar-01')), {
      type: 'online',
      deviceId: 'kamar-01',
      online: false,
      at,
    });
    expect(kinds(offline)).toEqual(['offline']);
    expect(
      kinds(
        liveReducer(offline, {
          type: 'online',
          deviceId: 'kamar-01',
          online: true,
          at,
        }),
      ),
    ).toEqual(['offline', 'online']);
  });
  it('gangguan muncul dan pulih diumumkan per komponen, snapshot tidak', () => {
    const faulty = (fault: number) => ({
      type: 'state' as const,
      deviceId: 'kamar-01',
      data: { ...state, fault },
      at,
    });
    expect(
      liveReducer(
        withRooms(room('kamar-01', { state: { ...state, fault: 1 } })),
        faulty(1),
      ).notices,
    ).toEqual([]);
    const live = [faulty(3), faulty(1), faulty(0)].reduce(
      liveReducer,
      withRooms(room('kamar-01')),
    );
    expect(live.notices.map(({ message }) => message)).toEqual([
      'kamar-01: Gangguan Sensor suhu/kelembapan (DHT11), Sensor gas (MQ-135)',
      'kamar-01: Sensor gas (MQ-135) normal kembali',
      'kamar-01: Sensor suhu/kelembapan (DHT11) normal kembali',
    ]);
    expect(find(live, 'kamar-01')?.state?.fault).toBe(0);
    expect(liveReducer(live, faulty(4)).notices.at(-1)?.message).toBe(
      'kamar-01: Gangguan Layar LCD',
    );
  });
  it('perangkat baru diumumkan hanya saat muncul setelah snapshot', () => {
    const device = { deviceId: 'kamar-02', lastSeen: at, online: true };
    const list = {
      type: 'rooms' as const,
      data: { rooms: [room('kamar-01')], unregistered: [device] },
      source: 'stream' as const,
    };
    const live = liveReducer(withRooms(room('kamar-01')), list);
    expect(live.notices).toMatchObject([
      { kind: 'newDevice', deviceId: 'kamar-02' },
    ]);
    expect(liveReducer(live, list).notices).toHaveLength(1);
  });
  it('maksimal tiga, Bahaya bertahan, dan bisa ditutup', () => {
    const live = (['a', 'b', 'c', 'd'] as const).reduce(
      (current, deviceId, index) =>
        liveReducer(
          index === 0
            ? liveReducer(current, {
                type: 'telemetry',
                deviceId,
                data: danger.telemetry,
                at,
              })
            : current,
          { type: 'online', deviceId, online: false, at },
        ),
      withRooms(room('a'), room('b'), room('c'), room('d')),
    );
    expect(kinds(live)).toEqual(['danger', 'offline', 'offline']);
    expect(live.notices.map(({ deviceId }) => deviceId)).toEqual([
      'a',
      'c',
      'd',
    ]);
    const id = live.notices[0]!.id;
    expect(kinds(liveReducer(live, { type: 'dismissNotice', id }))).toEqual([
      'offline',
      'offline',
    ]);
  });
});

describe('parser SSE', () => {
  it('membaca deviceId pada event per kamar dan memakai waktu telemetri', () => {
    expect(
      parseLiveEvent(
        'state',
        JSON.stringify({ ...state, deviceId: 'kamar-01' }),
        at,
      ),
    ).toEqual({ type: 'state', deviceId: 'kamar-01', data: state, at });
    expect(
      parseLiveEvent(
        'online',
        JSON.stringify({ deviceId: 'kamar-01', online: false }),
        at,
      ),
    ).toEqual({ type: 'online', deviceId: 'kamar-01', online: false, at });
    const telemetry = parseLiveEvent(
      'telemetry',
      JSON.stringify({ t: 28, h: 55, ppm: 900, at, deviceId: 'kamar-01' }),
      later,
    );
    expect(telemetry).toMatchObject({
      deviceId: 'kamar-01',
      data: { ppm: 900, at },
    });
  });
  it('membaca event rooms sesuai kontrak', () => {
    const data = {
      rooms: [
        room('kos-01', { state: null, telemetry: null, updatedAt: null }),
      ],
      unregistered: [{ deviceId: 'kamar-02', lastSeen: at, online: true }],
    };
    expect(parseLiveEvent('rooms', JSON.stringify(data))).toEqual({
      type: 'rooms',
      data,
      source: 'stream',
    });
  });
  it('menolak JSON, nilai payload, dan deviceId yang salah', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const deviceId = 'kamar-01';
    expect(parseLiveEvent('telemetry', '{')).toBeNull();
    expect(
      parseLiveEvent('state', JSON.stringify({ ...state, mode: 4, deviceId })),
    ).toBeNull();
    expect(parseLiveEvent('state', JSON.stringify(state))).toBeNull();
    expect(
      parseLiveEvent(
        'online',
        JSON.stringify({ deviceId: 'Kamar_01', online: true }),
      ),
    ).toBeNull();
    expect(
      parseLiveEvent('online', JSON.stringify({ deviceId, online: 'false' })),
    ).toBeNull();
    expect(
      parseLiveEvent('rooms', JSON.stringify({ rooms: [{ deviceId }] })),
    ).toBeNull();
    expect(parseLiveEvent('unknown', '{}')).toBeNull();
  });
});
