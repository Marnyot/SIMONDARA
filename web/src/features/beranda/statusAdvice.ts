import type { Telemetry } from '../../api/types';
import {
  airStatus,
  gasStatus,
  humidityStatus,
  temperatureStatus,
} from '../../live/status';

export function statusAdvice(telemetry: Telemetry) {
  const status = airStatus(telemetry);
  if (status === 0)
    return 'Suhu, kelembapan, dan gas masih aman. Biarkan udara tetap mengalir.';
  const causes: string[] = [];
  if (gasStatus(telemetry.ppm) === status)
    causes.push(
      status === 2 ? 'Kadar gas sangat tinggi' : 'Kadar gas mulai naik',
    );
  if (temperatureStatus(telemetry.t) === status)
    causes.push(
      telemetry.t < 18
        ? 'suhu terlalu rendah'
        : status === 2
          ? 'suhu sangat tinggi'
          : 'suhu mulai tinggi',
    );
  if (humidityStatus(telemetry.h) === status)
    causes.push(
      telemetry.h < 40
        ? 'kelembapan terlalu rendah'
        : 'kelembapan terlalu tinggi',
    );
  const cause = causes.join(', ');
  const advice =
    gasStatus(telemetry.ppm) === status
      ? status === 2
        ? 'Keluar dulu dari kamar dan buka jendela atau pintu.'
        : 'Buka jendela kalau tidak turun.'
      : status === 2
        ? 'Buka jendela sekarang dan cek kondisi kamar.'
        : 'Atur ventilasi dan pantau terus kamarnya.';
  return `${cause.charAt(0).toUpperCase()}${cause.slice(1)}. ${advice}`;
}

export function relativeUpdate(updatedAt: string, now: number) {
  const seconds = Math.max(
    0,
    Math.floor((now - new Date(updatedAt).getTime()) / 1000),
  );
  if (seconds < 10) return 'Diperbarui barusan';
  if (seconds < 60) return `Diperbarui ${seconds} detik lalu`;
  if (seconds < 3600)
    return `Diperbarui ${Math.floor(seconds / 60)} menit lalu`;
  if (seconds < 86400)
    return `Diperbarui ${Math.floor(seconds / 3600)} jam lalu`;
  return `Diperbarui ${Math.floor(seconds / 86400)} hari lalu`;
}
