import type { AirStatus } from '../../live/status';
import type { ConnectionStatus } from '../../live/reducer';
import type { Telemetry } from '../../api/types';
import { Card } from '../../components/ui/Card';
import { StatusDot } from '../../components/ui/StatusDot';
import { LCD_COLUMNS, formatLcdLines } from './lcd';
import { formatAbsoluteTime, formatRelativeTime, useNow } from './time';
import styles from './kontrol.module.css';

export function LcdCard({
  telemetry,
  status,
  online,
}: {
  telemetry: Telemetry | null;
  status: AirStatus | null;
  online: boolean;
}) {
  const lines = formatLcdLines(telemetry, status);
  return (
    <Card className={styles.card}>
      <h2 className={styles.title}>Tampilan LCD</h2>
      <div
        className={styles.lcd}
        role="img"
        aria-label={`Layar LCD: ${lines.map((line) => line.trimEnd()).join(', ')}`}
      >
        {lines.map((line, row) => (
          <div key={row} className={styles.lcdRow} aria-hidden="true">
            {Array.from(line, (char, column) => (
              <span key={column} className={styles.lcdCell}>
                {char}
              </span>
            ))}
          </div>
        ))}
      </div>
      <p className={styles.hint}>
        {online
          ? `Pratinjau layar ${LCD_COLUMNS}×2 pada perangkat, dari data terakhir.`
          : 'Perangkat terputus. Pratinjau menampilkan data terakhir yang diterima.'}
      </p>
    </Card>
  );
}

const SERVER_LABEL: Record<ConnectionStatus, string> = {
  connected: 'Terhubung',
  connecting: 'Menghubungkan…',
  reconnecting: 'Menyambung ulang…',
};

function Row({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: string;
  tone?: 'safe' | 'warning' | 'muted';
  title?: string;
}) {
  return (
    <div className={styles.row}>
      <dt>{label}</dt>
      <dd title={title}>
        {tone ? (
          <StatusDot
            color={
              tone === 'safe'
                ? 'var(--color-safe)'
                : tone === 'warning'
                  ? 'var(--color-warning)'
                  : 'var(--color-border-strong)'
            }
          />
        ) : null}
        {value}
      </dd>
    </div>
  );
}

export function ConnectionCard({
  online,
  connection,
  updatedAt,
}: {
  online: boolean;
  connection: ConnectionStatus;
  updatedAt: string | null;
}) {
  const now = useNow();
  return (
    <Card className={styles.card}>
      <h2 className={styles.title}>Koneksi</h2>
      <dl className={styles.rows}>
        <Row
          label="Perangkat"
          value={online ? 'Terhubung' : 'Terputus'}
          tone={online ? 'safe' : 'muted'}
        />
        <Row
          label="Server"
          value={SERVER_LABEL[connection]}
          tone={connection === 'connected' ? 'safe' : 'warning'}
        />
        <Row
          label="Data terakhir"
          value={updatedAt ? formatRelativeTime(updatedAt, now) : 'Belum ada'}
          title={updatedAt ? formatAbsoluteTime(updatedAt) : undefined}
        />
        <Row label="Model" value="NodeMCU ESP8266" />
      </dl>
    </Card>
  );
}
