import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Toggle } from './Toggle';
import { SegmentedControl } from './SegmentedControl';
const options = [
  { value: 0, label: 'Otomatis' },
  { value: 1, label: 'Manual' },
];
function Controls() {
  const [checked, setChecked] = useState(false);
  const [mode, setMode] = useState(0);
  return (
    <>
      <Toggle label="Kipas Exhaust" checked={checked} onChange={setChecked} />
      <SegmentedControl
        label="Mode Sistem"
        options={options}
        value={mode}
        onChange={setMode}
      />
    </>
  );
}
describe('kontrol aksesibel', () => {
  it('switch berlabel dapat diubah lewat keyboard', async () => {
    const user = userEvent.setup();
    render(<Controls />);
    const toggle = screen.getByRole('switch', { name: 'Kipas Exhaust' });
    expect(toggle).not.toBeChecked();
    await user.tab();
    expect(toggle).toHaveFocus();
    await user.keyboard(' ');
    expect(toggle).toBeChecked();
  });
  it('radiogroup mendukung panah dan Home, serta focus berpindah', async () => {
    const user = userEvent.setup();
    render(<Controls />);
    expect(
      screen.getByRole('radiogroup', { name: 'Mode Sistem' }),
    ).toBeInTheDocument();
    screen.getByRole('radio', { name: 'Otomatis' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Manual' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Manual' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('radio', { name: 'Otomatis' })).toBeChecked();
  });
  it('kontrol disabled tidak mengirim perubahan', async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(
      <>
        <Toggle label="Buzzer" checked={false} disabled onChange={change} />
        <SegmentedControl
          label="Mode"
          options={options}
          value={0}
          onChange={change}
          disabled
        />
      </>,
    );
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('radio', { name: 'Manual' }));
    expect(change).not.toHaveBeenCalled();
  });
});
