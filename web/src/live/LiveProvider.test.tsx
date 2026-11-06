import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveProvider } from './LiveProvider';
import { useLive } from './context';

class Stream extends EventTarget {
  static instances: Stream[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor() {
    super();
    Stream.instances.push(this);
  }
  close() {
    this.closed = true;
  }
}
function Consumer() {
  const { rooms, ready, connection, notices } = useLive();
  return (
    <output>
      {JSON.stringify({
        ready,
        connection,
        ppm: rooms[0]?.telemetry?.ppm,
        notices: notices.map(({ kind }) => kind),
      })}
    </output>
  );
}
afterEach(() => {
  vi.useRealTimers();
  Stream.instances = [];
});
describe('siklus koneksi live', () => {
  it('mempertahankan snapshot saat reconnect dan membersihkan stream/timer saat unmount', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', Stream);
    const fetchMock = vi.fn().mockImplementation(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.endsWith('/rooms')
              ? {
                  rooms: [
                    {
                      deviceId: 'kos-01',
                      name: 'Kamar 1',
                      createdAt: '2026-10-31T00:00:00.000Z',
                      online: true,
                      state: null,
                      telemetry: { t: 28, h: 55, ppm: 800 },
                      updatedAt: null,
                    },
                  ],
                  unregistered: [],
                }
              : { user: 'pengelola' },
          ),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const view = render(
      <LiveProvider>
        <Consumer />
      </LiveProvider>,
    );
    await act(async () => {});
    expect(screen.getByRole('status')).toHaveTextContent('"ready":true');
    const first = Stream.instances[0]!;
    act(() => first.onopen?.());
    expect(screen.getByRole('status')).toHaveTextContent(
      '"connection":"connected"',
    );
    await act(async () => {
      first.onerror?.();
    });
    expect(first.closed).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent(
      '"connection":"reconnecting"',
    );
    expect(screen.getByRole('status')).toHaveTextContent('"ppm":800');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });
    expect(Stream.instances).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.any(Object));
    view.unmount();
    expect(Stream.instances.every((stream) => stream.closed)).toBe(true);
    await vi.advanceTimersByTimeAsync(60000);
    expect(Stream.instances).toHaveLength(2);
  });
  it('rooms pertama tiap koneksi menjadi baseline, termasuk setelah reconnect', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', Stream);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    const emit = (stream: Stream, type: string, data: unknown) =>
      act(() => {
        stream.dispatchEvent(
          new MessageEvent(type, { data: JSON.stringify(data) }),
        );
      });
    const device = (deviceId: string) => ({
      deviceId,
      lastSeen: '2026-10-31T00:00:00.000Z',
      online: true,
    });
    const room = (online: boolean) => ({
      deviceId: 'kos-01',
      name: 'Kamar 1',
      createdAt: '2026-10-31T00:00:00.000Z',
      online,
      state: null,
      telemetry: null,
      updatedAt: null,
    });
    render(
      <LiveProvider>
        <Consumer />
      </LiveProvider>,
    );
    await act(async () => {});
    const first = Stream.instances[0]!;
    emit(first, 'rooms', {
      rooms: [room(true)],
      unregistered: [device('lama')],
    });
    expect(screen.getByRole('status')).toHaveTextContent('"notices":[]');
    await act(async () => {
      first.onerror?.();
      await vi.advanceTimersByTimeAsync(1300);
    });
    // Everything that changed during the outage arrives as the new baseline.
    const second = Stream.instances[1]!;
    emit(second, 'rooms', {
      rooms: [room(false)],
      unregistered: [device('lama'), device('saat-putus')],
    });
    emit(second, 'online', { deviceId: 'kos-01', online: false });
    expect(screen.getByRole('status')).toHaveTextContent('"notices":[]');
    emit(second, 'online', { deviceId: 'kos-01', online: true });
    emit(second, 'rooms', {
      rooms: [room(true)],
      unregistered: [device('lama'), device('saat-putus'), device('baru')],
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      '"notices":["online","newDevice"]',
    );
  });
});
