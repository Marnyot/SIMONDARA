import { SensorNumber } from './ui/SensorNumber';
import { STATUS, THRESHOLDS, gasStatus } from '../live/status';
import {
  GAUGE_MAX,
  gaugeArc,
  gaugeFraction,
  gaugeOverScale,
  gaugePoint,
  gaugeSegments,
} from './gaugeScale';
import styles from './GasGauge.module.css';

const CX = 100;
const CY = 100;
const RADIUS = 84;
const SEGMENT_COLOR = {
  safe: 'var(--color-safe)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
} as const;
const ppmText = (value: number) =>
  Math.round(value).toLocaleString('id-ID', { maximumFractionDigits: 0 });

export interface GasGaugeProps {
  /** Latest reading; `null` while nothing has arrived yet. */
  ppm: number | null;
  /** Right end of the scale. Readings above it pin the marker to the end and are flagged "Melebihi skala". */
  max?: number;
  /** The MQ-135 is faulty: show the number, but not as a trustworthy status. */
  unreliable?: boolean;
  /** Hide the repeated value and status when a nearby reading already supplies them. */
  showReadout?: boolean;
  className?: string;
}

/** Half-circle gauge for gas concentration: Aman / Waspada / Bahaya bands with a marker. */
export function GasGauge({
  ppm,
  max = GAUGE_MAX,
  unreliable = false,
  showReadout = true,
  className = '',
}: GasGaugeProps) {
  const value = ppm !== null && Number.isFinite(ppm) ? ppm : null;
  const status = value === null ? null : STATUS[gasStatus(value)];
  const active = status && !unreliable ? status.tone : null;
  const over = value !== null && gaugeOverScale(value, max);
  const marker =
    value === null
      ? null
      : gaugePoint(gaugeFraction(value, max), RADIUS, CX, CY);
  const scale = `Skala 0 sampai ${ppmText(max)} ppm: aman sampai ${ppmText(THRESHOLDS.gas.warning)}, waspada sampai ${ppmText(THRESHOLDS.gas.danger)}, bahaya di atasnya.`;
  const label =
    value === null || !status
      ? `Kadar gas belum tersedia. ${scale}`
      : `Kadar gas ${ppmText(value)} ppm${over ? `, melebihi skala ${ppmText(max)} ppm` : ''}, ${unreliable ? 'sensor gas bermasalah, status belum bisa dipastikan' : `status ${status.label}`}. ${scale}`;

  return (
    <div
      className={`${styles.gauge} ${className}`}
      role="img"
      aria-label={label}
      data-tone={active ?? undefined}
    >
      <div className={styles.dial}>
        <svg viewBox="0 0 200 112" aria-hidden="true" focusable="false">
          {gaugeSegments(max).map(({ tone, from, to }) => (
            <path
              key={tone}
              d={gaugeArc(from, to, RADIUS, CX, CY)}
              className={styles.segment}
              stroke={SEGMENT_COLOR[tone]}
              data-active={active === tone || undefined}
              data-dim={(active !== null && active !== tone) || undefined}
            />
          ))}
          {marker ? (
            <g className={styles.marker} data-over={over || undefined}>
              <circle cx={marker.x} cy={marker.y} r="9" />
              <circle cx={marker.x} cy={marker.y} r="3.5" />
            </g>
          ) : null}
        </svg>
        <div className={styles.readout}>
          {showReadout ? (
            <span className={styles.measurement}>
              <strong className="tabular-nums">
                <SensorNumber value={value === null ? '–' : ppmText(value)} />
              </strong>
              <span className={styles.unit}>ppm</span>
            </span>
          ) : null}
          {over ? <span className={styles.over}>Melebihi skala</span> : null}
          {showReadout ? (
            <span className={styles.status}>
              {!status
                ? 'Belum ada data'
                : unreliable
                  ? 'Sensor bermasalah'
                  : status.label}
            </span>
          ) : null}
        </div>
      </div>
      <div className={styles.ends} aria-hidden="true">
        <span>0</span>
        <span className="tabular-nums" data-over={over || undefined}>
          {over ? `> ${ppmText(max)}` : ppmText(max)}
        </span>
      </div>
    </div>
  );
}
