import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeviceState } from '../../api/types';
import { ApiError } from '../../api/client';
import { LiveContext } from '../../live/context';
import type { LiveContextValue } from '../../live/context';
import Kontrol from '../../pages/Kontrol';
import { CONFIRM_TIMEOUT_MS } from './useDeviceCommands';

const baseState: DeviceState = {
  status: 0,
  fan: 0,
  mode: 1,
  led: 1,
  buzzer: 0,
  mute: 0,
};

function live(overrides: Partial<LiveContextValue> = {}): LiveContextValue {
  return {
    state: baseState,
    telemetry: { t: 29.4, h: 62, ppm: 820 },
    online: true,
    updatedAt: new Date().toISOString(),
    connection: 'connected',
    ready: true,
    receivedState: true,
    receivedOnline: true,
    error: null,
    retry: vi.fn(),
    sendCommand: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

function renderPage(value: LiveContextValue) {
  const view = render(
    <LiveContext.Provider value={value}>
      <Kontrol />
    </LiveContext.Provider>,
  );
  return {
    ...view,
    update: (next: LiveContextValue) =>
      view.rerender(
        <LiveContext.Provider value={next}>
          <Kontrol />
        </LiveContext.Provider>,
      ),
  };
}

const fanSwitch = () => screen.getByRole('switch', { name: 'Kipas Exhaust' });

afterEach(() => {
  vi.useRealTimers();
});

describe('halaman Kontrol', () => {
  it('menonaktifkan aktuator pada mode Otomatis tetapi tetap menampilkan nilai aktual', () => {
    renderPage(live({ state: { ...baseState, mode: 0, fan: 1 } }));
    expect(fanSwitch()).toBeDisabled();
    expect(fanSwitch()).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Buzzer' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Merah' })).toBeDisabled();
    expect(
      screen.getAllByText('Ubah ke mode Manual untuk mengendalikan'),
    ).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Manual' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Bisukan alarm' })).toBeEnabled();
  });

  it('mengirim perintah sesuai kontrak untuk tiap kontrol', () => {
    const value = live();
    renderPage(value);
    fireEvent.click(fanSwitch());
    fireEvent.click(screen.getByRole('switch', { name: 'Buzzer' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Kuning' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bisukan alarm' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Otomatis' }));
    expect(vi.mocked(value.sendCommand).mock.calls).toEqual([
      [{ fan: 1 }],
      [{ buzzer: 1 }],
      [{ led: 2 }],
      [{ mute: 1 }],
      [{ mode: 0 }],
    ]);
  });

  it('memperbarui secara optimistis, mencegah kirim ganda, lalu dikonfirmasi oleh state SSE', () => {
    const value = live();
    const { update } = renderPage(value);
    fireEvent.click(fanSwitch());
    expect(fanSwitch()).toBeChecked();
    expect(fanSwitch()).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Menunggu konfirmasi perangkat…')).toBeVisible();
    fireEvent.click(fanSwitch());
    expect(value.sendCommand).toHaveBeenCalledTimes(1);

    update({ ...value, state: { ...baseState, fan: 1 } });
    expect(fanSwitch()).toBeChecked();
    expect(fanSwitch()).not.toHaveAttribute('aria-busy');
  });

  it('mengembalikan nilai dan menampilkan error saat POST gagal (503)', async () => {
    const value = live({
      sendCommand: vi.fn(() =>
        Promise.reject(new ApiError(503, 'Permintaan gagal (503).')),
      ),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderPage(value);
    fireEvent.click(fanSwitch());
    expect(fanSwitch()).toBeChecked();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /broker MQTT sedang tidak tersedia/,
    );
    expect(fanSwitch()).not.toBeChecked();
  });

  it('mengembalikan nilai bila perangkat tidak mengonfirmasi dalam batas waktu', () => {
    vi.useFakeTimers();
    renderPage(live());
    fireEvent.click(fanSwitch());
    expect(fanSwitch()).toBeChecked();
    act(() => vi.advanceTimersByTime(CONFIRM_TIMEOUT_MS));
    expect(fanSwitch()).not.toBeChecked();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /tidak mengonfirmasi perintah/,
    );
  });

  it('menonaktifkan semua kontrol saat perangkat offline', () => {
    renderPage(live({ online: false }));
    expect(screen.getByText(/Perangkat terputus\. Kontrol/)).toBeVisible();
    expect(fanSwitch()).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Otomatis' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Bisukan alarm' }),
    ).toBeDisabled();
  });
});
