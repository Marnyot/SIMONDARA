import { useId } from 'react';
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { UnregisteredDevice } from '../../api/types';
import { Card } from '../../components/ui/Card';
import { StatusDot } from '../../components/ui/StatusDot';
import ui from '../../components/ui/ui.module.css';
import {
  formatAbsoluteTime,
  formatRelativeTime,
  useNow,
} from '../kontrol/time';
import { newRoomUrl } from './rooms';
import styles from './kamar.module.css';

export function NewDevices({ devices }: { devices: UnregisteredDevice[] }) {
  const titleId = useId();
  const now = useNow();
  if (devices.length === 0) return null;
  return (
    <Card role="region" aria-labelledby={titleId} className={styles.panel}>
      <h2 id={titleId} className={styles.panelTitle}>
        Perangkat baru terdeteksi
      </h2>
      <p className={styles.panelHint}>
        Perangkat ini sudah mengirim data, tetapi belum terdaftar sebagai kamar.
      </p>
      <ul className={styles.deviceList}>
        {devices.map(({ deviceId, online, lastSeen }) => (
          <li key={deviceId}>
            <div>
              <strong>{deviceId}</strong>
              <span title={formatAbsoluteTime(lastSeen)}>
                <StatusDot
                  color={
                    online ? 'var(--color-safe)' : 'var(--color-border-strong)'
                  }
                />
                {online ? 'Terhubung' : 'Terputus'},{' '}
                {formatRelativeTime(lastSeen, now)}
              </span>
            </div>
            <Link
              to={newRoomUrl(deviceId)}
              className={ui.button}
              data-variant="secondary"
              aria-label={`Tambah ${deviceId} sebagai kamar`}
            >
              <Plus size={16} aria-hidden="true" />
              Tambah
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
