import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import type { Room } from '../../api/types';
import { RoomCard } from './RoomCard';

vi.mock('./RoomSparkline', () => ({ default: () => null }));

it('kamar terputus menyimpan angka terakhir tanpa menyatakan status udara dan gangguan terkini', () => {
  const room: Room = {
    deviceId: 'kamar-2',
    name: 'Kamar 2',
    online: false,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-09T00:00:00Z',
    telemetry: { t: 27, h: 54, ppm: 700 },
    state: { status: 0, fan: 0, mode: 0, led: 1, buzzer: 0, mute: 0, fault: 3 },
  };
  render(
    <MemoryRouter>
      <RoomCard room={room} />
    </MemoryRouter>,
  );
  expect(screen.getByText(/Terputus · Data terakhir/)).toBeVisible();
  expect(screen.queryByRole('img', { name: /Udara Kamar 2/ })).toBeNull();
  expect(screen.queryByText(/Gangguan:/)).toBeNull();
  expect(screen.getByText('700')).toBeVisible();
});
