import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  snapshotSchema,
  type Snapshot,
  type TelemetryPoint,
} from './schemas.js';

export class Store {
  readonly db: Database.Database;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    const version = this.db.pragma('user_version', { simple: true }) as number;
    if (version > 1) {
      this.db.close();
      throw new Error('Versi database lebih baru daripada backend');
    }
    if (version < 1)
      this.db.transaction(() => {
        this.db.exec(`
        CREATE TABLE telemetry (at INTEGER NOT NULL, t REAL NOT NULL, h REAL NOT NULL, ppm INTEGER NOT NULL);
        CREATE INDEX telemetry_at ON telemetry(at);
        CREATE TABLE events (at INTEGER NOT NULL, type TEXT NOT NULL CHECK(type IN ('status','online')), value INTEGER NOT NULL);
        CREATE INDEX events_at ON events(at);
        CREATE TABLE snapshot (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
        CREATE TABLE sessions (id TEXT PRIMARY KEY, expires INTEGER NOT NULL);
        PRAGMA user_version = 1;
      `);
      })();
  }
  restore(): Snapshot {
    const row = this.db
      .prepare('SELECT data FROM snapshot WHERE id=1')
      .get() as { data: string } | undefined;
    return row
      ? snapshotSchema.parse(JSON.parse(row.data))
      : { online: false, state: null, telemetry: null, updatedAt: null };
  }
  save(snapshot: Snapshot) {
    this.db
      .prepare(
        'INSERT INTO snapshot VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(JSON.stringify(snapshot));
  }
  telemetry(point: TelemetryPoint) {
    this.db
      .prepare('INSERT INTO telemetry VALUES (?, ?, ?, ?)')
      .run(Date.parse(point.at), point.t, point.h, point.ppm);
  }
  event(at: string, type: 'status' | 'online', value: number) {
    this.db
      .prepare('INSERT INTO events VALUES (?, ?, ?)')
      .run(Date.parse(at), type, value);
  }
  history(from: string, to: string, bucket: '1m' | '5m' | '1h') {
    const size = { '1m': 60_000, '5m': 300_000, '1h': 3_600_000 }[bucket];
    const rows = this.db
      .prepare(
        `SELECT CAST(at / ? AS INTEGER) * ? AS at, AVG(t) AS t, AVG(h) AS h, AVG(ppm) AS ppm
      FROM telemetry WHERE at >= ? AND at < ? GROUP BY CAST(at / ? AS INTEGER) ORDER BY at`,
      )
      .all(size, size, Date.parse(from), Date.parse(to), size) as {
      at: number;
      t: number;
      h: number;
      ppm: number;
    }[];
    return rows.map((row) => ({ ...row, at: new Date(row.at).toISOString() }));
  }
  events(limit: number) {
    return (
      this.db
        .prepare(
          'SELECT at, type, value FROM events ORDER BY at DESC, rowid DESC LIMIT ?',
        )
        .all(limit) as {
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
