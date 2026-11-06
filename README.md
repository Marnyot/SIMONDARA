# SIMONDARA

**Sistem Monitoring dan Peringatan Dini Kualitas Udara Ruangan Berbasis Internet of Things**

SIMONDARA merupakan prototipe sistem *smart home* untuk memantau kualitas udara di dalam ruangan tertutup berskala kecil, dengan studi kasus kamar kos. Sistem ini mengukur suhu, kelembapan, dan kadar gas udara secara berkelanjutan, menentukan status kualitas udara secara bertingkat, mengaktifkan kipas pembuang secara otomatis, serta mengirimkan peringatan dini kepada pengelola ruangan melalui aplikasi web progresif (PWA) dan Telegram.

Proyek ini disusun sebagai Tugas Besar mata kuliah Internet of Things.

| | |
| --- | --- |
| Dosen Pengampu | Abdul Aziz, S.Kom., M.Cs. |
| Program Studi | Informatika |
| Fakultas | Teknologi Informasi dan Sains Data |
| Institusi | Universitas Sebelas Maret |

### Kelompok 7

| Nama | NIM |
| --- | --- |
| Mario Valentino Ardhana | L0123079 |
| Michael Johanes Johansyah | L0123081 |
| Muhammad Dzaky Putra Utomo | L0123092 |
| Muhammad Firman Ghani | L0123095 |
| Muhammad Rifai Ageng Pambudi | L0123098 |

---

## Daftar Isi

1. [Latar Belakang](#latar-belakang)
2. [Fitur Utama](#fitur-utama)
3. [Arsitektur Sistem](#arsitektur-sistem)
4. [Teknologi yang Digunakan](#teknologi-yang-digunakan)
5. [Perangkat Keras](#perangkat-keras)
6. [Logika Penentuan Status](#logika-penentuan-status)
7. [Struktur Repositori](#struktur-repositori)
8. [Menjalankan Proyek](#menjalankan-proyek)
9. [Keamanan](#keamanan)
10. [Referensi](#referensi)

---

## Latar Belakang

Kualitas udara di dalam ruangan berpengaruh langsung terhadap kesehatan dan kenyamanan penghuninya. Peraturan Menteri Kesehatan Nomor 1077/MENKES/PER/V/2011 menetapkan batas suhu ruangan 18–30 °C, kelembapan 40–60 % RH, serta kadar karbon dioksida maksimal 1.000 ppm. Parameter tersebut tidak dapat dinilai hanya dengan indra manusia, sedangkan pemeriksaan manual yang bersifat berkala tidak mampu mendeteksi kondisi berbahaya yang terjadi di antara dua pemeriksaan.

SIMONDARA menggabungkan tiga aspek dalam satu sistem, yaitu pemantauan berkelanjutan, tindakan korektif otomatis, dan notifikasi jarak jauh.

## Fitur Utama

- **Pemantauan berkelanjutan** terhadap suhu dan kelembapan (DHT11) serta kadar gas yang diestimasi setara CO₂ (MQ-135).
- **Peringatan bertingkat** (Aman, Waspada, Bahaya) melalui LED indikator, buzzer, dan layar LCD di lokasi.
- **Pemulihan otomatis** dengan menyalakan kipas pembuang melalui modul relay ketika status Bahaya, disertai histeresis untuk mencegah relay menyala dan mati berulang kali.
- **Aplikasi web progresif (PWA)** yang dapat dipasang pada ponsel maupun digunakan pada desktop, berisi dasbor waktu nyata, grafik riwayat, dan panel kendali jarak jauh.
- **Mode sistem** Otomatis dan Manual. Pada mode Manual, pengelola mengendalikan kipas, LED, dan buzzer secara langsung.
- **Notifikasi Telegram** ketika status memburuk menjadi Bahaya, ketika kondisi kembali Aman, serta ketika perangkat terputus atau tersambung kembali.
- **Operasi lokal yang mandiri**: penentuan status dan pengendalian aktuator tetap berjalan walaupun koneksi internet terputus.

## Arsitektur Sistem

```
┌──────────────────────── Ruangan ────────────────────────┐
│  DHT11, MQ-135 ──> NodeMCU ESP8266 ──> LED, buzzer,     │
│                         │              LCD I2C, relay   │
│                         │              + kipas DC 12 V  │
└─────────────────────────┼───────────────────────────────┘
                          │ MQTT over TLS (Wi-Fi)
                          ▼
                 Broker MQTT (EMQX Cloud Serverless)
                          │
                          ▼
        Backend (Node.js) ──────────> Telegram Bot API ──> Pengelola
        - subscriber MQTT
        - penyimpanan riwayat (SQLite)
        - REST API dan Server-Sent Events
        - autentikasi pengelola
                          ▲
                          │ HTTPS
                          │
           Aplikasi Web Progresif (React)
```

Sistem terdiri atas empat bagian.

1. **Perangkat (firmware).** NodeMCU ESP8266 membaca sensor, menentukan status kualitas udara, mengendalikan aktuator, lalu mempublikasikan telemetri setiap 10 detik dan perubahan status melalui MQTT.
2. **Broker MQTT.** EMQX Cloud Serverless menjadi perantara pesan antara perangkat dan backend. Endpoint produksi adalah `l4919106.ala.asia-southeast1.emqxsl.com:8883`, hanya melalui TLS. Perangkat menggunakan akun `simondara-device`, sedangkan backend menggunakan akun `simondara-backend`; kata sandi masing-masing ditetapkan sendiri.
3. **Backend.** Layanan Node.js berlangganan topik perangkat, menyimpan riwayat pengukuran, menyediakan REST API dan aliran data waktu nyata (Server-Sent Events) bagi aplikasi web, meneruskan perintah kendali ke perangkat, serta menjalankan bot Telegram.
4. **Aplikasi web.** Antarmuka pengguna berbasis React yang hanya berkomunikasi dengan backend. Kredensial MQTT tidak pernah dikirimkan ke peramban.

Paket gratis EMQX Cloud Serverless menyediakan kuota bulanan 1 juta session-minute, 1 GB lalu lintas, dan 1 juta rule action. Batas pengeluaran deployment ditetapkan sebesar US$0; deployment berhenti ketika kuota habis tanpa menimbulkan tagihan. Deployment juga dihentikan apabila tidak ada koneksi klien selama 30 hari.

Spesifikasi topik MQTT, format pesan, dan REST API terdapat pada [`docs/CONTRACT.md`](docs/CONTRACT.md). Acuan desain antarmuka terdapat pada [`docs/design/`](docs/design/).

## Teknologi yang Digunakan

| Komponen | Teknologi |
| --- | --- |
| Firmware | Arduino (C++) untuk ESP8266, PubSubClient, ArduinoJson, DHT sensor library, LiquidCrystal_I2C |
| Broker | EMQX Cloud Serverless (produksi), Eclipse Mosquitto (pengembangan lokal) |
| Backend | Node.js 24, TypeScript, Fastify, Zod, MQTT.js, SQLite (`better-sqlite3`) |
| Aplikasi web | React, TypeScript, Vite, `vite-plugin-pwa`, React Router, Recharts |
| Notifikasi | Telegram Bot API |
| Pengujian dan kualitas | Vitest, ESLint, Prettier |
| Hosting | Railway (backend), Vercel (aplikasi web) |

## Perangkat Keras

| Komponen | Fungsi | Koneksi ke NodeMCU |
| --- | --- | --- |
| NodeMCU ESP8266 | Mikrokontroler dan konektivitas Wi-Fi | — |
| DHT11 | Sensor suhu (°C) dan kelembapan (% RH) | Data ke D6, catu daya 3,3 V |
| MQ-135 | Sensor gas, diestimasi sebagai ppm setara CO₂ | AO ke A0 melalui pembagi tegangan 10 kΩ/20 kΩ, VCC ke VIN (5 V) |
| LCD 16×2 dengan modul I2C (PCF8574) | Tampilan lokal | SDA ke D2, SCL ke D1 (alamat 0x27 atau 0x3F) |
| LED hijau, kuning, merah | Indikator status, masing-masing dengan resistor 220 Ω | D0, D7, D3 |
| Buzzer aktif | Alarm bunyi pada status Bahaya | D4 |
| Modul relay 1 kanal | Saklar kipas (COM ke +12 V, NO ke kipas) | IN ke D5, VCC ke VIN |
| Kipas DC 12 V | Kipas pembuang | Adaptor 12 V 1 A terpisah |

Pin D3 dan D4 pada ESP8266 harus berlogika HIGH dan pin D8 berlogika LOW saat papan dinyalakan. Oleh karena itu, kondisi awal setiap aktuator diatur sebelum pin dijadikan keluaran.

## Logika Penentuan Status

Status kualitas udara ditentukan berdasarkan parameter dengan kondisi terburuk.

| Parameter | Aman | Waspada | Bahaya |
| --- | --- | --- | --- |
| Suhu | 18–30 °C | > 30–33 °C atau < 18 °C | > 33 °C |
| Kelembapan | 40–60 % RH | 30–< 40 % RH atau > 60–70 % RH | < 30 % RH atau > 70 % RH |
| Gas (setara CO₂) | ≤ 1.000 ppm | 1.001–2.000 ppm | > 2.000 ppm |

Perilaku aktuator pada mode Otomatis adalah sebagai berikut.

| Status | LED | Kipas | Buzzer |
| --- | --- | --- | --- |
| Aman | Hijau | Mati | Mati |
| Waspada | Kuning | Tidak diubah | Mati |
| Bahaya | Merah | Menyala | Menyala, kecuali dibisukan |

Kipas dikendalikan dengan histeresis: kipas menyala ketika kadar gas melebihi 1.000 ppm dan baru dimatikan ketika kadar gas turun di bawah 900 ppm. Estimasi kadar gas dihitung dengan persamaan `ppm = 116,602 × (Rs/R0)^(−2,769)`. Nilai R0 diperoleh melalui kalibrasi di udara bersih dengan asumsi kadar CO₂ atmosfer sekitar 420 ppm. Sensor MQ-135 memerlukan pemanasan sekitar tiga menit setiap kali dinyalakan.

## Struktur Repositori

```
SIMONDARA/
├── firmware/   Program NodeMCU ESP8266
├── backend/    Layanan backend (API, subscriber MQTT, bot Telegram)
├── web/        Aplikasi web progresif
├── infra/      Konfigurasi broker Mosquitto untuk pengembangan lokal
└── docs/       Spesifikasi kontrak data dan acuan desain
```

## Menjalankan Proyek

### Prasyarat

- Node.js 24 dan npm
- Docker (untuk broker Mosquitto lokal)
- `arduino-cli` dengan core `esp8266:esp8266`

### Pengembangan Lokal

```bash
# 1. Jalankan broker MQTT lokal
docker compose -f infra/docker-compose.yml up -d

# 2. Jalankan backend
cd backend
cp .env.example .env      # isi variabel lingkungan
npm install
npm run dev

# 3. Jalankan simulator perangkat (opsional, tanpa perangkat keras)
npm run sim

# 4. Jalankan aplikasi web
cd ../web
npm install
npm run dev
```

### Firmware

```bash
cd firmware
cp secrets.example.h simondara/secrets.h   # isi kredensial Wi-Fi dan MQTT
arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 simondara
arduino-cli upload  --fqbn esp8266:esp8266:nodemcuv2 -p <port> simondara
```

Petunjuk rinci untuk setiap bagian tersedia pada berkas README di masing-masing direktori.

## Keamanan

- Kata sandi Wi-Fi, kredensial MQTT, token bot Telegram, dan kata sandi pengelola disimpan pada berkas konfigurasi lokal (`secrets.h` dan `.env`) yang dikecualikan dari repositori. Repositori hanya memuat berkas contoh.
- Komunikasi MQTT produksi melalui EMQX Cloud Serverless wajib menggunakan TLS pada port 8883 dengan validasi sertifikat DigiCert dan kredensial terpisah untuk perangkat serta backend. Listener Mosquitto tanpa TLS hanya digunakan untuk pengembangan lokal.
- Aplikasi web dilindungi autentikasi pengelola dengan sesi berbasis cookie `httpOnly`.
- Bot Telegram hanya menanggapi pesan dari chat ID pengelola yang terdaftar.
- Perintah kendali divalidasi oleh backend sebelum diteruskan ke perangkat.

## Referensi

1. Kementerian Kesehatan Republik Indonesia. (2011). *Peraturan Menteri Kesehatan Nomor 1077/MENKES/PER/V/2011 tentang Pedoman Penyehatan Udara dalam Ruang Rumah*.
2. World Health Organization. (2024). *Household air pollution* [Fact sheet].
3. Muttaqin, R., Prayitno, W. S. W., Setyaningsih, N. E., & Nurbaiti, U. (2024). Rancang bangun sistem pemantauan kualitas udara berbasis IoT dengan sensor DHT11 dan sensor MQ135. *Jurnal Pengelolaan Laboratorium Pendidikan*, 6(2), 102–115.
4. Agung, D. J., & Firmansah, A. (2025). Sistem automatic exhaust fan menggunakan sensor DHT11 dan sensor MQ-135 untuk mendeteksi kualitas udara ruang industri. *Journal Electric Field*, 2(2), 101–110.
5. Fiamalia, S. M. S., & Umar. (2025). *Sistem monitoring kualitas udara ruangan berbasis IoT dengan peringatan real-time melalui notifikasi Telegram* [Skripsi, Universitas Muhammadiyah Surakarta].
6. Surya, T. M. H., Supriadi, & Maesaroh, D. T. (2026). Penampil kualitas udara ruangan berbasis ESP8266 menggunakan sensor MQ135 dan DHT11. *Jurnal Sains Informatika Terapan*, 5(2), 551–558.
7. OASIS. *MQTT Version 3.1.1*. https://mqtt.org
8. Telegram. *Telegram Bot API*. https://core.telegram.org/bots/api
9. EMQX. *EMQX Cloud Serverless Documentation*. https://docs.emqx.com/en/cloud/latest/create/serverless.html
