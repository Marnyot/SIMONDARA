import { describe, expect, it } from 'vitest';
import {
  assessTemperature,
  assessHumidity,
  assessGas,
} from './sensorAssessment';

describe('penilaian sensor sesuai ambang live', () => {
  it.each([
    [17.9, 'Dingin', 1],
    [18, 'Nyaman', 0],
    [30, 'Nyaman', 0],
    [30.1, 'Panas', 1],
    [33, 'Panas', 1],
    [33.1, 'Sangat panas', 2],
  ] as const)('suhu %s', (value, label, status) => {
    expect(assessTemperature(value)).toEqual({ label, status });
  });
  it.each([
    [29, 'Kering', 2],
    [30, 'Kering', 1],
    [39, 'Kering', 1],
    [40, 'Nyaman', 0],
    [60, 'Nyaman', 0],
    [61, 'Lembap', 1],
    [70, 'Lembap', 1],
    [71, 'Lembap', 2],
  ] as const)('kelembapan %s', (value, label, status) => {
    expect(assessHumidity(value)).toEqual({ label, status });
  });
  it.each([
    [0, 'Normal', 0],
    [1000, 'Normal', 0],
    [1001, 'Tinggi', 1],
    [2000, 'Tinggi', 1],
    [2001, 'Sangat tinggi', 2],
  ] as const)('gas %s', (value, label, status) => {
    expect(assessGas(value)).toEqual({ label, status });
  });
});
