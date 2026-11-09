import { lazy, memo, Suspense } from 'react';
import { CaretRight as ChevronRight } from '@phosphor-icons/react/dist/csr/CaretRight';
import { Fan } from '@phosphor-icons/react/dist/csr/Fan';
import { Link } from 'react-router-dom';
import type { Room } from '../../api/types';
import { LevelMeter } from '../../components/LevelMeter';
import { SensorNumber } from '../../components/ui/SensorNumber';
import { FaultBadge } from '../../components/FaultBadge';
import { STATUS, unreliableReadings } from '../../live/status';
import { formatNumber } from '../riwayat/history';
import {
  formatAbsoluteTime,
  formatRelativeTime,
  useNow,
} from '../kontrol/time';
import { roomStatus, roomUrl } from './rooms';
import styles from './DaftarKamar.module.css';

const RoomSparkline = lazy(() => import('./RoomSparkline'));

function LastData({ at, online }: { at: string | null; online: boolean }) {
  const now = useNow();

  return (
    <p
      className={styles.lastData}
      title={at ? formatAbsoluteTime(at) : undefined}
    >
      {online ? 'Terhubung' : 'Terputus'} ·{' '}
      {at ? `Data terakhir ${formatRelativeTime(at, now)}` : 'Belum ada data'}
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
        <SensorNumber value={value} />
        <span>{unit}</span>
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
      data-pressable
      data-status={status ?? undefined}
      data-online={online}
    >
      <div className={styles.identity}>
        <div className={styles.roomTop}>
          <h2>
            <Link
              viewTransition
              className={styles.roomLink}
              to={roomUrl(deviceId)}
            >
              {name}
            </Link>
          </h2>
        </div>
        <LastData at={updatedAt} online={online} />
        {!online ? null : status === null ? (
          <span className={styles.waiting}>Belum ada data</span>
        ) : (
          <LevelMeter
            name={`Udara ${name}`}
            status={status}
            label={STATUS[status].label}
          />
        )}
        {online ? <FaultBadge fault={state?.fault ?? 0} /> : null}
      </div>
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
        <p className={styles.waiting}>Menunggu data dari alat.</p>
      )}
      <Suspense
        fallback={
          <div className={styles.sparklinePlaceholder} aria-hidden="true" />
        }
      >
        <RoomSparkline deviceId={deviceId} name={name} />
      </Suspense>
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
