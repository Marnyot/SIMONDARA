import type { HistoryPoint, Telemetry } from '../../api/types';

/** Include the newest device reading while the bucketed history catches up. */
export function withLatestReading(
  points: HistoryPoint[],
  telemetry: Telemetry | null,
  updatedAt: string | null,
): HistoryPoint[] {
  const at = telemetry?.at ?? updatedAt;
  if (!telemetry || !at || !Number.isFinite(Date.parse(at))) return points;
  const last = points.at(-1);
  if (last && Date.parse(last.at) > Date.parse(at)) return points;
  const latest = { at, t: telemetry.t, h: telemetry.h, ppm: telemetry.ppm };
  return last?.at === at
    ? [...points.slice(0, -1), latest]
    : [...points, latest];
}
