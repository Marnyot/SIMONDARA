# Broker MQTT lokal

Dari root repo: `docker compose -f infra/docker-compose.yml up -d`.
Broker Eclipse Mosquitto 2 tersedia di `mqtt://localhost:1883` (hanya bind loopback), tanpa WebSocket. Data retained disimpan pada volume `mosquitto-data`.

**KHUSUS PENGEMBANGAN LOKAL:** akun `device` dan `backend` sama-sama memakai password publik `dev`, disimpan sebagai hash Mosquitto pada `passwords.dev`. Jangan gunakan kredensial atau listener tanpa TLS ini di produksi. `device` hanya boleh publish telemetry/state/online perangkat `kos-01` dan subscribe cmd; `backend` boleh subscribe `simondara/#` dan publish `simondara/+/cmd`. Sesuaikan ACL jika DEVICE_ID diganti.

Validasi: `docker compose -f infra/docker-compose.yml config`.
Log: `docker compose -f infra/docker-compose.yml logs -f`.
Hentikan: `docker compose -f infra/docker-compose.yml down` (tambah `-v` hanya untuk menghapus data broker).

Ubah password lokal menggunakan `mosquitto_passwd` di image broker, lalu restart service. Untuk produksi gunakan EMQX Cloud Serverless pada `mqtts://l4919106.ala.asia-southeast1.emqxsl.com:8883`; Serverless hanya menyediakan TLS, tanpa port MQTT non-TLS. Terapkan ACL per perangkat dan akun terpisah `simondara-device` (perangkat) serta `simondara-backend` (backend), dengan password kuat yang ditetapkan sendiri.
