import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HistoryPoint } from '../../api/types';
import { THRESHOLDS } from '../../live/status';
import {
  formatDateTime,
  formatNumber,
  formatTime,
  historyAxis,
} from './history';
import styles from './SensorChart.module.css';

const METRICS = {
  t: { label: 'Suhu', unit: '°C', color: 'var(--color-primary)' },
  h: { label: 'Kelembapan', unit: '%', color: '#3278c8' },
  ppm: { label: 'Kadar Gas', unit: 'ppm', color: 'var(--color-heading)' },
};
export default function SensorChart({
  points,
  metric,
  daily = false,
}: {
  points: HistoryPoint[];
  metric: keyof typeof METRICS;
  daily?: boolean;
}) {
  const data = useMemo(
    () =>
      points
        .map((point) => ({ ...point, time: new Date(point.at).getTime() }))
        .sort((a, b) => a.time - b.time),
    [points],
  );
  const { label, unit, color } = METRICS[metric];
  const axis = historyAxis(points, metric);
  return (
    <div
      className={styles.chart}
      role="group"
      aria-label={`Grafik ${label}, ${points.length} pengukuran. ${metric === 'ppm' ? 'Ambang waspada 1.000 ppm dan bahaya 2.000 ppm.' : `Satuan ${unit}.`} Gunakan tombol panah untuk menjelajahi pengukuran.`}
    >
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        initialDimension={{ width: 320, height: 150 }}
      >
        <LineChart
          data={data}
          margin={{ top: 12, right: 10, left: 0, bottom: 0 }}
          accessibilityLayer
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--color-border)"
            strokeDasharray="3 5"
          />
          <XAxis
            dataKey="time"
            type="number"
            domain={['dataMin', 'dataMax']}
            scale="time"
            tickFormatter={(value: number) =>
              daily
                ? new Date(value).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                  })
                : formatTime(value)
            }
            minTickGap={42}
            tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-border)' }}
          />
          <YAxis
            width={40}
            domain={axis.domain}
            ticks={axis.ticks}
            minTickGap={3}
            tickFormatter={(value: number) =>
              formatNumber(value, metric === 'ppm' ? 0 : 1)
            }
            tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            labelFormatter={(value) => formatDateTime(Number(value))}
            formatter={(value) => [
              `${formatNumber(Number(value), metric === 'ppm' ? 0 : 1)} ${unit}`,
              label,
            ]}
            contentStyle={{
              borderRadius: 10,
              borderColor: 'var(--color-border)',
              fontSize: 12,
            }}
          />
          {metric === 'ppm' ? (
            <>
              <ReferenceLine
                y={THRESHOLDS.gas.warning}
                stroke="var(--color-warning)"
                strokeDasharray="5 4"
              />
              <ReferenceLine
                y={THRESHOLDS.gas.danger}
                stroke="var(--color-danger)"
                strokeDasharray="5 4"
              />
            </>
          ) : null}
          <Line
            type="linear"
            dataKey={metric}
            name={label}
            stroke={color}
            strokeWidth={2.5}
            dot={data.length === 1 ? { r: 3 } : false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
