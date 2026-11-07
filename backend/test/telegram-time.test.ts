import { describe, expect, it } from 'vitest';
import { formatSnoozeTime } from '../src/telegram.js';

describe('Telegram snooze time in WIB', () => {
  it.each([
    ['2026-11-07T10:00:00Z', '2026-11-07T11:40:00.000Z', '18.40 WIB'],
    // Different UTC dates can still fall on the same Jakarta day.
    ['2026-11-07T18:00:00Z', '2026-11-08T01:40:00Z', '08.40 WIB'],
    // The Jakarta date changes at 17:00 UTC, including at midnight.
    ['2026-11-07T16:40:00Z', '2026-11-07T17:00:00Z', 'Min, 8 Nov 00.00 WIB'],
    ['2026-12-31T16:40:00Z', '2026-12-31T17:40:00Z', 'Jum, 1 Jan 00.40 WIB'],
  ])('formats %s → %s as %s', (now, until, expected) => {
    expect(formatSnoozeTime(until, new Date(now))).toBe(expected);
  });
});
