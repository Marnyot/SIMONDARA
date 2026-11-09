import { describe, expect, it } from 'vitest';
import { LCD_COLUMNS, fitLcdLine, formatLcdLines } from './lcd';

describe('format LCD 16x2', () => {
  it('meniru format sketch tim dan mengisi spasi hingga 16 kolom', () => {
    const [line1, line2] = formatLcdLines({ t: 29.44, h: 61.6, ppm: 820 }, 0);
    expect(line1).toBe('S:29.4C L:62%   ');
    expect(line2).toBe(' 820ppm AMAN    ');
    expect(line2).toHaveLength(LCD_COLUMNS);
  });

  it('menampilkan >5000ppm dan memotong baris yang melebihi 16 kolom', () => {
    const [line1, line2] = formatLcdLines(
      { t: -12.25, h: 100, ppm: 123456 },
      1,
    );
    expect(line1).toBe('S:-12.3C L:100% ');
    expect(line2).toBe('>5000ppm WASPADA');
    expect(fitLcdLine('x'.repeat(40))).toHaveLength(LCD_COLUMNS);
  });

  it('tanpa status dan tanpa telemetri memakai layar awal firmware', () => {
    expect(formatLcdLines({ t: 25, h: 50, ppm: 2400 }, null)[1]).toBe(
      fitLcdLine('2400ppm '),
    );
    expect(formatLcdLines(null, 2)).toEqual([
      fitLcdLine('SIMONDARA'),
      fitLcdLine('Monitor aktif'),
    ]);
  });
});

it.each([
  [1, 820, 0, 'S:25.0C L:50%?', ' 820ppm AMAN'],
  [2, 820, 1, 'S:25.0C L:50%', 'Cek sinyal MQ135'],
  [3, 820, 2, 'S:25.0C L:50%?', 'Cek sinyal MQ135'],
  [0, NaN, 0, 'S:25.0C L:50%', 'Cek sinyal MQ135'],
  [0, 2450, 2, 'S:25.0C L:50%', '2450ppm BAHAYA'],
] as const)(
  'fault %s dan gas %s mengikuti firmware',
  (fault, ppm, status, first, second) => {
    const lines = formatLcdLines({ t: 25, h: 50, ppm }, status, fault);
    expect(lines).toEqual([fitLcdLine(first), fitLcdLine(second)]);
    lines.forEach((line) => expect(line).toHaveLength(16));
  },
);
