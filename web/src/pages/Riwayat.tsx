import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { StatusDot } from '../components/ui/StatusDot';
import { useRoom } from '../live/context';
import { unreliableReadings } from '../live/status';
import {
  describeEvent,
  formatDateTime,
  formatNumber,
  formatTime,
  parseRange,
  RANGE_OPTIONS,
} from '../features/riwayat/history';
import { useEvents, useHistory } from '../features/riwayat/useHistory';
import styles from './Riwayat.module.css';

const SensorChart = lazy(() => import('../features/riwayat/SensorChart'));

const metrics = [
  { key: 't', label: 'Suhu', unit: '°C' },
  { key: 'h', label: 'Kelembapan', unit: '%' },
  { key: 'ppm', label: 'Kadar Gas', unit: 'ppm' },
] as const;

export default function Riwayat() {
  const [query, setQuery] = useSearchParams();
  const range = parseRange(query.get('range'));
  const { deviceId, name, telemetry, online, state } = useRoom();
  const unreliable = unreliableReadings(state);
  const history = useHistory(deviceId, range);
  const events = useEvents(deviceId, range);
  return (
    <>
      <div className={styles.toolbar}>
        <PageHeader
          title={name}
          subtitle="Riwayat tren sensor dari cloud"
          online={online}
        />
        <div className={styles.range}>
          <SegmentedControl
            label="Rentang waktu riwayat"
            value={range}
            options={RANGE_OPTIONS}
            onChange={(value) =>
              setQuery((previous) => {
                const next = new URLSearchParams(previous);
                next.set('range', value);
                return next;
              })
            }
          />
        </div>
      </div>
      <div className={styles.grid} aria-busy={history.loading}>
        {metrics.map(({ key, label, unit }) => (
          <Card
            key={key}
            className={`${styles.chartCard} ${key === 'ppm' ? styles.gas : ''}`}
          >
            <div className={styles.cardHeader}>
              <h2>{label}</h2>
              <span>
                {telemetry
                  ? `${online ? 'Sekarang' : 'Terakhir'} ${formatNumber(telemetry[key], key === 'ppm' ? 0 : 1)} ${unit}${unreliable[key] ? ' (tidak andal)' : ''}`
                  : 'Belum ada data langsung'}
              </span>
            </div>
            {history.loading ? (
              <div className={styles.chartState}>
                <Skeleton height={130} label={`Memuat grafik ${label}`} />
              </div>
            ) : history.error ? (
              <ErrorState message={history.error} onRetry={history.retry} />
            ) : history.points.length === 0 ? (
              <EmptyState title="Belum ada pengukuran">
                Belum ada data sensor pada rentang ini. Pilih rentang waktu
                lain.
              </EmptyState>
            ) : (
              <Suspense
                fallback={
                  <Skeleton height={130} label={`Memuat grafik ${label}`} />
                }
              >
                <SensorChart
                  points={history.points}
                  metric={key}
                  daily={range === '7d'}
                />
              </Suspense>
            )}
            {key === 'ppm' ? (
              <p className={styles.legend}>
                <span>
                  <i className={styles.warning} />
                  Garis kuning: ambang waspada
                </span>
                <span>
                  <i className={styles.danger} />
                  Garis merah: ambang bahaya
                </span>
              </p>
            ) : null}
          </Card>
        ))}
        <Card className={styles.events}>
          <h2>Peristiwa Terakhir</h2>
          {events.loading ? (
            <div className={styles.chartState}>
              <Skeleton height={65} label="Memuat peristiwa terakhir" />
            </div>
          ) : events.error ? (
            <ErrorState message={events.error} onRetry={events.retry} />
          ) : events.events.length === 0 ? (
            <EmptyState title="Belum ada peristiwa">
              Perubahan kualitas udara dan koneksi perangkat akan muncul di
              sini.
            </EmptyState>
          ) : (
            <ul>
              {events.events.map((event, index) => {
                const { text, color } = describeEvent(event);
                return (
                  <li key={`${event.at}-${event.type}-${index}`}>
                    <StatusDot color={color} />
                    <span>{text}</span>
                    <time dateTime={event.at} title={formatDateTime(event.at)}>
                      {formatTime(event.at)}
                    </time>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
