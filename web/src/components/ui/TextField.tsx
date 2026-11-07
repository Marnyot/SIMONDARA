import { useId } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import styles from './ui.module.css';
export interface TextFieldProps extends ComponentProps<'input'> {
  label: string;
  icon?: ReactNode;
  hint?: string;
  error?: string | null;
}
export function TextField({
  label,
  hint,
  error,
  icon,
  ...props
}: TextFieldProps) {
  const id = useId();
  const described = [hint && `${id}-hint`, error && `${id}-error`]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.inputGroup}>
        {icon}
        <input
          {...props}
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={described || undefined}
        />
      </div>
      {hint ? (
        <p id={`${id}-hint`} className={styles.fieldHint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className={styles.fieldError}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
