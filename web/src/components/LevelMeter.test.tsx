import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LevelMeter } from './LevelMeter';

describe('LevelMeter', () => {
  it.each([
    [0, 'Aman', 'safe'],
    [1, 'Waspada', 'warning'],
    [2, 'Bahaya', 'danger'],
  ] as const)(
    'maps status %i to its level and color',
    (status, label, tone) => {
      const { container } = render(<LevelMeter name="Udara" status={status} />);
      expect(
        screen.getByRole('img', {
          name: `Udara: ${label}, tingkat ${status + 1} dari 3`,
        }),
      ).toHaveAttribute('data-tone', tone);
      expect(container.querySelectorAll('[data-filled="true"]')).toHaveLength(
        status + 1,
      );
    },
  );
  it('keeps a stale reading explicit and supports sensor labels', () => {
    render(<LevelMeter name="Suhu" status={1} label="Terakhir: Panas" stale />);
    expect(
      screen.getByRole('img', {
        name: 'Suhu: Terakhir: Panas, tingkat 2 dari 3',
      }),
    ).toHaveAttribute('data-stale', 'true');
  });
});
