# Kontrak Data SIMONDARA

Sumber kebenaran untuk firmware, backend, web, dan simulator. Perubahan kontrak hanya lewat koordinator.

## MQTT

Prefix: `simondara/<deviceId>/` (default `deviceId` = `kos-01`). Semua payload JSON UTF-8 kecuali `online`.

| Topik | Arah | QoS | Retained | Payload |
| --- | --- | --- | --- | --- |
| `telemetry` | ESP → | 0 | tidak | `{"t":28.5,"h":55.0,"ppm":820,"ts":1730000000}` tiap 10 dtk |
| `state` | ESP → | 0* | ya | `{"status":0,"fan":0,"mode":0,"led":1,"buzzer":0,"mute":0,"fault":0}` saat berubah + saat connect |
| `cmd` | → ESP | 1 | tidak | salah satu/lebih field: `{"mode":1}`, `{"fan":1}`, `{"led":2}`, `{"buzzer":1}`, `{"mute":1}` |
| `online` | ESP → | 1 | ya | `"1"` saat connect; LWT `"0"` |

\* PubSubClient hanya bisa publish QoS 0; state tetap retained dan dikirim ulang setiap connect. LWT dan subscribe `cmd` memakai QoS 1.

Nilai:
- `t` °C (float), `h` % RH (float), `ppm` integer setara CO₂, `ts` unix detik (opsional; backend pakai waktu terima jika tidak ada/0).
- `status`: 0 aman, 1 waspada, 2 bahaya.
- `fan`, `buzzer`, `mute`: 0/1. `mode`: 0 otomatis, 1 manual. `led`: 0 mati, 1 hijau, 2 kuning, 3 merah.
- Pada mode otomatis, ESP mengabaikan `cmd` aktuator (`fan`, `led`, `buzzer`) kecuali `mute` dan `mode`.
- `fan`/`led`/`buzzer` di `cmd` saat mode otomatis: backend boleh mengirim `{"mode":1,"fan":1}` sekaligus (mis. `/kipas_on` Telegram).
- Telemetri tidak valid (sensor gagal) tidak dipublish.
- `fault`: bitmask gangguan perangkat keras yang terdeteksi firmware (0 = semua normal). Firmware publish `state` setiap `fault` berubah.
  - `1` DHT11: gagal baca ≥3 kali beruntun / nilai di luar rentang valid (kabel data/catu lepas).
  - `2` MQ-135: tegangan A0 di bawah ambang valid (sensor lepas) atau ADC mentok (pembagi tegangan bermasalah). Tidak termasuk masa pemanasan.
  - `4` LCD: modul I2C tidak menjawab (dicek berkala ±5 dtk; firmware mencoba inisialisasi ulang saat kembali menjawab).
  - Aktuator (kipas/relay, buzzer, LED) tidak punya umpan balik sehingga tidak dapat dideteksi.
- Buzzer active low dimatikan dengan melepas pin (high-Z/`INPUT`), bukan menulis HIGH, agar modul yang dicatu 5V benar-benar diam; dinyalakan dengan `OUTPUT` + LOW.
  - Backend menerima `state` tanpa `fault` (firmware lama) sebagai `fault: 0`.

## Multi-kamar

1 kamar = 1 perangkat (NodeMCU) dengan `deviceId` unik. `deviceId` adalah identitas kamar di seluruh sistem.
- Pola `deviceId`: `^[a-z0-9][a-z0-9-]{0,31}$`. Pesan MQTT dengan segmen topik yang tidak cocok diabaikan.
- Backend subscribe `simondara/+/{telemetry,state,online}` dan menyimpan data **semua** perangkat yang cocok pola, terdaftar atau tidak.
- Kamar terdaftar = baris di tabel `rooms` (`deviceId`, `name`, `createdAt`). Perangkat yang mengirim data tetapi belum terdaftar = **perangkat baru** (ditampilkan untuk didaftarkan; tidak memicu notifikasi Telegram).
- Migrasi DB v2: kolom `device_id` pada telemetri/event/snapshot; data lama diberi `device_id` = env `DEVICE_ID` (default `kos-01`) dan kamar itu dibuat otomatis dengan nama `Kamar 1`.
- Nama kamar: 1–40 karakter setelah trim, unik (case-insensitive).
- Ambang status sama untuk semua kamar (dihitung di firmware).

## REST API backend

Base `/api`. Auth: cookie `httpOnly` `session` setelah login. Semua endpoint kecuali `login` dan `health` butuh session (401 jika tidak). `:deviceId` yang tidak terdaftar → 404 `{"error":"room_not_found"}`.

| Method | Path | Body / Query | Respons |
| --- | --- | --- | --- |
| GET | `/api/health` | – | `{"ok":true}` |
| POST | `/api/auth/login` | `{"password":"..."}` | 204 + set cookie; 401 salah |
| POST | `/api/auth/logout` | – | 204 |
| GET | `/api/auth/me` | – | `{"user":"pengelola"}` / 401 |
| GET | `/api/rooms` | – | `{"rooms":[Room],"unregistered":[{"deviceId":"kamar-02","lastSeen":"ISO","online":true}]}`; rooms urut `createdAt` |
| POST | `/api/rooms` | `{"deviceId":"kamar-02","name":"Kamar 2"}` | 201 `Room`; 400 tidak valid; 409 `{"error":"device_exists"}` / `{"error":"name_exists"}` |
| PATCH | `/api/rooms/:deviceId` | `{"name":"..."}` | 200 `Room`; 400; 409 `name_exists` |
| DELETE | `/api/rooms/:deviceId` | – | 204; data historis perangkat ikut dihapus |
| GET | `/api/rooms/:deviceId/state` | – | `{"online":true,"state":{...},"telemetry":{...},"updatedAt":"ISO"}` |
| GET | `/api/rooms/:deviceId/history` | `?from=ISO&to=ISO&bucket=1m|5m|1h` | `{"points":[{"at":"ISO","t":..,"h":..,"ppm":..}]}` |
| GET | `/api/rooms/:deviceId/events` | `?limit=50` | `{"events":[{"at":"ISO","type":"status|online","value":0}]}` |
| POST | `/api/rooms/:deviceId/cmd` | subset `{"mode","fan","led","buzzer","mute"}` | 202; 400 field/nilai tidak valid |
| GET | `/api/stream` | – | SSE semua kamar terdaftar, lihat bawah |

| GET | `/api/notifications` | – | `Notifications` |
| PATCH | `/api/notifications` | `{"enabled":bool}` dan/atau `{"snoozeMinutes":15..1440}` / `{"snoozeMinutes":0}` (batalkan jeda) | 200 `Notifications`; 400 |

`Room` = `{"deviceId":"kos-01","name":"Kamar 1","createdAt":"ISO","notify":true,"online":true,"state":{...}|null,"telemetry":{...}|null,"updatedAt":"ISO"|null}`. `PATCH /api/rooms/:deviceId` juga menerima `{"notify":bool}` (boleh bersama `name`).

`Notifications` = `{"enabled":true,"snoozedUntil":"ISO"|null}` (pengaturan global Telegram; `snoozedUntil` lampau dikembalikan `null`).

Endpoint lama satu-perangkat (`/api/state`, `/api/history`, `/api/events`, `/api/cmd`) dihapus.

### SSE `/api/stream`

Setiap event membawa `deviceId`:
- `telemetry` → payload MQTT + `at` ISO + `deviceId`
- `state` → payload `state` + `deviceId`
- `online` → `{"deviceId":"...","online":true|false}`
- `rooms` → `{"rooms":[Room],"unregistered":[...]}` saat kamar ditambah/diubah/dihapus (termasuk `notify`) atau perangkat baru terdeteksi
- `notifications` → `Notifications` saat pengaturan global berubah (web atau Telegram) dan saat jeda berakhir; juga dikirim saat connect

Saat connect, backend langsung kirim `rooms` lalu snapshot `state`, `online`, dan `telemetry` terakhir tiap kamar terdaftar. Data perangkat tidak terdaftar tidak dialirkan selain lewat `rooms.unregistered`.

### Telegram

- Notifikasi Bahaya / kembali Aman / offline >60 dtk / kembali online hanya untuk kamar terdaftar, diawali nama kamar (mis. `Kamar 2: BAHAYA ...`).
- Gangguan perangkat keras: saat bit `fault` baru muncul → `Kamar 2: Gangguan <komponen> ...`; saat semua bit yang sebelumnya aktif hilang → `Kamar 2: <komponen> normal kembali`. Nama komponen: Sensor suhu/kelembapan (DHT11), Sensor gas (MQ-135), Layar LCD. `/status` menyebut gangguan aktif.
- Saklar notifikasi (DB, bertahan setelah restart; migrasi menambah `rooms.notify` default 1 dan pengaturan global default aktif): notifikasi otomatis (Bahaya/Aman/offline/online/gangguan) hanya dikirim bila global `enabled`, tidak sedang dijeda, dan `notify` kamar aktif. Notifikasi yang tertahan dibuang (tidak dikirim belakangan). Balasan perintah bot selalu dikirim.
- `/notif_off [kamar]`, `/notif_on [kamar]`: tanpa argumen = global, dengan argumen = per kamar. `/notif_jeda [menit]` (default 60, 15–1440) jeda global; `/notif_jeda 0` batalkan. `/status` menyebut status notifikasi (global, jeda sampai jam berapa, kamar yang dimatikan).
- `/status` → ringkasan semua kamar. `/status <kamar>` → detail satu kamar.
- `/kipas_on <kamar>`, `/kipas_off <kamar>`, `/otomatis <kamar>`; `<kamar>` = `deviceId` atau nama (case-insensitive). Argumen boleh dihilangkan jika hanya ada 1 kamar; jika >1 kamar dan tanpa argumen → balas daftar kamar.

## Web (rute)

- `/` Daftar Kamar (grid kartu: nama, status, online, t/h/ppm, kipas) + kartu "Perangkat baru terdeteksi".
- `/kamar/:deviceId` Beranda kamar, `/kamar/:deviceId/kontrol`, `/kamar/:deviceId/riwayat`.
- Kamar offline → aksen/badge merah "Terputus"; koneksi SSE web putus → banner merah reconnect. `fault` ≠ 0 → badge "Gangguan: <komponen>" di kartu kamar & beranda kamar (+ detail di kartu Koneksi).
- Toast (hanya transisi setelah snapshot): Bahaya, kembali Aman, terputus, kembali online, gangguan muncul/pulih, perangkat baru.
- `/kelola` Kelola Kamar: tambah (deviceId + nama, atau dari perangkat baru), ubah nama, hapus (konfirmasi).
- `/kontrol`, `/riwayat` lama → redirect ke `/`.

## Env backend (`backend/.env.example`)

```
PORT=8080
MQTT_URL=mqtts://l4919106.ala.asia-southeast1.emqxsl.com:8883   # dev: mqtt://localhost:1883
MQTT_USERNAME=simondara-backend
MQTT_PASSWORD=
DEVICE_ID=kos-01              # kamar awal hasil migrasi v2
DB_PATH=./data/simondara.db
ADMIN_PASSWORD_HASH=          # bcrypt/argon2
SESSION_SECRET=
WEB_ORIGIN=http://localhost:5173
TELEGRAM_BOT_TOKEN=           # kosong = bot nonaktif
TELEGRAM_CHAT_ID=
```

## Env web

Web memanggil `/api` relatif (same-origin) supaya cookie session tidak diblok browser sebagai third-party cookie.
- Dev: Vite `server.proxy` `/api` → `http://localhost:8080`.
- Prod: `web/vercel.json` rewrite `/api/:path*` → `https://simondara-production.up.railway.app/api/:path*`, sebelum fallback SPA. `WEB_ORIGIN` backend harus sama persis dengan origin Vercel.
