import { useCallback, useEffect, useReducer, useState } from 'react';
import type { ReactNode } from 'react';
import { api, sendCommand } from '../api/client';
import { LiveContext } from './context';
import { initialLiveState, liveReducer, parseLiveEvent } from './reducer';
export function LiveProvider({ children }: { children: ReactNode }) {
  const [live, dispatch] = useReducer(liveReducer, initialLiveState);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    let source: EventSource | undefined;
    let retryTimer: number | undefined;
    let failures = 0;
    let streamHasData = false;
    const received = new Set<string>();
    const controller = new AbortController();
    const initialTimeout = window.setTimeout(() => {
      if (!disposed)
        setError(
          'Data perangkat belum tersedia. Periksa koneksi server lalu coba lagi.',
        );
    }, 12000);
    api
      .snapshot(
        AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
      )
      .then((data) => {
        if (disposed) return;
        dispatch({ type: 'snapshot', data });
        setError(null);
        window.clearTimeout(initialTimeout);
      })
      .catch((cause: unknown) => {
        if (!disposed && !streamHasData)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Gagal memuat data perangkat.',
          );
      });
    const connect = () => {
      if (disposed) return;
      dispatch({
        type: 'connection',
        value: failures ? 'reconnecting' : 'connecting',
      });
      source = new EventSource('/api/stream', { withCredentials: true });
      source.onopen = () => {
        failures = 0;
        dispatch({ type: 'connection', value: 'connected' });
      };
      for (const type of ['state', 'telemetry', 'online']) {
        source.addEventListener(type, (message) => {
          if (disposed) return;
          const action = parseLiveEvent(
            type,
            (message as MessageEvent<string>).data,
          );
          if (action) {
            streamHasData = true;
            received.add(type);
            dispatch(action);
            setError(null);
            if (received.has('state') && received.has('online'))
              window.clearTimeout(initialTimeout);
          }
        });
      }
      source.onerror = () => {
        source?.close();
        if (disposed) return;
        dispatch({ type: 'connection', value: 'reconnecting' });
        // EventSource hides HTTP status; probe the session so expired cookies still trigger global logout.
        void api.me(controller.signal).catch(() => {});
        const delay = Math.min(30000, 1000 * 2 ** Math.min(failures++, 5));
        retryTimer = window.setTimeout(connect, delay + Math.random() * 250);
      };
    };
    connect();
    return () => {
      disposed = true;
      controller.abort();
      source?.close();
      window.clearTimeout(retryTimer);
      window.clearTimeout(initialTimeout);
    };
  }, [attempt]);
  const retry = useCallback(() => {
    setError(null);
    setAttempt((value) => value + 1);
  }, []);
  return (
    <LiveContext.Provider value={{ ...live, error, retry, sendCommand }}>
      {children}
    </LiveContext.Provider>
  );
}
