import { SensorNumber } from '../components/ui/SensorNumber';
import { lazy, Suspense } from 'react';
import { RoomHeader } from '../components/RoomHeader';
import { Link } from 'react-router-dom';
import { Droplet, Thermometer, Wind } from 'lucide-react';
import { GasGauge } from '../components/GasGauge';
import { Badge } from '../components/ui/Badge';
import { StatusDot } from '../components/ui/StatusDot';
import { LevelMeter } from '../components/LevelMeter';
import {
  assessTemperature,
  assessHumidity,
  assessGas,
} from '../features/beranda/sensorAssessment';
import { FaultBadge } from '../components/FaultBadge';
import { MuteAlarmButton } from '../components/MuteAlarmButton';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingSwap } from '../components/ui/LoadingSwap';
import { Skeleton } from '../components/ui/Skeleton';
import { useRoom } from '../live/context';
import { airStatus, STATUS, unreliableReadings } from '../live/status';
import { statusAdvice } from '../features/beranda/statusAdvice';
import { bucketInterval, formatNumber } from '../features/riwayat/history';
import { roomUrl } from '../features/kamar/rooms';
import { useHistory } from '../features/riwayat/useHistory';
import styles from './Beranda.module.css';

const SensorChart = lazy(() => import('../features/riwayat/SensorChart'));

const UNRELIABLE_NOTE = 'Sensor gangguan, nilai tidak andal';

function GasTrend() {
  const { deviceId } = useRoom();
  const { points, from, to, error, loading, retry } = useHistory(
    deviceId,
    '24h',
  );
  return (
    <Card className={styles.trend}>
      <h2>Tren Kadar Gas (24 jam)</h2>
      <LoadingSwap
        loading={loading}
        skeleton={<Skeleton height={194} label="Memuat tren kadar gas" />}
      >
        {error ? (
          <ErrorState message={error} onRetry={retry} />
        ) : points.length === 0 || from === null || to === null ? (
          <EmptyState title="Belum ada riwayat gas">
            Pengukuran akan muncul setelah sensor mengirim data.
          </EmptyState>
        ) : (
          <Suspense
            fallback={<Skeleton height={150} label="Memuat grafik gas" />}
          >
            <SensorChart
              points={points}
              metric="ppm"
              from={from}
              to={to}
              intervalMs={bucketInterval('24h')}
              zoomAction={
                <Link
                  viewTransition
                  to={`${roomUrl(deviceId, 'riwayat')}?range=1h`}
                >
                  Lihat 1 Jam
                </Link>
              }
            />
          </Suspense>
        )}
      </LoadingSwap>
    </Card>
  );
}

export default function Beranda() {
  const { name, telemetry, state, online } = useRoom();
  const status = telemetry ? airStatus(telemetry) : null;
  const unreliable = unreliableReadings(state);
  return (
    <>
      <RoomHeader />
      <div className={styles.layout}>
        {!online ? (
          <p className={styles.offline} role="status">
            Perangkat terputus.{' '}
            {telemetry || state
              ? 'Data terakhir ditampilkan; kondisi saat ini belum dapat dipastikan.'
              : 'Menunggu perangkat terhubung untuk menerima data.'}
          </p>
        ) : null}
        {telemetry && status !== null ? (
          <>
            <section
              className={styles.status}
              data-status={status}
              aria-labelledby="air-quality-title"
            >
              <div className={styles.condition}>
                <h2 id="air-quality-title">Kondisi udara</h2>
                <p className={styles.summary}>
                  Udara di {name} sedang{' '}
                  <strong className={styles.statusLabel}>
                    {status === 2
                      ? 'berbahaya'
                      : status === 1
                        ? 'perlu diwaspadai'
                        : 'aman'}
                  </strong>
                  .
                </p>
                <div className={styles.mainReading}>
                  <span className={styles.readingLabel}>Kadar gas</span>
                  <div className={styles.numberUnit}>
                    <span className={styles.mainValue}>
                      <SensorNumber value={formatNumber(telemetry.ppm, 0)} />
                    </span>
                    <span className={styles.mainUnit}>ppm</span>
                  </div>
                </div>
                <p className={styles.advice}>{statusAdvice(telemetry)}</p>
                {!online || unreliable.t || unreliable.h || unreliable.ppm ? (
                  <p className={styles.source}>
                    Berdasarkan data terakhir.{' '}
                    {!online
                      ? 'Perangkat terputus; kondisi saat ini belum dapat dipastikan.'
                      : 'Sensor mengalami gangguan; periksa perangkat sebelum mengandalkan pengukuran.'}
                  </p>
                ) : null}
                <MuteAlarmButton />
              </div>
              <div className={styles.gauge}>
                <GasGauge
                  ppm={telemetry.ppm}
                  unreliable={unreliable.ppm}
                  showReadout={false}
                />
              </div>
            </section>
            <section className={styles.air} aria-labelledby="air-title">
              <h2 id="air-title" className={styles.groupTitle}>
                Udara
              </h2>
              <Card className={styles.sensorPanel}>
                <dl className={styles.sensors}>
                  {[
                    {
                      key: 't' as const,
                      title: 'Suhu',
                      icon: Thermometer,
                      unit: '°C',
                      assessment: assessTemperature(telemetry.t),
                    },
                    {
                      key: 'h' as const,
                      title: 'Kelembapan',
                      icon: Droplet,
                      unit: '%',
                      assessment: assessHumidity(telemetry.h),
                    },
                    {
                      key: 'ppm' as const,
                      title: 'Kadar gas',
                      icon: Wind,
                      unit: 'ppm',
                      assessment: assessGas(telemetry.ppm),
                    },
                  ].map(({ key, title, icon: Icon, unit, assessment }) => (
                    <div
                      key={key}
                      className={styles.sensorRow}
                      data-unreliable={unreliable[key]}
                    >
                      <dt>
                        <Icon size={20} aria-hidden="true" />
                        {title}
                      </dt>
                      <dd className={styles.value}>
                        <SensorNumber
                          value={formatNumber(
                            telemetry[key],
                            key === 'ppm' ? 0 : 1,
                          )}
                        />{' '}
                        <span>{unit}</span>
                      </dd>
                      <dd className={styles.assessment}>
                        {unreliable[key] ? (
                          <span>Tidak andal</span>
                        ) : (
                          <LevelMeter
                            name={title}
                            status={assessment.status}
                            label={assessment.label}
                            stale={!online}
                          />
                        )}
                      </dd>
                      {unreliable[key] ? (
                        <dd className={styles.sensorNote}>{UNRELIABLE_NOTE}</dd>
                      ) : null}
                    </div>
                  ))}
                </dl>
              </Card>
            </section>
          </>
        ) : (
          <Card className={styles.full}>
            <EmptyState title="Belum ada pengukuran">
              Menunggu data suhu, kelembapan, dan kadar gas dari perangkat.
            </EmptyState>
          </Card>
        )}
        <section className={styles.devices} aria-labelledby="devices-title">
          <h2 id="devices-title" className={styles.groupTitle}>
            Perangkat
          </h2>
          <Card className={styles.actuators}>
            <div className={styles.connection}>
              <span>Koneksi</span>
              <Badge tone={online ? 'safe' : 'danger'}>
                <StatusDot />
                {online ? 'Terhubung' : 'Terputus'}
              </Badge>
            </div>
            <FaultBadge fault={state?.fault ?? 0} />
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
        </section>
        <GasTrend />
      </div>
    </>
  );
}
