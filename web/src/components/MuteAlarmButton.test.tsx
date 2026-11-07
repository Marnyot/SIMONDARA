import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RoomContext } from '../live/context';
import type { RoomContextValue } from '../live/context';
import { MuteAlarmButton } from './MuteAlarmButton';

function live(overrides: Partial<RoomContextValue> = {}): RoomContextValue {
  return {
    deviceId: 'kos-01',
    name: 'Kamar 1',
    createdAt: '2026-10-31T00:00:00.000Z',
    telemetry: null,
    updatedAt: null,
    online: true,
    connection: 'connected',
    state: { status: 2, buzzer: 1, mute: 0, fan: 1, led: 3, mode: 0, fault: 0 },
    sendCommand: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
const view = (value: RoomContextValue) => (
  <RoomContext.Provider value={value}>
    <MuteAlarmButton />
  </RoomContext.Provider>
);

describe('bisukan alarm', () => {
  it('mengirim mute:1, menampilkan loading, lalu menunggu konfirmasi', async () => {
    let resolve!: () => void;
    const sendCommand = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    render(view(live({ sendCommand })));
    await userEvent.click(
      screen.getByRole('button', { name: 'Bisukan alarm' }),
    );
    expect(sendCommand).toHaveBeenCalledExactlyOnceWith({ mute: 1 });
    expect(
      screen.getByRole('button', { name: 'Membisukan alarm…' }),
    ).toBeDisabled();
    await act(async () => resolve());
    expect(screen.getByRole('status')).toHaveTextContent(
      'Perintah bisukan alarm terkirim',
    );
  });
  it('menampilkan kegagalan dan mengizinkan retry', async () => {
    const sendCommand = vi
      .fn()
      .mockRejectedValueOnce(new Error('Perangkat tidak merespons'))
      .mockResolvedValue(undefined);
    render(view(live({ sendCommand })));
    await userEvent.click(
      screen.getByRole('button', { name: 'Bisukan alarm' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Perangkat tidak merespons',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Coba bisukan alarm lagi' }),
    );
    expect(sendCommand).toHaveBeenCalledTimes(2);
  });
  it('tidak mengirim saat offline dan hanya muncul untuk buzzer bahaya', () => {
    const value = live({ online: false });
    const { rerender } = render(view(value));
    expect(screen.getByRole('button')).toBeDisabled();
    rerender(view({ ...value, state: { ...value.state!, status: 1 } }));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rerender(view({ ...value, state: { ...value.state!, buzzer: 0 } }));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('menyediakan tombol lagi untuk episode alarm berikutnya', async () => {
    const value = live();
    const { rerender } = render(view(value));
    await userEvent.click(
      screen.getByRole('button', { name: 'Bisukan alarm' }),
    );
    rerender(view({ ...value, state: { ...value.state!, mute: 1 } }));
    expect(screen.getByRole('status')).toHaveTextContent('Alarm dibisukan');
    rerender(view(value));
    expect(screen.getByRole('button', { name: 'Bisukan alarm' })).toBeEnabled();
  });
});

it('mengaktifkan kembali alarm yang dibisukan dan menunggu konfirmasi', async () => {
  const value = live();
  const muted = { ...value, state: { ...value.state!, mute: 1 as const } };
  const { rerender } = render(view(muted));
  await userEvent.click(screen.getByRole('button', { name: 'Aktifkan alarm' }));
  expect(value.sendCommand).toHaveBeenCalledWith({ mute: 0 });
  expect(screen.getByText('Menunggu konfirmasi perangkat…')).toBeVisible();
  rerender(view(value));
  expect(screen.getByRole('button', { name: 'Bisukan alarm' })).toBeEnabled();
});
