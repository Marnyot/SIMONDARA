import { describe, expect, it } from 'vitest';
import {
  GAUGE_MAX,
  gaugeArc,
  gaugeFraction,
  gaugeOverScale,
  gaugePoint,
  gaugeSegments,
  gaugeTone,
} from './gaugeScale';

describe('pemetaan gauge gas', () => {
  it('memetakan ppm ke posisi 0–1 dan menjepit di luar skala', () => {
    expect(gaugeFraction(0)).toBe(0);
    expect(gaugeFraction(1500)).toBe(0.5);
    expect(gaugeFraction(GAUGE_MAX)).toBe(1);
    expect(gaugeFraction(9000)).toBe(1);
    expect(gaugeFraction(-20)).toBe(0);
    expect(gaugeFraction(Number.NaN)).toBe(0);
    expect(gaugeFraction(2000, 4000)).toBe(0.5);
  });
  it('membagi skala menjadi tiga segmen di ambang 1.000 dan 2.000', () => {
    const [safe, warning, danger] = gaugeSegments();
    expect(safe.tone).toBe('safe');
    expect(safe.from).toBe(0);
    expect(danger.to).toBe(1);
    expect(safe.to).toBeLessThan(1 / 3);
    expect(warning.from).toBeGreaterThan(1 / 3);
    expect(warning.to).toBeLessThan(2 / 3);
    expect(danger.from).toBeGreaterThan(2 / 3);
  });
  it('menaruh ujung kiri, puncak, dan ujung kanan pada setengah lingkaran', () => {
    const left = gaugePoint(0, 80, 100, 100);
    const top = gaugePoint(0.5, 80, 100, 100);
    const right = gaugePoint(1, 80, 100, 100);
    expect(left.x).toBeCloseTo(20);
    expect(left.y).toBeCloseTo(100);
    expect(top.x).toBeCloseTo(100);
    expect(top.y).toBeCloseTo(20);
    expect(right.x).toBeCloseTo(180);
    expect(gaugeArc(0, 1, 80, 100, 100)).toBe(
      'M 20.00 100.00 A 80.00 80.00 0 0 1 180.00 100.00',
    );
  });
  it('memakai ambang yang sama dengan gasStatus: >1.000 waspada, >2.000 bahaya', () => {
    expect(gaugeTone(0)).toBe('safe');
    expect(gaugeTone(1000)).toBe('safe');
    expect(gaugeTone(1001)).toBe('warning');
    expect(gaugeTone(2000)).toBe('warning');
    expect(gaugeTone(2001)).toBe('danger');
  });
  it('menandai bacaan di atas skala tanpa mengubah angkanya', () => {
    expect(gaugeOverScale(GAUGE_MAX)).toBe(false);
    expect(gaugeOverScale(GAUGE_MAX + 1)).toBe(true);
    expect(gaugeOverScale(4500, 5000)).toBe(false);
    expect(gaugeOverScale(Number.NaN)).toBe(false);
    expect(gaugeFraction(GAUGE_MAX + 1)).toBe(1);
  });
});
