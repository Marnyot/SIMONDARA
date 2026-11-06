import { X } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import {
  LedCard,
  MANUAL_HINT,
  ModeCard,
  MuteCard,
  SwitchCard,
} from '../features/kontrol/ControlCards';
import { ConnectionCard, LcdCard } from '../features/kontrol/StatusCards';
import { useDeviceCommands } from '../features/kontrol/useDeviceCommands';
import { useRoom } from '../live/context';
import styles from './Kontrol.module.css';

export default function Kontrol() {
  const { name, state, telemetry, online, connection, updatedAt, sendCommand } =
    useRoom();
  const { values, pending, error, send, dismissError } = useDeviceCommands(
    state,
    sendCommand,
  );

  const serverReady = connection === 'connected';
  const offline = !online || !serverReady;
  const manual = state?.mode === 1 && !pending.mode;
  const actuatorDisabled = offline || !manual;
  const actuatorHint = !offline && !manual ? MANUAL_HINT : null;
  const danger = state?.status === 2;

  const muteCard = values ? (
    <MuteCard
      muted={values.mute === 1}
      danger={danger}
      onChange={(muted) => send('mute', muted ? 1 : 0)}
      disabled={offline}
      pending={Boolean(pending.mute)}
    />
  ) : null;

  return (
    <>
      <PageHeader
        title={name}
        subtitle="Kirim perintah ke NodeMCU dari jarak jauh"
        online={online}
      />
      {offline ? (
        <p className={styles.banner} role="status">
          {!online
            ? 'Perangkat terputus. Kontrol dinonaktifkan sampai perangkat tersambung kembali.'
            : 'Koneksi ke server terputus. Kontrol dinonaktifkan sementara aplikasi menyambung ulang.'}
        </p>
      ) : null}
      {error ? (
        <div className={styles.error} role="alert">
          <p>{error}</p>
          <button
            type="button"
            className={styles.dismiss}
            onClick={dismissError}
            aria-label="Tutup pesan kesalahan"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <div className={styles.grid}>
        <div className={styles.column}>
          {values ? (
            <>
              {danger ? muteCard : null}
              <ModeCard
                value={values.mode}
                onChange={(mode) => send('mode', mode)}
                disabled={offline}
                pending={Boolean(pending.mode)}
              />
              <SwitchCard
                title="Kipas Exhaust"
                onLabel="Menyala"
                checked={values.fan === 1}
                onChange={(on) => send('fan', on ? 1 : 0)}
                disabled={actuatorDisabled}
                pending={Boolean(pending.fan)}
                hint={actuatorHint}
              />
              <SwitchCard
                title="Buzzer"
                onLabel="Berbunyi"
                checked={values.buzzer === 1}
                onChange={(on) => send('buzzer', on ? 1 : 0)}
                disabled={actuatorDisabled}
                pending={Boolean(pending.buzzer)}
                hint={actuatorHint}
              />
              <LedCard
                value={values.led}
                onChange={(led) => send('led', led)}
                disabled={actuatorDisabled}
                pending={Boolean(pending.led)}
                hint={actuatorHint}
              />
              {danger ? null : muteCard}
            </>
          ) : (
            <Card>
              <EmptyState title="Belum ada status perangkat">
                Kontrol tersedia setelah perangkat mengirim status pertamanya.
                Pastikan NodeMCU menyala dan terhubung ke WiFi.
              </EmptyState>
            </Card>
          )}
        </div>
        <div className={styles.column}>
          <LcdCard
            telemetry={telemetry}
            status={state?.status ?? null}
            online={online}
            lcdFault={((state?.fault ?? 0) & 4) !== 0}
          />
          <ConnectionCard
            online={online}
            connection={connection}
            updatedAt={updatedAt}
            fault={state?.fault ?? null}
          />
        </div>
      </div>
    </>
  );
}
