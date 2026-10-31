import type { CSSProperties } from 'react';
import styles from './ui.module.css';
export function StatusDot({ color }: { color?: string }) {
  return (
    <span
      aria-hidden="true"
      className={styles.dot}
      style={{ color } as CSSProperties}
    />
  );
}
