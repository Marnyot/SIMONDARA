import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { eventSchema } from './types';

describe('event API', () => {
  it('memvalidasi payload backend nyata dan menormalisasi online menjadi boolean', () => {
    const payload = {
      events: [
        { at: '2026-10-31T14:49:45.498Z', type: 'status', value: 1 },
        { at: '2026-10-31T14:49:35.457Z', type: 'online', value: 1 },
      ],
    };
    expect(z.object({ events: z.array(eventSchema) }).parse(payload)).toEqual({
      events: [payload.events[0], { ...payload.events[1], value: true }],
    });
  });
  it.each([
    [0, false],
    [1, true],
    [false, false],
    [true, true],
  ] as const)('online %s menjadi %s', (value, expected) => {
    expect(
      eventSchema.parse({
        at: '2026-10-31T14:49:35.457Z',
        type: 'online',
        value,
      }).value,
    ).toBe(expected);
  });
  it.each([2, -1, '1', null])(
    'menolak nilai online di luar kontrak: %s',
    (value) => {
      expect(
        eventSchema.safeParse({
          at: '2026-10-31T14:49:35.457Z',
          type: 'online',
          value,
        }).success,
      ).toBe(false);
    },
  );
});
