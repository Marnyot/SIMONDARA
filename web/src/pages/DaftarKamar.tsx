import { useState } from 'react';
import { Plus } from '@phosphor-icons/react/dist/csr/Plus';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import ui from '../components/ui/ui.module.css';
import { NewDevices } from '../features/kamar/NewDevices';
import { RecentActivity } from '../features/kamar/RecentActivity';
import { RoomCard } from '../features/kamar/RoomCard';
import { countRooms, sortRooms } from '../features/kamar/rooms';
import styles from '../features/kamar/DaftarKamar.module.css';
import { useLive } from '../live/context';

export default function DaftarKamar() {
  const { ready } = useLive();
  if (!ready)
    return (
      <>
        <PageHeader title="Daftar Kamar" subtitle="Memuat kamar…" />
        <div className={styles.summary} aria-label="Memuat ringkasan kamar">
          <Skeleton height={84} />
          <Skeleton height={84} />
        </div>
        <div className={styles.overview}>
          <div className={styles.roomGrid}>
            {[0, 1].map((index) => (
              <article
                key={index}
                className={`${styles.roomCard} ${styles.roomSkeleton}`}
                aria-label="Memuat kamar"
              >
                <div>
                  <Skeleton height={22} />
                  <Skeleton height={16} />
                  <Skeleton height={20} />
                </div>
                <div className={styles.readings}>
                  {[0, 1, 2].map((sensor) => (
                    <Skeleton key={sensor} height={42} />
                  ))}
                </div>
                <Skeleton height={80} />
                <Skeleton height={34} />
              </article>
            ))}
          </div>
          <Card className={styles.activity}>
            <h2>Aktivitas terbaru</h2>
            <Skeleton height={250} />
          </Card>
        </div>
      </>
    );
  return <RoomOverview />;
}

function RoomOverview() {
  const { rooms, unregistered } = useLive();
  const [initialRooms] = useState(
    () => new Set(rooms.map((room) => room.deviceId)),
  );
  const counts = countRooms(rooms);
  return (
    <>
      <PageHeader
        title="Daftar Kamar"
        subtitle={`${rooms.length} kamar terdaftar`}
      />
      <div className={styles.summary} aria-label="Ringkasan kondisi kamar">
        {(
          [
            {
              title: 'Kualitas udara',
              stats: [
                ['safe', 'Aman'],
                ['warning', 'Waspada'],
                ['danger', 'Bahaya'],
              ],
            },
            {
              title: 'Perangkat',
              stats: [
                ['offline', 'Terputus'],
                ['fault', 'Gangguan'],
              ],
            },
          ] as const
        ).map(({ title, stats }) => (
          <section
            key={title}
            className={styles.summaryGroup}
            aria-label={title}
          >
            <h2>{title}</h2>
            <dl>
              {stats.map(([key, label]) => (
                <div key={key} data-kind={key}>
                  <dt>{label}</dt>
                  <dd>{counts[key]}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      {counts.pending ? (
        <p className={styles.hint}>
          {counts.pending} kamar belum mengirim pengukuran.
        </p>
      ) : null}
      <div className={styles.overview}>
        {rooms.length ? (
          <div className={styles.roomGrid}>
            {sortRooms(rooms).map((room, index) => (
              <div
                key={room.deviceId}
                style={{ animationDelay: `${Math.min(index, 4) * 40}ms` }}
                className={
                  initialRooms.has(room.deviceId) ? 'motion-content' : undefined
                }
              >
                <RoomCard room={room} />
              </div>
            ))}
          </div>
        ) : (
          <Card className={styles.emptyRooms}>
            <EmptyState
              title="Belum ada kamar"
              action={
                <Link viewTransition to="/kelola" className={ui.button}>
                  <Plus size={16} aria-hidden="true" />
                  Tambah kamar
                </Link>
              }
            >
              Daftarkan NodeMCU sebagai kamar supaya udaranya bisa dipantau.
            </EmptyState>
          </Card>
        )}
        <RecentActivity rooms={rooms} />
      </div>
      <NewDevices devices={unregistered} />
    </>
  );
}
