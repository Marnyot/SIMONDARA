import type { ReactNode } from 'react';
import styles from './ui.module.css';

/** Keep both layers in one grid cell while the placeholder fades out. */
export function LoadingSwap({
  loading,
  skeleton,
  children,
}: {
  loading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={styles.loadingSwap}
      data-loading={loading || undefined}
      aria-busy={loading}
    >
      <div className={styles.loadingPlaceholder} aria-hidden={!loading}>
        {skeleton}
      </div>
      <div className={styles.loadingContent}>{loading ? null : children}</div>
    </div>
  );
}
