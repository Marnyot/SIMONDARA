import { useState } from 'react';
import type { FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Room } from '../../api/types';
import { roomNameSchema } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { StatusDot } from '../../components/ui/StatusDot';
import { TextField } from '../../components/ui/TextField';
import { RoomNotification } from '../notifikasi/RoomNotification';
import { useLive } from '../../live/context';
import { describeRoomError, fieldError, roomUrl } from './rooms';
import styles from './kamar.module.css';

export function RoomRow({
  room,
  onRenamed,
  onDelete,
}: {
  room: Room;
  onRenamed: (room: Room) => void;
  onDelete: (room: Room) => void;
}) {
  const { renameRoom } = useLive();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [closedEditor, setClosedEditor] = useState(false);

  const close = () => {
    setClosedEditor(true);
    setDraft(null);
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (draft === null || saving) return;
    const invalid = fieldError(roomNameSchema, draft);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (draft.trim() === room.name) {
      close();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onRenamed(await renameRoom(room.deviceId, draft.trim()));
      close();
    } catch (cause) {
      setError(describeRoomError(cause).message);
    } finally {
      setSaving(false);
    }
  };

  if (draft !== null)
    return (
      <li>
        <form
          className={styles.renameForm}
          noValidate
          onSubmit={(event) => void submit(event)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !saving) close();
          }}
        >
          <TextField
            label={`Nama baru untuk ${room.name}`}
            error={error}
            autoFocus
            autoComplete="off"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
          />
          <div className={styles.rowActions}>
            <Button type="submit" loading={saving}>
              {saving ? 'Menyimpan…' : 'Simpan'}
            </Button>
            <Button variant="ghost" disabled={saving} onClick={close}>
              Batal
            </Button>
          </div>
        </form>
      </li>
    );

  return (
    <li className={styles.roomRow}>
      <div className={styles.rowInfo}>
        <Link viewTransition to={roomUrl(room.deviceId)}>{room.name}</Link>
        <span>
          <StatusDot
            color={room.online ? 'var(--color-safe)' : 'var(--color-danger)'}
          />
          {room.deviceId}, {room.online ? 'terhubung' : 'terputus'}
        </span>
      </div>
      <RoomNotification room={room} />
      <div className={`${styles.rowActions} ${styles.roomActions}`}>
        <Button
          variant="ghost"
          aria-label={`Ubah nama ${room.name}`}
          // Keyboard users land back on this button when the editor closes.
          autoFocus={closedEditor}
          onClick={() => setDraft(room.name)}
        >
          <Pencil size={16} aria-hidden="true" />
          Ubah nama
        </Button>
        <Button
          variant="ghost"
          className={styles.deleteButton}
          aria-label={`Hapus ${room.name}`}
          onClick={() => onDelete(room)}
        >
          <Trash2 size={16} aria-hidden="true" />
          Hapus
        </Button>
      </div>
    </li>
  );
}
