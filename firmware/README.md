# Firmware SIMONDARA (NodeMCU ESP8266)

Firmware membaca DHT11 dan MQ-135, menentukan status kualitas udara (Aman/Waspada/Bahaya),
mengendalikan LED, buzzer, dan relay kipas, menampilkan data di LCD 16×2, serta bertukar pesan
dengan backend melalui MQTT sesuai [`docs/CONTRACT.md`](../docs/CONTRACT.md). Logika lokal
(sensor, status, aktuator, LCD) tetap berjalan ketika Wi-Fi atau broker terputus.

## Struktur

```
firmware/
├── Makefile               make test | make compile | make upload PORT=...
├── secrets.example.h      contoh kredensial -> salin ke simondara/secrets.h
├── simondara/
│   ├── simondara.ino      setup/loop, parsing cmd (ArduinoJson), publish state & telemetri
│   ├── config.h           pin, polaritas aktuator, ambang, kalibrasi MQ-135, interval
│   ├── air_status.*       logika status + histeresis + aturan aktuator (murni, dites di host)
│   ├── sensors.*          DHT11 (validasi + retry), MQ-135 (rata-rata 10 sampel, pemanasan, kalibrasi R0)
│   ├── actuators.*        LED, buzzer, relay (level aman sebelum pinMode)
│   ├── display.*          LCD I2C (deteksi alamat 0x27/0x3F)
│   ├── net.*              Wi-Fi, NTP, MQTT (TLS/non-TLS), reconnect dengan backoff
│   ├── ca_cert.h          ISRG Root X1 (+ X2 cadangan) untuk HiveMQ Cloud
│   └── log.h              logging Serial 115200
└── test/test_air_status.cpp
```

## Wiring ringkas

| Komponen | Pin NodeMCU | Catatan |
| --- | --- | --- |
| DHT11 data | D6 (GPIO12) | VCC 3V3 |
| MQ-135 AO | A0 | lewat pembagi 10 kΩ (atas) / 20 kΩ (bawah), VCC ke VIN 5 V |
| LCD I2C SDA / SCL | D2 / D1 | alamat 0x27, otomatis mencoba 0x3F |
| LED hijau | D0 (GPIO16) | aktif HIGH: D0 → 220 Ω → LED → GND |
| LED kuning | D7 (GPIO13) | aktif HIGH |
| LED merah | D3 (GPIO0) | **aktif LOW**: 3V3 → 220 Ω → LED → D3 |
| Buzzer aktif | D4 (GPIO2) | **aktif LOW** (modul low-level trigger / transistor PNP); LED onboard ikut menyala |
| Relay IN | D5 (GPIO14) | modul relay low-level trigger, VCC ke VIN |

D3 (GPIO0) dan D4 (GPIO2) harus HIGH saat boot, D8 (GPIO15) harus LOW (tidak dipakai). Karena itu
LED merah dan buzzer dirangkai aktif LOW: level "mati" = HIGH, sama dengan syarat boot. Firmware
menulis level mati ke setiap pin **sebelum** `pinMode(OUTPUT)`. Bila rangkaian berbeda, ubah
konstanta `LED_*_ACTIVE_LOW`, `BUZZER_ACTIVE_LOW`, dan `RELAY_ACTIVE_LOW` di `config.h`.

## Library dan toolchain

| Komponen | Versi diuji |
| --- | --- |
| arduino-cli | 1.5.1 |
| Core `esp8266:esp8266` | 3.1.2 |
| DHT sensor library (Adafruit) | 1.4.7 |
| Adafruit Unified Sensor | 1.1.15 |
| LiquidCrystal I2C (Frank de Brabander) | 1.1.2 |
| PubSubClient (Nick O'Leary) | 2.8 |
| ArduinoJson (Benoit Blanchon) | 7.4.3 |

```bash
arduino-cli core install esp8266:esp8266 \
  --additional-urls https://arduino.esp8266.com/stable/package_esp8266com_index.json
arduino-cli lib install "DHT sensor library" "Adafruit Unified Sensor" "LiquidCrystal I2C" PubSubClient ArduinoJson
```

## Konfigurasi kredensial

```bash
cp firmware/secrets.example.h firmware/simondara/secrets.h   # lalu isi
```

`secrets.h` dikecualikan dari git. Isinya: `WIFI_SSID`, `WIFI_PASS`, `MQTT_HOST`, `MQTT_PORT`,
`MQTT_USER`, `MQTT_PASS`, `MQTT_USE_TLS`, `DEVICE_ID` (default `kos-01`, harus sama dengan backend).
Log Serial tidak pernah mencetak kata sandi.

### HiveMQ Cloud (produksi, TLS)

```c
#define MQTT_HOST "<cluster>.s1.eu.hivemq.cloud"
#define MQTT_PORT 8883
#define MQTT_USER "<kredensial perangkat dari HiveMQ Access Management>"
#define MQTT_PASS "..."
#define MQTT_USE_TLS 1
```

- Sertifikat broker divalidasi dengan BearSSL terhadap ISRG Root X1 (Let's Encrypt) di
  `ca_cert.h`; ISRG Root X2 ikut dimuat sebagai cadangan rantai ECDSA. Tidak ada mode `setInsecure()`.
- Validasi sertifikat butuh jam yang benar, jadi firmware menunggu sinkronisasi NTP
  (`pool.ntp.org`, `time.google.com`, `time.cloudflare.com`) sebelum membuka koneksi TLS.
- Bila broker mendukung Max Fragment Length, buffer TLS diperkecil ke 1 KB untuk menghemat RAM.

### Mosquitto lokal (pengembangan, tanpa TLS)

```c
#define MQTT_HOST "192.168.1.10"   // IP komputer yang menjalankan infra/docker-compose
#define MQTT_PORT 1883
#define MQTT_USER ""               // kosong = koneksi anonim
#define MQTT_PASS ""
#define MQTT_USE_TLS 0
```

## Compile, upload, monitor

```bash
arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 firmware/simondara
arduino-cli upload  --fqbn esp8266:esp8266:nodemcuv2 -p /dev/cu.usbserial-XXXX firmware/simondara
arduino-cli monitor -p /dev/cu.usbserial-XXXX -c baudrate=115200
```

Atau lewat Makefile: `make -C firmware compile`, `make -C firmware upload PORT=/dev/cu.usbserial-XXXX`
(`ARDUINO_CLI=/path/ke/arduino-cli` bila tidak ada di `PATH`).

## Test host

```bash
make -C firmware test
```

Mengompilasi `simondara/air_status.cpp` dengan `c++ -std=c++17 -Wall -Wextra -Werror` dan menguji
klasifikasi ambang, status terburuk, histeresis kipas 1000/900 ppm, aturan aktuator, mute, dan
penanganan cmd.

## Kalibrasi R0 MQ-135

1. Sensor baru sebaiknya dipanaskan (burn-in) 24–48 jam terlebih dahulu.
2. Letakkan perangkat di udara bersih (luar ruangan / ruangan berventilasi baik, ±420 ppm CO₂).
3. Buka Serial Monitor 115200, tunggu pemanasan 3 menit selesai, lalu ketik `cal` + Enter.
   Firmware merata-ratakan R0 selama 60 detik dan mencetak, misalnya:
   ```
   [cal] selesai: 300 sampel, R0 = 81.27 kOhm
   [cal] salin ke config.h: constexpr float kMq135R0KOhm = 81.27f;
   ```
4. Salin nilai tersebut ke `kMq135R0KOhm` di `config.h`, lalu compile dan upload ulang.

Alternatif tanpa perintah serial: compile dengan
`--build-property "compiler.cpp.extra_flags=-DSIMONDARA_CALIBRATION=1"` sehingga sesi kalibrasi
berulang otomatis setelah pemanasan.

Rumus: `Rs = RL × (Vc − Vao) / Vao`, dengan `Vao = ADC/1023 × 3,2 V × 1,5`, lalu
`ppm = 116,602 × (Rs/R0)^−2,769`. R0 = Rs / (420/116,602)^(1/−2,769) di udara bersih.

## Perilaku

- **Pemanasan MQ-135 (3 menit):** LCD menampilkan bilah progres dan sisa waktu. Status dan aktuator
  mode otomatis belum aktif (semua aktuator mati), telemetri belum dikirim, state dikirim dengan
  status 0. Mode manual tetap dapat dipakai.
- **Status** = parameter terburuk di antara parameter yang valid (tabel di README utama).
- **Mode otomatis:** Aman → hijau, kipas & buzzer mati; Waspada → kuning, kipas tidak diubah,
  buzzer mati; Bahaya → merah, kipas nyala, buzzer nyala kecuali `mute`. Kipas juga mengikuti
  histeresis gas: nyala bila ppm > 1000 dan baru mati bila ppm < 900 (sehingga pada 900–1000 ppm
  kipas tetap nyala walau status Aman). `mute` direset otomatis saat status kembali Aman.
- **Mode manual:** kipas, LED (0–3), dan buzzer mengikuti `cmd` terakhir; status tetap dihitung dan
  dilaporkan.
- **cmd:** `mode` dan `mute` selalu diterima; `fan`/`led`/`buzzer` hanya pada mode manual dan
  diproses setelah `mode`, sehingga `{"mode":1,"fan":1}` langsung berlaku. Field yang bukan integer
  atau di luar rentang diabaikan per-field; JSON rusak atau payload > 256 byte diabaikan.
- **Sensor:** DHT11 dibaca tiap 2 dtk; gagal diulang setelah 1,1 dtk dan baru dianggap tidak valid
  setelah 3 kegagalan beruntun. MQ-135 disampel tiap 200 ms, rata-rata bergulir 10 sampel. Data tidak
  valid ditampilkan sebagai error di LCD dan telemetri tidak dikirim.
- **LCD (±2 dtk):** `Suhu:29.4 Lb:62%` / `Gas:820 Aman`. Satuan "C" dihilangkan karena
  `Suhu:29.4C Lb:62%` (17 karakter) tidak muat di 16 kolom. Glyph antena bersilang di kolom 16
  menandakan broker offline.
- **MQTT:** client ID `simondara-<DEVICE_ID>-<chipId>`, keep-alive 30 dtk, LWT
  `simondara/<id>/online` = `"0"` (retained, QoS1), `"1"` retained saat connect, subscribe `cmd`
  QoS1, `state` retained saat connect dan saat berubah, telemetri tiap 10 dtk (`ts` = epoch NTP,
  0 bila belum sinkron).
- **Reconnect:** Wi-Fi dan MQTT memakai backoff eksponensial 2 dtk → 60 dtk berbasis `millis()`.
  Satu percobaan connect MQTT (terutama handshake TLS) dapat memblokir loop beberapa detik;
  di luar itu loop tidak memakai `delay()`.

### Keterbatasan yang diketahui

- PubSubClient hanya dapat **publish** dengan QoS0. `state` dikirim retained (subscriber selalu
  mendapat nilai terakhir) dan dikirim ulang setiap kali tersambung kembali, sehingga kontrak
  tetap terpenuhi secara fungsional. LWT dan subscribe `cmd` memakai QoS1 penuh.
- Estimasi ppm MQ-135 bersifat indikatif (setara CO₂), bukan pengukuran CO₂ terkalibrasi.

## Perintah Serial

| Perintah | Fungsi |
| --- | --- |
| `status` | cetak heap, koneksi, pembacaan sensor, Rs/R0, mode, status, aktuator |
| `cal` | kalibrasi R0 60 detik di udara bersih |
| `help` | daftar perintah |
