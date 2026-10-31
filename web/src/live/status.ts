import type { DeviceState, Telemetry } from '../api/types';
export const THRESHOLDS = {
  gas: { warning: 1000, danger: 2000 },
  temperature: { min: 18, warning: 30, danger: 33 },
  humidity: { dangerMin: 30, min: 40, max: 60, dangerMax: 70 },
} as const;
export type AirStatus = DeviceState['status'];
export const STATUS = {
  0: {
    label: 'Aman',
    color: 'var(--color-safe)',
    background: 'var(--color-safe-soft)',
    tone: 'safe',
  },
  1: {
    label: 'Waspada',
    color: 'var(--color-warning)',
    background: 'var(--color-warning-soft)',
    tone: 'warning',
  },
  2: {
    label: 'Bahaya',
    color: 'var(--color-danger)',
    background: 'var(--color-danger-soft)',
    tone: 'danger',
  },
} as const;
export function gasStatus(ppm: number): AirStatus {
  return ppm > THRESHOLDS.gas.danger ? 2 : ppm > THRESHOLDS.gas.warning ? 1 : 0;
}
export function temperatureStatus(t: number): AirStatus {
  return t > THRESHOLDS.temperature.danger
    ? 2
    : t < THRESHOLDS.temperature.min || t > THRESHOLDS.temperature.warning
      ? 1
      : 0;
}
export function humidityStatus(h: number): AirStatus {
  return h < THRESHOLDS.humidity.dangerMin || h > THRESHOLDS.humidity.dangerMax
    ? 2
    : h < THRESHOLDS.humidity.min || h > THRESHOLDS.humidity.max
      ? 1
      : 0;
}
export function airStatus({
  t,
  h,
  ppm,
}: Pick<Telemetry, 't' | 'h' | 'ppm'>): AirStatus {
  return Math.max(
    gasStatus(ppm),
    temperatureStatus(t),
    humidityStatus(h),
  ) as AirStatus;
}
