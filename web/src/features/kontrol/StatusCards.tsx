import {
  TriangleAlert,
  CircuitBoard,
  Clock3,
  Cloud,
  Monitor,
  Thermometer,
  Wind,
  Wifi,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AirStatus } from '../../live/status';
import type { ConnectionStatus } from '../../live/reducer';
import type { Telemetry } from '../../api/types';
import { Card } from '../../components/ui/Card';
import { LCD_COLUMNS, formatLcdLines } from './lcd';
import { formatAbsoluteTime, formatRelativeTime, useNow } from './time';
import styles from './kontrol.module.css';

export function LcdCard({
  telemetry,
  status,
  online,
  lcdFault,
}: {
  telemetry: Telemetry | null;
  status: AirStatus | null;
  online: boolean;
  lcdFault: boolean;
}) {
  const lines = formatLcdLines(telemetry, status);
  return (
    <Card className={styles.card}>
      <h3 className={styles.title}>Tampilan LCD</h3>
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
        {lcdFault
          ? 'Layar LCD pada perangkat mengalami gangguan; tampilan fisiknya bisa berbeda dari pratinjau ini.'
          : online
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
  icon: Icon,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: 'safe' | 'warning' | 'danger';
  title?: string;
}) {
  return (
    <div className={styles.row} data-tone={tone}>
      <dt>
        <Icon size={16} aria-hidden="true" />
        <span>{label}</span>
      </dt>
      <dd title={title}>
        {tone === 'danger' || tone === 'warning' ? (
          <TriangleAlert size={14} aria-hidden="true" />
        ) : null}
        <span>{value}</span>
      </dd>
    </div>
  );
}

export function ConnectionCard({
  online,
  connection,
  updatedAt,
  fault,
}: {
  online: boolean;
  connection: ConnectionStatus;
  updatedAt: string | null;
  /** Null until the device has reported a state. */
  fault: number | null;
}) {
  const now = useNow();
  return (
    <Card className={styles.card}>
      <h3 className={styles.title}>Koneksi</h3>
      <div className={styles.connectionGroups}>
        <section className={styles.connectionGroup} aria-label="Jaringan">
          <div className={styles.connectionHeading}>
            <h4>Jaringan</h4>
            <span>NodeMCU ESP8266</span>
          </div>
          <dl className={styles.rows}>
            <Row
              icon={Wifi}
              label="Perangkat"
              value={online ? 'Terhubung' : 'Terputus'}
              tone={online ? 'safe' : 'danger'}
            />
            <Row
              icon={Cloud}
              label="Server"
              value={SERVER_LABEL[connection]}
              tone={connection === 'connected' ? 'safe' : 'warning'}
            />
            <Row
              icon={Clock3}
              label="Data terakhir"
              value={
                updatedAt ? formatRelativeTime(updatedAt, now) : 'Belum ada'
              }
              title={updatedAt ? formatAbsoluteTime(updatedAt) : undefined}
            />
          </dl>
        </section>
        <section className={styles.connectionGroup} aria-label="Sensor">
          <div className={styles.connectionHeading}>
            <h4>Sensor</h4>
            <CircuitBoard size={16} aria-hidden="true" />
          </div>
          <dl className={styles.rows}>
            {(
              [
                {
                  bit: 1,
                  label: 'DHT11',
                  icon: Thermometer,
                  title: 'Sensor suhu/kelembapan (DHT11)',
                },
                {
                  bit: 2,
                  label: 'MQ-135',
                  icon: Wind,
                  title: 'Sensor gas (MQ-135)',
                },
                { bit: 4, label: 'LCD', icon: Monitor, title: 'Layar LCD' },
              ] as const
            ).map(({ bit, label, icon, title }) => (
              <Row
                key={bit}
                icon={icon}
                label={label}
                title={title}
                value={
                  fault === null
                    ? 'Belum ada'
                    : fault & bit
                      ? 'Gangguan'
                      : 'Normal'
                }
                tone={
                  fault === null ? undefined : fault & bit ? 'danger' : 'safe'
                }
              />
            ))}
          </dl>
        </section>
      </div>
    </Card>
  );
}
