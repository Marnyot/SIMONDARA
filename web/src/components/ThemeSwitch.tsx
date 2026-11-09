import { Moon } from '@phosphor-icons/react/dist/csr/Moon';
import { Sun } from '@phosphor-icons/react/dist/csr/Sun';
import { useRef } from 'react';
import { toggleTheme, useTheme } from './theme';
import styles from './ThemeSwitch.module.css';

/** One sliding switch for light/dark; on is dark. `labelled` shows the name beside it. */
export function ThemeSwitch({ labelled = false }: { labelled?: boolean }) {
  const dark = useTheme() === 'dark';
  const track = useRef<HTMLSpanElement>(null);
  const toggle = () => {
    const box = track.current?.getBoundingClientRect();
    // The reveal grows from the track's centre, also for keyboard presses.
    toggleTheme(
      box
        ? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
        : undefined,
    );
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Tema"
      title={dark ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
      className={styles.switch}
      data-labelled={labelled || undefined}
      onClick={toggle}
    >
      {labelled ? (
        <span className={styles.label} aria-hidden="true">
          Tema gelap
        </span>
      ) : null}
      <span ref={track} className={styles.track} aria-hidden="true">
        <span className={styles.knob}>
          <Sun size={14} weight="regular" className={styles.sun} />
          <Moon size={14} weight="regular" className={styles.moon} />
        </span>
      </span>
    </button>
  );
}
