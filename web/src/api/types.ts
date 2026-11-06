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
  /** Hardware fault bitmask; older firmware omits it. See FAULTS in live/status.ts. */
  fault: z.number().int().nonnegative().default(0),
});
export const snapshotSchema = z.object({
  online: z.boolean(),
  state: deviceStateSchema.nullable(),
  telemetry: telemetrySchema.nullable(),
  updatedAt: iso.nullable(),
});
export const deviceIdSchema = z
  .string()
  .trim()
  .min(1, 'ID perangkat wajib diisi.')
  .regex(
    /^[a-z0-9][a-z0-9-]{0,31}$/,
    'ID perangkat maksimal 32 karakter: huruf kecil, angka, dan tanda hubung, diawali huruf atau angka.',
  );
export const roomNameSchema = z
  .string()
  .trim()
  .min(1, 'Nama kamar wajib diisi.')
  .max(40, 'Nama kamar maksimal 40 karakter.');
export const roomSchema = snapshotSchema.extend({
  deviceId: deviceIdSchema,
  name: z.string().min(1),
  createdAt: iso,
});
export const unregisteredDeviceSchema = z.object({
  deviceId: deviceIdSchema,
  lastSeen: iso,
  online: z.boolean(),
});
export const roomsPayloadSchema = z.object({
  rooms: z.array(roomSchema),
  unregistered: z.array(unregisteredDeviceSchema),
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
  .omit({ status: true, fault: true })
  .partial()
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Perintah tidak boleh kosong',
  );
export type Telemetry = z.infer<typeof telemetrySchema>;
export type DeviceState = z.infer<typeof deviceStateSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Room = z.infer<typeof roomSchema>;
export type UnregisteredDevice = z.infer<typeof unregisteredDeviceSchema>;
export type RoomsPayload = z.infer<typeof roomsPayloadSchema>;
export type HistoryPoint = z.infer<typeof historyPointSchema>;
export type Event = z.infer<typeof eventSchema>;
export type Command = z.infer<typeof commandSchema>;
export type HistoryBucket = '1m' | '5m' | '1h';
