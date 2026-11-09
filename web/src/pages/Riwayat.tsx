import { SensorNumber } from '../components/ui/SensorNumber';
import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RoomHeader } from '../components/RoomHeader';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { useRoom } from '../live/context';
import { unreliableReadings } from '../live/status';
import {
  describeEvent,
  formatDateTime,
  formatNumber,
  formatTime,
  parseRange,
  RANGE_OPTIONS,
  bucketInterval,
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
  const { deviceId, telemetry, online, state } = useRoom();
  const unreliable = unreliableReadings(state);
  const setRange = (value: string) =>
    setQuery((previous) => {
      const next = new URLSearchParams(previous);
      next.set('range', value);
      return next;
    });
  const history = useHistory(deviceId, range);
  const events = useEvents(deviceId, range);
  return (
    <>
      <div className={styles.toolbar}>
        <RoomHeader />
        <div className={styles.range}>
          <SegmentedControl
            label="Rentang waktu riwayat"
            value={range}
            options={RANGE_OPTIONS}
            onChange={setRange}
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
                {telemetry ? (
                  <>
                    {online ? 'Sekarang' : 'Terakhir'}{' '}
                    <span className={styles.reading}>
                      <SensorNumber
                        value={formatNumber(
                          telemetry[key],
                          key === 'ppm' ? 0 : 1,
                        )}
                      />
                      <small>{unit}</small>
                    </span>
                    {unreliable[key] ? ' (tidak andal)' : ''}
                  </>
                ) : (
                  'Belum ada data langsung'
                )}
              </span>
            </div>
            {history.loading || history.from === null || history.to === null ? (
              <div className={styles.chartState}>
                <Skeleton height={130} label={`Memuat grafik ${label}`} />
              </div>
            ) : history.error ? (
              <ErrorState message={history.error} onRetry={history.retry} />
            ) : history.points.length === 0 ? (
              <EmptyState title="Belum ada pengukuran">
                Belum ada data di rentang ini. Coba pilih rentang lain.
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
                  from={history.from}
                  to={history.to}
                  intervalMs={bucketInterval(range)}
                  zoomAction={
                    range !== '1h' ? (
                      <button type="button" onClick={() => setRange('1h')}>
                        Lihat 1 Jam
                      </button>
                    ) : undefined
                  }
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
              Perubahan kondisi udara dan koneksi alat muncul di sini.
            </EmptyState>
          ) : (
            <ul>
              {events.events.map((event, index) => {
                const { text } = describeEvent(event);
                return (
                  <li key={`${event.at}-${event.type}-${index}`}>
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
