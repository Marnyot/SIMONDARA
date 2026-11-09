// Hardware dan konstanta SIMONDARA v2; tanpa Arduino agar dapat dites di host.
#pragma once
#include <stdint.h>
namespace config {
constexpr uint8_t kPinDht = 2;        // D4
constexpr uint8_t kPinI2cSda = 4;     // D2
constexpr uint8_t kPinI2cScl = 5;     // D1
constexpr uint8_t kPinLedGreen = 13;  // D7
constexpr uint8_t kPinLedYellow = 16; // D0
constexpr uint8_t kPinLedRed = 15;    // D8
constexpr uint8_t kPinBuzzer = 12;    // D6
constexpr uint8_t kPinRelay = 14;     // D5
constexpr bool kUseLeds = false;
constexpr bool LED_GREEN_ACTIVE_LOW = false;
constexpr bool LED_YELLOW_ACTIVE_LOW = false;
constexpr bool LED_RED_ACTIVE_LOW = false;
constexpr bool BUZZER_ACTIVE_LOW = true;
constexpr bool BUZZER_OFF_HIGH_Z = false; // sketch tim: mati = OUTPUT HIGH
constexpr bool RELAY_ACTIVE_LOW = false;
constexpr uint8_t kLcdCols = 16;
constexpr uint8_t kLcdRows = 2;
constexpr float kMq135R0KOhm = 133.4f; // cadangan tim bila EEPROM tidak valid
constexpr float kMq135LoadKOhm = 1.0f;
constexpr float kMq135SupplyV = 5.0f;
constexpr float kAdcFullScaleV = 3.3f;
constexpr float kMq135DividerFactor = 2.0f;
constexpr float kMq135CurveA = 116.6020682f;
constexpr float kMq135CurveB = 2.769034857f; // ppm = A * (Rs/R0)^(-B)
constexpr float kMq135CleanAirPpm = 420.0f;
constexpr uint8_t kMq135Samples = 64;
constexpr uint32_t kGasIntervalMs = 1000;
constexpr float kMq135EmaAlpha = 0.2f;
constexpr float kMq135AdcMinValid = 2.0f;
constexpr float kMq135AdcRailMin = 1015.0f; // batas eksklusif, seperti adcValid()
constexpr int kPpmMax = 5000;
constexpr uint32_t kWarmupMinMs = 20000;
constexpr uint32_t kWarmupMs = 180000;
constexpr uint32_t kStableWindowMs = 10000;
constexpr float kStableFraction = 0.01f;
constexpr uint8_t kCalibrationSamples = 30;
constexpr float kCalibrationSpreadPercent = 3.0f;
constexpr uint32_t kDhtIntervalMs = 2000;
constexpr uint8_t kDhtMaxFailures = 3;
constexpr float kTempMinValid = -10.0f;
constexpr float kTempMaxValid = 60.0f;
constexpr float kTempSafeMin = 18.0f;
constexpr float kTempSafeMax = 30.0f;
constexpr float kTempWarnMax = 33.0f;
constexpr float kHumDangerBelow = 30.0f;
constexpr float kHumSafeMin = 40.0f;
constexpr float kHumSafeMax = 60.0f;
constexpr float kHumWarnMax = 70.0f;
constexpr int kGasSafeMax = 1000;
constexpr int kGasWarnMax = 2000;
constexpr float kTempMargin = 0.5f;
constexpr float kHumMargin = 2.0f;
constexpr float kGasMargin = 100.0f;
constexpr uint32_t kBeepDurationMs = 300;
constexpr uint32_t kBeepPeriodMs = 5000;
constexpr uint32_t kTelemetryIntervalMs = 10000;
constexpr uint32_t kDisplayIntervalMs = 1000;
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
