import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/client';
import type { Room } from '../../api/types';
import { deviceIdSchema, roomNameSchema } from '../../api/types';
import {
  countRooms,
  sortRooms,
  describeRoomError,
  fieldError,
  summarizeRooms,
} from './rooms';

describe('validasi form kamar', () => {
  it.each(['kamar-02', 'kos-01', '0', 'a'.repeat(32), '  kamar-02  '])(
    'menerima ID perangkat %s',
    (value) => expect(fieldError(deviceIdSchema, value)).toBeNull(),
  );
  it.each(['-kamar', 'Kamar-02', 'kamar_02', 'kamar 02', 'a'.repeat(33)])(
    'menolak ID perangkat %s',
    (value) => expect(fieldError(deviceIdSchema, value)).toMatch(/huruf kecil/),
  );
  it('ID dan nama kosong memberi pesan wajib diisi', () => {
    expect(fieldError(deviceIdSchema, '')).toMatch(/wajib/);
    expect(fieldError(roomNameSchema, '   ')).toMatch(/wajib/);
  });
  it('panjang nama dihitung setelah trim, 1 sampai 40 karakter', () => {
    expect(fieldError(roomNameSchema, `  ${'a'.repeat(40)}  `)).toBeNull();
    expect(fieldError(roomNameSchema, 'a'.repeat(41))).toMatch(/40 karakter/);
  });
});

describe('error server kamar', () => {
  const conflict = (code: string) =>
    new ApiError(409, 'Permintaan gagal (409).', undefined, code);
  it('409 diarahkan ke kolom yang bermasalah dengan pesan Indonesia', () => {
    expect(describeRoomError(conflict('device_exists'))).toMatchObject({
      field: 'deviceId',
      message: expect.stringContaining('sudah dipakai kamar lain'),
    });
    expect(describeRoomError(conflict('name_exists'))).toMatchObject({
      field: 'name',
      message: expect.stringContaining('sudah dipakai'),
    });
  });
  it('kesalahan lain menjadi pesan umum tanpa kolom', () => {
    expect(describeRoomError(new ApiError(400, 'x')).field).toBeUndefined();
    expect(describeRoomError(new Error('x')).message).toMatch(/gagal/i);
  });
});

it('ringkasan menyebut hanya kondisi yang perlu perhatian', () => {
  const room = (ppm: number, online = true) =>
    ({ online, telemetry: { t: 25, h: 50, ppm } }) as Room;
  expect(summarizeRooms([])).toBe('Belum ada kamar terdaftar');
  expect(summarizeRooms([room(500), room(500)])).toBe(
    '2 kamar, tidak ada peringatan',
  );
  expect(summarizeRooms([room(2500), room(1500), room(500, false)])).toBe(
    '3 kamar: 1 Bahaya, 1 Waspada, 1 terputus',
  );
});

describe('prioritas dan ringkasan kamar', () => {
  const room = (name: string, ppm = 500, online = true, fault = 0): Room => ({
    name,
    deviceId: name,
    online,
    telemetry: { t: 25, h: 50, ppm },
    state: { status: 0, fan: 0, mode: 0, led: 1, buzzer: 0, mute: 0, fault },
    updatedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
  });
  it('bahaya > terputus > gangguan > waspada > aman, lalu nama; tidak memutasi input', () => {
    const rooms = [
      room('Aman 10'),
      room('Waspada', 1500),
      room('Gangguan', 1500, true, 2),
      room('Terputus', 1500, false),
      room('Bahaya', 2500, false, 1),
      room('Aman 2'),
    ];
    const original = [...rooms];
    expect(sortRooms(rooms).map(({ name }) => name)).toEqual([
      'Bahaya',
      'Terputus',
      'Gangguan',
      'Waspada',
      'Aman 2',
      'Aman 10',
    ]);
    expect(rooms).toEqual(original);
  });
  it('menghitung status udara terpisah dari koneksi dan gangguan', () => {
    expect(
      countRooms([
        room('a', 2500, false, 3),
        room('b', 1500),
        room('c'),
        { ...room('d'), telemetry: null },
      ]),
    ).toEqual({
      danger: 1,
      warning: 1,
      safe: 1,
      offline: 1,
      fault: 1,
      pending: 1,
    });
    expect(sortRooms([])).toEqual([]);
  });
});
