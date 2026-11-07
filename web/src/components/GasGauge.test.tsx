import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GasGauge } from './GasGauge';

describe('GasGauge', () => {
  it('menampilkan angka asli dan penanda melebihi skala di atas maksimum', () => {
    render(<GasGauge ppm={3500} />);
    expect(screen.getByText('3.500')).toBeInTheDocument();
    expect(screen.getByText('Melebihi skala')).toBeInTheDocument();
    expect(screen.getByText('> 3.000')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName(
      /3\.500 ppm, melebihi skala 3\.000 ppm, status Bahaya/,
    );
  });
  it('status mengikuti ambang gasStatus: 1.000 aman, 1.001 waspada', () => {
    const { rerender } = render(<GasGauge ppm={1000} />);
    expect(screen.getByText('Aman')).toBeInTheDocument();
    rerender(<GasGauge ppm={1001} />);
    expect(screen.getByText('Waspada')).toBeInTheDocument();
    expect(screen.queryByText('Melebihi skala')).not.toBeInTheDocument();
  });
  it('mode skala menyembunyikan pengulangan nilai dan status tetapi mempertahankan deskripsi aksesibel', () => {
    render(<GasGauge ppm={3500} showReadout={false} />);
    expect(screen.queryByText('3.500')).not.toBeInTheDocument();
    expect(screen.queryByText('Bahaya')).not.toBeInTheDocument();
    expect(screen.queryByText('ppm')).not.toBeInTheDocument();
    expect(screen.getByText('Melebihi skala')).toBeVisible();
    expect(screen.getByRole('img')).toHaveAccessibleName(
      /3\.500 ppm.*status Bahaya/,
    );
  });
});
