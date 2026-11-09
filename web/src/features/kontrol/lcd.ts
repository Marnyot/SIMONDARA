import type { AirStatus } from '../../live/status';
import type { Telemetry } from '../../api/types';

export const LCD_COLUMNS = 16;

/** Pads or truncates text to exactly one 16-column LCD row. */
export function fitLcdLine(text: string): string {
  return text.slice(0, LCD_COLUMNS).padEnd(LCD_COLUMNS, ' ');
}

const LCD_STATUS = ['AMAN', 'WASPADA', 'BAHAYA'] as const;
const PPM_MAX_SHOWN = 5000;

/**
 * Mirrors firmware `perbaruiLcd()` (sketch tim SIMONDARA v2):
 *   "S:%.1fC L:%.0f%%" (+"?" bila DHT gagal) / "%4.0fppm STATUS"
 * C printf formatting (dot decimal), so it ignores the Indonesian number format.
 * The web does not see warm-up or calibration state, so those LCD screens are
 * not previewed; a gas fault shows the firmware's "Cek sinyal MQ135".
 */
export function formatLcdLines(
  telemetry: Pick<Telemetry, 't' | 'h' | 'ppm'> | null,
  status: AirStatus | null,
  fault = 0,
): [string, string] {
  if (!telemetry) return [fitLcdLine('SIMONDARA'), fitLcdLine('Monitor aktif')];
  const line1 =
    Number.isFinite(telemetry.t) && Number.isFinite(telemetry.h)
      ? `S:${telemetry.t.toFixed(1)}C L:${Math.round(telemetry.h)}%${fault & 1 ? '?' : ''}`
      : 'DHT belum terbaca';
  const label = status === null ? '' : LCD_STATUS[status];
  const line2 =
    fault & 2 || !Number.isFinite(telemetry.ppm) || telemetry.ppm < 0
      ? 'Cek sinyal MQ135'
      : telemetry.ppm > PPM_MAX_SHOWN
        ? `>${PPM_MAX_SHOWN}ppm ${label}`
        : `${String(Math.round(telemetry.ppm)).padStart(4, ' ')}ppm ${label}`;
  return [fitLcdLine(line1), fitLcdLine(line2)];
}
