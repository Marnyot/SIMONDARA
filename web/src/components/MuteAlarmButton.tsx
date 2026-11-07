import { useEffect, useRef, useState } from 'react';
import { BellOff } from 'lucide-react';
import { useRoom } from '../live/context';
import { Button } from './ui/Button';
import styles from './MuteAlarmButton.module.css';

export function MuteAlarmButton({
  alwaysShow = false,
}: {
  alwaysShow?: boolean;
}) {
  const { state, online, connection, sendCommand } = useRoom();
  const [result, setResult] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [error, setError] = useState('');
  const [requestedMute, setRequestedMute] = useState<number | null>(null);
  const pending = useRef(false);
  const active = state?.status === 2 && state.buzzer === 1 && state.mute === 0;
  const [previousActive, setPreviousActive] = useState(active);
  const [previousMute, setPreviousMute] = useState(state?.mute);
  if (previousActive !== active || previousMute !== state?.mute) {
    setPreviousMute(state?.mute);
    setPreviousActive(active);
    setResult('idle');
  }
  if (result === 'success' && requestedMute === state?.mute) setResult('idle');
  useEffect(() => {
    if (result !== 'success') return;
    const timer = window.setTimeout(() => {
      setError('Alat belum membalas. Coba lagi.');
      setResult('error');
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [result]);
  const mute = async () => {
    if (pending.current) return;
    pending.current = true;
    setRequestedMute(state?.mute === 1 ? 0 : 1);
    setResult('loading');
    try {
      await sendCommand({ mute: state?.mute === 1 ? 0 : 1 });
      setResult('success');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Gagal membisukan alarm. Coba lagi.',
      );
      setResult('error');
    } finally {
      pending.current = false;
    }
  };
  if (!state || (!alwaysShow && state.status !== 2)) return null;
  const muted = state.mute === 1;
  if (!muted && result !== 'success' && !alwaysShow && state.buzzer !== 1)
    return null;
  const offline = !online || connection !== 'connected';
  // Satu struktur DOM untuk semua keadaan agar tombol tidak di-mount ulang
  // (mount ulang memicu animasi masuk dan terlihat seperti halaman refresh).
  return (
    <div className={styles.wrapper}>
      <Button
        variant="secondary"
        disabled={offline || result === 'success'}
        loading={result === 'loading'}
        onClick={() => void mute()}
      >
        {muted ? null : <BellOff size={17} aria-hidden="true" />}
        {muted
          ? 'Aktifkan alarm'
          : result === 'loading'
            ? 'Membisukan alarm…'
            : result === 'error'
              ? 'Coba bisukan alarm lagi'
              : 'Bisukan alarm'}
      </Button>
      {result === 'success' ? (
        <p role="status" className={styles.feedback}>
          {muted
            ? 'Menunggu balasan alat…'
            : 'Perintah terkirim, menunggu balasan alat…'}
        </p>
      ) : muted ? (
        <p role="status" className={styles.feedback}>
          Alarm dibisukan.
        </p>
      ) : offline ? (
        <p className={styles.feedback}>
          Alarm bisa dibisukan setelah alat dan server tersambung.
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
