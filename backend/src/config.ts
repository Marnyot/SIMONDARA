import { z } from 'zod';
import { passwordHashPattern } from './password.js';
import { deviceIdSchema } from './schemas.js';
const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    TRUST_PROXY: z.enum(['true', 'false']).optional(),
    PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    MQTT_URL: z
      .url()
      .refine(
        (url) => ['mqtt:', 'mqtts:'].includes(new URL(url).protocol),
        'Gunakan mqtt:// atau mqtts://',
      ),
    MQTT_USERNAME: z.string().min(1),
    MQTT_PASSWORD: z.string().min(1),
    DEVICE_ID: deviceIdSchema.default('kos-01'),
    DB_PATH: z.string().min(1).default('./data/simondara.db'),
    ADMIN_PASSWORD_HASH: z
      .string()
      .regex(
        passwordHashPattern,
        'Gunakan hash scrypt dari npm run hash-password',
      ),
    SESSION_SECRET: z.string().min(32, 'Minimal 32 karakter'),
    WEB_ORIGIN: z
      .url()
      .refine(
        (url) =>
          ['http:', 'https:'].includes(new URL(url).protocol) &&
          new URL(url).origin === url,
        'Isi origin HTTP(S) tanpa path',
      ),
    TELEGRAM_BOT_TOKEN: z.string().default(''),
    TELEGRAM_CHAT_ID: z.string().default(''),
  })
  .superRefine((env, ctx) => {
    if (env.TELEGRAM_BOT_TOKEN && !/^-?\d+$/.test(env.TELEGRAM_CHAT_ID))
      ctx.addIssue({
        code: 'custom',
        path: ['TELEGRAM_CHAT_ID'],
        message: 'Wajib chat ID numerik bila bot aktif',
      });
    if (env.NODE_ENV === 'production' && !env.MQTT_URL.startsWith('mqtts:'))
      ctx.addIssue({
        code: 'custom',
        path: ['MQTT_URL'],
        message: 'Produksi wajib MQTT TLS (mqtts://)',
      });
  })
  .transform((env) => ({
    ...env,
    TRUST_PROXY:
      env.TRUST_PROXY === undefined
        ? env.NODE_ENV === 'production'
        : env.TRUST_PROXY === 'true',
  }));
export type Config = z.infer<typeof envSchema>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success)
    throw new Error(
      `Konfigurasi tidak valid:\n${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')}`,
    );
  return parsed.data;
}
