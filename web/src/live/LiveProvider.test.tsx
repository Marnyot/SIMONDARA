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
  const { online, ready, connection, telemetry } = useLive();
  return (
    <output>
      {JSON.stringify({ online, ready, connection, ppm: telemetry?.ppm })}
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
            url.endsWith('/state')
              ? {
                  online: true,
                  state: null,
                  telemetry: { t: 28, h: 55, ppm: 800 },
                  updatedAt: null,
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
});
