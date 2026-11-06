import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import ui from '../components/ui/ui.module.css';
import { NewDevices } from '../features/kamar/NewDevices';
import { RoomCard } from '../features/kamar/RoomCard';
import { summarizeRooms } from '../features/kamar/rooms';
import styles from '../features/kamar/kamar.module.css';
import { useLive } from '../live/context';

export default function DaftarKamar() {
  const { rooms, unregistered } = useLive();
  return (
    <>
      <PageHeader title="Daftar Kamar" subtitle={summarizeRooms(rooms)} />
      {rooms.length ? (
        <div className={styles.roomGrid}>
          {rooms.map((room) => (
            <RoomCard key={room.deviceId} room={room} />
          ))}
        </div>
      ) : (
        <Card className={styles.emptyRooms}>
          <EmptyState
            title="Belum ada kamar"
            action={
              <Link to="/kelola" className={ui.button}>
                <Plus size={16} aria-hidden="true" />
                Tambah kamar
              </Link>
            }
          >
            Daftarkan perangkat NodeMCU sebagai kamar untuk mulai memantau
            kualitas udaranya.
          </EmptyState>
        </Card>
      )}
      <NewDevices devices={unregistered} />
    </>
  );
}
