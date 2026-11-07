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
      text: `Udara jadi ${STATUS[event.value].label}`,
      color: STATUS[event.value].color,
    };
  }
  return {
    text: event.value ? 'Alat tersambung lagi' : 'Alat terputus',
    color: event.value ? 'var(--color-safe)' : 'var(--color-danger)',
  };
}
export const formatNumber = (value: number, fractionDigits = 1) =>
  value.toLocaleString('id-ID', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

export const GAS_AXIS_MAX = 1500;
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
    // Batas atas 1.500 ppm agar data harian (umumnya < 1.000) tidak datar;
    // melebar per 500 ppm hanya bila ada bacaan di atasnya supaya tidak terpotong.
    const upper =
      max <= GAS_AXIS_MAX ? GAS_AXIS_MAX : Math.ceil(max / 500) * 500;
    const ticks =
      upper === GAS_AXIS_MAX
        ? [0, 500, THRESHOLDS.gas.warning, GAS_AXIS_MAX]
        : [0, THRESHOLDS.gas.warning, THRESHOLDS.gas.danger, upper].filter(
            (tick, index, all) => tick <= upper && all.indexOf(tick) === index,
          );
    return { domain: [0, upper], ticks };
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

export const BUCKET_MS: Record<HistoryBucket, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '1h': 60 * 60 * 1000,
};
export const bucketInterval = (range: HistoryRange) =>
  BUCKET_MS[RANGES[range].bucket];

export type ChartMetric = 't' | 'h' | 'ppm';
export interface ChartGap {
  from: number;
  to: number;
}
/**
 * `value: null` marks a break: the chart must not draw across it. Rows inside
 * an outage carry the outage, so hovering anywhere on it can name its span.
 */
export interface ChartRow {
  time: number;
  value: number | null;
  gap?: ChartGap;
}
/** A reading missing for longer than this many buckets counts as the device being away. */
export const GAP_FACTOR = 3;
/** Most placeholder rows spread over one outage (keeps week-long gaps cheap). */
export const MAX_GAP_ROWS = 48;

/** Median spacing between readings; the fallback when the bucket size is unknown. */
export function typicalInterval(times: number[]) {
  const steps = times
    .slice(1)
    .map((time, index) => time - times[index]!)
    .filter((step) => step > 0)
    .sort((a, b) => a - b);
  return steps.length ? steps[Math.floor(steps.length / 2)]! : 0;
}

/**
 * Time-sorted rows for one metric. Wherever two readings are further apart
 * than GAP_FACTOR × the bucket interval, the outage is returned as a gap and
 * filled with evenly spaced null rows: the line breaks instead of bridging it,
 * and the tooltip (which snaps to the nearest row) reports "no data" across
 * the whole band rather than only at its middle. A reading of 0 is a reading.
 */
export function chartSeries(
  points: HistoryPoint[],
  metric: ChartMetric,
  intervalMs?: number,
): { rows: ChartRow[]; gaps: ChartGap[] } {
  const readings = points
    .map((point) => ({ time: Date.parse(point.at), value: point[metric] }))
    .filter(
      ({ time, value }) => Number.isFinite(time) && Number.isFinite(value),
    )
    .sort((a, b) => a.time - b.time);
  const interval =
    intervalMs ?? typicalInterval(readings.map(({ time }) => time));
  const rows: ChartRow[] = [];
  const gaps: ChartGap[] = [];
  readings.forEach((reading, index) => {
    const previous = readings[index - 1];
    const span = previous ? reading.time - previous.time : 0;
    if (previous && interval > 0 && span > GAP_FACTOR * interval) {
      const gap = { from: previous.time, to: reading.time };
      gaps.push(gap);
      const count = Math.min(
        MAX_GAP_ROWS,
        Math.max(1, Math.round(span / interval) - 1),
      );
      for (let step = 1; step <= count; step += 1) {
        rows.push({
          time: previous.time + (span * step) / (count + 1),
          value: null,
          gap,
        });
      }
    }
    rows.push(reading);
  });
  return { rows, gaps };
}

export type Probe =
  | { kind: 'data'; reading: { time: number; value: number } }
  | { kind: 'empty'; from: number; to: number };

/**
 * What lies under the pointer at `time`: decided by the time itself, not by
 * the nearest row's payload. Inside an outage (up to both of its edges), or
 * before the first / after the last reading of the window, there is no data
 * and the span says how long; elsewhere the nearest reading answers.
 */
export function probeAt(
  time: number,
  rows: ChartRow[],
  gaps: ChartGap[],
  from: number,
  to: number,
): Probe | null {
  const readings = rows.filter(
    (row): row is { time: number; value: number } => row.value !== null,
  );
  const first = readings[0];
  const last = readings.at(-1);
  if (!first || !last || !Number.isFinite(time)) return null;
  if (time < first.time) return { kind: 'empty', from, to: first.time };
  if (time > last.time) return { kind: 'empty', from: last.time, to };
  const gap = gaps.find((item) => time > item.from && time < item.to);
  if (gap) return { kind: 'empty', from: gap.from, to: gap.to };
  let nearest = first;
  for (const reading of readings) {
    if (Math.abs(reading.time - time) < Math.abs(nearest.time - time))
      nearest = reading;
  }
  return { kind: 'data', reading: nearest };
}

/** "5 menit", "2 jam 10 menit", "1 hari 3 jam": a duration for the coverage note. */
export function formatDuration(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours} jam ${rest} menit` : `${hours} jam`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} hari ${restHours} jam` : `${days} hari`;
}

/** Below this share of the window, the chart offers to zoom in. */
export const SPARSE_COVERAGE = 0.25;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const TICK_STEPS = [
  5 * MINUTE,
  15 * MINUTE,
  30 * MINUTE,
  HOUR,
  2 * HOUR,
  3 * HOUR,
  6 * HOUR,
  12 * HOUR,
  DAY,
  2 * DAY,
];

/** Local midnight of the day containing `time`. */
const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0);

/**
 * Time-axis ticks for a fixed [from, to] window: the smallest "round" step
 * that gives at most `maxTicks`, aligned to the local clock (whole hours,
 * midnight), so 1 Jam reads 10.15 · 10.30, 24 Jam 06.00 · 12.00, 7 Hari dates.
 */
export function timeTicks(from: number, to: number, maxTicks = 7) {
  const span = to - from;
  if (!(span > 0)) return { step: 0, ticks: [] as number[] };
  const step =
    TICK_STEPS.find((candidate) => span / candidate <= maxTicks) ??
    Math.ceil(span / maxTicks / DAY) * DAY;
  const ticks: number[] = [];
  const origin = startOfDay(from);
  for (
    let tick = origin + Math.ceil((from - origin) / step) * step;
    tick <= to;
    tick += step
  ) {
    ticks.push(tick);
  }
  return { step, ticks };
}

export const formatDay = (value: number) =>
  new Date(value).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
  });

/** Day steps and midnights show the date, every other tick the clock time. */
export const formatTimeTick = (value: number, step: number) =>
  step >= DAY || value === startOfDay(value)
    ? formatDay(value)
    : formatTime(value);

/** "10.05–11.00" within one day, "6 Nov 14.00–7 Nov 13.55" across days. */
export function formatSpan(from: number, to: number) {
  return startOfDay(from) === startOfDay(to)
    ? `${formatTime(from)}–${formatTime(to)}`
    : `${formatDateTime(from)}–${formatDateTime(to)}`;
}

/**
 * Hard colour stops for the gas line, top (domain max) to bottom (domain min),
 * so the line is green below 1.000 ppm, amber up to 2.000 and red above.
 * Offsets come from the Y-axis domain, not the data, so a threshold always
 * changes colour exactly where its reference line is drawn.
 */
export function gasGradientStops([min, max]: [number, number]) {
  const span = max - min || 1;
  const at = (value: number) => Math.min(1, Math.max(0, (max - value) / span));
  const danger = at(THRESHOLDS.gas.danger);
  const warning = at(THRESHOLDS.gas.warning);
  return [
    { offset: 0, color: 'var(--color-danger)' },
    { offset: danger, color: 'var(--color-danger)' },
    { offset: danger, color: 'var(--color-warning)' },
    { offset: warning, color: 'var(--color-warning)' },
    { offset: warning, color: 'var(--color-safe)' },
    { offset: 1, color: 'var(--color-safe)' },
  ];
}
