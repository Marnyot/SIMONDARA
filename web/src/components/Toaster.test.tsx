import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { LiveContext } from '../live/context';
import type { LiveContextValue } from '../live/context';
import { initialLiveState } from '../live/reducer';
import type { LiveNotice } from '../live/reducer';
import { NOTICE_DURATION_MS, Toaster } from './Toaster';

function renderToaster(notices: LiveNotice[]) {
  const dismissNotice = vi.fn();
  const live = {
    ...initialLiveState,
    notices,
    dismissNotice,
  } as unknown as LiveContextValue;
  render(
    <MemoryRouter>
      <LiveContext.Provider value={live}>
        <Toaster />
      </LiveContext.Provider>
    </MemoryRouter>,
  );
  return dismissNotice;
}

it('Bahaya memakai alert, lainnya polite, dan perangkat baru punya aksi Tambah', () => {
  renderToaster([
    { id: 1, kind: 'danger', deviceId: 'a', message: 'Kamar A: BAHAYA' },
    { id: 2, kind: 'newDevice', deviceId: 'b', message: 'Perangkat baru: b' },
  ]);
  expect(screen.getByRole('alert')).toHaveTextContent('Kamar A: BAHAYA');
  expect(screen.getByRole('region', { name: 'Notifikasi' })).toHaveAttribute(
    'aria-live',
    'polite',
  );
  expect(
    screen.getByRole('link', { name: 'Tambah b sebagai kamar' }),
  ).toHaveAttribute('href', '/kelola?deviceId=b');
});

it('tertutup otomatis, tertahan selama disorot, dan bisa ditutup manual', () => {
  vi.useFakeTimers();
  const dismiss = renderToaster([
    {
      id: 7,
      kind: 'online',
      deviceId: 'a',
      message: 'Kamar A: kembali online',
    },
  ]);
  const text = screen.getByText('Kamar A: kembali online');
  fireEvent.mouseEnter(text);
  act(() => vi.advanceTimersByTime(NOTICE_DURATION_MS * 2));
  expect(dismiss).not.toHaveBeenCalled();
  fireEvent.mouseLeave(text);
  act(() => vi.advanceTimersByTime(NOTICE_DURATION_MS));
  expect(dismiss).toHaveBeenCalledExactlyOnceWith(7);
  fireEvent.click(screen.getByRole('button', { name: 'Tutup notifikasi' }));
  expect(dismiss).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});
