import type { HTMLAttributes } from 'react';
import styles from './ui.module.css';
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'safe' | 'warning' | 'danger' | 'neutral';
}
export function Badge({
  tone = 'neutral',
  className = '',
  ...props
}: BadgeProps) {
  return (
    <span
      className={`${styles.badge} ${className}`}
      data-tone={tone}
      {...props}
    />
  );
}
export { Badge as StatusPill };
