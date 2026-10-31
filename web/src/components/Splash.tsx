import { Brand } from './Brand';
import styles from './shell.module.css';
export function Splash({ phase }: { phase: 'auth' | 'snapshot' | 'ready' }) {
  const progress = phase === 'auth' ? 15 : phase === 'snapshot' ? 55 : 100;
  const text =
    phase === 'auth'
      ? 'Menghubungkan ke server...'
      : phase === 'snapshot'
        ? 'Memuat data perangkat...'
        : 'Siap';
  return (
    <div className={styles.splash}>
      <Brand splash />
      <div className={styles.progressGroup}>
        <progress
          aria-label="Progres membuka aplikasi"
          value={progress}
          max={100}
        />
        <p role="status" aria-live="polite">
          {text}
        </p>
      </div>
    </div>
  );
}
