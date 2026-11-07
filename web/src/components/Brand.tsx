import styles from './shell.module.css';

/** Two air currents passing a sensor point: the product in one glyph. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      className={styles.mark}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="9" fill="var(--color-primary)" />
      <g
        fill="none"
        stroke="var(--color-on-primary)"
        strokeLinecap="round"
        strokeWidth="2.4"
      >
        <path d="M7 13c2.6-2.6 5.4-2.6 8 0s5.4 2.6 8 0" />
        <path d="M7 20c2.6-2.6 5.4-2.6 8 0s5.4 2.6 8 0" opacity="0.6" />
      </g>
      <circle cx="24.5" cy="8" r="2" fill="var(--color-on-primary)" />
    </svg>
  );
}

export function Brand({ splash = false }: { splash?: boolean }) {
  if (splash) {
    return (
      <div className={styles.splashBrand}>
        <img src="/logo.svg" width="72" height="72" alt="" />
        <strong>SIMONDARA</strong>
        <span>Sistem Monitoring Udara</span>
      </div>
    );
  }
  return (
    <div className={styles.brand}>
      <BrandMark />
      <div>
        <strong>SIMONDARA</strong>
        <span>Sistem Monitoring Udara</span>
      </div>
    </div>
  );
}
