import { Button } from './Button';
import styles from './ui.module.css';
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className={`${styles.empty} ${styles.error}`}>
      <h2>Koneksi bermasalah</h2>
      <p>{message}</p>
      {onRetry ? <Button onClick={onRetry}>Coba lagi</Button> : null}
    </div>
  );
}
