import type { CSSProperties } from 'react';
import styles from './ui.module.css';
export function Skeleton({
  height = '1em',
  label = 'Memuat data',
}: {
  height?: CSSProperties['height'];
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={styles.skeleton}
      style={{ height }}
    />
  );
}
