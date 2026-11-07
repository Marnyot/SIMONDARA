import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { Notifications, NotificationsPatch } from '../../api/types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusDot } from '../../components/ui/StatusDot';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Toggle } from '../../components/ui/Toggle';
import { useLive } from '../../live/context';
import styles from './notifikasi.module.css';

export function NotificationsPanel() {
  const { notifications, updateNotifications } = useLive();
  const [loaded, setLoaded] = useState<Notifications | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [minutes, setMinutes] = useState(60);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const controller = new AbortController();
    api
      .notifications(controller.signal)
      .then(setLoaded)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && cause.status === 404)
          setUnavailable(true);
        else setError('Pengaturan notifikasi gagal dimuat. Coba lagi.');
      });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const data = notifications ?? loaded;
  const paused = data?.snoozedUntil && Date.parse(data.snoozedUntil) > now;
  const save = async (patch: NotificationsPatch) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      setLoaded(await (updateNotifications ?? api.updateNotifications)(patch));
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404)
        setUnavailable(true);
      else setError('Gagal menyimpan. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className={styles.panel}>
      <h2>Notifikasi Telegram</h2>
      <p>
        Kabar soal kualitas udara, alat terputus, dan sensor bermasalah dari
        semua kamar.
      </p>
      {unavailable && !notifications ? (
        <p role="status">Server ini belum mendukung pengaturan notifikasi.</p>
      ) : data ? (
        <>
          <div className={styles.row}>
            <span className={styles.status}>
              <StatusDot
                color={
                  data.enabled ? 'var(--color-safe)' : 'var(--color-muted)'
                }
              />
              {data.enabled ? 'Aktif' : 'Mati'}
            </span>
            <Toggle
              label="Notifikasi Telegram global"
              checked={data.enabled}
              disabled={busy}
              onChange={(enabled) => void save({ enabled })}
            />
          </div>
          {paused ? (
            <div className={styles.pause}>
              <p role="status">
                Dijeda sampai{' '}
                {new Date(data.snoozedUntil!).toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void save({ snoozeMinutes: 0 })}
              >
                Batalkan jeda
              </Button>
            </div>
          ) : (
            <div className={styles.pause}>
              <div className={styles.duration}>
                <span>Lama jeda</span>
                <SegmentedControl
                  label="Lama jeda"
                  value={minutes}
                  onChange={setMinutes}
                  disabled={busy || !data.enabled}
                  options={[
                    { value: 15, label: '15 mnt' },
                    { value: 60, label: '1 jam' },
                    { value: 480, label: '8 jam' },
                    { value: 1440, label: '24 jam' },
                  ]}
                />
              </div>
              <Button
                variant="secondary"
                disabled={busy || !data.enabled}
                onClick={() => void save({ snoozeMinutes: minutes })}
              >
                Jeda
              </Button>
            </div>
          )}
          <p className={styles.hint}>
            Selama dijeda, notifikasi tidak dikirim dan tidak menyusul nanti.
            Alarm di alat tetap bunyi.
          </p>
        </>
      ) : !error ? (
        <p role="status">Memuat pengaturan…</p>
      ) : null}
      {error ? (
        <div role="alert">
          <p>{error}</p>
          {!data ? (
            <Button
              variant="ghost"
              onClick={() => {
                setError('');
                setAttempt((value) => value + 1);
              }}
            >
              Coba lagi
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
