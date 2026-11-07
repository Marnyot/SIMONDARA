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
| DEVICE_ID                            | Kamar awal migrasi/DB baru (default kos-01); pola `^[a-z0-9][a-z0-9-]{0,31}$`                          |
| DB_PATH                              | Default ./data/simondara.db; produksi /data/simondara.db di volume persisten                           |
| ADMIN_PASSWORD_HASH                  | Hash scrypt dari script; wajib                                                                         |
| SESSION_SECRET                       | Minimal 32 karakter acak; wajib; rotasi membatalkan cookie lama                                        |
| WEB_ORIGIN                           | Origin web tanpa trailing slash; dev http://localhost:5173                                             |
| TELEGRAM_BOT_TOKEN                   | Kosong menonaktifkan bot                                                                               |
| TELEGRAM_CHAT_ID                     | Chat numerik pengelola; wajib ketika token terisi                                                      |
| SIM_MQTT_USERNAME, SIM_MQTT_PASSWORD | Default device/dev, terpisah dari MQTT_USERNAME/PASSWORD                                               |
| SIM_DEVICES                          | Daftar deviceId simulator dipisah koma; default DEVICE_ID saja                                         |
| SIM_SCENARIO                         | normal / naik-ke-bahaya / offline                                                                      |

Konfigurasi divalidasi sebelum membuka DB/koneksi. Pesan kegagalan menyebut nama field tanpa mencetak nilainya. Jangan commit `.env`. Buat SESSION_SECRET dengan `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. CORS hanya aktif saat development dan hanya mengizinkan WEB_ORIGIN; POST dari Origin lain ditolak. Pada production WEB_ORIGIN wajib sama persis dengan origin Vercel (misalnya https://simondara.vercel.app), bukan URL Railway, karena browser mengirim Origin Vercel melalui rewrite. Web produksi menggunakan rewrite `/api` same-origin sesuai kontrak. Kredensial cookie dan token Telegram tidak dicetak pada log.

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

`GET /api/health` mengembalikan `{"ok":true}` sebagai liveness. Semua endpoint lain selain login butuh cookie session, termasuk logout. Backend subscribe `simondara/+/telemetry`, `simondara/+/state`, dan `simondara/+/online`; deviceId yang tidak cocok pola kontrak diabaikan. Data semua device valid disimpan, termasuk yang belum didaftarkan.

`GET /api/rooms` mengembalikan `{"rooms":[Room],"unregistered":[{"deviceId":"kamar-02","lastSeen":"ISO","online":true}]}`. Kamar urut `createdAt`; `lastSeen` adalah waktu terima pesan valid terakhir, bukan timestamp sensor. `Room` berbentuk `{"deviceId":"kos-01","name":"Kamar 1","createdAt":"ISO","notify":true,"online":false,"state":null,"telemetry":null,"updatedAt":null}` sebelum menerima data. Telemetry memuat `at` ISO selain field MQTT.

Daftarkan kamar melalui `POST /api/rooms` dengan `{"deviceId":"kamar-02","name":"Kamar 2"}` (201), ubah nama/saklar melalui `PATCH /api/rooms/:deviceId` dengan `{"name":"..."}` dan/atau `{"notify":false}` (200; minimal satu field), hapus melalui `DELETE /api/rooms/:deviceId` (204). Nama di-trim, wajib 1–40 karakter, unik tanpa membedakan kapital. Input invalid mendapat 400; konflik 409 `{"error":"device_exists"}` atau `{"error":"name_exists"}`. DELETE menghapus kamar beserta snapshot, telemetri dan event secara transaksional; pesan MQTT berikutnya dapat membuat device itu muncul kembali sebagai perangkat belum terdaftar.

`GET /api/notifications` dan `PATCH /api/notifications` memakai autentikasi sesi yang sama. Respons `{"enabled":true,"snoozedUntil":null}` adalah pengaturan Telegram global. PATCH menerima `enabled` boolean dan/atau `snoozeMinutes` integer 15–1440, atau 0 untuk membatalkan jeda; objek kosong, field asing, dan nilai di luar rentang mendapat 400. Waktu jeda berupa ISO UTC, dan jeda lampau dikembalikan sebagai null. Mengaktifkan global tidak membatalkan jeda; gunakan `snoozeMinutes:0` untuk membatalkannya.

Endpoint per kamar: `GET /api/rooms/:deviceId/state`, `GET /api/rooms/:deviceId/history`, `GET /api/rooms/:deviceId/events`, dan `POST /api/rooms/:deviceId/cmd`. State memuat online/state/telemetry/updatedAt. Device belum terdaftar mendapat 404 `{"error":"room_not_found"}`. Endpoint lama `/api/state`, `/api/history`, `/api/events`, `/api/cmd` dihapus.

History membutuhkan from/to ISO dengan timezone, rentang positif maksimal 7 hari, bucket 1m/5m/1h. Bucket sejajar waktu Unix/UTC, rata-rata aritmetika per bucket, rentang `[from,to)`, tanpa interpolasi bucket kosong. Events default limit 50, maksimal 500, terbaru dahulu; value berupa angka status 0/1/2 atau online 0/1. Cmd menerima subset tidak kosong mode/fan/led/buzzer/mute dan menolak field asing. Cmd dipublish ke `simondara/<deviceId>/cmd`, QoS 1 tidak retained; 202 setelah publish diakui broker, 503 bila broker belum tersambung, tanpa antrean cmd saat offline. PUBACK bukan konfirmasi aktuator; state perangkat adalah sumber kebenaran.

SSE `/api/stream` pertama mengirim event `rooms` dengan payload yang sama seperti `GET /api/rooms`, lalu snapshot `state`, `online`, `telemetry` untuk setiap kamar terdaftar. Event `state` adalah field state + `deviceId`; `telemetry` adalah field MQTT + `at` ISO + `deviceId`; `online` adalah `{"deviceId":"kos-01","online":true}`. Jika state/telemetry belum tersedia, snapshot event-nya hanya berisi `{"deviceId":"kos-01"}`; nilai null eksplisit tersedia dalam `rooms`. Event `notifications` membawa pengaturan global saat connect, saat berubah melalui web/bot, dan saat jeda berakhir. Satu timer berdasarkan deadline persisten dijadwalkan ulang setelah restart; tidak memerlukan polling jeda. Event `rooms` dikirim pada CRUD (termasuk perubahan `notify`) dan pesan perangkat belum terdaftar, sehingga daftar perangkat baru, online, dan lastSeen tetap mutakhir. Data perangkat belum terdaftar tidak pernah dikirim sebagai event state/online/telemetry.

Komentar heartbeat SSE dikirim tiap 25 detik. Disconnect membersihkan listener/timer; logout dan kedaluwarsa menutup stream. Client lambat diputus saat buffer penuh dan dapat menyambung ulang untuk snapshot terbaru. MQTT reconnect otomatis 2 detik; payload JSON/range salah di-warn dan diabaikan. Prune telemetry >30 hari dan sesi kedaluwarsa dijalankan saat startup dan tiap jam. SQLite memakai skema v3: tabel rooms, snapshot per device, device_id di telemetry/events, index `(device_id, at)`. Migrasi v2 → v3 menambah `rooms.notify INTEGER NOT NULL DEFAULT 1` dan tabel singleton `notifications` (`enabled` default 1, `snoozed_until` nullable); migrasi transaksional dan idempoten, pengaturan bertahan setelah restart. DB baru langsung v3 dan seed `Kamar 1` dari DEVICE_ID; DB v1 dimigrasi transaksional dan idempoten, mempertahankan data/sesi lama dan memberi semua data lama device_id=DEVICE_ID. Mengubah DEVICE_ID setelah migrasi tidak mengganti identitas data/kamar yang sudah ada. Versi DB lebih baru ditolak. SIGINT/SIGTERM menutup SSE, Fastify, Telegram, MQTT dan DB. Volume harus dicadangkan (gunakan SQLite backup API atau hentikan service sebelum menyalin berkas WAL).

## Telegram

Bot memakai fetch long polling getUpdates dan hanya memproses TELEGRAM_CHAT_ID. Perintah: /start, /help, /status (ringkasan semua kamar), /status <kamar> (satu kamar), /kipas_on <kamar> (`{"mode":1,"fan":1}`), /kipas_off <kamar> (`{"mode":1,"fan":0}`), /otomatis <kamar> (`{"mode":0}`). `/notif_off [kamar]` dan `/notif_on [kamar]` mematikan/mengaktifkan notifikasi global tanpa argumen atau per kamar bila target diberikan. `/notif_jeda [menit]` menjeda global (default 60 menit, integer 15–1440); `/notif_jeda 0` membatalkan jeda. `/status` menyebut saklar global, deadline jeda ISO UTC, dan kamar yang dimatikan (detail satu kamar menampilkan saklar kamar tersebut). Target dapat berupa deviceId atau nama lengkap kamar, case-insensitive; command aktuator tanpa argumen memakai satu-satunya kamar bila hanya ada satu, atau membalas daftar kamar bila lebih dari satu. Target tidak dikenal tidak mengirim command. Kegagalan API di-log tanpa token, retry pengiriman sampai 3 kali dengan backoff, polling maksimal backoff 30 detik; shutdown membatalkan fetch.

Notifikasi otomatis Bahaya/Aman/offline/online/gangguan hanya dikirim bila global aktif, tidak sedang dijeda, dan `notify` kamar aktif. Pesan tertahan dibuang, sementara transisi tetap dicatat sehingga pengaktifan ulang tidak mengirim ulang peristiwa lama. Balasan perintah bot tetap dikirim walaupun notifikasi mati atau dijeda. Notifikasi hanya untuk kamar terdaftar, setiap teks diawali nama kamar dan titik dua (`Kamar 2: ...`). Status, timer offline 60 detik dan episode bahaya dilacak independen per kamar; perangkat belum terdaftar tidak memicu notifikasi. Teks notifikasi:

- `BAHAYA! Kualitas udara ruangan buruk. Kipas exhaust telah diaktifkan otomatis. Suhu … °C, kelembapan … % RH, gas … ppm.` saat status berubah menjadi 2 pada mode otomatis. Pada mode manual kalimat kipas diganti `Mode manual aktif; periksa dan kendalikan kipas exhaust.` agar tidak mengklaim pengaktifan otomatis.
- `Kondisi udara ruangan telah kembali normal (Aman). Suhu … °C, kelembapan … % RH, gas … ppm.` ketika kembali ke 0 setelah episode Bahaya, termasuk melalui 1.
- `Perangkat SIMONDARA offline lebih dari 60 detik. Periksa koneksi perangkat.` setelah online → offline selama 60 detik.
- `Perangkat SIMONDARA kembali online.` hanya bila notifikasi offline sebelumnya sudah dikirim; reconnect singkat tidak memicu spam.

Riwayat episode notifikasi hanya memori proses; snapshot perangkat tetap persisten.

## Simulator

`SIM_DEVICES=kos-01,kamar-02 npm run sim -- normal` menjalankan beberapa perangkat, masing-masing dengan koneksi, LWT, state, telemetri, command, penghitung skenario dan timer sendiri; tanpa SIM_DEVICES hanya DEVICE_ID yang dijalankan. Identitas harus valid dan unik. `npm run sim -- normal`, `npm run sim -- naik-ke-bahaya`, atau `npm run sim -- offline`; argumen mengalahkan SIM_SCENARIO. Normal memakai random walk terbatas suhu 24–29 °C, kelembapan 42–58 %, gas 450–850 ppm. Skenario naik menambah gas 200 ppm tiap sampel hingga 3500. Offline memutus socket paksa setelah sampel keempat (~30 detik), sehingga broker mengirim LWT `0` retained. Simulator connect dengan online `1`, state QoS 1 retained saat connect/perubahan, telemetry QoS 0 tiap 10 detik, subscribe cmd QoS 1. Stop normal mengirim online `0`; koneksi terputus memakai LWT.

Status mengikuti parameter terburuk dari tabel root README: suhu >33, kelembapan <30/>70, atau gas >2000 = Bahaya; suhu <18/>30, kelembapan <40/>60, atau gas >1000 = Waspada. Logika mengikuti firmware `air_status`: latch gas terpisah dari keluaran kipas, ON bila ppm>1000, OFF bila ppm<900, dan tetap di pita 900–1000. Mode otomatis: Aman memakai fan=latch gas, LED hijau, buzzer mati; Waspada memakai fan=latch gas atau kipas sebelumnya, LED kuning, buzzer mati; Bahaya memaksa kipas menyala, LED merah, dan buzzer kecuali mute. Mute direset ke 0 saat status berubah dari non-Aman ke Aman, juga pada mode manual. Latch gas tetap diperbarui pada mode manual. Mode otomatis mengabaikan fan/led/buzzer cmd, menerima mode/mute; mode manual menerima semua aktuator. Pemilihan mode diproses terlebih dahulu agar cmd gabungan mode+fan bekerja.

## Railway / Docker produksi

1. Pilih **New Project → Deploy from GitHub repo**, lalu pilih repositori SIMONDARA.
2. Pada pengaturan service, tetapkan **Root Directory** ke `backend`. Railway mendeteksi `Dockerfile` secara otomatis; pastikan build menggunakan Dockerfile tersebut. Pada **Settings**, isi healthcheck path `/api/health`, pilih restart policy **On Failure**, dan gunakan satu replica. Pengaturan dilakukan melalui dashboard karena [Config as Code tidak lagi tersedia untuk service baru](https://docs.railway.com/config-as-code).
3. Attach **Railway Volume** ke service dengan mount path `/data`. Dockerfile tidak memakai instruksi `VOLUME` karena tidak didukung Railway. Image tetap membuat `/data` dan menetapkan `DB_PATH=/data/simondara.db`; tanpa volume, data hanya bertahan selama container lokal tersebut ada.
4. Isi **Variables** berikut sebelum deploy:

   | Variabel              | Nilai                                                                               |
   | --------------------- | ----------------------------------------------------------------------------------- |
   | `NODE_ENV`            | `production`                                                                        |
   | `RAILWAY_RUN_UID`     | `0`                                                                                 |
   | `MQTT_URL`            | `mqtts://l4919106.ala.asia-southeast1.emqxsl.com:8883`                              |
   | `MQTT_USERNAME`       | `simondara-backend`                                                                 |
   | `MQTT_PASSWORD`       | Password akun backend di EMQX                                                       |
   | `DEVICE_ID`           | `kos-01`                                                                            |
   | `ADMIN_PASSWORD_HASH` | Hasil `npm run hash-password` dari direktori `backend/`                             |
   | `SESSION_SECRET`      | String acak minimal 32 karakter, buat dengan perintah di bagian Environment         |
   | `WEB_ORIGIN`          | Origin Vercel persis, misalnya `https://simondara.vercel.app`, tanpa trailing slash |
   | `TELEGRAM_BOT_TOKEN`  | Token bot; boleh kosong untuk menonaktifkan Telegram                                |
   | `TELEGRAM_CHAT_ID`    | Chat ID numerik pengelola; wajib jika token bot terisi                              |
   | `TRUST_PROXY`         | `true` (default di production)                                                      |

   Railway Volume di-mount sebagai root; `RAILWAY_RUN_UID=0` membuat proses dapat menulis SQLite di volume, sesuai [panduan volume Railway](https://docs.railway.com/volumes/reference#caveats). Image lokal secara default tetap memakai user `node`; compiler hanya tersedia di build stage. Tetapkan password backend sendiri dan gunakan akun `simondara-device` terpisah untuk perangkat. Jangan memasukkan kredensial ke Docker build arguments.

5. Deploy service, lalu pilih **Networking → Generate Domain** dengan target port **8080**. `PORT` disediakan Railway; server membaca `PORT` melalui `src/config.ts` dan listen pada `0.0.0.0` di `src/server.ts`. Jika nilai `PORT` berbeda, sesuaikan target port domain dengannya.
6. Periksa `https://<domain>/api/health`, misalnya dengan `curl --fail https://<domain>/api/health`. Respons yang diharapkan adalah HTTP 200 dengan `{"ok":true}`. Endpoint ini memeriksa liveness server; status tersebut tidak menjamin broker MQTT tersambung.

Set proxy rewrite web `/api/*` melalui `web/vercel.json` ke origin backend Railway agar cookie memakai origin web; login/me dan SSE harus melewati rewrite yang sama. Rewrite Vercel dapat memutus request yang berjalan lama; SSE dapat reconnect berkala melalui LiveProvider dan menerima snapshot terbaru saat tersambung kembali (lihat panduan deploy di `../web/README.md`). Gunakan HTTPS; cookie Secure tidak dikirim lewat HTTP. TRUST_PROXY menerima true/false; jika tidak diisi, Fastify mempercayai header proxy pada production dan tidak pada development/test. Dengan Railway + rewrite Vercel, default production membuat limiter login memakai IP klien dari X-Forwarded-For, bukan menggabungkan semua pengguna pada IP proxy. Proxy terluar harus menulis ulang header forwarding dari klien; gunakan TRUST_PROXY=false bila backend diakses langsung tanpa proxy tepercaya. WEB_ORIGIN wajib diisi origin Vercel persis tanpa trailing slash; Origin lain pada POST ditolak meskipun ada rewrite.

Verifikasi lokal: `npm run lint && npm run typecheck && npm run build && npm test`. Uji nyata: jalankan broker, backend dan simulator; `curl http://localhost:8080/api/health`, POST login dengan JSON password lokal melalui stdin/file berizin terbatas dan cookie jar, kemudian GET `/api/rooms` dan `/api/rooms/kos-01/state` dengan cookie jar. Hapus cookie jar setelah selesai. Docker daemon diperlukan untuk uji broker lokal.
