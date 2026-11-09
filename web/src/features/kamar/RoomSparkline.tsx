import { useId } from 'react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  useYAxisScale,
} from 'recharts';
import { useHistory } from '../riwayat/useHistory';
import {
  bucketInterval,
  chartSeries,
  formatNumber,
  gasGradientStops,
  historyAxis,
} from '../riwayat/history';
import styles from './DaftarKamar.module.css';

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
          <stop key={index} offset={offset} stopColor={color} />
        ))}
      </linearGradient>
    </defs>
  );
}

const MIN_SPAN_MS = 2 * 60 * 60 * 1000;

export default function RoomSparkline({
  deviceId,
  name,
}: {
  deviceId: string;
  name: string;
}) {
  const id = useId();
  const { points, from, to, error } = useHistory(deviceId, '24h', 300_000);
  // Butuh rentang data minimal 2 jam, kalau tidak garisnya hanya sepotong di pojok.
  const span =
    points.length > 1
      ? Date.parse(points.at(-1)!.at) - Date.parse(points[0]!.at)
      : 0;
  if (error || span < MIN_SPAN_MS || from === null || to === null)
    return (
      <p className={styles.sparklineEmpty}>
        {error
          ? 'Tren belum tersedia'
          : 'Tren 24 jam muncul setelah ada data 2 jam'}
      </p>
    );
  const { rows } = chartSeries(points, 'ppm', bucketInterval('24h'));
  const { domain } = historyAxis(points, 'ppm');
  return (
    <div className={`${styles.sparkline} chart-reveal motion-content`}>
      <span>Kadar gas · 24 jam</span>
      <div
        role="img"
        aria-label={`Tren kadar gas ${name}, 24 jam, terakhir ${formatNumber(points.at(-1)!.ppm, 0)} ppm.`}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart
            data={rows}
            margin={{ top: 3, right: 2, bottom: 3, left: 2 }}
            accessibilityLayer={false}
          >
            <GasGradient id={id} domain={domain} />
            <XAxis hide type="number" dataKey="time" domain={[from, to]} />
            <YAxis hide domain={domain} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={`url(#${id})`}
              strokeWidth={2}
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
