import { StatusDot } from './ui/StatusDot';
import { useRoom } from '../live/context';
import { useNow } from '../features/kontrol/time';
import { relativeUpdate } from '../features/beranda/statusAdvice';
import { formatDateTime } from '../features/riwayat/history';
import styles from './RoomHeader.module.css';

export function RoomHeader() {
  const { name, online, updatedAt } = useRoom();
  const now = useNow(10_000);
  return (
    <header className={styles.header}>
      <h1>{name}</h1>
      <div className={styles.meta}>
        <span className={styles.connection} data-online={online}>
          <StatusDot
            color={online ? 'var(--color-safe)' : 'var(--color-danger)'}
          />
          {online ? 'Terhubung' : 'Terputus'}
        </span>
        <span aria-hidden="true">·</span>
        {updatedAt ? (
          <time dateTime={updatedAt} title={formatDateTime(updatedAt)}>
            {relativeUpdate(updatedAt, now)}
          </time>
        ) : (
          <span>Belum ada pembaruan</span>
        )}
      </div>
    </header>
  );
}
