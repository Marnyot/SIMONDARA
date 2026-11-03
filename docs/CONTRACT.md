# Kontrak Data SIMONDARA

Sumber kebenaran untuk firmware, backend, web, dan simulator. Perubahan kontrak hanya lewat koordinator.

## MQTT

Prefix: `simondara/<deviceId>/` (default `deviceId` = `kos-01`). Semua payload JSON UTF-8 kecuali `online`.

| Topik | Arah | QoS | Retained | Payload |
| --- | --- | --- | --- | --- |
| `telemetry` | ESP → | 0 | tidak | `{"t":28.5,"h":55.0,"ppm":820,"ts":1730000000}` tiap 10 dtk |
| `state` | ESP → | 0* | ya | `{"status":0,"fan":0,"mode":0,"led":1,"buzzer":0,"mute":0}` saat berubah + saat connect |
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

## REST API backend

Base `/api`. Auth: cookie `httpOnly` `session` setelah login. Semua endpoint kecuali `login` dan `health` butuh session (401 jika tidak).

| Method | Path | Body / Query | Respons |
| --- | --- | --- | --- |
| GET | `/api/health` | – | `{"ok":true}` |
| POST | `/api/auth/login` | `{"password":"..."}` | 204 + set cookie; 401 salah |
| POST | `/api/auth/logout` | – | 204 |
| GET | `/api/auth/me` | – | `{"user":"pengelola"}` / 401 |
| GET | `/api/state` | – | `{"online":true,"state":{...},"telemetry":{...},"updatedAt":"ISO"}` |
| GET | `/api/history` | `?from=ISO&to=ISO&bucket=1m|5m|1h` | `{"points":[{"at":"ISO","t":..,"h":..,"ppm":..}]}` (rata-rata per bucket) |
| GET | `/api/events` | `?limit=50` | `{"events":[{"at":"ISO","type":"status|online","value":0}]}` — `value` integer: status 0/1/2, online 0/1 |
| POST | `/api/cmd` | subset `{"mode","fan","led","buzzer","mute"}` | 202; 400 field/nilai tidak valid |
| GET | `/api/stream` | – | SSE, lihat bawah |

### SSE `/api/stream`

Event:
- `telemetry` → data sama dengan payload MQTT + `at` ISO
- `state` → payload `state`
- `online` → `{"online":true|false}`

Saat connect, backend langsung kirim snapshot `state`, `online`, dan `telemetry` terakhir.

## Env backend (`backend/.env.example`)

```
PORT=8080
MQTT_URL=mqtts://l4919106.ala.asia-southeast1.emqxsl.com:8883   # dev: mqtt://localhost:1883
MQTT_USERNAME=simondara-backend
MQTT_PASSWORD=
DEVICE_ID=kos-01
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
- Prod: `web/netlify.toml` proxy rewrite `/api/*` → `https://BACKEND_URL_RAILWAY/api/:splat` (status 200), sebelum fallback SPA; ganti placeholder dengan domain backend Railway. `WEB_ORIGIN` backend harus sama persis dengan origin Netlify.
