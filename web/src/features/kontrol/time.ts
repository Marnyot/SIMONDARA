import { useEffect, useState } from 'react';

const relative = new Intl.RelativeTimeFormat('id', { numeric: 'auto' });
const absolute = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'medium',
});

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

export function formatRelativeTime(iso: string, now: number): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '—';
  const seconds = Math.round((now - time) / 1000);
  if (seconds < 10) return 'baru saja';
  for (const [unit, size] of UNITS)
    if (seconds >= size)
      return relative.format(-Math.floor(seconds / size), unit);
  return relative.format(-seconds, 'second');
}

export function formatAbsoluteTime(iso: string): string {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? '' : absolute.format(time);
}

/** Current time that re-renders the caller every `intervalMs`. */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
