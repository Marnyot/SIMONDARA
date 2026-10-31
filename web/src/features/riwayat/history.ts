import type { Event, HistoryBucket, HistoryPoint } from '../../api/types';
import { STATUS, THRESHOLDS } from '../../live/status';

export type HistoryRange = '1h' | '24h' | '7d';
export const RANGE_OPTIONS = [
  { value: '1h', label: '1 Jam' },
  { value: '24h', label: '24 Jam' },
  { value: '7d', label: '7 Hari' },
] as const;
const RANGES: Record<
  HistoryRange,
  { duration: number; bucket: HistoryBucket }
> = {
  '1h': { duration: 60 * 60 * 1000, bucket: '1m' },
  '24h': { duration: 24 * 60 * 60 * 1000, bucket: '5m' },
  '7d': { duration: 7 * 24 * 60 * 60 * 1000, bucket: '1h' },
};
export function parseRange(value: string | null): HistoryRange {
  return value === '1h' || value === '7d' ? value : '24h';
}
export function historyWindow(range: HistoryRange, now = new Date()) {
  return {
    from: new Date(now.getTime() - RANGES[range].duration).toISOString(),
    to: now.toISOString(),
    bucket: RANGES[range].bucket,
  };
}
export function describeEvent(event: Event) {
  if (event.type === 'status') {
    return {
      text: `Kualitas udara berubah ke ${STATUS[event.value].label}`,
      color: STATUS[event.value].color,
    };
  }
  return {
    text: event.value ? 'Perangkat terhubung kembali' : 'Perangkat terputus',
    color: event.value ? 'var(--color-safe)' : 'var(--color-danger)',
  };
}
export const formatNumber = (value: number, fractionDigits = 1) =>
  value.toLocaleString('id-ID', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

export function historyAxis(
  points: HistoryPoint[],
  metric: 't' | 'h' | 'ppm',
): { domain: [number, number]; ticks: number[] } {
  let min = points[0]?.[metric] ?? 0;
  let max = min;
  for (const point of points) {
    min = Math.min(min, point[metric]);
    max = Math.max(max, point[metric]);
  }
  if (metric === 'ppm') {
    const upper = Math.max(3000, Math.ceil(max / 1000) * 1000);
    return {
      domain: [0, upper],
      ticks: [0, THRESHOLDS.gas.warning, THRESHOLDS.gas.danger, upper],
    };
  }
  const lower =
    metric === 'h' ? Math.max(0, Math.floor(min - 1)) : Math.floor(min - 1);
  const upper =
    metric === 'h' ? Math.min(100, Math.ceil(max + 1)) : Math.ceil(max + 1);
  return { domain: [lower, upper], ticks: [lower, (lower + upper) / 2, upper] };
}
export const formatTime = (value: string | number) =>
  new Date(value).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
export const formatDateTime = (value: string | number) =>
  new Date(value).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
