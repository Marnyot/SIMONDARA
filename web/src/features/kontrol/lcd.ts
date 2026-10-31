import type { AirStatus } from '../../live/status';
import { STATUS } from '../../live/status';
import type { Telemetry } from '../../api/types';

export const LCD_COLUMNS = 16;

/** Pads or truncates text to exactly one 16-column LCD row. */
export function fitLcdLine(text: string): string {
  return text.slice(0, LCD_COLUMNS).padEnd(LCD_COLUMNS, ' ');
}

/**
 * Mirrors firmware `display.cpp` renderReadings():
 *   "Suhu:%.1f Lb:%d%%" / "Gas:%s %s"
 * The LCD uses C printf formatting (dot decimal), so it intentionally ignores
 * the Indonesian number format used elsewhere in the UI.
 */
export function formatLcdLines(
  telemetry: Pick<Telemetry, 't' | 'h' | 'ppm'> | null,
  status: AirStatus | null,
): [string, string] {
  if (!telemetry) return [fitLcdLine('SIMONDARA'), fitLcdLine('Menunggu data')];
  const line1 = `Suhu:${telemetry.t.toFixed(1)} Lb:${Math.round(telemetry.h)}%`;
  // Firmware buffer holds 5 digits for ppm.
  const gas = String(Math.trunc(telemetry.ppm)).slice(0, 5);
  const label = status === null ? '-' : STATUS[status].label;
  return [fitLcdLine(line1), fitLcdLine(`Gas:${gas} ${label}`)];
}
