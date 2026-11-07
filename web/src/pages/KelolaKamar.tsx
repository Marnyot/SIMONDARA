import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Room } from '../api/types';
import { deviceIdSchema } from '../api/types';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { NewDevices } from '../features/kamar/NewDevices';
import { RoomForm } from '../features/kamar/RoomForm';
import { RoomRow } from '../features/kamar/RoomRow';
import { describeRoomError } from '../features/kamar/rooms';
import styles from '../features/kamar/kamar.module.css';
import { NotificationsPanel } from '../features/notifikasi/NotificationsPanel';
import { useLive } from '../live/context';

export default function KelolaKamar() {
  const { rooms, unregistered, deleteRoom } = useLive();
  const [query, setQuery] = useSearchParams();
  const prefill = deviceIdSchema.safeParse(query.get('deviceId')).data ?? '';
  const [notice, setNotice] = useState('');
  const [target, setTarget] = useState<Room | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const listTitle = useRef<HTMLHeadingElement>(null);

  const closeDialog = () => {
    setTarget(null);
    setDeleteError(null);
  };
  const confirmDelete = async () => {
    if (!target || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteRoom(target.deviceId);
      setNotice(`Kamar "${target.name}" dihapus beserta data historisnya.`);
      closeDialog();
    } catch (cause) {
      setDeleteError(describeRoomError(cause).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Kelola Kamar"
        subtitle="Tambah kamar baru, ubah nama, atau hapus kamar"
      />
      <div role="status" className={styles.notice}>
        {notice}
      </div>
      <div className={styles.manage}>
        <NotificationsPanel />
        <div className={styles.manageColumn}>
          <NewDevices devices={unregistered} />
          <RoomForm
            prefill={prefill}
            onCreated={(room) => {
              setNotice(`Kamar "${room.name}" ditambahkan.`);
              if (prefill) setQuery({}, { replace: true });
            }}
          />
        </div>
        <Card className={`${styles.panel} ${styles.registeredPanel}`}>
          <h2 ref={listTitle} tabIndex={-1} className={styles.panelTitle}>
            Kamar terdaftar ({rooms.length})
          </h2>
          {rooms.length ? (
            <ul className={styles.roomList}>
              {rooms.map((room) => (
                <RoomRow
                  key={room.deviceId}
                  room={room}
                  onRenamed={({ name }) =>
                    setNotice(`Nama kamar diubah menjadi "${name}".`)
                  }
                  onDelete={setTarget}
                />
              ))}
            </ul>
          ) : (
            <EmptyState title="Belum ada kamar">
              Kamar yang ditambahkan akan tampil di sini.
            </EmptyState>
          )}
        </Card>
      </div>
      <ConfirmDialog
        open={target !== null}
        title={`Hapus kamar "${target?.name ?? ''}"?`}
        confirmLabel={deleting ? 'Menghapus…' : 'Hapus kamar'}
        pending={deleting}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onCancel={closeDialog}
        onClosed={() => {
          // The trigger disappears with a deleted room; keep keyboard users in the list.
          if (document.activeElement === document.body)
            listTitle.current?.focus();
        }}
      >
        <p>
          Seluruh data historis perangkat <strong>{target?.deviceId}</strong>{' '}
          (telemetri dan peristiwa) ikut terhapus permanen dan tidak dapat
          dikembalikan.
        </p>
        <p>
          Jika perangkat masih mengirim data, ia akan muncul lagi sebagai
          perangkat baru.
        </p>
      </ConfirmDialog>
    </>
  );
}
