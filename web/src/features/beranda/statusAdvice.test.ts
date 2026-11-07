import { describe, expect, it } from 'vitest';
import { relativeUpdate, statusAdvice } from './statusAdvice';

describe('saran kualitas udara', () => {
  it('menyebut semua parameter aman', () => {
    expect(statusAdvice({ t: 29.4, h: 55, ppm: 820 })).toContain('masih aman');
  });
  it('memberi saran ventilasi ketika gas mulai naik', () => {
    expect(statusAdvice({ t: 29.4, h: 55, ppm: 1500 })).toBe(
      'Kadar gas mulai naik. Buka jendela kalau tidak turun.',
    );
  });
  it('mendahulukan parameter paling buruk dan menyebut penyebab yang setara', () => {
    const advice = statusAdvice({ t: 34, h: 75, ppm: 1500 });
    expect(advice).toContain('Suhu sangat tinggi, kelembapan terlalu tinggi');
    expect(advice).not.toContain('gas');
    expect(statusAdvice({ t: 25, h: 25, ppm: 900 })).toContain(
      'Kelembapan terlalu rendah',
    );
    expect(statusAdvice({ t: 16, h: 50, ppm: 900 })).toContain(
      'Suhu terlalu rendah',
    );
  });
  it('memberi instruksi segera untuk gas bahaya', () => {
    expect(statusAdvice({ t: 25, h: 50, ppm: 2001 })).toContain(
      'Keluar dulu dari kamar',
    );
  });
  it('memformat umur pembaruan tanpa nilai negatif', () => {
    const at = '2026-10-31T10:00:00Z';
    expect(relativeUpdate(at, Date.parse(at) - 1000)).toBe(
      'Diperbarui barusan',
    );
    expect(relativeUpdate(at, Date.parse(at) + 125000)).toBe(
      'Diperbarui 2 menit lalu',
    );
  });
});
