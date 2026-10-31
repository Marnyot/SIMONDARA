import { useId, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import styles from './ui.module.css';
export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
}
export interface SegmentedControlProps<T extends string | number> {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentOption<T>[];
  label: string;
  disabled?: boolean;
}
export function SegmentedControl<T extends string | number>({
  value,
  onChange,
  options,
  label,
  disabled = false,
}: SegmentedControlProps<T>) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const keyDown = (event: KeyboardEvent, index: number) => {
    if (
      ![
        'ArrowRight',
        'ArrowLeft',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    const enabled = options
      .map((option, i) => ({ option, i }))
      .filter(({ option }) => !disabled && !option.disabled);
    const position = enabled.findIndex(({ i }) => i === index);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? enabled.length - 1
          : (position +
              (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) +
              enabled.length) %
            enabled.length;
    const target = enabled[next];
    if (target) {
      onChange(target.option.value);
      refs.current[target.i]?.focus();
    }
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled}
      className={styles.segments}
    >
      {options.map((option, index) => (
        <button
          key={`${id}-${option.value}`}
          ref={(element) => {
            refs.current[index] = element;
          }}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          disabled={disabled || option.disabled}
          className={styles.segment}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => keyDown(event, index)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
