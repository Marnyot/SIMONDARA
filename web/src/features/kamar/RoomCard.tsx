import { memo } from 'react';
import { ChevronRight, Fan } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Room } from '../../api/types';
import { Badge } from '../../components/ui/Badge';
import { StatusDot } from '../../components/ui/StatusDot';
import { FaultBadge } from '../../components/FaultBadge';
import { STATUS, unreliableReadings } from '../../live/status';
import { formatNumber } from '../riwayat/history';
import {
  formatAbsoluteTime,
  formatRelativeTime,
  useNow,
} from '../kontrol/time';
import { roomStatus, roomUrl } from './rooms';
import styles from './kamar.module.css';

function LastData({ at }: { at: string | null }) {
  const now = useNow();
  if (!at) return <p className={styles.lastData}>Belum pernah mengirim data</p>;
  return (
    <p className={styles.lastData} title={formatAbsoluteTime(at)}>
      Data terakhir {formatRelativeTime(at, now)}
    </p>
  );
}

function Reading({
  label,
  value,
  unit,
  unreliable,
}: {
  label: string;
  value: string;
  unit: string;
  unreliable: boolean;
}) {
  return (
    <div data-unreliable={unreliable || undefined}>
      <dt>{label}</dt>
      <dd>
        {value} <span>{unit}</span>
      </dd>
      {unreliable ? <dd className={styles.unreliable}>Tidak andal</dd> : null}
    </div>
  );
}

function RoomCardBase({ room }: { room: Room }) {
  const { name, deviceId, online, state, telemetry, updatedAt } = room;
  const status = roomStatus(room);
  const unreliable = unreliableReadings(state);
  return (
    <article
      className={styles.roomCard}
      data-status={status ?? undefined}
      data-online={online}
    >
      <div className={styles.roomTop}>
        <h2>
          <Link className={styles.roomLink} to={roomUrl(deviceId)}>
            {name}
          </Link>
        </h2>
        {online ? (
          <span className={styles.link}>
            <StatusDot color="var(--color-safe)" />
            Terhubung
          </span>
        ) : (
          <Badge tone="danger">
            <StatusDot />
            Terputus
          </Badge>
        )}
      </div>
      <p className={styles.roomStatus}>
        {status === null ? 'Belum ada data' : STATUS[status].label}
      </p>
      <FaultBadge fault={state?.fault ?? 0} />
      {telemetry ? (
        <dl className={styles.readings}>
          <Reading
            label="Suhu"
            value={formatNumber(telemetry.t)}
            unit="°C"
            unreliable={unreliable.t}
          />
          <Reading
            label="Kelembapan"
            value={formatNumber(telemetry.h)}
            unit="%"
            unreliable={unreliable.h}
          />
          <Reading
            label="Kadar gas"
            value={formatNumber(telemetry.ppm, 0)}
            unit="ppm"
            unreliable={unreliable.ppm}
          />
        </dl>
      ) : (
        <p className={styles.waiting}>Menunggu data sensor dari perangkat.</p>
      )}
      {online ? null : <LastData at={updatedAt} />}
      <div className={styles.roomBottom}>
        <span>
          <Fan size={16} aria-hidden="true" />
          Kipas {state ? (state.fan ? 'nyala' : 'mati') : 'belum diketahui'}
        </span>
        <ChevronRight size={18} aria-hidden="true" />
      </div>
    </article>
  );
}

export const RoomCard = memo(RoomCardBase);
