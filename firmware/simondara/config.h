// Konfigurasi perangkat keras, ambang status, dan interval SIMONDARA.
//
// Berkas ini sengaja tidak bergantung pada Arduino.h sehingga bisa dipakai
// oleh test host (firmware/test). Pin ditulis sebagai nomor GPIO ESP8266
// dengan label NodeMCU di komentar.
#pragma once

#include <stdint.h>

namespace config {

// ---------------------------------------------------------------------------
// Pin (NodeMCU v2 -> GPIO ESP8266)
// ---------------------------------------------------------------------------
constexpr uint8_t kPinDht = 2;         // D4  data DHT11 (GPIO2, HIGH saat boot; pull-up DHT menjaganya)
constexpr uint8_t kPinI2cSda = 4;      // D2  SDA LCD
constexpr uint8_t kPinI2cScl = 5;      // D1  SCL LCD
constexpr uint8_t kPinLedGreen = 16;   // D0
constexpr uint8_t kPinLedYellow = 13;  // D7
constexpr uint8_t kPinLedRed = 0;      // D3  (GPIO0, harus HIGH saat boot)
constexpr uint8_t kPinBuzzer = 12;     // D6  SIG buzzer
constexpr uint8_t kPinRelay = 14;      // D5  IN modul relay
// MQ-135 memakai A0 (satu-satunya ADC), tidak perlu konstanta.
// D8 (GPIO15) harus LOW saat boot dan sengaja tidak dipakai.

// Polaritas aktuator. "Active low" berarti pin LOW = menyala.
// D3 wajib HIGH saat boot, jadi LED merah dirangkai active low (anoda ke 3V3
// lewat 220 ohm, katoda ke D3). Pin DHT/buzzer/relay dan polaritasnya mengikuti
// alat yang sudah diuji tim (sketch uji perangkat keras). Ubah bila rangkaian berbeda.
constexpr bool LED_GREEN_ACTIVE_LOW = false;
constexpr bool LED_YELLOW_ACTIVE_LOW = false;
constexpr bool LED_RED_ACTIVE_LOW = true;
constexpr bool BUZZER_ACTIVE_LOW = true;
constexpr bool RELAY_ACTIVE_LOW = false;  // modul relay alat: HIGH = kipas menyala

// Buzzer active low dimatikan dengan melepas pin (pinMode INPUT, high-Z), bukan
// menulis HIGH. Modul buzzer dicatu 5V (VIN), sedangkan HIGH ESP8266 hanya 3,3V:
// selisih ~1,7V masih membuat transistor PNP modul menghantar sehingga buzzer
// tetap bunyi. Saat high-Z, pull-up modul menarik SIG ke VCC dan buzzer diam.
// Set false bila buzzer dicatu 3V3 atau dirangkai active high.
constexpr bool BUZZER_OFF_HIGH_Z = true;

// ---------------------------------------------------------------------------
// LCD 16x2 I2C (PCF8574)
// ---------------------------------------------------------------------------
constexpr uint8_t kLcdAddress = 0x27;          // alamat utama
constexpr uint8_t kLcdFallbackAddress = 0x3F;  // dicoba bila alamat utama tidak menjawab
constexpr uint8_t kLcdCols = 16;
constexpr uint8_t kLcdRows = 2;

// ---------------------------------------------------------------------------
// MQ-135
// ---------------------------------------------------------------------------
// R0 dari sketch uji tim (129.41 kOhm pada skala ADC 3.3 V), dikonversi ke kAdcFullScaleV 3.2 V.
// Kalibrasi ulang disarankan setelah pemanasan penuh (firmware/README.md, perintah serial `cal`).
constexpr float kMq135R0KOhm = 133.4f;
constexpr float kMq135LoadKOhm = 1.0f;       // RL pada modul MQ-135 (kode 102 = 1 kOhm)
constexpr float kMq135SupplyV = 5.0f;        // VCC modul (VIN NodeMCU)
constexpr float kAdcFullScaleV = 3.2f;       // A0 NodeMCU v2: pembagi internal 220k/100k
constexpr float kMq135DividerFactor = 2.0f;  // pembagi eksternal dua resistor sama: Vao = Va0 * 2
constexpr float kMq135CurveA = 116.602f;     // ppm = A * (Rs/R0)^B
constexpr float kMq135CurveB = -2.769f;
constexpr float kMq135CleanAirPpm = 420.0f;  // CO2 atmosfer untuk kalibrasi R0
constexpr uint8_t kMq135Samples = 10;        // rata-rata bergulir
constexpr uint32_t kMq135SampleIntervalMs = 200;
// Ambang gangguan dalam count ADC (rata-rata). RL 1 kOhm membuat ADC udara bersih
// hanya ~8-10, jadi ambang "lepas" harus jauh di bawahnya. Sesuaikan dengan alat.
constexpr float kMq135AdcMinValid = 2.0f;    // di bawah ini dianggap sensor lepas
constexpr float kMq135AdcRailMin = 1015.0f;  // mulai nilai ini dianggap ADC mentok
constexpr uint8_t kMq135FaultConfirmSamples = 10;  // sampel beruntun (+-2 dtk) sebelum fault berubah
constexpr int kPpmMax = 9999;                // batas tampilan / payload
constexpr uint32_t kWarmupMs = 3UL * 60UL * 1000UL;
constexpr uint32_t kCalibrationDurationMs = 60UL * 1000UL;

// Set 1 untuk mode kalibrasi terus-menerus (mencetak R0 tiap sesi tanpa perlu
// perintah serial). Dapat juga diset lewat build flag -DSIMONDARA_CALIBRATION=1.
#ifndef SIMONDARA_CALIBRATION
#define SIMONDARA_CALIBRATION 0
#endif

// ---------------------------------------------------------------------------
// DHT11
// ---------------------------------------------------------------------------
constexpr uint32_t kDhtIntervalMs = 2000;   // DHT11 minimal 1 dtk antar-baca
constexpr uint32_t kDhtRetryMs = 1100;      // jeda ulang setelah gagal
constexpr uint8_t kDhtMaxFailures = 3;      // gagal beruntun sebelum data dianggap tidak valid
constexpr float kTempMinValid = -10.0f;
constexpr float kTempMaxValid = 60.0f;

// ---------------------------------------------------------------------------
// Ambang status (README "Logika Penentuan Status")
// ---------------------------------------------------------------------------
constexpr float kTempSafeMin = 18.0f;      // < 18 -> waspada
constexpr float kTempSafeMax = 30.0f;      // > 30 -> waspada
constexpr float kTempWarnMax = 33.0f;      // > 33 -> bahaya
constexpr float kHumDangerBelow = 30.0f;   // < 30 -> bahaya
constexpr float kHumSafeMin = 40.0f;       // < 40 -> waspada
constexpr float kHumSafeMax = 60.0f;       // > 60 -> waspada
constexpr float kHumWarnMax = 70.0f;       // > 70 -> bahaya
constexpr int kGasSafeMax = 1000;          // > 1000 -> waspada
constexpr int kGasWarnMax = 2000;          // > 2000 -> bahaya
constexpr int kGasFanOnAbove = 1000;       // histeresis kipas: nyala bila > 1000
constexpr int kGasFanOffBelow = 900;       //                    mati bila < 900

// ---------------------------------------------------------------------------
// Interval & jaringan
// ---------------------------------------------------------------------------
constexpr uint32_t kTelemetryIntervalMs = 10000;
constexpr uint32_t kDisplayIntervalMs = 2000;
constexpr uint32_t kLcdProbeIntervalMs = 5000;  // cek modul LCD menjawab I2C
constexpr uint32_t kWifiConnectTimeoutMs = 20000;
constexpr uint32_t kBackoffMinMs = 2000;
constexpr uint32_t kBackoffMaxMs = 60000;
constexpr uint16_t kMqttKeepAliveS = 30;
constexpr uint16_t kMqttSocketTimeoutS = 5;
constexpr uint16_t kMqttBufferSize = 512;
constexpr uint16_t kMqttMaxCmdBytes = 256;
constexpr uint32_t kTimeValidAfter = 1700000000UL;  // epoch minimal agar jam dianggap sinkron

}  // namespace config
