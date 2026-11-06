import {
  lazy,
  Suspense,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { Droplet, Thermometer, Wind } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { FaultBadge } from '../components/FaultBadge';
import { MuteAlarmButton } from '../components/MuteAlarmButton';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { useRoom } from '../live/context';
import {
  airStatus,
  gasStatus,
  STATUS,
  unreliableReadings,
} from '../live/status';
import { relativeUpdate, statusAdvice } from '../features/beranda/statusAdvice';
import { formatDateTime, formatNumber } from '../features/riwayat/history';
import { useHistory } from '../features/riwayat/useHistory';
import styles from './Beranda.module.css';

const SensorChart = lazy(() => import('../features/riwayat/SensorChart'));

const desktopQuery = '(min-width: 1024px)';
const subscribeDesktop = (callback: () => void) => {
  const query = window.matchMedia(desktopQuery);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
};
const isDesktop = () => window.matchMedia(desktopQuery).matches;

const UNRELIABLE_NOTE = 'Sensor gangguan, nilai tidak andal';

function UpdatedAt({ at }: { at: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <time dateTime={at} title={formatDateTime(at)}>
      {relativeUpdate(at, now)}
    </time>
  );
}

function GasTrend() {
  const { deviceId } = useRoom();
  const { points, error, loading, retry } = useHistory(deviceId, '24h');
  return (
    <Card className={styles.trend}>
      <h2>Tren Kadar Gas (24 jam)</h2>
      {loading ? (
        <Skeleton height={150} label="Memuat tren kadar gas" />
      ) : error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : points.length === 0 ? (
        <EmptyState title="Belum ada riwayat gas">
          Pengukuran akan muncul setelah sensor mengirim data.
        </EmptyState>
      ) : (
        <Suspense
          fallback={<Skeleton height={150} label="Memuat grafik gas" />}
        >
          <SensorChart points={points} metric="ppm" />
        </Suspense>
      )}
    </Card>
  );
}

export default function Beranda() {
  const { name, telemetry, state, online, updatedAt } = useRoom();
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    isDesktop,
    () => false,
  );
  const status = telemetry ? airStatus(telemetry) : null;
  const unreliable = unreliableReadings(state);
  return (
    <>
      <PageHeader
        title={name}
        subtitle="Pantauan kualitas udara ruangan secara langsung"
        online={online}
      />
      <div className={styles.layout}>
        {!online ? (
          <p className={styles.offline} role="status">
            Perangkat terputus.{' '}
            {telemetry || state
              ? 'Data terakhir ditampilkan; kondisi saat ini belum dapat dipastikan.'
              : 'Menunggu perangkat terhubung untuk menerima data.'}
          </p>
        ) : null}
        {state?.fault ? (
          <div className={styles.full}>
            <FaultBadge fault={state.fault} />
          </div>
        ) : null}
        {telemetry && status !== null ? (
          <>
            <section
              className={styles.status}
              data-status={status}
              aria-labelledby="air-quality-title"
            >
              <div>
                <h2 id="air-quality-title">Kualitas Udara Saat Ini</h2>
                <p className={styles.statusLabel}>{STATUS[status].label}</p>
                <p className={styles.advice}>{statusAdvice(telemetry)}</p>
                <MuteAlarmButton />
              </div>
              <div
                className={styles.scale}
                aria-label={`Kualitas udara ${STATUS[status].label}`}
              >
                <div className={styles.segments} aria-hidden="true">
                  {[0, 1, 2].map((item) => (
                    <span
                      key={item}
                      style={{ background: STATUS[item as 0 | 1 | 2].color }}
                    >
                      {status === item ? <i /> : null}
                    </span>
                  ))}
                </div>
                <div className={styles.scaleLabels} aria-hidden="true">
                  <span>Aman</span>
                  <span>Waspada</span>
                  <span>Bahaya</span>
                </div>
              </div>
            </section>
            <Card className={styles.metric} data-unreliable={unreliable.t}>
              <h2>
                <Thermometer size={19} aria-hidden="true" />
                Suhu
              </h2>
              <p className={styles.value}>
                {formatNumber(telemetry.t)} <span>°C</span>
              </p>
              <p className={styles.source}>
                {unreliable.t ? UNRELIABLE_NOTE : 'Sensor DHT11'}
              </p>
            </Card>
            <Card className={styles.metric} data-unreliable={unreliable.h}>
              <h2>
                <Droplet size={19} aria-hidden="true" />
                Kelembapan
              </h2>
              <p className={styles.value}>
                {formatNumber(telemetry.h)} <span>%</span>
              </p>
              <p className={styles.source}>
                {unreliable.t ? UNRELIABLE_NOTE : 'Sensor DHT11'}
              </p>
            </Card>
            <Card
              className={`${styles.metric} ${styles.gas}`}
              data-unreliable={unreliable.ppm}
            >
              <h2>
                <Wind size={20} aria-hidden="true" />
                Kadar Gas
              </h2>
              <p className={styles.value}>
                {formatNumber(telemetry.ppm, 0)} <span>ppm</span>
              </p>
              <div
                role="meter"
                aria-label="Kadar gas"
                aria-valuenow={telemetry.ppm}
                aria-valuemin={0}
                aria-valuemax={Math.max(3000, telemetry.ppm)}
                aria-valuetext={`${formatNumber(telemetry.ppm, 0)} ppm`}
                className={styles.gasMeter}
              >
                <span
                  style={{
                    width: `${Math.min(100, telemetry.ppm / 30)}%`,
                    background: STATUS[gasStatus(telemetry.ppm)].color,
                  }}
                />
              </div>
              <p className={styles.source}>
                {unreliable.ppm
                  ? UNRELIABLE_NOTE
                  : 'Ambang kuning 1.000 ppm, merah 2.000 ppm'}
              </p>
            </Card>
          </>
        ) : (
          <Card className={styles.full}>
            <EmptyState title="Belum ada pengukuran">
              Menunggu data dari sensor DHT11 dan sensor gas.
            </EmptyState>
          </Card>
        )}
        <div className={styles.bottom}>
          <Card className={styles.actuators}>
            <h2>Status Aktuator</h2>
            {state ? (
              <dl>
                <div className={styles.ledRow}>
                  <dt>LED</dt>
                  <dd>
                    <span className={styles.leds} aria-hidden="true">
                      {[1, 2, 3].map((led) => (
                        <i
                          key={led}
                          data-active={state.led === led}
                          style={{
                            background: STATUS[(led - 1) as 0 | 1 | 2].color,
                          }}
                        />
                      ))}
                    </span>
                    {['Mati', 'Hijau', 'Kuning', 'Merah'][state.led]}
                  </dd>
                </div>
                <div>
                  <dt>Kipas</dt>
                  <dd>{state.fan ? 'Nyala' : 'Mati'}</dd>
                </div>
                <div>
                  <dt>Buzzer</dt>
                  <dd>
                    {state.mute ? 'Dibisukan' : state.buzzer ? 'Nyala' : 'Mati'}
                  </dd>
                </div>
                <div>
                  <dt>Mode</dt>
                  <dd>{state.mode ? 'Manual' : 'Otomatis'}</dd>
                </div>
              </dl>
            ) : (
              <p className={styles.source}>Status aktuator belum tersedia.</p>
            )}
            {!telemetry ? <MuteAlarmButton /> : null}
          </Card>
          {desktop ? <GasTrend /> : null}
        </div>
        <p className={styles.updated}>
          {updatedAt ? (
            <UpdatedAt at={updatedAt} />
          ) : (
            'Belum ada pembaruan perangkat'
          )}
        </p>
      </div>
    </>
  );
}
