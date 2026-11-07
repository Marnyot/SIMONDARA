import { STATUS, THRESHOLDS, gasStatus } from '../live/status';

/** Default top of the gauge scale: one band above the danger threshold. */
export const GAUGE_MAX = 3000;
/** Gap between segments, as a fraction of the half circle. */
const SEGMENT_GAP = 0.012;

/** Position of a reading on the gauge, 0 (left end) to 1 (right end), clamped. */
export function gaugeFraction(ppm: number, max = GAUGE_MAX) {
  if (!Number.isFinite(ppm) || max <= 0) return 0;
  return Math.min(1, Math.max(0, ppm / max));
}

/** True when the reading lies past the right end: the marker pins there, the number stays real. */
export function gaugeOverScale(ppm: number, max = GAUGE_MAX) {
  return Number.isFinite(ppm) && ppm > max;
}

/** Band a reading falls in; the same rule (`gasStatus`) as badges, alarms and the chart. */
export const gaugeTone = (ppm: number) => STATUS[gasStatus(ppm)].tone;

export function gaugeSegments(max = GAUGE_MAX) {
  const warning = gaugeFraction(THRESHOLDS.gas.warning, max);
  const danger = gaugeFraction(THRESHOLDS.gas.danger, max);
  const half = SEGMENT_GAP / 2;
  return [
    { tone: 'safe', from: 0, to: warning - half },
    { tone: 'warning', from: warning + half, to: danger - half },
    { tone: 'danger', from: danger + half, to: 1 },
  ] as const;
}

/** Point on the upper half circle; fraction 0 is the left end, 1 the right. */
export function gaugePoint(
  fraction: number,
  radius: number,
  cx: number,
  cy: number,
) {
  const angle = Math.PI * (1 - fraction);
  return { x: cx + radius * Math.cos(angle), y: cy - radius * Math.sin(angle) };
}

/** SVG path of the arc between two fractions, drawn clockwise over the top. */
export function gaugeArc(
  from: number,
  to: number,
  radius: number,
  cx: number,
  cy: number,
) {
  const start = gaugePoint(from, radius, cx, cy);
  const end = gaugePoint(to, radius, cx, cy);
  const r = radius.toFixed(2);
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}
