import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/client';
import type { Room } from '../../api/types';
import { deviceIdSchema, roomNameSchema } from '../../api/types';
import { describeRoomError, fieldError, summarizeRooms } from './rooms';

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
      message: expect.stringContaining('sudah terdaftar'),
    });
    expect(describeRoomError(conflict('name_exists'))).toMatchObject({
      field: 'name',
      message: expect.stringContaining('sudah dipakai'),
    });
  });
  it('kesalahan lain menjadi pesan umum tanpa kolom', () => {
    expect(describeRoomError(new ApiError(400, 'x')).field).toBeUndefined();
    expect(describeRoomError(new Error('x')).message).toMatch(/gagal/);
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
