# Firmware SIMONDARA (NodeMCU ESP8266)

Logika lokal mengikuti sketch tim `simondara_full.ino` (SIMONDARA v2): sensor,
status/histeresis, relay/buzzer/LED, LCD dan menu Serial. Cloud tetap memakai Wi-Fi,
MQTT EMQX TLS, topik/payload [`docs/CONTRACT.md`](../docs/CONTRACT.md), LWT dan fault.
Tidak ada perubahan pada `net.*` atau kredensial.

## Modul dan wiring

`config.h`: pin/konstanta; `sensors.*`: DHT, MQ135, EEPROM dan kalibrasi;
`air_status.*`: status dan keputusan aktuator murni; `actuators.*`: pin keluaran;
`display.*`: LCD; `net.*`: Wi-Fi/NTP/TLS/MQTT; `fault.*`: bitmask;
`simondara.ino`: integrasi, perintah dan publikasi.

| Komponen | Pin NodeMCU | Polaritas / catatan |
| --- | --- | --- |
| DHT11 DATA | D4 / GPIO2 | catu 3V3, pull-up data |
| Relay IN | D5 / GPIO14 | aktif HIGH, kipas lewat COM–NO |
| Buzzer | D6 / GPIO12 | aktif LOW; mati = OUTPUT HIGH, `BUZZER_OFF_HIGH_Z = false` |
| LED hijau | D7 / GPIO13 | aktif HIGH |
| LED kuning | D0 / GPIO16 | aktif HIGH |
| LED merah | D8 / GPIO15 | aktif HIGH |
| LCD SDA / SCL | D2 / D1 | I2C 100 kHz, scan alamat 1–126 seperti sketch |
| MQ135 AO | A0 | pembagi eksternal 2,0; modul 5 V; RL 1 kΩ (102); DO tidak dipakai |

`kUseLeds = false` karena LED belum dipasang. Pin LED tidak dijadikan OUTPUT;
state LED tetap dihitung dan dilaporkan (0 mati, 1 hijau, 2 kuning, 3 merah).
Level OFF buzzer/relay ditulis sebelum `pinMode(OUTPUT)`.
Scan LCD memilih kandidat PCF8574 0x20–0x27 / 0x38–0x3F dengan prioritas yang
sama seperti `cariAlamatLcd()`. Probe berkala 5 detik mempertahankan fault/pemulihan cloud.

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

### EMQX Cloud Serverless (produksi, TLS)

```c
#define MQTT_HOST "l4919106.ala.asia-southeast1.emqxsl.com"
#define MQTT_PORT 8883
#define MQTT_USER "simondara-device"
#define MQTT_PASS ""  // isi password akun perangkat sendiri
#define MQTT_USE_TLS 1
```

- EMQX Cloud Serverless hanya menyediakan MQTT melalui TLS pada port 8883; port non-TLS tidak tersedia.
- Sertifikat broker divalidasi dengan BearSSL terhadap DigiCert Global Root G2 dan DigiCert
  Global Root CA di `ca_cert.h`, termasuk rantai G2 yang cross-signed. Tidak ada mode `setInsecure()`.
- Validasi sertifikat butuh jam yang benar, jadi firmware menunggu sinkronisasi NTP
  (`pool.ntp.org`, `time.google.com`, `time.cloudflare.com`) sebelum membuka koneksi TLS.
- Bila broker mendukung Max Fragment Length, buffer TLS diperkecil ke 1 KB untuk menghemat RAM.

### Mosquitto lokal (pengembangan, tanpa TLS)

```c
#define MQTT_HOST "192.168.1.10"   // IP komputer yang menjalankan infra/docker-compose
#define MQTT_PORT 1883
#define MQTT_USER "device"
#define MQTT_PASS "dev"            // khusus pengembangan lokal
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

```sh
make -C firmware test
```

Tes C++17 (`-Wall -Wextra -Werror`) memeriksa batas status dan histeresis ketiga
sensor, kipas dari AMAN/WASPADA/BAHAYA, bip 300 ms/5 detik termasuk overflow
`millis()`, transisi manual/otomatis, mute/cmd dan fault.

## Status dan aktuator

| Parameter | AMAN | WASPADA | BAHAYA |
| --- | --- | --- | --- |
| Suhu | 18–30 °C | <18 atau >30 sampai 33 | >33 °C |
| Kelembapan | 40–60 % | 30–<40 atau >60–70 | <30 atau >70 % |
| Gas | ≤1000 ppm | >1000 sampai 2000 | >2000 ppm |

Status akhir adalah yang terburuk. Memburuk langsung; membaik memakai fungsi
`hysteresis(previous, raw, strict)` persis sketch, dengan margin 0,5 °C / 2 % /
100 ppm. Contoh: BAHAYA suhu baru turun pada ≤32,5 °C; gas WASPADA baru AMAN
pada ≤900 ppm. Nilai NaN/belum tersedia dan gas belum siap dianggap AMAN.
DHT gagal mempertahankan nilai terakhir dan status lokalnya, seperti sketch;
telemetri menunggu pembacaan terbaru yang valid.

- Kipas otomatis menyala saat BAHAYA, mati saat AMAN; WASPADA mempertahankan
  latch otomatis. Gas >1000 ppm sendiri tidak menyalakan kipas.
- Buzzer BAHAYA berbip 300 ms setiap 5000 ms bila tidak bisu. Bip pertama langsung
  saat masuk BAHAYA. LED otomatis = status + 1, termasuk selama pemanasan gas.
- DHT tetap ikut menentukan status selama pemanasan MQ135.
- Masuk manual mempertahankan kipas dan LED saat ini, buzzer manual awalnya mati.
  Perintah berikutnya mengubah keluaran manual. `a` menginisialisasi ulang latch
  kipas (ON hanya jika BAHAYA) dan waktu bip, sama seperti sketch.
- `mode`/`mute` cloud selalu diterima; `fan`/`led`/`buzzer` hanya pada mode manual.
  Mode diproses dahulu, sehingga `{"mode":1,"fan":1}` langsung berlaku.
  Field tidak valid diabaikan; JSON rusak/payload >256 byte ditolak.

## MQ135, pemanasan dan kalibrasi

Gas dibaca tiap 1 detik: rata-rata 64 sampel (jeda 500 µs), lalu EMA α=0,2.
ADC valid `2 ≤ ADC < 1015`. Tegangan AO dibatasi 0,001…4,999 V sebelum menghitung Rs,
sama seperti sketch (tidak menjadikan AO ≥5 V sebagai fault terpisah).

```
Vao = ADC / 1023 × 3,3 V × 2,0
Rs = RL × (5,0 − Vao) / Vao
ppm = 116.6020682 × (Rs / R0)^(-2.769034857)
R0 = Rs_bersih × (420 / 116.6020682)^(1 / 2.769034857)
```

Pemanasan adaptif selesai bila perubahan EMA ADC <1 % dalam jendela 10 detik,
minimum 20 detik, maksimum 180 detik sejak boot. `w` melewati pemanasan.
DHT dibaca tiap 2 detik, LCD diperbarui tiap 1 detik.

1. Letakkan alat di udara bersih, jauh dari napas/asap.
2. Tunggu pemanasan selesai, lalu ketik `k` di Serial 115200 baud.
3. Firmware mengambil 30 sampel Rs dengan jarak 1 detik. ADC tidak valid membatalkan
   sesi. Sebaran `(Rs_max − Rs_min)/Rs_rata × 100` >3 % menghasilkan peringatan.
4. R0 langsung dipakai dan disimpan di EEPROM 64 byte, tanpa edit kode/upload ulang.
   `r` menampilkan R0/Rs; `x` menghapus R0 dan menonaktifkan gas sampai kalibrasi lagi.

Struktur EEPROM sama dengan sketch: `{uint32_t kode; float r0; float rl; float faktor;}`,
kode `0x53494D44`, offset 0. RL dan pembagi harus cocok (toleransi 0,001), R0
harus finite dan positif; metadata NaN/Inf ditolak. Jika EEPROM kosong/tidak valid,
R0 cadangan tim **133,4 kΩ** dipakai saat boot. Setelah `x`, R0 tetap 0 untuk sesi
berjalan; reboot memakai cadangan lagi sebagaimana mekanisme cadangan sketch.
Nilai ppm lokal tidak dibulatkan sebelum klasifikasi; LCD/plotter dan telemetri
membatasi nilai tampilan/payload ke 5000. LCD menunjukkan `>5000ppm` bila terlampaui.

## LCD dan Serial

Splash dua detik: `SIMONDARA` / `Monitor aktif`. Dua baris normal sama dengan
`perbaruiLcd()` sketch (dipotong/pad ke 16 kolom):

- Baris 1: `S:%.1fC L:%.0f%%`, tambah `?` saat DHT gagal dengan data lama,
  atau `DHT belum terbaca` bila belum ada nilai.
- Baris 2: `Pemanasan %lus`, `Gas blm kalibr.`, `Cek sinyal MQ135`,
  `>5000ppm <STATUS>`, atau `%4.0fppm <STATUS>`; status huruf besar.

Informasi Wi-Fi/MQTT tetap di Serial dan tidak menimpa LCD. Log status tiap dua
detik memakai format `cetakStatus()` sketch: mode, suhu/status, lembap/status,
ADC, gas/status, STATUS total, Kipas ON/OFF dan Buzzer OFF/BIP/BISU/ON.

Perintah satu karakter langsung diproses, tanpa perlu Enter; huruf besar diterima.

| Perintah | Fungsi |
| --- | --- |
| `a` | mode otomatis |
| `n` / `f` | kipas manual ON / OFF |
| `1` / `0` | buzzer manual ON / OFF |
| `c` | siklus LED manual: mati → hijau → kuning → merah |
| `m` | toggle bisu buzzer otomatis |
| `k` | kalibrasi MQ135, 30 sampel di udara bersih |
| `r` | info kalibrasi R0, RL, pembagi, Rs/R0 |
| `x` | hapus R0 tersimpan |
| `w` | lewati pemanasan |
| `p` | toggle Serial Plotter (`ppm:` atau `ADC:`) |
| `s` | pindai dan hubungkan LCD lagi |
| `b` | toggle backlight LCD |
| `h` | menu dan ambang |

## Cloud dan perbedaan sengaja dari sketch lokal

- Wi-Fi/NTP/MQTT TLS EMQX tetap aktif; sertifikat BearSSL divalidasi, tidak ada
  `setInsecure()`. `net.*` mempertahankan reconnect/backoff dan topik/payload.
- Telemetri tiap 10 detik hanya jika DHT terbaru dan gas siap/valid. `state`
  retained dikirim saat berubah dan connect; LWT `online="0"` retained QoS1,
  connect `online="1"`, subscribe `cmd` QoS1. PubSubClient publish memakai QoS0.
- **Mute reset saat kembali AMAN**, juga bila mute berasal dari Serial; sketch
  lokal mempertahankan bisu sampai `m` ditekan lagi. Ini mengikuti perilaku cloud/web.
- **R0 cadangan 133,4 kΩ**, sedangkan sketch acuan menonaktifkan cadangan (0).
- Kalibrasi 30 sampel dijalankan bertahap, bukan `delay(1000)` yang memblokir
  selama 30 detik, agar MQTT tetap dilayani. Selama sesi, pembacaan/status lokal
  dibekukan dan buzzer fisik mati seperti sketch; perintah cloud tetap dilayani.
- Fault bitmask tetap dilaporkan: **1** DHT gagal ≥3 kali beruntun atau nilai di luar
  −10…60 °C / 0…100 %; **2** EMA ADC di luar [2,1015) setelah pemanasan, di luar
  kalibrasi; **4** LCD tidak menjawab probe I2C (termasuk absen sejak boot).
  Data DHT lama tetap dipakai lokal saat baca gagal, tetapi tidak dipublish sebagai
  telemetri baru. LCD dipindai/init ulang otomatis untuk pemulihan.
- Pemadaman buzzer sekarang **OUTPUT HIGH** sesuai sketch yang terbukti; ini
  sengaja menggantikan panduan high-Z lama dalam kontrak checkout main. Topik dan
  bentuk payload kontrak tidak berubah.
- Sampling gas memblokir sekitar 32 ms per detik. Percobaan koneksi MQTT/TLS
  masih bisa memblokir beberapa detik (perilaku jaringan lama); waktu bip dapat
  bergeser selama handshake. Pengujian alat tetap diperlukan untuk timing fisik.

Estimasi MQ135 adalah ppm setara CO₂, bukan pengukuran laboratorium.
