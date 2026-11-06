import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { LiveContext, useRoom } from '../live/context';
import type { LiveContextValue } from '../live/context';
import { initialLiveState } from '../live/reducer';
import RoomLayout from './RoomLayout';

const live: LiveContextValue = {
  ...initialLiveState,
  ready: true,
  rooms: [
    {
      deviceId: 'kos-01',
      name: 'Kamar 1',
      createdAt: '2026-10-31T00:00:00.000Z',
      online: true,
      state: null,
      telemetry: null,
      updatedAt: null,
    },
  ],
  error: null,
  retry: vi.fn(),
  createRoom: vi.fn(),
  renameRoom: vi.fn(),
  deleteRoom: vi.fn(),
  dismissNotice: vi.fn(),
};
function RoomName() {
  return <h1>{useRoom().name}</h1>;
}
const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LiveContext.Provider value={live}>
        <Routes>
          <Route path="/kamar/:deviceId" element={<RoomLayout />}>
            <Route index element={<RoomName />} />
          </Route>
        </Routes>
      </LiveContext.Provider>
    </MemoryRouter>,
  );

it('memberi konteks kamar dan tautan kembali ke daftar', () => {
  renderAt('/kamar/kos-01');
  expect(screen.getByRole('heading', { name: 'Kamar 1' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Daftar Kamar' })).toHaveAttribute(
    'href',
    '/',
  );
});

it('deviceId tak dikenal menampilkan kamar tidak ditemukan', () => {
  renderAt('/kamar/asing');
  expect(
    screen.getByRole('heading', { name: 'Kamar tidak ditemukan' }),
  ).toBeVisible();
  expect(screen.getByText(/ID perangkat asing/)).toBeVisible();
});
