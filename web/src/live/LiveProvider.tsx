import { useEffect, useMemo, useReducer, useState } from 'react';
import type { NotificationsPatch } from '../api/types';
import type { ReactNode } from 'react';
import { api } from '../api/client';
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
    let streamHasRooms = false;
    const controller = new AbortController();
    const initialTimeout = window.setTimeout(() => {
      if (!disposed)
        setError('Data alat belum masuk. Cek koneksi server, lalu coba lagi.');
    }, 12000);
    api
      .rooms(AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]))
      .then((data) => {
        if (disposed) return;
        dispatch({ type: 'rooms', data, source: 'rest' });
        setError(null);
        window.clearTimeout(initialTimeout);
      })
      .catch((cause: unknown) => {
        if (!disposed && !streamHasRooms)
          setError(
            cause instanceof Error ? cause.message : 'Data alat gagal dimuat.',
          );
      });
    const connect = () => {
      if (disposed) return;
      dispatch({
        type: 'connection',
        value: failures ? 'reconnecting' : 'connecting',
      });
      source = new EventSource('/api/stream', { withCredentials: true });
      // The backend opens every connection with `rooms` plus a replay of the
      // current values, so that list sets the baseline for change alerts.
      let awaitingSnapshot = true;
      source.onopen = () => {
        failures = 0;
        dispatch({ type: 'connection', value: 'connected' });
      };
      for (const type of [
        'rooms',
        'state',
        'telemetry',
        'online',
        'notifications',
      ]) {
        source.addEventListener(type, (message) => {
          if (disposed) return;
          const action = parseLiveEvent(
            type,
            (message as MessageEvent<string>).data,
          );
          if (!action) return;
          if (action.type !== 'rooms') {
            dispatch(action);
            return;
          }
          dispatch({
            ...action,
            source: awaitingSnapshot ? 'snapshot' : 'stream',
          });
          awaitingSnapshot = false;
          streamHasRooms = true;
          setError(null);
          window.clearTimeout(initialTimeout);
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
  const actions = useMemo(
    () => ({
      updateNotifications: async (input: NotificationsPatch) => {
        const data = await api.updateNotifications(input);
        dispatch({ type: 'notifications', data });
        return data;
      },
      setRoomNotify: async (deviceId: string, notify: boolean) => {
        const room = await api.setRoomNotify(deviceId, notify);
        dispatch({ type: 'roomSaved', room });
        return room;
      },
      retry: () => {
        setError(null);
        setAttempt((value) => value + 1);
      },
      // Responses apply immediately so the UI stays right while the stream is down.
      createRoom: async (input: { deviceId: string; name: string }) => {
        const room = await api.createRoom(input);
        dispatch({ type: 'roomSaved', room });
        return room;
      },
      renameRoom: async (deviceId: string, name: string) => {
        const room = await api.renameRoom(deviceId, name);
        dispatch({ type: 'roomSaved', room });
        return room;
      },
      deleteRoom: async (deviceId: string) => {
        await api.deleteRoom(deviceId);
        dispatch({ type: 'roomDeleted', deviceId });
      },
      dismissNotice: (id: number) => dispatch({ type: 'dismissNotice', id }),
    }),
    [],
  );
  return (
    <LiveContext.Provider value={{ ...live, ...actions, error }}>
      {children}
    </LiveContext.Provider>
  );
}
