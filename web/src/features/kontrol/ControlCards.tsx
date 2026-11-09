import type { ReactNode } from 'react';
import type { DeviceState } from '../../api/types';
import { Card } from '../../components/ui/Card';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Toggle } from '../../components/ui/Toggle';
import styles from './kontrol.module.css';

export const MANUAL_HINT =
  'Mode Otomatis aktif, kontrol dimatikan. Pindah ke Manual untuk mengatur sendiri';

function PendingNote() {
  return (
    <span className={styles.pending}>
      <span className={styles.spinner} aria-hidden="true" />
      Menunggu balasan alat…
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
}

export function SwitchCard({
  title,
  onLabel,
  checked,
  actual,
  onChange,
  disabled,
  pending,
}: CommonProps & {
  title: string;
  onLabel: string;
  checked: boolean;
  actual?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Card
      className={`${styles.card} ${styles.actuator}`}
      data-disabled={disabled || undefined}
    >
      <CardHeading
        title={title}
        status={`Di alat: ${(actual ?? checked) ? onLabel : 'Mati'}`}
        pending={pending}
        aside={
          <Toggle
            label={title}
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            aria-busy={pending || undefined}
          />
        }
      />
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
        status={`Di alat: ${actual === 0 ? 'Otomatis' : 'Manual'}`}
        pending={pending}
      />
      <SegmentedControl
        label="Mode Sistem"
        options={MODE_OPTIONS}
        value={value}
        onChange={onChange}
        disabled={disabled || pending}
      />
      {value === 0 ? <p className={styles.hint}>{MANUAL_HINT}</p> : null}
      <p className={styles.description}>
        {value === 0 ? (
          <>
            Kipas, LED, dan buzzer mengikuti kualitas udara: LED{' '}
            <strong className={styles.safe}>hijau</strong> saat Aman,{' '}
            <strong className={styles.warning}>kuning</strong> saat Waspada,{' '}
            <strong className={styles.danger}>merah</strong> saat Bahaya.
          </>
        ) : (
          'Kipas, LED, dan buzzer kamu atur sendiri dari sini.'
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
}: CommonProps & {
  value: DeviceState['led'];
  actual?: DeviceState['led'];
  onChange: (value: DeviceState['led']) => void;
}) {
  return (
    <Card
      className={`${styles.card} ${styles.actuator}`}
      data-disabled={disabled || undefined}
      aria-busy={pending || undefined}
    >
      <CardHeading
        title="LED Indikator"
        status={`Di alat: ${LED_OPTIONS[actual ?? value].label}`}
        pending={pending}
      />
      <SegmentedControl
        label="Warna LED Indikator"
        options={LED_OPTIONS}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    </Card>
  );
}
