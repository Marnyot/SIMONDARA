# Backend SIMONDARA

Node.js **24**, npm, Fastify 5, TypeScript strict, MQTT.js, SQLite WAL, Zod dan Telegram long polling. Backend adalah satu-satunya jembatan MQTT untuk web dan Telegram; web tidak menerima kredensial broker. Kontrak API/topik ada di `../docs/CONTRACT.md`.

## Setup lokal

Dari root repo jalankan `docker compose -f infra/docker-compose.yml up -d`, lalu:

```sh
cd backend
npm ci
cp .env.example .env
npm run hash-password
# Isi ADMIN_PASSWORD_HASH dan SESSION_SECRET di .env sebelum startup.
npm run dev
# Terminal lain, dari backend/:
npm run sim
```

CLI hash meminta password minimal 8 karakter tanpa menampilkan input; bisa juga membaca satu baris melalui stdin. Jangan menaruh password asli pada argumen shell. Hash format `scrypt$<salt hex 32 karakter>$<key hex 128 karakter>` memakai `node:crypto` (N=16384, r=8, p=1, key 64 byte, salt acak 16 byte). Cookie sesi ditandatangani, httpOnly, SameSite=Lax, 7 hari, dan Secure saat NODE_ENV=production; token acak disimpan sebagai SHA-256 di DB dan logout mencabut sesi. Login dibatasi 5 percobaan/menit/IP; jalankan satu replica backend (SQLite dan limiter lokal proses).

## Environment

| Variabel                             | Keterangan                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| PORT                                 | Default 8080; listen 0.0.0.0                                                                           |
| NODE_ENV                             | development / test / production                                                                        |
| TRUST_PROXY                          | true/false; default true di production, false di development/test jika tidak diisi                     |
| MQTT_URL                             | mqtt://localhost:1883 lokal; mqtts://l4919106.ala.asia-southeast1.emqxsl.com:8883 produksi (wajib TLS) |
| MQTT_USERNAME, MQTT_PASSWORD         | Wajib; akun backend terpisah dari perangkat                                                            |
| DEVICE_ID                            | Default kos-01, huruf/angka/underscore/tanda minus                                                     |
| DB_PATH                              | Default ./data/simondara.db; produksi /data/simondara.db di volume persisten                           |
| ADMIN_PASSWORD_HASH                  | Hash scrypt dari script; wajib                                                                         |
| SESSION_SECRET                       | Minimal 32 karakter acak; wajib; rotasi membatalkan cookie lama                                        |
| WEB_ORIGIN                           | Origin web tanpa trailing slash; dev http://localhost:5173                                             |
| TELEGRAM_BOT_TOKEN                   | Kosong menonaktifkan bot                                                                               |
| TELEGRAM_CHAT_ID                     | Chat numerik pengelola; wajib ketika token terisi                                                      |
| SIM_MQTT_USERNAME, SIM_MQTT_PASSWORD | Default device/dev, terpisah dari MQTT_USERNAME/PASSWORD                                               |
| SIM_SCENARIO                         | normal / naik-ke-bahaya / offline                                                                      |

Konfigurasi divalidasi sebelum membuka DB/koneksi. Pesan kegagalan menyebut nama field tanpa mencetak nilainya. Jangan commit `.env`. Buat SESSION_SECRET dengan `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. CORS hanya aktif saat development dan hanya mengizinkan WEB_ORIGIN; POST dari Origin lain ditolak. Pada production WEB_ORIGIN wajib sama persis dengan origin Netlify (misalnya https://simondara.netlify.app), bukan URL Railway, karena browser mengirim Origin Netlify melalui rewrite. Web produksi menggunakan rewrite `/api` same-origin sesuai kontrak. Kredensial cookie dan token Telegram tidak dicetak pada log.

## Script

| Perintah              | Fungsi                                     |
| --------------------- | ------------------------------------------ |
| npm run dev           | Watch TypeScript, membaca .env jika ada    |
| npm run build         | tsc ke dist/                               |
| npm start             | node dist/server.js, membaca .env jika ada |
| npm run typecheck     | Pemeriksaan tipe tanpa emit                |
| npm run lint          | ESLint flat config                         |
| npm run format        | Prettier                                   |
| npm test              | Vitest, termasuk Fastify inject            |
| npm run sim -- normal | Simulator setiap 10 detik                  |
| npm run hash-password | Membuat hash password pengelola            |

## Data, API, SSE

`GET /api/health` mengembalikan `{"ok":true}` sebagai liveness. Semua endpoint lain selain login butuh cookie session, termasuk logout. Snapshot `GET /api/state` memuat online, state, telemetry, updatedAt; sebelum data pertama state/telemetry/updatedAt adalah null dan online false. Telemetry memuat `at` ISO selain field MQTT. Snapshot dipulihkan dari DB dan disegarkan oleh retained state/online saat subscribe; telemetry disimpan di SQLite dan snapshot.

History membutuhkan from/to ISO dengan timezone, rentang positif maksimal 7 hari, bucket 1m/5m/1h. Bucket sejajar waktu Unix/UTC, rata-rata aritmetika per bucket, rentang `[from,to)`, tanpa interpolasi bucket kosong. Events default limit 50, maksimal 500, terbaru dahulu; value berupa angka status 0/1/2 atau online 0/1. Cmd menerima subset tidak kosong mode/fan/led/buzzer/mute dan menolak field asing. Cmd QoS 1 tidak retained; 202 setelah publish diakui broker, 503 bila broker belum tersambung, tanpa antrean cmd saat offline. PUBACK bukan konfirmasi aktuator; state perangkat adalah sumber kebenaran.

SSE mengirim event state, online, telemetry sebagai snapshot saat connect (null bila belum ada), lalu perubahan live dan komentar heartbeat tiap 25 detik. Disconnect membersihkan listener/timer; logout dan kedaluwarsa menutup stream. Client lambat diputus saat buffer penuh dan dapat menyambung ulang untuk snapshot terbaru. MQTT reconnect otomatis 2 detik; payload JSON/range salah di-warn dan diabaikan. Prune telemetry >30 hari dan sesi kedaluwarsa dijalankan saat startup dan tiap jam. Skema SQLite memakai PRAGMA user_version; versi lebih baru ditolak. SIGINT/SIGTERM menutup SSE, Fastify, Telegram, MQTT dan DB. Volume harus dicadangkan (gunakan SQLite backup API atau hentikan service sebelum menyalin berkas WAL).

## Telegram

Bot memakai fetch long polling getUpdates dan hanya memproses TELEGRAM_CHAT_ID. Perintah: /start, /help, /status, /kipas_on (`{"mode":1,"fan":1}`), /kipas_off (`{"mode":1,"fan":0}`), /otomatis (`{"mode":0}`). Kegagalan API di-log tanpa token, retry pengiriman sampai 3 kali dengan backoff, polling maksimal backoff 30 detik; shutdown membatalkan fetch.

Teks notifikasi:

- `BAHAYA! Kualitas udara ruangan buruk. Kipas exhaust telah diaktifkan otomatis. Suhu … °C, kelembapan … % RH, gas … ppm.` saat status berubah menjadi 2 pada mode otomatis. Pada mode manual kalimat kipas diganti `Mode manual aktif; periksa dan kendalikan kipas exhaust.` agar tidak mengklaim pengaktifan otomatis.
- `Kondisi udara ruangan telah kembali normal (Aman). Suhu … °C, kelembapan … % RH, gas … ppm.` ketika kembali ke 0 setelah episode Bahaya, termasuk melalui 1.
- `Perangkat SIMONDARA offline lebih dari 60 detik. Periksa koneksi perangkat.` setelah online → offline selama 60 detik.
- `Perangkat SIMONDARA kembali online.` hanya bila notifikasi offline sebelumnya sudah dikirim; reconnect singkat tidak memicu spam.

Riwayat episode notifikasi hanya memori proses; snapshot perangkat tetap persisten.

## Simulator

`npm run sim -- normal`, `npm run sim -- naik-ke-bahaya`, atau `npm run sim -- offline`; argumen mengalahkan SIM_SCENARIO. Normal memakai random walk terbatas suhu 24–29 °C, kelembapan 42–58 %, gas 450–850 ppm. Skenario naik menambah gas 200 ppm tiap sampel hingga 3500. Offline memutus socket paksa setelah sampel keempat (~30 detik), sehingga broker mengirim LWT `0` retained. Simulator connect dengan online `1`, state QoS 1 retained saat connect/perubahan, telemetry QoS 0 tiap 10 detik, subscribe cmd QoS 1. Stop normal mengirim online `0`; koneksi terputus memakai LWT.

Status mengikuti parameter terburuk dari tabel root README: suhu >33, kelembapan <30/>70, atau gas >2000 = Bahaya; suhu <18/>30, kelembapan <40/>60, atau gas >1000 = Waspada. Logika mengikuti firmware `air_status`: latch gas terpisah dari keluaran kipas, ON bila ppm>1000, OFF bila ppm<900, dan tetap di pita 900–1000. Mode otomatis: Aman memakai fan=latch gas, LED hijau, buzzer mati; Waspada memakai fan=latch gas atau kipas sebelumnya, LED kuning, buzzer mati; Bahaya memaksa kipas menyala, LED merah, dan buzzer kecuali mute. Mute direset ke 0 saat status berubah dari non-Aman ke Aman, juga pada mode manual. Latch gas tetap diperbarui pada mode manual. Mode otomatis mengabaikan fan/led/buzzer cmd, menerima mode/mute; mode manual menerima semua aktuator. Pemilihan mode diproses terlebih dahulu agar cmd gabungan mode+fan bekerja.

## Railway / Docker produksi

1. Pilih **New Project → Deploy from GitHub repo**, lalu pilih repositori SIMONDARA.
2. Pada pengaturan service, tetapkan **Root Directory** ke `backend`. Railway mendeteksi `Dockerfile` secara otomatis; pastikan build menggunakan Dockerfile tersebut. Pada **Settings**, isi healthcheck path `/api/health`, pilih restart policy **On Failure**, dan gunakan satu replica. Pengaturan dilakukan melalui dashboard karena [Config as Code tidak lagi tersedia untuk service baru](https://docs.railway.com/config-as-code).
3. Attach **Railway Volume** ke service dengan mount path `/data`. Dockerfile tidak memakai instruksi `VOLUME` karena tidak didukung Railway. Image tetap membuat `/data` dan menetapkan `DB_PATH=/data/simondara.db`; tanpa volume, data hanya bertahan selama container lokal tersebut ada.
4. Isi **Variables** berikut sebelum deploy:

   | Variabel | Nilai |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `RAILWAY_RUN_UID` | `0` |
   | `MQTT_URL` | `mqtts://l4919106.ala.asia-southeast1.emqxsl.com:8883` |
   | `MQTT_USERNAME` | `simondara-backend` |
   | `MQTT_PASSWORD` | Password akun backend di EMQX |
   | `DEVICE_ID` | `kos-01` |
   | `ADMIN_PASSWORD_HASH` | Hasil `npm run hash-password` dari direktori `backend/` |
   | `SESSION_SECRET` | String acak minimal 32 karakter, buat dengan perintah di bagian Environment |
   | `WEB_ORIGIN` | Origin Netlify persis, misalnya `https://simondara.netlify.app`, tanpa trailing slash |
   | `TELEGRAM_BOT_TOKEN` | Token bot; boleh kosong untuk menonaktifkan Telegram |
   | `TELEGRAM_CHAT_ID` | Chat ID numerik pengelola; wajib jika token bot terisi |
   | `TRUST_PROXY` | `true` (default di production) |

   Railway Volume di-mount sebagai root; `RAILWAY_RUN_UID=0` membuat proses dapat menulis SQLite di volume, sesuai [panduan volume Railway](https://docs.railway.com/volumes/reference#caveats). Image lokal secara default tetap memakai user `node`; compiler hanya tersedia di build stage. Tetapkan password backend sendiri dan gunakan akun `simondara-device` terpisah untuk perangkat. Jangan memasukkan kredensial ke Docker build arguments.

5. Deploy service, lalu pilih **Networking → Generate Domain** dengan target port **8080**. `PORT` disediakan Railway; server membaca `PORT` melalui `src/config.ts` dan listen pada `0.0.0.0` di `src/server.ts`. Jika nilai `PORT` berbeda, sesuaikan target port domain dengannya.
6. Periksa `https://<domain>/api/health`, misalnya dengan `curl --fail https://<domain>/api/health`. Respons yang diharapkan adalah HTTP 200 dengan `{"ok":true}`. Endpoint ini memeriksa liveness server; status tersebut tidak menjamin broker MQTT tersambung.

Set proxy rewrite web `/api/*` melalui `web/netlify.toml` ke origin backend Railway agar cookie memakai origin web; login/me dan SSE harus melewati rewrite yang sama. Proxy Netlify membatasi durasi request hingga 26 detik; SSE dapat reconnect berkala melalui LiveProvider dan menerima snapshot terbaru saat tersambung kembali (lihat panduan deploy di `../web/README.md`). Gunakan HTTPS; cookie Secure tidak dikirim lewat HTTP. TRUST_PROXY menerima true/false; jika tidak diisi, Fastify mempercayai header proxy pada production dan tidak pada development/test. Dengan Railway + rewrite Netlify, default production membuat limiter login memakai IP klien dari X-Forwarded-For, bukan menggabungkan semua pengguna pada IP proxy. Proxy terluar harus menulis ulang header forwarding dari klien; gunakan TRUST_PROXY=false bila backend diakses langsung tanpa proxy tepercaya. WEB_ORIGIN wajib diisi origin Netlify persis tanpa trailing slash; Origin lain pada POST ditolak meskipun ada rewrite.

Verifikasi lokal: `npm run lint && npm run typecheck && npm run build && npm test`. Uji nyata: jalankan broker, backend dan simulator; `curl http://localhost:8080/api/health`, POST login dengan JSON password lokal melalui stdin/file berizin terbatas dan cookie jar, kemudian GET `/api/state` dengan cookie jar. Hapus cookie jar setelah selesai. Docker daemon diperlukan untuk uji broker lokal.
