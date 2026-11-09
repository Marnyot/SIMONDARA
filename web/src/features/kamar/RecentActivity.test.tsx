import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import type { Room } from '../../api/types';
import { RecentActivity } from './RecentActivity';

const rooms = [
  { deviceId: 'a', name: 'Kamar 1' },
  { deviceId: 'b', name: 'Kamar 2' },
] as Room[];
const event = {
  at: '2026-11-07T10:00:00Z',
  type: 'status' as const,
  value: 2 as const,
};

it('mempertahankan aktivitas kamar lain saat satu request gagal dan tidak memuat ulang saat telemetry berubah', async () => {
  const request = vi
    .spyOn(api, 'events')
    .mockImplementation(async (deviceId) => {
      if (deviceId === 'b') throw new Error('offline');
      return { events: [event] };
    });
  const { rerender, unmount } = render(
    <MemoryRouter>
      <RecentActivity rooms={rooms} />
    </MemoryRouter>,
  );
  expect(
    await screen.findByRole('link', { name: 'Kamar 1 jadi Bahaya' }),
  ).toBeVisible();
  expect(request).toHaveBeenCalledTimes(2);
  rerender(
    <MemoryRouter>
      <RecentActivity
        rooms={rooms.map((room) => ({
          ...room,
          name: `${room.name} baru`,
          updatedAt: new Date().toISOString(),
        }))}
      />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole('link', { name: 'Kamar 1 baru jadi Bahaya' }),
  ).toBeVisible();
  expect(request).toHaveBeenCalledTimes(2);
  const signal = request.mock.calls[0]![2]!;
  unmount();
  expect(signal.aborted).toBe(true);
});

describe('aktivitas kosong', () => {
  it('memberi empty state saat tidak ada peristiwa', async () => {
    vi.spyOn(api, 'events').mockResolvedValue({ events: [] });
    render(
      <MemoryRouter>
        <RecentActivity rooms={rooms} />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Belum ada peristiwa')).toBeVisible();
  });
  it('membedakan kegagalan semua request dari tidak adanya peristiwa', async () => {
    vi.spyOn(api, 'events').mockRejectedValue(new Error('offline'));
    render(
      <MemoryRouter>
        <RecentActivity rooms={rooms} />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText('Aktivitas belum tersedia')).toBeVisible(),
    );
  });
});
