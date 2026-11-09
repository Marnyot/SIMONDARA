import type { AirStatus } from '../live/status';
import { STATUS } from '../live/status';
import styles from './LevelMeter.module.css';

export function LevelMeter({
  name,
  status,
  label = STATUS[status].label,
  stale = false,
}: {
  name: string;
  status: AirStatus;
  label?: string;
  stale?: boolean;
}) {
  return (
    <span
      className={styles.meter}
      data-tone={STATUS[status].tone}
      data-stale={stale || undefined}
      role="img"
      aria-label={`${name}: ${label}, tingkat ${status + 1} dari 3`}
    >
      <span className={styles.track} aria-hidden="true">
        {[0, 1, 2].map((level) => (
          <span
            key={level}
            className={styles.step}
            data-filled={level <= status}
          />
        ))}
      </span>
      <span aria-hidden="true">{label}</span>
    </span>
  );
}
