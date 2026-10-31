import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { Event, HistoryPoint } from '../../api/types';
import { historyWindow } from './history';
import type { HistoryRange } from './history';

type Result<T> = { data: T[]; error: string | null; key: string };
const message = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : 'Data gagal dimuat. Silakan coba lagi.';

export function useHistory(range: HistoryRange) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result<HistoryPoint> | null>(null);
  const key = `${range}-${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    const { from, to, bucket } = historyWindow(range);
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(15000),
    ]);
    void api.history(from, to, bucket, signal).then(
      ({ points }) => {
        if (!controller.signal.aborted)
          setResult({ data: points, error: null, key });
      },
      (cause: unknown) => {
        if (!controller.signal.aborted)
          setResult({ data: [], error: message(cause), key });
      },
    );
    return () => controller.abort();
  }, [range, key]);
  return {
    points: result?.key === key ? result.data : [],
    error: result?.key === key ? result.error : null,
    loading: result?.key !== key,
    retry: () => setAttempt((value) => value + 1),
  };
}

export function useEvents(range: HistoryRange) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result<Event> | null>(null);
  const key = `${range}-${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(15000),
    ]);
    void api.events(50, signal).then(
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
  }, [range, key]);
  return {
    events: result?.key === key ? result.data : [],
    error: result?.key === key ? result.error : null,
    loading: result?.key !== key,
    retry: () => setAttempt((value) => value + 1),
  };
}
