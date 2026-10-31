import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import type { FastifyBaseLogger } from 'fastify';
import type { Bridge } from './bridge.js';
import type { Config } from './config.js';
import type { Snapshot } from './schemas.js';

export function sensorText(snapshot: Snapshot): string {
  const t = snapshot.telemetry;
  return t
    ? `Suhu ${t.t.toFixed(1)} °C, kelembapan ${t.h.toFixed(1)} % RH, gas ${t.ppm} ppm.`
    : 'Data sensor belum tersedia.';
}
export function statusText(snapshot: Snapshot): string {
  return `SIMONDARA: ${snapshot.online ? 'online' : 'offline'}. Status ${snapshot.state ? ['Aman', 'Waspada', 'Bahaya'][snapshot.state.status] : 'belum tersedia'}. ${sensorText(snapshot)}`;
}

// Deterministic transition logic; offline grace is checked periodically by the bot.
export class Notifications {
  private previousStatus: number | undefined;
  private dangerSeen: boolean;
  private previousOnline: boolean;
  private offlineAt: number | undefined;
  private offlineSent = false;
  constructor(snapshot: Snapshot) {
    this.previousStatus = snapshot.state?.status;
    this.dangerSeen = this.previousStatus === 2;
    this.previousOnline = snapshot.online;
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
  'SIMONDARA\n/status — kondisi terkini\n/kipas_on — mode manual, kipas menyala\n/kipas_off — mode manual, kipas mati\n/otomatis — mode otomatis\n/help — bantuan';
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

export class Telegram {
  private readonly abort = new AbortController();
  private polling: Promise<void> | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly notifications: Notifications;
  private readonly pending = new Set<Promise<void>>();
  private readonly onUpdate = () => this.notify();
  constructor(
    private readonly config: Config,
    private readonly bridge: Bridge,
    private readonly log: FastifyBaseLogger,
  ) {
    this.notifications = new Notifications(bridge.snapshot);
  }
  start() {
    if (!this.config.TELEGRAM_BOT_TOKEN) return;
    this.bridge.events.on('update', this.onUpdate);
    this.timer = setInterval(() => this.notify(), 1000);
    this.polling = this.poll();
  }
  private notify() {
    for (const message of this.notifications.update(this.bridge.snapshot)) {
      const sending = this.send(message);
      this.pending.add(sending);
      void sending.finally(() => this.pending.delete(sending));
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
          const command = message.text?.trim().split(/\s/)[0]?.split('@')[0];
          if (command === '/status')
            await this.send(statusText(this.bridge.snapshot));
          else if (command === '/start' || command === '/help')
            await this.send(help);
          else if (
            ['/kipas_on', '/kipas_off', '/otomatis'].includes(command ?? '')
          ) {
            try {
              await this.bridge.publish(
                command === '/otomatis'
                  ? { mode: 0 }
                  : { mode: 1, fan: command === '/kipas_on' ? 1 : 0 },
              );
              await this.send('Perintah dikirim ke perangkat.');
            } catch {
              await this.send(
                'Perintah gagal dikirim: broker belum terhubung.',
              );
            }
          }
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
