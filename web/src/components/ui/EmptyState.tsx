import type { ReactNode } from 'react';
import styles from './ui.module.css';
export function EmptyState({
  title = 'Belum ada data',
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
    </div>
  );
}
