import { describe, expect, it } from 'vitest';
import {
  airStatus,
  gasStatus,
  humidityStatus,
  STATUS,
  temperatureStatus,
} from './status';
describe('ambang kualitas udara', () => {
  it.each([
    [1000, 0],
    [1001, 1],
    [2000, 1],
    [2001, 2],
  ])('gas %i → %i', (value, status) => expect(gasStatus(value)).toBe(status));
  it.each([
    [17, 1],
    [18, 0],
    [30, 0],
    [31, 1],
    [33, 1],
    [34, 2],
  ])('suhu %i → %i', (value, status) =>
    expect(temperatureStatus(value)).toBe(status),
  );
  it.each([
    [29, 2],
    [30, 1],
    [39, 1],
    [40, 0],
    [60, 0],
    [61, 1],
    [70, 1],
    [71, 2],
  ])('kelembapan %i → %i', (value, status) =>
    expect(humidityStatus(value)).toBe(status),
  );
  it('mengambil parameter terburuk dan label final', () => {
    expect(airStatus({ t: 28, h: 72, ppm: 800 })).toBe(2);
    expect(Object.values(STATUS).map(({ label }) => label)).toEqual([
      'Aman',
      'Waspada',
      'Bahaya',
    ]);
  });
});
