import { useState } from 'react';
import { ApiError } from '../../api/client';
import type { Room } from '../../api/types';
import { Toggle } from '../../components/ui/Toggle';
import { useLive } from '../../live/context';
import styles from './notifikasi.module.css';
export function RoomNotification({ room }: { room: Room }) {
  const { setRoomNotify } = useLive();
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState('');
  if (room.notify === undefined || !setRoomNotify) return null;
  if (unavailable)
    return <p className={styles.hint}>Notifikasi belum bisa diatur.</p>;
  return (
    <div className={styles.room}>
      <div className={styles.row}>
        <span className={styles.roomLabel}>Notifikasi Telegram</span>
        <Toggle
          label={`Notifikasi Telegram ${room.name}`}
          checked={room.notify}
          disabled={busy}
          onChange={(notify) => {
            if (busy) return;
            setBusy(true);
            setError('');
            void setRoomNotify(room.deviceId, notify)
              .catch((cause: unknown) => {
                if (cause instanceof ApiError && cause.status === 404)
                  setUnavailable(true);
                else setError('Gagal mengubah notifikasi. Coba lagi.');
              })
              .finally(() => setBusy(false));
          }}
        />
      </div>
      {error ? (
        <p role="alert" className={styles.hint}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
