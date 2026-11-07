import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import type { FastifyBaseLogger } from 'fastify';
import type { Bridge } from './bridge.js';
import type { Config } from './config.js';
import { snoozeMinutesSchema, type Room, type Snapshot } from './schemas.js';

const faultComponents = [
  [1, 'Sensor suhu/kelembapan (DHT11)'],
  [2, 'Sensor gas (MQ-135)'],
  [4, 'Layar LCD'],
] as const;

const displayTimeZone = 'Asia/Jakarta';
const localDay = new Intl.DateTimeFormat('id-ID', {
  timeZone: displayTimeZone,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});
const localDate = new Intl.DateTimeFormat('id-ID', {
  timeZone: displayTimeZone,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const localTime = new Intl.DateTimeFormat('id-ID', {
  timeZone: displayTimeZone,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatSnoozeTime(until: string, now = new Date()): string {
  const date = new Date(until);
  const prefix =
    localDay.format(date) === localDay.format(now)
      ? ''
      : `${localDate.format(date)} `;
  return `${prefix}${localTime.format(date)} WIB`;
}

export function sensorText(snapshot: Snapshot): string {
  const t = snapshot.telemetry;
  return t
    ? `Suhu ${t.t.toFixed(1)} °C, kelembapan ${t.h.toFixed(1)} % RH, gas ${t.ppm} ppm.`
    : 'Data sensor belum tersedia.';
}
export function statusText(snapshot: Snapshot): string {
  const faults = faultComponents
    .filter(([bit]) => (snapshot.state?.fault ?? 0) & bit)
    .map(([, name]) => name);
  return `SIMONDARA: ${snapshot.online ? 'online' : 'offline'}. Status ${snapshot.state ? ['Aman', 'Waspada', 'Bahaya'][snapshot.state.status] : 'belum tersedia'}. ${sensorText(snapshot)}${faults.length ? ` Gangguan: ${faults.join(', ')}.` : ''}`;
}

// Deterministic transition logic; offline grace is checked periodically by the bot.
export class Notifications {
  private previousStatus: number | undefined;
  private dangerSeen: boolean;
  private previousOnline: boolean;
  private previousFault: number;
  private offlineAt: number | undefined;
  private offlineSent = false;
  constructor(snapshot: Snapshot) {
    this.previousStatus = snapshot.state?.status;
    this.dangerSeen = this.previousStatus === 2;
    this.previousOnline = snapshot.online;
    this.previousFault = snapshot.state?.fault ?? 0;
  }
  update(snapshot: Snapshot, now = Date.now()): string[] {
    const messages: string[] = [];
    const status = snapshot.state?.status;
    if (status !== this.previousStatus && status !== undefined) {
      if (status === 2) {
        this.dangerSeen = true;
        messages.push(
          `BAHAYA! Kualitas udara ruangan buruk. ${snapshot.state?.mode === 0 ? 'Kipas exhaust telah diaktifkan otomatis.' : 'Mode manual aktif; periksa dan kendalikan kipas exhaust.'} ${sensorText(snapshot)}`,
        );
      } else if (status === 0 && this.dangerSeen) {
        this.dangerSeen = false;
        messages.push(
          `Kondisi udara ruangan telah kembali normal (Aman). ${sensorText(snapshot)}`,
        );
      }
      this.previousStatus = status;
    }
    const fault = snapshot.state?.fault ?? 0;
    for (const [bit, name] of faultComponents) {
      if ((fault & bit) === (this.previousFault & bit)) continue;
      messages.push(
        fault & bit ? `Gangguan ${name}` : `${name} normal kembali`,
      );
    }
    this.previousFault = fault;
    if (this.previousOnline && !snapshot.online) this.offlineAt = now;
    if (snapshot.online) {
      if (this.offlineSent)
        messages.push('Perangkat SIMONDARA kembali online.');
      this.offlineAt = undefined;
      this.offlineSent = false;
    } else if (
      this.offlineAt !== undefined &&
      !this.offlineSent &&
      now - this.offlineAt >= 60_000
    ) {
      this.offlineSent = true;
      messages.push(
        'Perangkat SIMONDARA offline lebih dari 60 detik. Periksa koneksi perangkat.',
      );
    }
    this.previousOnline = snapshot.online;
    return messages;
  }
}
const help =
  'SIMONDARA\n/status [kamar] — kondisi terkini\n/kipas_on <kamar> — mode manual, kipas menyala\n/kipas_off <kamar> — mode manual, kipas mati\n/otomatis <kamar> — mode otomatis\n/notif_off [kamar] — matikan notifikasi\n/notif_on [kamar] — aktifkan notifikasi\n/notif_jeda [menit] — jeda global (default 60; 0 batalkan)\n/help — bantuan';
const updatesSchema = z.array(
  z.object({
    update_id: z.number().int(),
    message: z
      .object({
        chat: z.object({ id: z.number().int() }),
        text: z.string().optional(),
      })
      .optional(),
  }),
);

export function parseTelegramCommand(text: string) {
  const match = /^(\/[^\s@]+)(?:@[^\s]+)?(?:\s+(.+))?$/s.exec(text.trim());
  return match
    ? { command: match[1]!.toLowerCase(), argument: match[2]?.trim() ?? '' }
    : null;
}
export function resolveRoom(rooms: Room[], argument: string): Room | undefined {
  if (!argument) return rooms.length === 1 ? rooms[0] : undefined;
  const key = argument.toLowerCase();
  // Device identity takes precedence if a room name happens to match another ID.
  return (
    rooms.find((room) => room.deviceId.toLowerCase() === key) ??
    rooms.find((room) => room.name.toLowerCase() === key)
  );
}
const roomListText = (rooms: Room[]) =>
  rooms.length
    ? `Pilih kamar:\n${rooms.map((room) => `${room.name} (${room.deviceId})`).join('\n')}`
    : 'Belum ada kamar terdaftar.';

export class Telegram {
  private readonly abort = new AbortController();
  private polling: Promise<void> | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly notifications = new Map<string, Notifications>();
  private readonly pending = new Set<Promise<void>>();
  private readonly onUpdate = () => this.notify();
  constructor(
    private readonly config: Config,
    private readonly bridge: Bridge,
    private readonly log: FastifyBaseLogger,
  ) {
    this.syncRooms();
  }
  start() {
    if (!this.config.TELEGRAM_BOT_TOKEN) return;
    this.bridge.events.on('update', this.onUpdate);
    this.timer = setInterval(() => this.notify(), 1000);
    this.polling = this.poll();
  }
  private syncRooms() {
    const rooms = this.bridge.store.rooms();
    const ids = new Set(rooms.map((room) => room.deviceId));
    for (const id of this.notifications.keys())
      if (!ids.has(id)) this.notifications.delete(id);
    for (const room of rooms)
      if (!this.notifications.has(room.deviceId))
        this.notifications.set(room.deviceId, new Notifications(room));
    return rooms;
  }
  private notify() {
    const settings = this.bridge.store.notifications();
    for (const room of this.syncRooms()) {
      for (const message of this.notifications
        .get(room.deviceId)!
        .update(room)) {
        // Always consume transitions; suppressed messages are discarded.
        if (!settings.enabled || settings.snoozedUntil || !room.notify)
          continue;
        const sending = this.send(`${room.name}: ${message}`);
        this.pending.add(sending);
        void sending.finally(() => this.pending.delete(sending));
      }
    }
  }
  private notificationText(rooms: Room[]) {
    const settings = this.bridge.store.notifications();
    const disabled = rooms
      .filter((room) => !room.notify)
      .map((room) => room.name);
    return `Notifikasi global: ${settings.enabled ? 'aktif' : 'mati'}.${settings.snoozedUntil ? ` Jeda sampai ${formatSnoozeTime(settings.snoozedUntil)}.` : ''}${disabled.length ? ` Notifikasi kamar mati: ${disabled.join(', ')}.` : ''}`;
  }
  async handleCommand(text: string) {
    const parsed = parseTelegramCommand(text);
    if (!parsed) return;
    const { command, argument } = parsed;
    const rooms = this.bridge.store.rooms();
    if (command === '/start' || command === '/help') {
      await this.send(help);
      return;
    }
    if (command === '/notif_jeda') {
      const minutes =
        argument === '' ? 60 : /^\d+$/.test(argument) ? Number(argument) : NaN;
      const parsedMinutes = snoozeMinutesSchema.safeParse(minutes);
      if (!parsedMinutes.success) {
        await this.send('Jeda harus 0 atau 15–1440 menit.');
        return;
      }
      this.bridge.updateNotifications({ snoozeMinutes: parsedMinutes.data });
      await this.send(this.notificationText(rooms));
      return;
    }
    if (['/notif_off', '/notif_on'].includes(command) && !argument) {
      this.bridge.updateNotifications({ enabled: command === '/notif_on' });
      await this.send(this.notificationText(rooms));
      return;
    }
    if (command === '/status' && !argument) {
      await this.send(
        `${
          rooms.length
            ? rooms
                .map((room) => `${room.name}: ${statusText(room)}`)
                .join('\n')
            : roomListText(rooms)
        }\n${this.notificationText(rooms)}`,
      );
      return;
    }
    if (
      ![
        '/status',
        '/kipas_on',
        '/kipas_off',
        '/otomatis',
        '/notif_off',
        '/notif_on',
      ].includes(command)
    )
      return;
    const room = resolveRoom(rooms, argument);
    if (!room) {
      await this.send(
        argument
          ? `Kamar tidak ditemukan.\n${roomListText(rooms)}`
          : roomListText(rooms),
      );
      return;
    }
    if (command === '/status') {
      await this.send(
        `${room.name}: ${statusText(room)}\n${this.notificationText([room])}`,
      );
      return;
    }
    if (command === '/notif_off' || command === '/notif_on') {
      const updated = this.bridge.updateRoom(room.deviceId, {
        notify: command === '/notif_on',
      });
      await this.send(
        `${room.name}: Notifikasi ${updated.notify ? 'aktif' : 'mati'}.`,
      );
      return;
    }
    try {
      await this.bridge.publish(
        room.deviceId,
        command === '/otomatis'
          ? { mode: 0 }
          : { mode: 1, fan: command === '/kipas_on' ? 1 : 0 },
      );
      await this.send(`${room.name}: Perintah dikirim ke perangkat.`);
    } catch {
      await this.send(
        `${room.name}: Perintah gagal dikirim: broker belum terhubung.`,
      );
    }
  }
  private async api(method: string, body: object): Promise<unknown> {
    const response = await fetch(
      `https://api.telegram.org/bot${this.config.TELEGRAM_BOT_TOKEN}/${method}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.any([
          this.abort.signal,
          AbortSignal.timeout(40_000),
        ]),
      },
    );
    const data = z
      .object({ ok: z.boolean(), result: z.unknown() })
      .parse(await response.json());
    if (!response.ok || !data.ok) throw new Error('Telegram API gagal');
    return data.result;
  }
  private async send(text: string): Promise<void> {
    for (
      let attempt = 0;
      attempt < 3 && !this.abort.signal.aborted;
      attempt++
    ) {
      try {
        await this.api('sendMessage', {
          chat_id: this.config.TELEGRAM_CHAT_ID,
          text,
        });
        return;
      } catch {
        if (this.abort.signal.aborted) return;
        // Do not log fetch errors: their URL includes the bot token.
        this.log.warn({ attempt: attempt + 1 }, 'Gagal mengirim Telegram');
        try {
          await delay(1000 * 2 ** attempt, undefined, {
            signal: this.abort.signal,
          });
        } catch {
          return;
        }
      }
    }
  }
  private async poll(): Promise<void> {
    let offset = 0;
    let backoff = 1000;
    while (!this.abort.signal.aborted) {
      try {
        const updates = updatesSchema.parse(
          await this.api('getUpdates', {
            offset,
            timeout: 25,
            allowed_updates: ['message'],
          }),
        );
        for (const update of updates) {
          offset = update.update_id + 1;
          const message = update.message;
          if (
            !message ||
            String(message.chat.id) !== this.config.TELEGRAM_CHAT_ID
          )
            continue;
          if (message.text) await this.handleCommand(message.text);
        }
        backoff = 1000;
      } catch {
        if (this.abort.signal.aborted) break;
        this.log.warn('Polling Telegram gagal; mencoba ulang');
        try {
          await delay(backoff, undefined, { signal: this.abort.signal });
        } catch {
          break;
        }
        backoff = Math.min(backoff * 2, 30_000);
      }
    }
  }
  async close() {
    if (this.timer) clearInterval(this.timer);
    this.bridge.events.off('update', this.onUpdate);
    this.abort.abort();
    await this.polling;
    await Promise.all(this.pending);
  }
}
