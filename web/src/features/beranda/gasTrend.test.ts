import { expect, it } from 'vitest';
import { withLatestReading } from './gasTrend';
import { historyAxis } from '../riwayat/history';

it('sumbu dan titik akhir menyertakan telemetri yang belum masuk riwayat', () => {
  const points = [{ at: '2026-11-09T01:00:00Z', t: 25, h: 50, ppm: 800 }];
  const telemetry = { t: 27, h: 51, ppm: 3050 };
  const latest = withLatestReading(points, telemetry, '2026-11-09T01:01:00Z');
  expect(latest.at(-1)?.ppm).toBe(3050);
  expect(historyAxis(latest, 'ppm').domain).toEqual([0, 3500]);
  expect(points).toHaveLength(1);
  expect(withLatestReading(latest, telemetry, points[0]!.at)).toBe(latest);
  expect(withLatestReading(points, null, null)).toBe(points);
  expect(withLatestReading(points, telemetry, points[0]!.at)).toHaveLength(1);
});
