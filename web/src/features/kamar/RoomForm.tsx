import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Room } from '../../api/types';
import { deviceIdSchema, roomNameSchema } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/TextField';
import { useLive } from '../../live/context';
import { describeRoomError, fieldError } from './rooms';
import styles from './kamar.module.css';

interface Errors {
  deviceId?: string | null;
  name?: string | null;
  form?: string | null;
}

export function RoomForm({
  prefill,
  onCreated,
}: {
  /** Device picked from "Perangkat baru terdeteksi". */
  prefill: string;
  onCreated: (room: Room) => void;
}) {
  const { createRoom } = useLive();
  const titleId = useId();
  const [deviceId, setDeviceId] = useState(prefill);
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const deviceInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  const [seenPrefill, setSeenPrefill] = useState(prefill);
  if (prefill !== seenPrefill) {
    setSeenPrefill(prefill);
    setDeviceId(prefill);
    setErrors({});
  }
  // The ID is settled once a device is picked, so the name is what's left to type.
  useEffect(() => {
    if (prefill) nameInput.current?.focus();
  }, [prefill]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const invalid = {
      deviceId: fieldError(deviceIdSchema, deviceId),
      name: fieldError(roomNameSchema, name),
    };
    if (invalid.deviceId || invalid.name) {
      setErrors(invalid);
      (invalid.deviceId ? deviceInput : nameInput).current?.focus();
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const room = await createRoom({
        deviceId: deviceId.trim(),
        name: name.trim(),
      });
      setDeviceId('');
      setName('');
      onCreated(room);
    } catch (cause) {
      const { field, message } = describeRoomError(cause);
      setErrors({ [field ?? 'form']: message });
      if (field)
        (field === 'deviceId' ? deviceInput : nameInput).current?.focus();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card role="region" aria-labelledby={titleId} className={styles.panel}>
      <h2 id={titleId} className={styles.panelTitle}>
        Tambah kamar
      </h2>
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <TextField
          ref={deviceInput}
          label="ID perangkat"
          hint="Sama dengan deviceId di firmware NodeMCU, misalnya kamar-02."
          error={errors.deviceId}
          name="deviceId"
          value={deviceId}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => {
            setDeviceId(event.target.value);
            setErrors((current) => ({ ...current, deviceId: null }));
          }}
        />
        <TextField
          ref={nameInput}
          label="Nama kamar"
          hint="Tampil di aplikasi dan Telegram, maksimal 40 karakter."
          error={errors.name}
          name="name"
          value={name}
          autoComplete="off"
          onChange={(event) => {
            setName(event.target.value);
            setErrors((current) => ({ ...current, name: null }));
          }}
        />
        {errors.form ? (
          <p role="alert" className={styles.formError}>
            {errors.form}
          </p>
        ) : null}
        <Button type="submit" loading={saving}>
          {saving ? 'Menambahkan…' : 'Tambah kamar'}
        </Button>
      </form>
    </Card>
  );
}
