import { z } from 'zod';
const bit = z.union([z.literal(0), z.literal(1)]);
const iso = z.iso.datetime({ offset: true });
export const telemetrySchema = z.object({
  t: z.number().finite(),
  h: z.number().min(0).max(100),
  ppm: z.number().int().nonnegative(),
  ts: z.number().int().nonnegative().optional(),
  at: iso.optional(),
});
export const deviceStateSchema = z.object({
  status: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  fan: bit,
  mode: bit,
  led: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  buzzer: bit,
  mute: bit,
});
export const snapshotSchema = z.object({
  online: z.boolean(),
  state: deviceStateSchema.nullable(),
  telemetry: telemetrySchema.nullable(),
  updatedAt: iso.nullable(),
});
export const historyPointSchema = z.object({
  at: iso,
  t: z.number().finite(),
  h: z.number().min(0).max(100),
  ppm: z.number().nonnegative(),
});
export const eventSchema = z.discriminatedUnion('type', [
  z.object({
    at: iso,
    type: z.literal('status'),
    value: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  }),
  z.object({
    at: iso,
    type: z.literal('online'),
    value: z
      .union([z.boolean(), bit])
      .transform((value) => value === true || value === 1),
  }),
]);
export const commandSchema = deviceStateSchema
  .omit({ status: true })
  .partial()
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Perintah tidak boleh kosong',
  );
export type Telemetry = z.infer<typeof telemetrySchema>;
export type DeviceState = z.infer<typeof deviceStateSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type HistoryPoint = z.infer<typeof historyPointSchema>;
export type Event = z.infer<typeof eventSchema>;
export type Command = z.infer<typeof commandSchema>;
export type HistoryBucket = '1m' | '5m' | '1h';
