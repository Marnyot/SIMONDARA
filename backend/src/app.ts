import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import { createHash, randomBytes } from 'node:crypto';
import { z, ZodError } from 'zod';
import type { ServerResponse } from 'node:http';
import type { Config } from './config.js';
import { Store } from './store.js';
import { Bridge } from './bridge.js';
import { Telegram } from './telegram.js';
import { commandSchema, eventsQuerySchema, historySchema } from './schemas.js';
import { verifyPassword } from './password.js';

const sessionDuration = 7 * 86_400_000;
const sessionKey = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export async function buildApp(
  config: Config,
  options: { connectMqtt?: boolean; logger?: boolean } = {},
) {
  const app = Fastify({
    bodyLimit: 16_384,
    trustProxy: config.TRUST_PROXY,
    logger:
      options.logger === false
        ? false
        : {
            level: 'info',
            redact: [
              'req.headers.cookie',
              'req.headers.authorization',
              'res.headers["set-cookie"]',
            ],
          },
  });
  const store = new Store(config.DB_PATH);
  const bridge = new Bridge(store, app.log);
  const telegram = new Telegram(config, bridge, app.log);
  const streams = new Map<ServerResponse, string>();
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    signed: true,
    sameSite: 'lax' as const,
    secure: config.NODE_ENV === 'production',
  };
  let prune: ReturnType<typeof setInterval> | undefined;

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: 'Input tidak valid',
        issues: error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
    const err = error as Error & { statusCode?: number };
    if (err.statusCode && err.statusCode < 500)
      return reply.code(err.statusCode).send({ error: err.message });
    app.log.error({ err }, 'Permintaan gagal');
    return reply.code(500).send({ error: 'Kesalahan server' });
  });
  await app.register(cookie, { secret: config.SESSION_SECRET });
  await app.register(helmet);
  await app.register(rateLimit, { global: false });
  if (config.NODE_ENV === 'development')
    await app.register(cors, { origin: config.WEB_ORIGIN, credentials: true });

  // All protected routes are encapsulated below, including logout and the event stream.
  app.addHook('onRequest', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    if (
      ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method) &&
      request.headers.origin &&
      request.headers.origin !== config.WEB_ORIGIN
    ) {
      return reply.code(403).send({ error: 'Origin tidak diizinkan' });
    }
  });
  app.get('/api/health', async () => ({ ok: true }));
  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { password } = z
        .object({ password: z.string().min(1).max(1024) })
        .strict()
        .parse(request.body);
      if (!(await verifyPassword(password, config.ADMIN_PASSWORD_HASH)))
        return reply.code(401).send({ error: 'Password salah' });
      const old =
        request.cookies.session &&
        request.unsignCookie(request.cookies.session);
      if (old && old.valid && old.value)
        store.db
          .prepare('DELETE FROM sessions WHERE id=?')
          .run(sessionKey(old.value));
      const token = randomBytes(32).toString('hex');
      store.db
        .prepare('INSERT INTO sessions VALUES (?, ?)')
        .run(sessionKey(token), Date.now() + sessionDuration);
      return reply
        .setCookie('session', token, {
          ...cookieOptions,
          maxAge: sessionDuration / 1000,
        })
        .code(204)
        .send();
    },
  );
  await app.register(async (protectedApp) => {
    protectedApp.addHook('onRequest', async (request, reply) => {
      const raw = request.cookies.session;
      const signed = raw ? request.unsignCookie(raw) : null;
      if (
        !signed?.valid ||
        !signed.value ||
        !store.db
          .prepare('SELECT 1 FROM sessions WHERE id=? AND expires>?')
          .get(sessionKey(signed.value), Date.now())
      ) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
    });
    protectedApp.post('/api/auth/logout', async (request, reply) => {
      const signed = request.unsignCookie(request.cookies.session!);
      const id = sessionKey(signed.value!);
      store.db.prepare('DELETE FROM sessions WHERE id=?').run(id);
      for (const [stream, session] of streams) if (session === id) stream.end();
      return reply.clearCookie('session', cookieOptions).code(204).send();
    });
    protectedApp.get('/api/auth/me', async () => ({ user: 'pengelola' }));
    protectedApp.get('/api/state', async () => bridge.snapshot);
    protectedApp.get('/api/history', async (request) => {
      const query = historySchema.parse(request.query);
      return { points: store.history(query.from, query.to, query.bucket) };
    });
    protectedApp.get('/api/events', async (request) => {
      const { limit } = eventsQuerySchema.parse(request.query);
      return { events: store.events(limit) };
    });
    protectedApp.post('/api/cmd', async (request, reply) => {
      const command = commandSchema.parse(request.body);
      try {
        await bridge.publish(command);
      } catch {
        return reply.code(503).send({ error: 'Broker MQTT belum terhubung' });
      }
      return reply.code(202).send();
    });
    protectedApp.get('/api/stream', async (request, reply) => {
      const id = sessionKey(
        request.unsignCookie(request.cookies.session!).value!,
      );
      reply.hijack();
      // Copy security/CORS headers set by Fastify before taking ownership of the socket.
      for (const [name, value] of Object.entries(reply.getHeaders()))
        if (value !== undefined) reply.raw.setHeader(name, value);
      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      streams.set(reply.raw, id);
      const send = (event: string, data: unknown) => {
        if (!reply.raw.destroyed && !reply.raw.writableEnded) {
          if (
            !reply.raw.write(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            )
          )
            reply.raw.destroy();
        }
      };
      send('state', bridge.snapshot.state);
      send('online', { online: bridge.snapshot.online });
      send('telemetry', bridge.snapshot.telemetry);
      bridge.events.on('update', send);
      const heartbeat = setInterval(() => {
        if (
          !store.db
            .prepare('SELECT 1 FROM sessions WHERE id=? AND expires>?')
            .get(id, Date.now())
        ) {
          reply.raw.end();
          return;
        }
        if (!reply.raw.write(': heartbeat\n\n')) reply.raw.destroy();
      }, 25_000);
      const cleanup = () => {
        clearInterval(heartbeat);
        bridge.events.off('update', send);
        streams.delete(reply.raw);
      };
      reply.raw.once('close', cleanup);
      reply.raw.once('error', cleanup);
    });
  });
  app.addHook('onReady', async () => {
    store.prune();
    prune = setInterval(() => {
      try {
        store.prune();
      } catch (err) {
        app.log.error({ err }, 'Prune SQLite gagal');
      }
    }, 60 * 60_000);
    prune.unref();
    if (options.connectMqtt !== false) {
      bridge.start(config);
      telegram.start();
    }
  });
  app.addHook('preClose', async () => {
    for (const stream of streams.keys()) stream.end();
  });
  app.addHook('onClose', async () => {
    if (prune) clearInterval(prune);
    await telegram.close();
    await bridge.close();
    store.close();
  });
  return { app, bridge, store };
}
