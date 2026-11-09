import { X } from '@phosphor-icons/react/dist/csr/X';
import { MuteAlarmButton } from '../components/MuteAlarmButton';
import { RoomHeader } from '../components/RoomHeader';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import {
  LedCard,
  ModeCard,
  SwitchCard,
} from '../features/kontrol/ControlCards';
import { ConnectionCard, LcdCard } from '../features/kontrol/StatusCards';
import { useDeviceCommands } from '../features/kontrol/useDeviceCommands';
import { useRoom } from '../live/context';
import styles from './Kontrol.module.css';
import controlStyles from '../features/kontrol/kontrol.module.css';

export default function Kontrol() {
  const { state, telemetry, online, connection, updatedAt, sendCommand } =
    useRoom();
  const { values, pending, error, send, dismissError } = useDeviceCommands(
    state,
    sendCommand,
  );

  const serverReady = connection === 'connected';
  const offline = !online || !serverReady;
  const manual = state?.mode === 1 && !pending.mode;
  const actuatorDisabled = offline || !manual;

  const muteCard = values ? (
    <Card className={controlStyles.card}>
      <h3 className={controlStyles.title}>Alarm perangkat</h3>
      <p className={styles.sectionHint}>
        Matikan bunyi alarm sampai udara aman lagi.
      </p>
      <MuteAlarmButton alwaysShow />
    </Card>
  ) : null;

  return (
    <>
      <RoomHeader />
      {offline ? (
        <p className={styles.banner} role="status">
          {!online
            ? 'Alat sedang terputus. Kontrol bisa dipakai lagi setelah alat tersambung.'
            : 'Koneksi ke server putus. Kontrol dimatikan dulu sampai tersambung lagi.'}
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
          <h2 className={styles.sectionTitle}>Kontrol</h2>
          {values ? (
            <>
              <ModeCard
                value={values.mode}
                actual={state?.mode ?? values.mode}
                onChange={(mode) => send('mode', mode)}
                disabled={offline}
                pending={Boolean(pending.mode)}
              />
              <SwitchCard
                title="Kipas Exhaust"
                onLabel="Menyala"
                checked={values.fan === 1}
                actual={state?.fan === 1}
                onChange={(on) => send('fan', on ? 1 : 0)}
                disabled={actuatorDisabled}
                pending={Boolean(pending.fan)}
              />
              <SwitchCard
                title="Buzzer"
                onLabel="Berbunyi"
                checked={values.buzzer === 1}
                actual={state?.buzzer === 1}
                onChange={(on) => send('buzzer', on ? 1 : 0)}
                disabled={actuatorDisabled}
                pending={Boolean(pending.buzzer)}
              />
              <LedCard
                value={values.led}
                actual={state?.led}
                onChange={(led) => send('led', led)}
                disabled={actuatorDisabled}
                pending={Boolean(pending.led)}
              />
              {muteCard}
            </>
          ) : (
            <Card>
              <EmptyState title="Belum ada status perangkat">
                Kontrol bisa dipakai setelah alat mengirim status pertama.
                Pastikan NodeMCU menyala dan terhubung ke WiFi.
              </EmptyState>
            </Card>
          )}
        </div>
        <div className={styles.column}>
          <h2 className={styles.sectionTitle}>Status perangkat</h2>
          <LcdCard
            telemetry={telemetry}
            status={state?.status ?? null}
            online={online}
            fault={state?.fault ?? 0}
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
