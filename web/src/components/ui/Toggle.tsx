import type { ButtonHTMLAttributes } from 'react';
import styles from './ui.module.css';
export interface ToggleProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange' | 'onClick' | 'role' | 'aria-checked'
> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}
export function Toggle({
  checked,
  onChange,
  label,
  className = '',
  ...props
}: ToggleProps) {
  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`${styles.toggle} ${className}`}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.thumb} />
    </button>
  );
}
