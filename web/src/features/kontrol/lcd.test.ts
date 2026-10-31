import { describe, expect, it } from 'vitest';
import { LCD_COLUMNS, fitLcdLine, formatLcdLines } from './lcd';

describe('format LCD 16x2', () => {
  it('meniru format firmware dan mengisi spasi hingga 16 kolom', () => {
    const [line1, line2] = formatLcdLines({ t: 29.44, h: 61.6, ppm: 820 }, 0);
    expect(line1).toBe('Suhu:29.4 Lb:62%');
    expect(line2).toBe('Gas:820 Aman    ');
    expect(line2).toHaveLength(LCD_COLUMNS);
  });

  it('memotong baris yang melebihi 16 kolom', () => {
    const [line1, line2] = formatLcdLines(
      { t: -12.25, h: 100, ppm: 123456 },
      1,
    );
    expect(line1).toBe('Suhu:-12.3 Lb:10');
    expect(line2).toBe('Gas:12345 Waspad');
    expect(fitLcdLine('x'.repeat(40))).toHaveLength(LCD_COLUMNS);
  });

  it('menampilkan "-" bila status belum diketahui dan placeholder tanpa telemetri', () => {
    expect(formatLcdLines({ t: 25, h: 50, ppm: 2400 }, null)[1]).toBe(
      'Gas:2400 -      ',
    );
    expect(formatLcdLines(null, 2)).toEqual([
      'SIMONDARA       ',
      'Menunggu data   ',
    ]);
  });
});
