import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import type { HistoryRange } from './history';
import { useEvents, useHistory } from './useHistory';

afterEach(() => vi.restoreAllMocks());
describe('request riwayat', () => {
  it('membatalkan rentang lama dan mengabaikan respons terlambat', async () => {
    let finish!: (value: { points: [] }) => void;
    const request = vi
      .spyOn(api, 'history')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue({
        points: [{ at: '2026-10-31T10:00:00Z', t: 25, h: 50, ppm: 800 }],
      });
    const { result, rerender, unmount } = renderHook(
      ({ range }: { range: HistoryRange }) => useHistory('kos-01', range),
      { initialProps: { range: '1h' as HistoryRange } },
    );
    expect(request.mock.calls[0]![0]).toBe('kos-01');
    const firstSignal = request.mock.calls[0]![4]!;
    rerender({ range: '7d' });
    expect(firstSignal.aborted).toBe(true);
    await waitFor(() => expect(result.current.points).toHaveLength(1));
    await act(async () => finish({ points: [] }));
    expect(result.current.points).toHaveLength(1);
    const latestSignal = request.mock.calls[1]![4]!;
    unmount();
    expect(latestSignal.aborted).toBe(true);
  });
  it('menangani error dan retry, serta membatalkan request peristiwa saat unmount', async () => {
    const request = vi
      .spyOn(api, 'events')
      .mockRejectedValueOnce(new Error('Server tidak tersedia'))
      .mockResolvedValue({ events: [] });
    const { result, unmount } = renderHook(() => useEvents('kos-01', '24h'));
    await waitFor(() =>
      expect(result.current.error).toBe('Server tidak tersedia'),
    );
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.events).toEqual([]);
    const signal = request.mock.calls[1]![2]!;
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
