import { useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
  useYAxisScale,
} from 'recharts';
import type { HistoryPoint } from '../../api/types';
import { LevelMeter } from '../../components/LevelMeter';
import { STATUS, THRESHOLDS, gasStatus } from '../../live/status';
import {
  chartSeries,
  formatDay,
  formatDuration,
  formatNumber,
  formatSpan,
  formatTime,
  formatTimeTick,
  gasGradientStops,
  historyAxis,
  probeAt,
  SPARSE_COVERAGE,
  timeTicks,
} from './history';
import type { ChartGap, ChartMetric, ChartRow } from './history';
import styles from './SensorChart.module.css';

const METRICS: Record<
  ChartMetric,
  { label: string; unit: string; color: string; digits: number }
> = {
  t: { label: 'Suhu', unit: '°C', color: 'var(--color-primary)', digits: 1 },
  h: {
    label: 'Kelembapan',
    unit: '%',
    color: 'var(--color-chart-alt)',
    digits: 1,
  },
  ppm: { label: 'Kadar Gas', unit: 'ppm', color: '', digits: 0 },
};

/** Gas colour bands, anchored to the Y-axis pixels so they meet the threshold lines. */
function GasGradient({ id, domain }: { id: string; domain: [number, number] }) {
  const scale = useYAxisScale();
  if (!scale) return null;
  return (
    <defs>
      <linearGradient
        id={id}
        gradientUnits="userSpaceOnUse"
        x1="0"
        x2="0"
        y1={scale(domain[1])}
        y2={scale(domain[0])}
      >
        {gasGradientStops(domain).map(({ offset, color }, index) => (
          <stop key={index} offset={offset} style={{ stopColor: color }} />
        ))}
      </linearGradient>
    </defs>
  );
}

function ChartTooltip({
  active,
  pointerX,
  coordinate,
  metric,
  rows,
  gaps,
  from,
  to,
}: {
  active?: boolean;
  /** Pointer x within the chart (SVG space); `null` for keyboard navigation. */
  pointerX: number | null;
  /** Snapped x of the active row: the fallback without a pointer. */
  coordinate?: { x?: number };
  metric: ChartMetric;
  rows: ChartRow[];
  gaps: ChartGap[];
  from: number;
  to: number;
}) {
  const plot = usePlotArea();
  const x = pointerX ?? coordinate?.x;
  if (!active || !plot || x == null || !(plot.width > 0)) return null;
  // The pointer's own time decides, not the nearest row's payload.
  const time = from + ((x - plot.x) / plot.width) * (to - from);
  const probe = probeAt(time, rows, gaps, from, to);
  if (!probe) return null;
  const { unit, digits } = METRICS[metric];
  if (probe.kind === 'empty') {
    return (
      <div className={styles.tooltip}>
        <p className={styles.tooltipEmpty}>Tidak ada data</p>
        <p className={styles.tooltipTime}>
          <strong>{formatSpan(probe.from, probe.to)}</strong>
        </p>
        <p className={styles.tooltipTime}>Tidak ada data di jam ini</p>
      </div>
    );
  }
  const { time: at, value } = probe.reading;
  const status = metric === 'ppm' ? STATUS[gasStatus(value)] : null;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipTime}>
        <strong>{formatTime(at)}</strong> {formatDay(at)}
      </p>
      <p className={styles.tooltipValue}>
        <strong>{formatNumber(value, digits)}</strong>
        <span>{unit}</span>
      </p>
      {status ? (
        <LevelMeter name="Kadar gas" status={gasStatus(value)} />
      ) : null}
    </div>
  );
}

export default function SensorChart({
  points,
  metric,
  from,
  to,
  intervalMs,
  zoomAction,
}: {
  points: HistoryPoint[];
  metric: ChartMetric;
  /** The requested window (epoch ms): the time axis always spans all of it. */
  from: number;
  to: number;
  /** Bucket size of `points`; a silence longer than 3 buckets breaks the line. Inferred when omitted. */
  intervalMs?: number;
  /** Shown beside the "Baru … data tersedia" note when little of the window has data. */
  zoomAction?: ReactNode;
}) {
  const uid = useId().replace(/:/g, '');
  const [pointerX, setPointerX] = useState<number | null>(null);
  const { rows, gaps } = useMemo(
    () => chartSeries(points, metric, intervalMs),
    [points, metric, intervalMs],
  );
  const { ticks, step } = useMemo(() => timeTicks(from, to), [from, to]);
  const readings = rows.filter(
    (row): row is { time: number; value: number } => row.value !== null,
  );
  const { label, unit, digits } = METRICS[metric];
  const first = readings[0];
  const last = readings.at(-1);

  if (!first || !last) {
    return (
      <div className={styles.empty} role="status">
        <p>Belum ada data di rentang ini</p>
        <p className={styles.emptyLast}>
          Grafik muncul setelah alat mengirim data.
        </p>
      </div>
    );
  }

  // A reading with no neighbour on either side has no line; it still gets a dot.
  const isolated = new Set(
    rows.flatMap((row, index) =>
      row.value !== null &&
      (rows[index - 1]?.value ?? null) === null &&
      (rows[index + 1]?.value ?? null) === null
        ? [index]
        : [],
    ),
  );
  const axis = historyAxis(points, metric);
  const ids = {
    stroke: `stroke-${uid}`,
    dots: `dots-${uid}`,
    fade: `fade-${uid}`,
    fadeMask: `fade-mask-${uid}`,
    fill: `fill-${uid}`,
  };
  const lineColor =
    metric === 'ppm' ? `url(#${ids.stroke})` : METRICS[metric].color;
  const pointColor = (value: number) =>
    metric === 'ppm' ? STATUS[gasStatus(value)].color : METRICS[metric].color;
  const lastColor = pointColor(last.value);
  const tickStyle = {
    fill: 'var(--color-muted)',
    fontSize: 12,
    fontFamily: 'var(--font-number)',
    fontWeight: 500,
  };
  const covered = last.time - first.time;
  const sparse = to > from && covered / (to - from) < SPARSE_COVERAGE;
  const coverage = sparse
    ? `Baru ada data ${formatDuration(covered)}`
    : `Data tersedia ${formatSpan(first.time, last.time)}${gaps.length ? ' · ada jeda' : ''}`;

  return (
    <>
      <p className={`${styles.coverage} tabular-nums`}>
        {coverage}
        {sparse && zoomAction ? zoomAction : null}
      </p>
      <div
        className={`${styles.chart} chart-reveal motion-content`}
        role="group"
        onPointerMove={(event) =>
          setPointerX(
            Math.round(
              event.clientX - event.currentTarget.getBoundingClientRect().left,
            ),
          )
        }
        onPointerLeave={() => setPointerX(null)}
        aria-label={`Grafik ${label}, ${readings.length} pengukuran${gaps.length ? `, ${gaps.length} jeda data` : ''}. ${coverage}. ${metric === 'ppm' ? `Ambang waspada di atas ${formatNumber(THRESHOLDS.gas.warning, 0)} ppm dan bahaya di atas ${formatNumber(THRESHOLDS.gas.danger, 0)} ppm.` : `Satuan ${unit}.`} Nilai terakhir ${formatNumber(last.value, digits)} ${unit}. Gunakan tombol panah untuk menjelajahi pengukuran.`}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          initialDimension={{ width: 320, height: 160 }}
        >
          <ComposedChart
            data={rows}
            margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
            accessibilityLayer
          >
            <defs>
              <pattern
                id={ids.dots}
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="3" cy="3" r="1.15" fill="#fff" />
              </pattern>
              <linearGradient id={ids.fade} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
                <stop offset="1" stopColor="#fff" stopOpacity="0.15" />
              </linearGradient>
              <mask id={ids.fadeMask}>
                <rect width="100%" height="100%" fill={`url(#${ids.fade})`} />
              </mask>
              {/* Dots under the line, fading toward the axis. */}
              <mask id={ids.fill}>
                <rect
                  width="100%"
                  height="100%"
                  fill={`url(#${ids.dots})`}
                  mask={`url(#${ids.fadeMask})`}
                />
              </mask>
            </defs>
            {metric === 'ppm' ? (
              <GasGradient id={ids.stroke} domain={axis.domain} />
            ) : null}
            <CartesianGrid
              horizontal={false}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
            <XAxis
              dataKey="time"
              type="number"
              domain={[from, to]}
              allowDataOverflow
              scale="time"
              ticks={ticks}
              tickFormatter={(value: number) => formatTimeTick(value, step)}
              minTickGap={24}
              tick={tickStyle}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              width={44}
              domain={axis.domain}
              ticks={axis.ticks}
              tickFormatter={(value: number) =>
                formatNumber(value, metric === 'ppm' ? 0 : 1)
              }
              tick={tickStyle}
              tickLine={false}
              axisLine={false}
            />
            {gaps.map(({ from, to }) => (
              <ReferenceArea
                key={from}
                x1={from}
                x2={to}
                fill="var(--color-border)"
                fillOpacity={0.35}
                stroke="var(--color-border-strong)"
                strokeOpacity={0.6}
                strokeDasharray="3 4"
              />
            ))}
            {metric === 'ppm' ? (
              <>
                <ReferenceLine
                  y={THRESHOLDS.gas.warning}
                  stroke="var(--color-warning)"
                  strokeOpacity={0.55}
                  strokeDasharray="2 5"
                />
                <ReferenceLine
                  y={THRESHOLDS.gas.danger}
                  stroke="var(--color-danger)"
                  strokeOpacity={0.55}
                  strokeDasharray="2 5"
                />
              </>
            ) : null}
            <Area
              type="monotone"
              dataKey="value"
              stroke="none"
              fill={lineColor}
              fillOpacity={0.5}
              mask={`url(#${ids.fill})`}
              connectNulls={false}
              isAnimationActive={false}
              activeDot={false}
              tooltipType="none"
            />
            <Line
              type="monotone"
              dataKey="value"
              name={label}
              stroke={lineColor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              connectNulls={false}
              dot={({ cx, cy, index, payload }) =>
                isolated.has(index) && cx != null && cy != null ? (
                  <circle
                    key={index}
                    cx={cx}
                    cy={cy}
                    r={3.5}
                    fill={pointColor((payload as ChartRow).value ?? 0)}
                  />
                ) : (
                  <g key={index} />
                )
              }
              activeDot={{
                r: 5,
                fill: 'var(--color-surface)',
                stroke: 'var(--color-heading)',
                strokeWidth: 2,
              }}
              isAnimationActive={false}
            />
            <ReferenceDot
              x={last.time}
              y={last.value}
              ifOverflow="visible"
              shape={({ cx, cy }) => (
                <g aria-hidden="true">
                  <circle
                    cx={cx}
                    cy={cy}
                    r={7}
                    fill={lastColor}
                    fillOpacity={0.16}
                  />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={4.5}
                    fill="var(--color-surface)"
                    stroke={lastColor}
                    strokeWidth={2}
                  />
                </g>
              )}
            />
            <Tooltip
              filterNull={false}
              cursor={{ stroke: 'var(--color-border-strong)', strokeWidth: 1 }}
              content={({ active, coordinate }) => (
                <ChartTooltip
                  active={active}
                  pointerX={pointerX}
                  coordinate={coordinate}
                  metric={metric}
                  rows={rows}
                  gaps={gaps}
                  from={from}
                  to={to}
                />
              )}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
