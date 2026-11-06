import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  snapshotSchema,
  type Room,
  type Snapshot,
  type TelemetryPoint,
} from './schemas.js';

type RoomRow = { deviceId: string; name: string; createdAt: string };
export class RoomConflict extends Error {
  constructor(readonly code: 'device_exists' | 'name_exists') {
    super(code);
  }
}

export class Store {
  readonly db: Database.Database;
  constructor(path: string, initialDeviceId = 'kos-01') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    const version = this.db.pragma('user_version', { simple: true }) as number;
    if (version > 2) {
      this.db.close();
      throw new Error('Versi database lebih baru daripada backend');
    }
    try {
      if (version < 2)
        this.db.transaction(() => {
          if (version === 1) {
            this.db.exec(`
            ALTER TABLE telemetry RENAME TO telemetry_v1;
            ALTER TABLE events RENAME TO events_v1;
            ALTER TABLE snapshot RENAME TO snapshot_v1;
          `);
          }
          this.db.exec(`
          CREATE TABLE telemetry (at INTEGER NOT NULL, t REAL NOT NULL, h REAL NOT NULL, ppm INTEGER NOT NULL, device_id TEXT NOT NULL);
          CREATE TABLE events (at INTEGER NOT NULL, type TEXT NOT NULL CHECK(type IN ('status','online')), value INTEGER NOT NULL, device_id TEXT NOT NULL);
        `);
          if (version === 1) {
            this.db
              .prepare(
                'INSERT INTO telemetry SELECT at,t,h,ppm,? FROM telemetry_v1 ORDER BY rowid',
              )
              .run(initialDeviceId);
            this.db
              .prepare(
                'INSERT INTO events SELECT at,type,value,? FROM events_v1 ORDER BY rowid',
              )
              .run(initialDeviceId);
            this.db.exec('DROP TABLE telemetry_v1; DROP TABLE events_v1');
          } else {
            this.db.exec(
              'CREATE TABLE sessions (id TEXT PRIMARY KEY, expires INTEGER NOT NULL)',
            );
          }
          this.db.exec(`
          CREATE TABLE rooms (device_id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
          CREATE TABLE snapshot (device_id TEXT PRIMARY KEY, data TEXT NOT NULL);
          CREATE INDEX telemetry_device_at ON telemetry(device_id, at);
          CREATE INDEX events_device_at ON events(device_id, at);
          CREATE INDEX IF NOT EXISTS telemetry_at ON telemetry(at);
        `);
          if (version === 1) {
            this.db
              .prepare(
                'INSERT INTO snapshot SELECT ?, data FROM snapshot_v1 WHERE id=1',
              )
              .run(initialDeviceId);
            this.db.exec('DROP TABLE snapshot_v1');
          }
          this.db
            .prepare('INSERT INTO rooms VALUES (?, ?, ?, ?)')
            .run(
              initialDeviceId,
              'Kamar 1',
              'kamar 1',
              new Date().toISOString(),
            );
          this.db.pragma('user_version = 2');
        })();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  restore(deviceId: string): Snapshot {
    const row = this.db
      .prepare('SELECT data FROM snapshot WHERE device_id=?')
      .get(deviceId) as { data: string } | undefined;
    return row
      ? snapshotSchema.parse(JSON.parse(row.data))
      : { online: false, state: null, telemetry: null, updatedAt: null };
  }
  save(deviceId: string, snapshot: Snapshot) {
    this.db
      .prepare(
        'INSERT INTO snapshot VALUES (?, ?) ON CONFLICT(device_id) DO UPDATE SET data=excluded.data',
      )
      .run(deviceId, JSON.stringify(snapshot));
  }
  room(deviceId: string): Room | undefined {
    const row = this.db
      .prepare(
        'SELECT device_id AS deviceId, name, created_at AS createdAt FROM rooms WHERE device_id=?',
      )
      .get(deviceId) as RoomRow | undefined;
    return row && { ...row, ...this.restore(deviceId) };
  }
  rooms(): Room[] {
    return (
      this.db
        .prepare('SELECT device_id FROM rooms ORDER BY created_at, rowid')
        .all() as { device_id: string }[]
    ).map(({ device_id }) => this.room(device_id)!);
  }
  roomList() {
    const unregistered = (
      this.db
        .prepare(
          'SELECT device_id, data FROM snapshot WHERE device_id NOT IN (SELECT device_id FROM rooms) ORDER BY device_id',
        )
        .all() as { device_id: string; data: string }[]
    ).map(({ device_id, data }) => {
      const snapshot = snapshotSchema.parse(JSON.parse(data));
      return {
        deviceId: device_id,
        lastSeen: snapshot.updatedAt!,
        online: snapshot.online,
      };
    });
    return { rooms: this.rooms(), unregistered };
  }
  createRoom(deviceId: string, name: string): Room {
    return this.db.transaction(() => {
      if (this.room(deviceId)) throw new RoomConflict('device_exists');
      if (
        this.db
          .prepare('SELECT 1 FROM rooms WHERE name_key=?')
          .get(name.toLowerCase())
      )
        throw new RoomConflict('name_exists');
      this.db
        .prepare('INSERT INTO rooms VALUES (?, ?, ?, ?)')
        .run(deviceId, name, name.toLowerCase(), new Date().toISOString());
      return this.room(deviceId)!;
    })();
  }
  renameRoom(deviceId: string, name: string): Room {
    return this.db.transaction(() => {
      if (
        this.db
          .prepare('SELECT 1 FROM rooms WHERE name_key=? AND device_id<>?')
          .get(name.toLowerCase(), deviceId)
      )
        throw new RoomConflict('name_exists');
      this.db
        .prepare('UPDATE rooms SET name=?, name_key=? WHERE device_id=?')
        .run(name, name.toLowerCase(), deviceId);
      return this.room(deviceId)!;
    })();
  }
  deleteRoom(deviceId: string) {
    this.db.transaction(() => {
      for (const table of ['rooms', 'snapshot', 'telemetry', 'events'])
        this.db.prepare(`DELETE FROM ${table} WHERE device_id=?`).run(deviceId);
    })();
  }
  telemetry(deviceId: string, point: TelemetryPoint) {
    this.db
      .prepare(
        'INSERT INTO telemetry (at,t,h,ppm,device_id) VALUES (?, ?, ?, ?, ?)',
      )
      .run(Date.parse(point.at), point.t, point.h, point.ppm, deviceId);
  }
  event(
    deviceId: string,
    at: string,
    type: 'status' | 'online',
    value: number,
  ) {
    this.db
      .prepare(
        'INSERT INTO events (at,type,value,device_id) VALUES (?, ?, ?, ?)',
      )
      .run(Date.parse(at), type, value, deviceId);
  }
  history(
    deviceId: string,
    from: string,
    to: string,
    bucket: '1m' | '5m' | '1h',
  ) {
    const size = { '1m': 60_000, '5m': 300_000, '1h': 3_600_000 }[bucket];
    const rows = this.db
      .prepare(
        `SELECT CAST(at / ? AS INTEGER) * ? AS at, AVG(t) AS t, AVG(h) AS h, AVG(ppm) AS ppm
      FROM telemetry WHERE device_id=? AND at >= ? AND at < ? GROUP BY CAST(at / ? AS INTEGER) ORDER BY at`,
      )
      .all(size, size, deviceId, Date.parse(from), Date.parse(to), size) as {
      at: number;
      t: number;
      h: number;
      ppm: number;
    }[];
    return rows.map((row) => ({ ...row, at: new Date(row.at).toISOString() }));
  }
  events(deviceId: string, limit: number) {
    return (
      this.db
        .prepare(
          'SELECT at,type,value FROM events WHERE device_id=? ORDER BY at DESC, rowid DESC LIMIT ?',
        )
        .all(deviceId, limit) as {
        at: number;
        type: 'status' | 'online';
        value: number;
      }[]
    ).map((row) => ({ ...row, at: new Date(row.at).toISOString() }));
  }
  prune(now = Date.now()) {
    this.db
      .prepare('DELETE FROM telemetry WHERE at < ?')
      .run(now - 30 * 86_400_000);
    this.db.prepare('DELETE FROM sessions WHERE expires <= ?').run(now);
  }
  close() {
    this.db.close();
  }
}
