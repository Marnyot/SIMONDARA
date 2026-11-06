import { useRef, useState } from 'react';
import { BellOff } from 'lucide-react';
import { useRoom } from '../live/context';
import { Button } from './ui/Button';
import styles from './MuteAlarmButton.module.css';

export function MuteAlarmButton() {
  const { state, online, connection, sendCommand } = useRoom();
  const [result, setResult] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const active = state?.status === 2 && state.buzzer === 1 && state.mute === 0;
  const [previousActive, setPreviousActive] = useState(active);
  if (previousActive !== active) {
    setPreviousActive(active);
    setResult('idle');
  }
  const mute = async () => {
    if (pending.current) return;
    pending.current = true;
    setResult('loading');
    try {
      await sendCommand({ mute: 1 });
      setResult('success');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Alarm gagal dibisukan. Coba lagi.',
      );
      setResult('error');
    } finally {
      pending.current = false;
    }
  };
  if (state?.status !== 2) return null;
  if (state.mute === 1)
    return (
      <p role="status" className={styles.feedback}>
        Alarm dibisukan.
      </p>
    );
  if (result === 'success' && state.buzzer === 1)
    return (
      <p role="status" className={styles.feedback}>
        Perintah bisukan alarm terkirim. Menunggu konfirmasi perangkat.
      </p>
    );
  if (state.buzzer !== 1) return null;
  return (
    <div className={styles.wrapper}>
      <Button
        variant="secondary"
        disabled={!online || connection !== 'connected'}
        loading={result === 'loading'}
        onClick={() => void mute()}
      >
        <BellOff size={17} aria-hidden="true" />
        {result === 'loading'
          ? 'Membisukan alarm…'
          : result === 'error'
            ? 'Coba bisukan alarm lagi'
            : 'Bisukan alarm'}
      </Button>
      {!online || connection !== 'connected' ? (
        <p className={styles.feedback}>
          Hubungkan perangkat dan server untuk membisukan alarm.
        </p>
      ) : null}
      {result === 'error' ? (
        <p role="alert" className={styles.feedback}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
