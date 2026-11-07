import { useId } from 'react';
import type { ReactNode } from 'react';
import type { DeviceState } from '../../api/types';
import { Card } from '../../components/ui/Card';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { StatusDot } from '../../components/ui/StatusDot';
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
  headingTag: Heading = 'h3',
}: {
  title: string;
  status?: ReactNode;
  pending: boolean;
  aside?: ReactNode;
  headingTag?: 'h2' | 'h3';
}) {
  return (
    <div className={styles.heading}>
      <div>
        <Heading className={styles.title}>{title}</Heading>
        {pending || status ? (
          <p className={styles.status} aria-live="polite">
            {status}
            {pending ? (
              <>
                <br />
                <PendingNote />
              </>
            ) : null}
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
  actual,
  onChange,
  disabled,
  pending,
  hint,
}: CommonProps & {
  title: string;
  onLabel: string;
  checked: boolean;
  actual?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const hintId = useId();
  return (
    <Card className={styles.card} data-disabled={disabled || undefined}>
      <CardHeading
        title={title}
        status={`Status perangkat: ${(actual ?? checked) ? onLabel : 'Mati'}`}
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
      {disabled ? (
        <span className={styles.locked}>
          <StatusDot />
          Kontrol nonaktif
        </span>
      ) : null}
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
  actual,
  onChange,
  disabled,
  pending,
}: CommonProps & {
  value: DeviceState['mode'];
  actual: DeviceState['mode'];
  onChange: (value: DeviceState['mode']) => void;
}) {
  return (
    <Card className={styles.card} aria-busy={pending || undefined}>
      <CardHeading
        title="Mode Sistem"
        headingTag="h2"
        status={`Mode perangkat: ${actual === 0 ? 'Otomatis' : 'Manual'}`}
        pending={pending}
      />
      <SegmentedControl
        label="Mode Sistem"
        options={MODE_OPTIONS}
        value={value}
        onChange={onChange}
        disabled={disabled || pending}
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
  actual,
  onChange,
  disabled,
  pending,
  hint,
}: CommonProps & {
  value: DeviceState['led'];
  actual?: DeviceState['led'];
  onChange: (value: DeviceState['led']) => void;
}) {
  const reported = actual ?? value;
  const label = LED_OPTIONS[reported].label;
  return (
    <Card
      className={styles.card}
      data-disabled={disabled || undefined}
      aria-busy={pending || undefined}
    >
      <CardHeading
        title="LED Indikator"
        status={`Status perangkat: ${LED_OPTIONS[actual ?? value].label}`}
        pending={pending}
        aside={
          <span
            className={styles.lamp}
            data-led={reported}
            role="img"
            aria-label={`LED ${label.toLowerCase()}`}
          />
        }
      />
      {disabled ? (
        <span className={styles.locked}>
          <StatusDot />
          Kontrol nonaktif
        </span>
      ) : null}
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
