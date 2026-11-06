import { useEffect, useState } from 'react';
import {
  CircleCheck,
  Cpu,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { newRoomUrl } from '../features/kamar/rooms';
import { useLive } from '../live/context';
import type { LiveNotice, NoticeKind } from '../live/reducer';
import styles from './Toaster.module.css';
import ui from './ui/ui.module.css';

export const NOTICE_DURATION_MS = 6000;

const ICONS: Record<NoticeKind, typeof X> = {
  danger: ShieldAlert,
  safe: ShieldCheck,
  offline: WifiOff,
  online: Wifi,
  fault: TriangleAlert,
  faultCleared: CircleCheck,
  newDevice: Cpu,
};

function Toast({
  notice,
  onDismiss,
}: {
  notice: LiveNotice;
  onDismiss: (id: number) => void;
}) {
  const { id, kind, deviceId, message } = notice;
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => onDismiss(id), NOTICE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [id, onDismiss, paused]);
  const Icon = ICONS[kind];
  return (
    <div
      className={styles.toast}
      data-kind={kind}
      role={kind === 'danger' ? 'alert' : undefined}
      // Reading it or reaching its controls must not race the timer.
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon size={20} aria-hidden="true" className={styles.icon} />
      <p>{message}</p>
      {kind === 'newDevice' ? (
        <Link
          to={newRoomUrl(deviceId)}
          className={ui.button}
          data-variant="secondary"
          aria-label={`Tambah ${deviceId} sebagai kamar`}
          onClick={() => onDismiss(id)}
        >
          Tambah
        </Link>
      ) : null}
      <button
        type="button"
        className={styles.close}
        aria-label="Tutup notifikasi"
        onClick={() => onDismiss(id)}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

export function Toaster() {
  const { notices, dismissNotice } = useLive();
  return (
    <div
      className={styles.region}
      role="region"
      aria-label="Notifikasi"
      aria-live="polite"
    >
      {notices.map((notice) => (
        <Toast key={notice.id} notice={notice} onDismiss={dismissNotice} />
      ))}
    </div>
  );
}
