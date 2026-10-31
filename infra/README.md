# Broker MQTT lokal

Dari root repo: `docker compose -f infra/docker-compose.yml up -d`.
Broker Eclipse Mosquitto 2 tersedia di `mqtt://localhost:1883` (hanya bind loopback), tanpa WebSocket. Data retained disimpan pada volume `mosquitto-data`.

**KHUSUS PENGEMBANGAN LOKAL:** akun `device` dan `backend` sama-sama memakai password publik `dev`, disimpan sebagai hash Mosquitto pada `passwords.dev`. Jangan gunakan kredensial atau listener tanpa TLS ini di produksi. `device` hanya boleh publish telemetry/state/online perangkat `kos-01` dan subscribe cmd; `backend` boleh subscribe `simondara/#` dan publish `simondara/+/cmd`. Sesuaikan ACL jika DEVICE_ID diganti.

Validasi: `docker compose -f infra/docker-compose.yml config`.
Log: `docker compose -f infra/docker-compose.yml logs -f`.
Hentikan: `docker compose -f infra/docker-compose.yml down` (tambah `-v` hanya untuk menghapus data broker).

Ubah password lokal menggunakan `mosquitto_passwd` di image broker, lalu restart service. Untuk produksi gunakan HiveMQ Cloud TLS, ACL per perangkat, dan kredensial terpisah yang kuat.
