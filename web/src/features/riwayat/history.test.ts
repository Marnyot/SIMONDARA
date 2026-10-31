import { describe, expect, it } from 'vitest';
import {
  describeEvent,
  formatNumber,
  historyAxis,
  historyWindow,
  parseRange,
} from './history';

describe('rentang riwayat', () => {
  it.each([
    ['1h', '1m', 3600000],
    ['24h', '5m', 86400000],
    ['7d', '1h', 604800000],
  ] as const)(
    '%s meminta bucket %s dan durasi yang tepat',
    (range, bucket, duration) => {
      const now = new Date('2026-10-31T10:00:00Z');
      const result = historyWindow(range, now);
      expect(result.bucket).toBe(bucket);
      expect(result.to).toBe(now.toISOString());
      expect(now.getTime() - Date.parse(result.from)).toBe(duration);
    },
  );
  it('memvalidasi query dan memakai 24 jam sebagai default', () => {
    expect(parseRange('1h')).toBe('1h');
    expect(parseRange('7d')).toBe('7d');
    expect(parseRange(null)).toBe('24h');
    expect(parseRange('invalid')).toBe('24h');
  });
});

describe('teks peristiwa', () => {
  const at = '2026-10-31T10:00:00Z';
  it.each([
    [0, 'Aman'],
    [1, 'Waspada'],
    [2, 'Bahaya'],
  ] as const)('status %i menjadi %s', (value, label) => {
    expect(describeEvent({ at, type: 'status', value }).text).toBe(
      `Kualitas udara berubah ke ${label}`,
    );
  });
  it('membedakan perangkat terhubung dan terputus', () => {
    expect(describeEvent({ at, type: 'online', value: true }).text).toBe(
      'Perangkat terhubung kembali',
    );
    expect(describeEvent({ at, type: 'online', value: false }).text).toBe(
      'Perangkat terputus',
    );
  });
});

describe('format angka dan skala grafik', () => {
  it('mempertahankan satu desimal sensor dan bilangan bulat gas dalam format Indonesia', () => {
    expect(formatNumber(27)).toBe('27,0');
    expect(formatNumber(50.3)).toBe('50,3');
    expect(formatNumber(1450, 0)).toBe('1.450');
  });
  it('memberi padding pada variasi kecil dan menghasilkan label tick sensor yang berbeda', () => {
    const points = [27, 27.04, 27.1].map((t) => ({
      at: '2026-10-31T14:49:35.457Z',
      t,
      h: 50.3,
      ppm: 1450,
    }));
    const axis = historyAxis(points, 't');
    expect(axis.domain).toEqual([26, 29]);
    expect(axis.ticks.map((tick) => formatNumber(tick))).toEqual([
      '26,0',
      '27,5',
      '29,0',
    ]);
    expect(historyAxis(points, 'h').domain).toEqual([49, 52]);
  });
  it('menjaga skala kelembapan dalam 0–100 dan tick tetap berbeda pada data konstan', () => {
    for (const h of [0, 50, 100]) {
      const axis = historyAxis(
        [{ at: '2026-10-31T14:49:35.457Z', t: 27, h, ppm: 1450 }],
        'h',
      );
      expect(new Set(axis.ticks.map((tick) => formatNumber(tick))).size).toBe(
        3,
      );
      expect(axis.domain[0]).toBeGreaterThanOrEqual(0);
      expect(axis.domain[1]).toBeLessThanOrEqual(100);
    }
  });
  it('menyertakan tick ambang gas dan rentang yang menampung data di atas ambang', () => {
    const axis = historyAxis(
      [{ at: '2026-10-31T14:49:35.457Z', t: 27, h: 50.3, ppm: 3450 }],
      'ppm',
    );
    expect(axis.ticks).toEqual([0, 1000, 2000, 4000]);
    expect(axis.domain).toEqual([0, 4000]);
  });
});
