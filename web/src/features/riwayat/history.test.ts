import { describe, expect, it } from 'vitest';
import type { HistoryPoint } from '../../api/types';
import {
  BUCKET_MS,
  chartSeries,
  describeEvent,
  gasGradientStops,
  typicalInterval,
  formatNumber,
  formatSpan,
  formatTimeTick,
  historyAxis,
  MAX_GAP_ROWS,
  timeTicks,
  historyWindow,
  parseRange,
  probeAt,
  formatDuration,
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
      `Udara jadi ${label}`,
    );
  });
  it('membedakan perangkat terhubung dan terputus', () => {
    expect(describeEvent({ at, type: 'online', value: true }).text).toBe(
      'Alat tersambung lagi',
    );
    expect(describeEvent({ at, type: 'online', value: false }).text).toBe(
      'Alat terputus',
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

const at = (minute: number) =>
  new Date(Date.UTC(2026, 10, 7, 10, minute)).toISOString();
const reading = (minute: number, ppm: number): HistoryPoint => ({
  at: at(minute),
  t: 27,
  h: 55,
  ppm,
});

describe('seri grafik', () => {
  it('mengurutkan pengukuran dan tidak memutus data yang rapat', () => {
    const { rows, gaps } = chartSeries(
      [reading(2, 300), reading(0, 100), reading(1, 200)],
      'ppm',
      BUCKET_MS['1m'],
    );
    expect(rows.map(({ value }) => value)).toEqual([100, 200, 300]);
    expect(gaps).toEqual([]);
  });
  it('memutus garis bila jeda lebih dari 3 interval bucket', () => {
    const { rows, gaps } = chartSeries(
      [reading(0, 100), reading(1, 120), reading(9, 900), reading(10, 950)],
      'ppm',
      BUCKET_MS['1m'],
    );
    const gap = { from: Date.parse(at(1)), to: Date.parse(at(9)) };
    expect(gaps).toEqual([gap]);
    // 8 minutes of silence: one placeholder per missing bucket, evenly spread.
    const filler = rows.slice(2, -2);
    expect(rows.map(({ value }) => value)).toEqual([
      100,
      120,
      ...Array(7).fill(null),
      900,
      950,
    ]);
    expect(filler.map(({ time }) => time)).toEqual(
      [2, 3, 4, 5, 6, 7, 8].map((minute) => Date.parse(at(minute))),
    );
    // Every placeholder names the whole outage, so the tooltip can show its span anywhere on the band.
    expect(filler.every((row) => row.gap === gaps[0])).toBe(true);
  });
  it('membatasi jumlah baris pengisi untuk jeda yang sangat panjang', () => {
    const { rows, gaps } = chartSeries(
      [reading(0, 100), reading(60 * 24 * 3, 100)],
      'ppm',
      BUCKET_MS['1m'],
    );
    expect(gaps).toHaveLength(1);
    expect(rows.filter(({ value }) => value === null)).toHaveLength(
      MAX_GAP_ROWS,
    );
  });
  it('memperlakukan nilai 0 sebagai pengukuran sah, bukan jeda', () => {
    const { rows, gaps } = chartSeries(
      [reading(0, 0), reading(1, 0), reading(2, 15)],
      'ppm',
      BUCKET_MS['1m'],
    );
    expect(gaps).toEqual([]);
    expect(rows.map(({ value }) => value)).toEqual([0, 0, 15]);
  });
  it('membuang pengukuran dengan waktu atau nilai tidak valid', () => {
    const { rows } = chartSeries(
      [
        reading(0, 100),
        { ...reading(1, 100), at: 'bukan-waktu' },
        { ...reading(2, 100), ppm: Number.NaN },
      ],
      'ppm',
      BUCKET_MS['1m'],
    );
    expect(rows).toHaveLength(1);
  });
  it('jeda tepat 3 interval masih tersambung', () => {
    const { gaps } = chartSeries(
      [reading(0, 100), reading(3, 120)],
      'ppm',
      BUCKET_MS['1m'],
    );
    expect(gaps).toEqual([]);
  });
  it('menebak interval dari median jarak bila bucket tidak diberikan', () => {
    expect(typicalInterval([0, 5, 10, 15, 100].map((m) => m * 60_000))).toBe(
      5 * 60_000,
    );
    expect(typicalInterval([1000])).toBe(0);
    const { gaps } = chartSeries(
      [0, 5, 10, 15, 100].map((m) => reading(m, 100)),
      'ppm',
    );
    expect(gaps).toHaveLength(1);
  });
  it('memilih metrik yang diminta', () => {
    const { rows } = chartSeries([reading(0, 100)], 't');
    expect(rows).toEqual([{ time: Date.parse(at(0)), value: 27 }]);
  });
});

describe('gradien kadar gas', () => {
  it('berganti warna tepat di ambang menurut domain sumbu Y', () => {
    const stops = gasGradientStops([0, 4000]);
    expect(stops.map(({ offset }) => offset)).toEqual([
      0, 0.5, 0.5, 0.75, 0.75, 1,
    ]);
    expect(stops[0]!.color).toBe('var(--color-danger)');
    expect(stops[2]!.color).toBe('var(--color-warning)');
    expect(stops.at(-1)!.color).toBe('var(--color-safe)');
  });
  it('tetap valid untuk domain datar', () => {
    const offsets = gasGradientStops([500, 500]).map(({ offset }) => offset);
    expect(offsets.every((offset) => offset >= 0 && offset <= 1)).toBe(true);
  });
});

describe('sumbu waktu rentang penuh', () => {
  const local = (day: number, hour: number, minute = 0) =>
    new Date(2026, 10, day, hour, minute).getTime();
  it('1 jam: tick tiap 15 menit pada jam bulat, di dalam rentang', () => {
    const from = local(7, 10, 7);
    const to = local(7, 11, 7);
    const { step, ticks } = timeTicks(from, to);
    expect(step).toBe(15 * 60_000);
    expect(ticks).toEqual([
      local(7, 10, 15),
      local(7, 10, 30),
      local(7, 10, 45),
      local(7, 11, 0),
    ]);
    expect(formatTimeTick(ticks[0]!, step)).toBe('10.15');
  });
  it('24 jam: tick tiap 6 jam, tengah malam ditulis sebagai tanggal', () => {
    const from = local(6, 10, 7);
    const to = local(7, 10, 7);
    const { step, ticks } = timeTicks(from, to);
    expect(step).toBe(6 * 3_600_000);
    expect(ticks).toEqual([
      local(6, 12),
      local(6, 18),
      local(7, 0),
      local(7, 6),
    ]);
    expect(formatTimeTick(local(6, 18), step)).toBe('18.00');
    expect(formatTimeTick(local(7, 0), step)).toBe('7 Nov');
  });
  it('7 hari: satu tick per hari pada tengah malam', () => {
    const from = local(1, 10, 7);
    const to = local(8, 10, 7);
    const { step, ticks } = timeTicks(from, to);
    expect(step).toBe(86_400_000);
    expect(ticks).toHaveLength(7);
    expect(ticks[0]).toBe(local(2, 0));
    expect(formatTimeTick(ticks[0]!, step)).toBe('2 Nov');
  });
  it('rentang kosong tidak menghasilkan tick', () => {
    expect(timeTicks(1000, 1000).ticks).toEqual([]);
    expect(timeTicks(2000, 1000).ticks).toEqual([]);
  });
  it('menulis rentang data dengan jam saja bila masih di hari yang sama', () => {
    expect(formatSpan(local(7, 9, 5), local(7, 10, 0))).toBe('09.05–10.00');
    expect(formatSpan(local(6, 14), local(7, 13, 55))).toMatch(
      /^6 Nov.*14\.00–7 Nov.*13\.55$/,
    );
  });
});

describe('probeAt: isi tooltip dari waktu pointer', () => {
  const min = 60_000;
  const t0 = Date.parse('2026-11-07T10:00:00Z');
  const at = (m: number) => new Date(t0 + m * min).toISOString();
  const points = [0, 1, 2, 30, 31].map((m) => ({
    at: at(m),
    t: 25,
    h: 50,
    ppm: 400 + m,
  }));
  const { rows, gaps } = chartSeries(points, 'ppm', min);
  const from = t0 - 10 * min;
  const to = t0 + 60 * min;
  const probe = (m: number) => probeAt(t0 + m * min, rows, gaps, from, to);

  it('di dalam pita jeda, juga sangat dekat kedua tepinya, bilang tidak ada data', () => {
    for (const m of [2.01, 10, 16, 29.99]) {
      expect(probe(m)).toEqual({
        kind: 'empty',
        from: t0 + 2 * min,
        to: t0 + 30 * min,
      });
    }
  });
  it('tepat di pembacaan tepi jeda masih data', () => {
    expect(probe(2)).toMatchObject({ kind: 'data', reading: { value: 402 } });
    expect(probe(30)).toMatchObject({ kind: 'data', reading: { value: 430 } });
  });
  it('sebelum data pertama dan sesudah data terakhir tidak ada data', () => {
    expect(probe(-5)).toEqual({ kind: 'empty', from, to: t0 });
    expect(probe(45)).toEqual({ kind: 'empty', from: t0 + 31 * min, to });
  });
  it('di antara pembacaan berurutan memakai pembacaan terdekat', () => {
    expect(probe(0.4)).toMatchObject({ kind: 'data', reading: { value: 400 } });
    expect(probe(0.6)).toMatchObject({ kind: 'data', reading: { value: 401 } });
  });
  it('tanpa data mengembalikan null', () => {
    expect(probeAt(t0, [], [], from, to)).toBeNull();
  });
  it('durasi ditulis dalam menit, jam, hari', () => {
    expect(formatDuration(20_000)).toBe('1 menit');
    expect(formatDuration(25 * min)).toBe('25 menit');
    expect(formatDuration(130 * min)).toBe('2 jam 10 menit');
    expect(formatDuration(27 * 60 * min)).toBe('1 hari 3 jam');
  });
});
