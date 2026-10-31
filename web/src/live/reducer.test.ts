import { describe, expect, it, vi } from 'vitest';
import { initialLiveState, liveReducer, parseLiveEvent } from './reducer';
const at = '2026-10-31T00:00:00.000Z';
const state = {
  status: 0,
  fan: 0,
  mode: 0,
  led: 1,
  buzzer: 0,
  mute: 0,
} as const;
describe('SSE', () => {
  it('snapshot bertahap siap setelah state dan online, termasuk perangkat offline', () => {
    const first = liveReducer(initialLiveState, {
      type: 'state',
      data: state,
      at,
    });
    expect(first.ready).toBe(false);
    const next = liveReducer(first, {
      type: 'online',
      data: { online: false },
      at,
    });
    expect(next).toMatchObject({ ready: true, online: false, state });
    expect(
      liveReducer(next, { type: 'connection', value: 'reconnecting' }),
    ).toMatchObject({ state, connection: 'reconnecting' });
  });
  it('menerima urutan snapshot terbalik dan memperbarui waktu telemetri', () => {
    const online = liveReducer(initialLiveState, {
      type: 'online',
      data: { online: true },
      at,
    });
    expect(liveReducer(online, { type: 'state', data: state, at }).ready).toBe(
      true,
    );
    const action = parseLiveEvent(
      'telemetry',
      JSON.stringify({ t: 28, h: 55, ppm: 900, at }),
      '2026-11-01T00:00:00.000Z',
    );
    expect(action && liveReducer(initialLiveState, action).updatedAt).toBe(at);
  });
  it('snapshot REST kosong valid tanpa mengarang data sensor', () => {
    expect(
      liveReducer(initialLiveState, {
        type: 'snapshot',
        data: { online: false, state: null, telemetry: null, updatedAt: null },
      }),
    ).toMatchObject({ ready: true, telemetry: null });
  });
  it('menolak JSON dan nilai payload yang salah', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseLiveEvent('telemetry', '{')).toBeNull();
    expect(
      parseLiveEvent('state', JSON.stringify({ ...state, mode: 4 })),
    ).toBeNull();
    expect(parseLiveEvent('online', '{"online":"false"}')).toBeNull();
    expect(parseLiveEvent('unknown', '{}')).toBeNull();
  });
});

it('REST melengkapi snapshot tanpa menimpa SSE yang lebih baru', () => {
  const telemetry = { t: 29, h: 55, ppm: 1400, at };
  const streamed = liveReducer(
    liveReducer(initialLiveState, { type: 'telemetry', data: telemetry, at }),
    { type: 'online', data: { online: false }, at },
  );
  const result = liveReducer(streamed, {
    type: 'snapshot',
    data: {
      online: true,
      state,
      telemetry: { t: 28, h: 55, ppm: 800 },
      updatedAt: null,
    },
  });
  expect(result).toMatchObject({
    ready: true,
    online: false,
    state,
    telemetry,
    updatedAt: at,
  });
});
