import { useId } from 'react';
import type { ReactNode } from 'react';
import { BellOff, BellRing } from 'lucide-react';
import type { DeviceState } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Toggle } from '../../components/ui/Toggle';
import styles from './kontrol.module.css';

export const MANUAL_HINT = 'Ubah ke mode Manual untuk mengendalikan';

function PendingNote() {
  return (
    <span className={styles.pending}>
      <span className={styles.spinner} aria-hidden="true" />
      Menunggu konfirmasi perangkat…
    </span>
  );
}

function CardHeading({
  title,
  status,
  pending,
  aside,
}: {
  title: string;
  status?: ReactNode;
  pending: boolean;
  aside?: ReactNode;
}) {
  return (
    <div className={styles.heading}>
      <div>
        <h2 className={styles.title}>{title}</h2>
        {pending || status ? (
          <p className={styles.status} aria-live="polite">
            {pending ? <PendingNote /> : status}
          </p>
        ) : null}
      </div>
      {aside}
    </div>
  );
}

interface CommonProps {
  disabled: boolean;
  pending: boolean;
  hint?: string | null;
}

export function SwitchCard({
  title,
  onLabel,
  checked,
  onChange,
  disabled,
  pending,
  hint,
}: CommonProps & {
  title: string;
  onLabel: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const hintId = useId();
  return (
    <Card className={styles.card} data-disabled={disabled || undefined}>
      <CardHeading
        title={title}
        status={checked ? onLabel : 'Mati'}
        pending={pending}
        aside={
          <Toggle
            label={title}
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            aria-busy={pending || undefined}
            aria-describedby={hint ? hintId : undefined}
          />
        }
      />
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
    </Card>
  );
}

const MODE_OPTIONS = [
  { value: 0, label: 'Otomatis' },
  { value: 1, label: 'Manual' },
] as const;

export function ModeCard({
  value,
  onChange,
  disabled,
  pending,
}: CommonProps & {
  value: DeviceState['mode'];
  onChange: (value: DeviceState['mode']) => void;
}) {
  return (
    <Card className={styles.card} aria-busy={pending || undefined}>
      <CardHeading title="Mode Sistem" pending={pending} />
      <SegmentedControl
        label="Mode Sistem"
        options={MODE_OPTIONS}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
      <p className={styles.description}>
        {value === 0 ? (
          <>
            Kipas, LED, dan buzzer mengikuti kualitas udara: LED{' '}
            <strong className={styles.safe}>hijau</strong> saat Aman,{' '}
            <strong className={styles.warning}>kuning</strong> saat Waspada,{' '}
            <strong className={styles.danger}>merah</strong> saat Bahaya.
          </>
        ) : (
          'Kipas, LED, dan buzzer dikendalikan langsung dari aplikasi ini.'
        )}
      </p>
    </Card>
  );
}

const LED_OPTIONS = [
  { value: 0, label: 'Mati' },
  { value: 1, label: 'Hijau' },
  { value: 2, label: 'Kuning' },
  { value: 3, label: 'Merah' },
] as const;

export function LedCard({
  value,
  onChange,
  disabled,
  pending,
  hint,
}: CommonProps & {
  value: DeviceState['led'];
  onChange: (value: DeviceState['led']) => void;
}) {
  const label = LED_OPTIONS[value].label;
  return (
    <Card
      className={styles.card}
      data-disabled={disabled || undefined}
      aria-busy={pending || undefined}
    >
      <CardHeading
        title="LED Indikator"
        status={value === 0 ? 'Mati' : `Menyala ${label.toLowerCase()}`}
        pending={pending}
        aside={
          <span
            className={styles.lamp}
            data-led={value}
            role="img"
            aria-label={`LED ${label.toLowerCase()}`}
          />
        }
      />
      <SegmentedControl
        label="Warna LED Indikator"
        options={LED_OPTIONS}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </Card>
  );
}

export function MuteCard({
  muted,
  danger,
  onChange,
  disabled,
  pending,
}: CommonProps & {
  muted: boolean;
  danger: boolean;
  onChange: (muted: boolean) => void;
}) {
  const Icon = muted ? BellOff : BellRing;
  const text = muted
    ? 'Alarm dibisukan sampai status kembali Aman.'
    : danger
      ? 'Status Bahaya: buzzer sedang membunyikan alarm.'
      : 'Buzzer berbunyi otomatis saat status Bahaya.';
  return (
    <Card
      className={`${styles.card} ${styles.mute}`}
      data-danger={danger || undefined}
      aria-busy={pending || undefined}
    >
      <div className={styles.muteBody}>
        <span className={styles.muteIcon} aria-hidden="true">
          <Icon size={22} />
        </span>
        <div>
          <h2 className={styles.title}>{danger ? 'Alarm bahaya' : 'Alarm'}</h2>
          <p className={styles.status} aria-live="polite">
            {pending ? <PendingNote /> : text}
          </p>
        </div>
      </div>
      <Button
        variant={danger && !muted ? 'primary' : 'secondary'}
        className={styles.muteButton}
        disabled={disabled}
        aria-busy={pending || undefined}
        onClick={() => onChange(!muted)}
      >
        {muted ? 'Aktifkan alarm' : 'Bisukan alarm'}
      </Button>
    </Card>
  );
}
