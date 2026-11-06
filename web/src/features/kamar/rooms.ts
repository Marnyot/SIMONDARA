import type { z } from 'zod';
import { ApiError } from '../../api/client';
import type { Room } from '../../api/types';
import { airStatus } from '../../live/status';

export const roomUrl = (deviceId: string, page?: 'kontrol' | 'riwayat') =>
  `/kamar/${encodeURIComponent(deviceId)}${page ? `/${page}` : ''}`;

export const newRoomUrl = (deviceId: string) =>
  `/kelola?${new URLSearchParams({ deviceId })}`;

/** Same source as the room's Beranda, so a card and its room never disagree. */
export const roomStatus = ({ telemetry }: Pick<Room, 'telemetry'>) =>
  telemetry ? airStatus(telemetry) : null;

export function summarizeRooms(rooms: Room[]): string {
  if (rooms.length === 0) return 'Belum ada kamar terdaftar';
  let danger = 0;
  let warning = 0;
  let offline = 0;
  for (const room of rooms) {
    const status = roomStatus(room);
    if (status === 2) danger++;
    if (status === 1) warning++;
    if (!room.online) offline++;
  }
  const alerts = [
    danger ? `${danger} Bahaya` : '',
    warning ? `${warning} Waspada` : '',
    offline ? `${offline} terputus` : '',
  ].filter(Boolean);
  return alerts.length
    ? `${rooms.length} kamar: ${alerts.join(', ')}`
    : `${rooms.length} kamar, tidak ada peringatan`;
}

/** First validation message of a form value, or null when it is valid. */
export function fieldError(schema: z.ZodType, value: string): string | null {
  const result = schema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? null);
}

export interface RoomError {
  field?: 'deviceId' | 'name';
  message: string;
}

export function describeRoomError(cause: unknown): RoomError {
  if (cause instanceof ApiError) {
    if (cause.code === 'device_exists')
      return {
        field: 'deviceId',
        message:
          'ID perangkat ini sudah terdaftar sebagai kamar. Periksa kembali ID-nya.',
      };
    if (cause.code === 'name_exists')
      return {
        field: 'name',
        message:
          'Nama ini sudah dipakai kamar lain. Gunakan nama yang berbeda.',
      };
    if (cause.code === 'room_not_found')
      return {
        message:
          'Kamar ini sudah tidak terdaftar, mungkin baru saja dihapus. Periksa kembali daftar kamar.',
      };
    if (cause.status === 400)
      return {
        message:
          'Server menolak data kamar. Periksa ID perangkat dan nama kamar lalu coba lagi.',
      };
    return { message: cause.message };
  }
  return { message: 'Perubahan gagal disimpan. Silakan coba lagi.' };
}
