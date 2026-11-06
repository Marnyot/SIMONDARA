import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/password.js';

describe('authenticated API', () => {
  let ctx: Awaited<ReturnType<typeof buildApp>>;
  let cookie = '';
  beforeAll(async () => {
    ctx = await buildApp(
      loadConfig({
        NODE_ENV: 'test',
        DB_PATH: ':memory:',
        MQTT_URL: 'mqtt://localhost:1883',
        MQTT_USERNAME: 'backend',
        MQTT_PASSWORD: 'dev',
        ADMIN_PASSWORD_HASH: await hashPassword('test-password'),
        SESSION_SECRET: 'a'.repeat(32),
        WEB_ORIGIN: 'http://localhost:5173',
      }),
      { connectMqtt: false, logger: false },
    );
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  it('keeps health public and requires auth on every protected route', async () => {
    expect((await ctx.app.inject('/api/health')).json()).toEqual({ ok: true });
    for (const url of [
      '/api/auth/me',
      '/api/rooms',
      '/api/rooms/kos-01/state',
      '/api/rooms/kos-01/history',
      '/api/rooms/kos-01/events',
      '/api/stream',
    ])
      expect((await ctx.app.inject(url)).statusCode).toBe(401);
    for (const url of ['/api/rooms/kos-01/cmd', '/api/auth/logout'])
      expect((await ctx.app.inject({ method: 'POST', url })).statusCode).toBe(
        401,
      );
  });
  it('rejects wrong password and tampered cookies, accepts correct password with secure cookie flags', async () => {
    expect(
      (
        await ctx.app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { password: 'wrong' },
        })
      ).statusCode,
    ).toBe(401);
    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'test-password' },
    });
    expect(login.statusCode).toBe(204);
    const header = login.headers['set-cookie'] as string;
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Max-Age=604800');
    cookie = header.split(';')[0]!;
    expect(
      (
        await ctx.app.inject({ url: '/api/auth/me', headers: { cookie } })
      ).json(),
    ).toEqual({ user: 'pengelola' });
    expect(
      (
        await ctx.app.inject({
          url: '/api/auth/me',
          headers: { cookie: `${cookie}tamper` },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('validates cmd and query boundaries; acknowledges publishing only on success', async () => {
    const publish = vi.spyOn(ctx.bridge, 'publish').mockResolvedValue();
    for (const payload of [
      {},
      { fan: 7 },
      { fan: 1, extra: true },
      { fault: 1 },
      { mode: 1, fault: 0 },
    ])
      expect(
        (
          await ctx.app.inject({
            method: 'POST',
            url: '/api/rooms/kos-01/cmd',
            headers: { cookie },
            payload,
          })
        ).statusCode,
      ).toBe(400);
    expect(
      (
        await ctx.app.inject({
          method: 'POST',
          url: '/api/rooms/kos-01/cmd',
          headers: { cookie },
          payload: { mode: 1, fan: 1 },
        })
      ).statusCode,
    ).toBe(202);
    expect(publish).toHaveBeenCalledExactlyOnceWith('kos-01', {
      mode: 1,
      fan: 1,
    });
    publish.mockRejectedValue(new Error('offline'));
    expect(
      (
        await ctx.app.inject({
          method: 'POST',
          url: '/api/rooms/kos-01/cmd',
          headers: { cookie },
          payload: { mute: 1 },
        })
      ).statusCode,
    ).toBe(503);
    expect(
      (
        await ctx.app.inject({
          url: '/api/rooms/kos-01/history?from=bad&to=bad&bucket=1m',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await ctx.app.inject({
          url: '/api/rooms/kos-01/events?limit=999999',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await ctx.app.inject({
          method: 'POST',
          url: '/api/rooms/kos-01/cmd',
          headers: { cookie, origin: 'https://evil.example' },
          payload: { mode: 1 },
        })
      ).statusCode,
    ).toBe(403);
    publish.mockRestore();
  });
  it('manages rooms, validates names and identities, and deletes only the selected device data', async () => {
    const call = (
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
      url: string,
      payload?: object,
    ) =>
      ctx.app.inject({
        method,
        url,
        headers: { cookie },
        ...(payload ? { payload } : {}),
      });
    const list = (await call('GET', '/api/rooms')).json();
    expect(list.rooms).toEqual([
      {
        deviceId: 'kos-01',
        name: 'Kamar 1',
        createdAt: expect.any(String),
        online: false,
        state: null,
        telemetry: null,
        updatedAt: null,
      },
    ]);
    expect(list.unregistered).toEqual([]);
    for (const payload of [
      { deviceId: 'Bad_ID', name: 'Kamar 2' },
      { deviceId: '-bad', name: 'Kamar 2' },
      { deviceId: 'a'.repeat(33), name: 'Kamar 2' },
      { deviceId: 'kamar-02', name: '  ' },
      { deviceId: 'kamar-02', name: 'x'.repeat(41) },
      { deviceId: 'kamar-02', name: 'Valid', extra: 1 },
    ])
      expect((await call('POST', '/api/rooms', payload)).statusCode).toBe(400);
    ctx.bridge.ingest('simondara/kamar-02/online', '1');
    ctx.bridge.ingest(
      'simondara/kamar-02/telemetry',
      JSON.stringify({ t: 27, h: 50, ppm: 650 }),
    );
    ctx.bridge.ingest(
      'simondara/kamar-02/state',
      JSON.stringify({
        status: 0,
        fan: 0,
        mode: 0,
        led: 1,
        buzzer: 0,
        mute: 0,
      }),
    );
    expect((await call('GET', '/api/rooms')).json().unregistered).toEqual([
      { deviceId: 'kamar-02', lastSeen: expect.any(String), online: true },
    ]);
    const created = await call('POST', '/api/rooms', {
      deviceId: 'kamar-02',
      name: '  Kamar 2  ',
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      deviceId: 'kamar-02',
      name: 'Kamar 2',
      online: true,
      telemetry: { ppm: 650 },
      state: { fault: 0 },
    });
    expect((await call('GET', '/api/rooms')).json().unregistered).toEqual([]);
    expect(
      (
        await call('POST', '/api/rooms', {
          deviceId: 'kamar-02',
          name: 'Other',
        })
      ).json(),
    ).toEqual({ error: 'device_exists' });
    const duplicate = await call('POST', '/api/rooms', {
      deviceId: 'kamar-03',
      name: 'kAMAR 2',
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ error: 'name_exists' });
    const conflict = await call('PATCH', '/api/rooms/kamar-02', {
      name: 'KAMAR 1',
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ error: 'name_exists' });
    expect(
      (await call('PATCH', '/api/rooms/kamar-02', { name: '' })).statusCode,
    ).toBe(400);
    const renamed = await call('PATCH', '/api/rooms/kamar-02', {
      name: 'Atas',
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json()).toMatchObject({
      name: 'Atas',
      createdAt: created.json().createdAt,
    });
    for (const [method, suffix] of [
      ['GET', '/state'],
      ['GET', '/history'],
      ['GET', '/events'],
      ['POST', '/cmd'],
      ['PATCH', ''],
      ['DELETE', ''],
    ] as const) {
      const missing = await call(
        method,
        `/api/rooms/missing${suffix}`,
        method === 'POST' ? { fan: 1 } : undefined,
      );
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toEqual({ error: 'room_not_found' });
    }
    expect(
      (await call('GET', '/api/rooms/kamar-02/state')).json(),
    ).toMatchObject({
      online: true,
      telemetry: { ppm: 650 },
      state: { fault: 0 },
    });
    ctx.bridge.ingest(
      'simondara/kamar-02/state',
      JSON.stringify({
        status: 0,
        fan: 0,
        mode: 0,
        led: 1,
        buzzer: 0,
        mute: 0,
        fault: 5,
      }),
    );
    expect(
      (await call('GET', '/api/rooms/kamar-02/state')).json().state.fault,
    ).toBe(5);
    expect((await call('GET', '/api/rooms')).json().rooms[1].state.fault).toBe(
      5,
    );
    expect(
      (await call('GET', '/api/rooms/kamar-02/events')).json().events,
    ).toHaveLength(2);
    expect((await call('DELETE', '/api/rooms/kamar-02')).statusCode).toBe(204);
    for (const table of ['rooms', 'snapshot', 'telemetry', 'events'])
      expect(
        ctx.store.db
          .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE device_id=?`)
          .get('kamar-02'),
      ).toEqual({ n: 0 });
    expect((await call('GET', '/api/rooms/kos-01/state')).statusCode).toBe(200);
    for (const old of ['state', 'history', 'events', 'cmd'])
      expect(
        (await call(old === 'cmd' ? 'POST' : 'GET', `/api/${old}`)).statusCode,
      ).toBe(404);
  });
  it('revokes sessions on logout and enforces expiration server-side', async () => {
    expect(
      (
        await ctx.app.inject({
          method: 'POST',
          url: '/api/auth/logout',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await ctx.app.inject({
          url: '/api/rooms/kos-01/state',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(401);
    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'test-password' },
    });
    cookie = (login.headers['set-cookie'] as string).split(';')[0]!;
    ctx.store.db.prepare('UPDATE sessions SET expires=0').run();
    expect(
      (
        await ctx.app.inject({
          url: '/api/rooms/kos-01/state',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('rate limits password guessing', async () => {
    let status = 0;
    for (let i = 0; i < 6; i++)
      status = (
        await ctx.app.inject({
          method: 'POST',
          url: '/api/auth/login',
          remoteAddress: '192.0.2.20',
          payload: { password: 'wrong' },
        })
      ).statusCode;
    expect(status).toBe(429);
  });
});

describe('proxy-aware login limiter', () => {
  it.each([
    ['production', undefined, true],
    ['production', 'false', false],
    ['development', undefined, false],
    ['development', 'true', true],
  ] as const)(
    'uses explicit proxy policy for %s / %s',
    async (environment, configured, expected) => {
      const config = loadConfig({
        NODE_ENV: environment,
        DB_PATH: ':memory:',
        MQTT_URL: 'mqtts://broker.example:8883',
        MQTT_USERNAME: 'backend',
        MQTT_PASSWORD: 'dev',
        ADMIN_PASSWORD_HASH: await hashPassword('test-password'),
        SESSION_SECRET: 'b'.repeat(32),
        WEB_ORIGIN: 'https://simondara.vercel.app',
        ...(configured === undefined ? {} : { TRUST_PROXY: configured }),
      });
      expect(config.TRUST_PROXY).toBe(expected);
      const { app } = await buildApp(config, {
        connectMqtt: false,
        logger: false,
      });
      try {
        const login = (forwarded: string) =>
          app.inject({
            method: 'POST',
            url: '/api/auth/login',
            remoteAddress: '192.0.2.10',
            headers: { 'x-forwarded-for': forwarded },
            payload: { password: 'wrong' },
          });
        for (let i = 0; i < 5; i++)
          expect((await login('198.51.100.1')).statusCode).toBe(401);
        expect((await login('198.51.100.1')).statusCode).toBe(429);
        expect((await login('198.51.100.2')).statusCode).toBe(
          expected ? 401 : 429,
        );
      } finally {
        await app.close();
      }
    },
  );
});
