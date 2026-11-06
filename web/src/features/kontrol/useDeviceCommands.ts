import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import type { Command, DeviceState } from '../../api/types';

export type CommandField = Exclude<keyof DeviceState, 'status' | 'fault'>;
export type CommandValues = Pick<DeviceState, CommandField>;

/** How long to wait for the device to echo a command through SSE `state`. */
export const CONFIRM_TIMEOUT_MS = 8000;

export const FIELD_LABEL: Record<CommandField, string> = {
  mode: 'Mode sistem',
  fan: 'Kipas exhaust',
  led: 'LED indikator',
  buzzer: 'Buzzer',
  mute: 'Bisukan alarm',
};

interface PendingEntry {
  id: number;
  value: number;
}
type PendingMap = Partial<Record<CommandField, PendingEntry>>;
interface CommandsState {
  pending: PendingMap;
  error: string | null;
}

const FIELDS = Object.keys(FIELD_LABEL) as CommandField[];

function withoutField(pending: PendingMap, field: CommandField): PendingMap {
  const next = { ...pending };
  delete next[field];
  return next;
}

/** Drops pending entries the device has confirmed. Returns the same object when nothing changed. */
function confirm(pending: PendingMap, state: DeviceState): PendingMap {
  let next = pending;
  for (const field of FIELDS) {
    const entry = pending[field];
    if (entry && state[field] === entry.value) next = withoutField(next, field);
  }
  return next;
}

export function describeCommandError(
  cause: unknown,
  field: CommandField,
): string {
  const label = FIELD_LABEL[field];
  if (cause instanceof ApiError) {
    if (cause.status === 503)
      return `${label}: broker MQTT sedang tidak tersedia sehingga perintah tidak terkirim. Coba lagi sebentar lagi.`;
    if (cause.status === 400)
      return `${label}: perintah ditolak server karena nilainya tidak valid.`;
    return `${label}: ${cause.message}`;
  }
  return `${label}: perintah gagal dikirim. Periksa koneksi lalu coba lagi.`;
}

let nextId = 1;

/**
 * Optimistic device commands. The displayed value changes immediately, stays
 * pending until the SSE `state` reports it, and rolls back to the real state
 * when the POST fails or no confirmation arrives within CONFIRM_TIMEOUT_MS.
 */
export function useDeviceCommands(
  state: DeviceState | null,
  sendCommand: (command: Command) => Promise<void>,
) {
  const [commands, setCommands] = useState<CommandsState>({
    pending: {},
    error: null,
  });
  const [seenState, setSeenState] = useState(state);
  const timers = useRef(new Set<number>());

  // Adjust during render when a new device state arrives (no extra effect pass).
  if (state !== seenState) {
    setSeenState(state);
    if (state) {
      const pending = confirm(commands.pending, state);
      if (pending !== commands.pending) setCommands({ ...commands, pending });
    }
  }

  useEffect(() => {
    const active = timers.current;
    return () => {
      for (const timer of active) window.clearTimeout(timer);
      active.clear();
    };
  }, []);

  const rollback = useCallback(
    (field: CommandField, id: number, message: string) =>
      setCommands((current) =>
        current.pending[field]?.id === id
          ? { pending: withoutField(current.pending, field), error: message }
          : current,
      ),
    [],
  );

  const send = useCallback(
    <F extends CommandField>(field: F, value: DeviceState[F]) => {
      // Discrete events flush synchronously, so this closure is never stale between clicks.
      if (!state || commands.pending[field] || state[field] === value) return;
      const id = nextId++;
      setCommands((current) => ({
        pending: { ...current.pending, [field]: { id, value } },
        error: null,
      }));
      const timer = window.setTimeout(() => {
        timers.current.delete(timer);
        rollback(
          field,
          id,
          `${FIELD_LABEL[field]}: perangkat tidak mengonfirmasi perintah dalam ${CONFIRM_TIMEOUT_MS / 1000} detik. Nilai dikembalikan ke kondisi terakhir.`,
        );
      }, CONFIRM_TIMEOUT_MS);
      timers.current.add(timer);
      sendCommand({ [field]: value } as Command).catch((cause: unknown) => {
        console.warn('Perintah perangkat gagal', { field, value }, cause);
        rollback(field, id, describeCommandError(cause, field));
      });
    },
    [state, commands.pending, sendCommand, rollback],
  );

  const dismissError = useCallback(
    () => setCommands((current) => ({ ...current, error: null })),
    [],
  );

  const values: CommandValues | null = state
    ? {
        mode: state.mode,
        fan: state.fan,
        led: state.led,
        buzzer: state.buzzer,
        mute: state.mute,
      }
    : null;
  if (values)
    for (const field of FIELDS) {
      const entry = commands.pending[field];
      if (entry) (values as Record<CommandField, number>)[field] = entry.value;
    }

  return {
    values,
    pending: commands.pending,
    error: commands.error,
    send,
    dismissError,
  };
}
