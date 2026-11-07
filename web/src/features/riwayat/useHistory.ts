import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { Event, HistoryPoint } from '../../api/types';
import { historyWindow } from './history';
import type { HistoryRange } from './history';

type Result<T> = { data: T[]; error: string | null; key: string };
/** The exact window that was requested, in epoch ms; charts use it as their time axis. */
export type HistoryWindow = { from: number; to: number };
const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'Data gagal dimuat. Coba lagi.';

export function useHistory(
  deviceId: string,
  range: HistoryRange,
  refreshMs = 0,
) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<
    (Result<HistoryPoint> & { window: HistoryWindow }) | null
  >(null);
  useEffect(() => {
    if (!refreshMs) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible')
        setAttempt((value) => value + 1);
    }, refreshMs);
    return () => window.clearInterval(timer);
  }, [refreshMs]);
  const key = `${deviceId}-${range}-${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    const { from, to, bucket } = historyWindow(range);
    const requested = { from: Date.parse(from), to: Date.parse(to) };
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(15000),
    ]);
    void api.history(deviceId, from, to, bucket, signal).then(
      ({ points }) => {
        if (!controller.signal.aborted)
          setResult({ data: points, error: null, key, window: requested });
      },
      (cause: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            data: [],
            error: message(cause),
            key,
            window: requested,
          });
      },
    );
    return () => controller.abort();
  }, [deviceId, range, key]);
  const current = result?.key === key ? result : null;
  return {
    points: current?.data ?? [],
    /** `from`/`to` of the request behind `points`; `null` while loading. */
    from: current?.window.from ?? null,
    to: current?.window.to ?? null,
    error: current?.error ?? null,
    loading: !current,
    retry: () => setAttempt((value) => value + 1),
  };
}

export function useEvents(deviceId: string, range: HistoryRange) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result<Event> | null>(null);
  const key = `${deviceId}-${range}-${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(15000),
    ]);
    void api.events(deviceId, 50, signal).then(
      ({ events }) => {
        if (!controller.signal.aborted)
          setResult({
            data: [...events].sort(
              (a, b) => Date.parse(b.at) - Date.parse(a.at),
            ),
            error: null,
            key,
          });
      },
      (cause: unknown) => {
        if (!controller.signal.aborted)
          setResult({ data: [], error: message(cause), key });
      },
    );
    return () => controller.abort();
  }, [deviceId, range, key]);
  return {
    events: result?.key === key ? result.data : [],
    error: result?.key === key ? result.error : null,
    loading: result?.key !== key,
    retry: () => setAttempt((value) => value + 1),
  };
}
