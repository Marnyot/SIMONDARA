import { z } from 'zod';

export const deviceIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/);
export const roomNameSchema = z.string().trim().min(1).max(40);
export const createRoomSchema = z
  .object({ deviceId: deviceIdSchema, name: roomNameSchema })
  .strict();
export const updateRoomSchema = z
  .object({ name: roomNameSchema.optional(), notify: z.boolean().optional() })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Perubahan tidak boleh kosong',
  );
export const snoozeMinutesSchema = z
  .number()
  .int()
  .refine(
    (value) => value === 0 || (value >= 15 && value <= 1440),
    'Jeda harus 0 atau 15–1440 menit',
  );
export const updateNotificationsSchema = z
  .object({
    enabled: z.boolean().optional(),
    snoozeMinutes: snoozeMinutesSchema.optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Perubahan tidak boleh kosong',
  );
export interface NotificationSettings {
  enabled: boolean;
  snoozedUntil: string | null;
}

const bit = z.union([z.literal(0), z.literal(1)]);
export const telemetrySchema = z
  .object({
    t: z.number().min(-40).max(125),
    h: z.number().min(0).max(100),
    ppm: z.number().int().min(0).max(100_000),
    ts: z.number().int().min(0).max(8_640_000_000_000).optional(),
  })
  .strict();
export const stateSchema = z
  .object({
    status: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    fan: bit,
    mode: bit,
    led: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    buzzer: bit,
    mute: bit,
    fault: z.number().int().min(0).max(7).default(0),
  })
  .strict();
export const commandSchema = stateSchema
  .omit({ status: true, fault: true })
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Perintah tidak boleh kosong',
  );
export const onlineSchema = z.enum(['0', '1']);
export const historySchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    bucket: z.enum(['1m', '5m', '1h']),
  })
  .strict()
  .refine(({ from, to }) => {
    const span = Date.parse(to) - Date.parse(from);
    return span > 0 && span <= 7 * 86_400_000;
  }, 'Rentang harus positif dan maksimal 7 hari');
export const eventsQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(500).default(50) })
  .strict();
export type Telemetry = z.infer<typeof telemetrySchema>;
export type State = z.infer<typeof stateSchema>;
export type Command = z.infer<typeof commandSchema>;
export type TelemetryPoint = Telemetry & { at: string };
export interface Snapshot {
  online: boolean;
  state: State | null;
  telemetry: TelemetryPoint | null;
  updatedAt: string | null;
}
export interface Room extends Snapshot {
  notify: boolean;
  deviceId: string;
  name: string;
  createdAt: string;
}
export const snapshotSchema = z.object({
  online: z.boolean(),
  state: stateSchema.nullable(),
  telemetry: telemetrySchema.extend({ at: z.iso.datetime() }).nullable(),
  updatedAt: z.iso.datetime().nullable(),
});
