import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { notificationsPatchSchema, notificationsSchema } from '../../api/types';
import { api } from '../../api/client';
import {
  initialLiveState,
  liveReducer,
  parseLiveEvent,
} from '../../live/reducer';
import { LiveProvider } from '../../live/LiveProvider';
import { useLive } from '../../live/context';
import { NotificationsPanel } from './NotificationsPanel';
import { RoomNotification } from './RoomNotification';

class Stream extends EventTarget {
  static current: Stream;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    super();
    Stream.current = this;
  }
  close() {}
}
const room = {
  deviceId: 'kos-01',
  name: 'Kamar 1',
  notify: true,
  createdAt: '2026-11-07T00:00:00Z',
  online: true,
  state: null,
  telemetry: null,
  updatedAt: null,
};
function RoomSwitch() {
  const { rooms } = useLive();
  return rooms[0] ? <RoomNotification room={rooms[0]} /> : null;
}
function setup(unavailable = false) {
  vi.stubGlobal('EventSource', Stream);
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === '/api/notifications' && unavailable)
      return new Response('{}', { status: 404 });
    const patch = options?.body
      ? (JSON.parse(String(options.body)) as Record<string, unknown>)
      : {};
    const data =
      url === '/api/rooms'
        ? { rooms: [room], unregistered: [] }
        : url === '/api/rooms/kos-01'
          ? { ...room, ...patch }
          : {
              enabled: patch.enabled ?? true,
              snoozedUntil: patch.snoozeMinutes
                ? new Date(
                    Date.now() + Number(patch.snoozeMinutes) * 60000,
                  ).toISOString()
                : null,
            };
    return new Response(JSON.stringify(data));
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <LiveProvider>
      <NotificationsPanel />
      <RoomSwitch />
    </LiveProvider>,
  );
  return fetchMock;
}

describe('kontrak notifikasi', () => {
  it('memvalidasi payload server dan semua pilihan jeda', () => {
    expect(
      notificationsSchema.parse({ enabled: true, snoozedUntil: null }),
    ).toEqual({ enabled: true, snoozedUntil: null });
    expect(
      notificationsSchema.safeParse({ enabled: 1, snoozedUntil: null }).success,
    ).toBe(false);
    expect(
      notificationsSchema.safeParse({ enabled: true, snoozedUntil: 'besok' })
        .success,
    ).toBe(false);
    for (const snoozeMinutes of [0, 15, 60, 480, 1440])
      expect(
        notificationsPatchSchema.safeParse({ snoozeMinutes }).success,
      ).toBe(true);
    for (const input of [
      {},
      { enabled: 1 },
      { snoozeMinutes: 1 },
      { snoozeMinutes: -1 },
      { snoozeMinutes: 1441 },
      { snoozeMinutes: 15.5 },
      { unknown: true },
    ])
      expect(notificationsPatchSchema.safeParse(input).success).toBe(false);
  });
  it('mereduksi SSE notifikasi tanpa mengubah kamar dan mengabaikan payload rusak', () => {
    const action = parseLiveEvent(
      'notifications',
      JSON.stringify({ enabled: false, snoozedUntil: null }),
    );
    expect(action).not.toBeNull();
    const next = liveReducer(initialLiveState, action!);
    expect(next.notifications?.enabled).toBe(false);
    expect(next.rooms).toBe(initialLiveState.rooms);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseLiveEvent('notifications', '{"enabled":"yes"}')).toBeNull();
  });
  it('menolak PATCH tidak valid sebelum mengirim jaringan', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(() => api.updateNotifications({ snoozeMinutes: 1 })).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('saklar notifikasi', () => {
  it('mengirim PATCH global, jeda 1 jam dan batalkan jeda', async () => {
    const fetchMock = setup();
    const toggle = await screen.findByRole('switch', {
      name: 'Notifikasi Telegram global',
    });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notifications',
      expect.objectContaining({ method: 'PATCH', body: '{"enabled":false}' }),
    );
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    fireEvent.click(screen.getByRole('button', { name: 'Jeda' }));
    expect(await screen.findByText(/Dijeda sampai/)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notifications',
      expect.objectContaining({ body: '{"snoozeMinutes":60}' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Batalkan jeda' }));
    await screen.findByRole('button', { name: 'Jeda' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notifications',
      expect.objectContaining({ body: '{"snoozeMinutes":0}' }),
    );
  });
  it('memilih lama jeda dengan keyboard dan mengirim durasi terpilih', async () => {
    const fetchMock = setup();
    const oneHour = await screen.findByRole('radio', { name: '1 jam' });
    expect(oneHour).toBeChecked();
    fireEvent.keyDown(oneHour, { key: 'ArrowRight' });
    const eightHours = screen.getByRole('radio', { name: '8 jam' });
    expect(eightHours).toBeChecked();
    expect(eightHours).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Jeda' }));
    expect(await screen.findByText(/Dijeda sampai/)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notifications',
      expect.objectContaining({ body: '{"snoozeMinutes":480}' }),
    );
  });
  it('mengirim PATCH kamar dan mengikuti SSE rooms serta notifications', async () => {
    const fetchMock = setup();
    const toggle = await screen.findByRole('switch', {
      name: 'Notifikasi Telegram Kamar 1',
    });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/rooms/kos-01',
      expect.objectContaining({ method: 'PATCH', body: '{"notify":false}' }),
    );
    act(() => {
      Stream.current.dispatchEvent(
        new MessageEvent('rooms', {
          data: JSON.stringify({ rooms: [room], unregistered: [] }),
        }),
      );
      Stream.current.dispatchEvent(
        new MessageEvent('notifications', {
          data: '{"enabled":false,"snoozedUntil":null}',
        }),
      );
    });
    expect(toggle).toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'Notifikasi Telegram global' }),
    ).not.toBeChecked();
  });
  it('menyembunyikan saklar global pada 404 dengan pesan ringan', async () => {
    setup(true);
    expect(
      await screen.findByText(
        'Server ini belum mendukung pengaturan notifikasi.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('switch', { name: 'Notifikasi Telegram global' }),
    ).not.toBeInTheDocument();
  });
});
