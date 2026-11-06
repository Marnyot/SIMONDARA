#include "sensors.h"

#include <Arduino.h>
#include <DHT.h>
#include <math.h>

#include "config.h"
#include "fault.h"
#include "log.h"

namespace sensors {

namespace {

DHT dht(config::kPinDht, DHT11);

Climate climateState = {false, NAN, NAN};
fault::DhtHealth dhtHealth;
uint32_t dhtLastAttemptMs = 0;
uint32_t dhtNextDelayMs = 0;

uint16_t adcSamples[config::kMq135Samples];
uint8_t adcCount = 0;
uint8_t adcIndex = 0;
uint32_t adcLastSampleMs = 0;

Gas gasState = {false, false, 0, 0.0f};
fault::Mq135Health gasHealth;
uint32_t warmupStartMs = 0;
bool warm = false;

bool calRequested = SIMONDARA_CALIBRATION != 0;
bool calActive = false;
uint32_t calStartMs = 0;
double calSum = 0;
uint32_t calCount = 0;

// Rs/R0 yang menghasilkan kMq135CleanAirPpm pada kurva ppm = A * (Rs/R0)^B.
float cleanAirRatio() {
  return powf(config::kMq135CleanAirPpm / config::kMq135CurveA, 1.0f / config::kMq135CurveB);
}

void readDht(uint32_t now) {
  if (now - dhtLastAttemptMs < dhtNextDelayMs) return;
  dhtLastAttemptMs = now;

  const float t = dht.readTemperature(false, true);
  const float h = dht.readHumidity();
  const fault::DhtRead read = fault::classifyDht(t, h);
  const bool wasFaulted = fault::dhtFaulted(dhtHealth);
  fault::recordDht(dhtHealth, read);

  if (read == fault::DhtRead::kOk) {
    if (!climateState.valid) LOGF("dht", "pembacaan valid: %.1fC %.0f%%", t, h);
    climateState = {true, t, h};
    dhtNextDelayMs = config::kDhtIntervalMs;
    return;
  }

  dhtNextDelayMs = config::kDhtRetryMs;
  if (wasFaulted) return;
  if (read == fault::DhtRead::kOutOfRange) {
    LOGF("dht", "nilai di luar rentang: %.1fC %.0f%%", t, h);
  } else {
    LOGF("dht", "gagal baca (%u/%u)", dhtHealth.failures, config::kDhtMaxFailures);
  }
  if (fault::dhtFaulted(dhtHealth)) {
    climateState.valid = false;
    LOGF("dht", "data suhu/kelembapan tidak valid, periksa kabel D4");
  }
}

void finishCalibration() {
  calActive = false;
  if (calCount == 0) {
    LOGF("cal", "gagal: tidak ada sampel MQ-135 yang valid");
  } else {
    const double r0 = calSum / calCount;
    LOGF("cal", "selesai: %lu sampel, R0 = %.2f kOhm", static_cast<unsigned long>(calCount), r0);
    LOGF("cal", "salin ke config.h: constexpr float kMq135R0KOhm = %.2ff;", r0);
  }
  calRequested = SIMONDARA_CALIBRATION != 0;  // mode compile: ulangi sesi berikutnya
}

void updateGas() {
  uint32_t sum = 0;
  for (uint8_t i = 0; i < adcCount; ++i) sum += adcSamples[i];
  const float adc = static_cast<float>(sum) / adcCount;
  const float vAo = fault::mq135Volts(adc);

  const bool wasValid = gasState.valid;
  gasState.ready = warm;
  gasState.valid = false;

  const bool wasOutOfRange = gasHealth.outOfRange;
  const bool outOfRange = fault::mq135OutOfRange(adc);
  fault::recordMq135(gasHealth, outOfRange);
  if (gasHealth.outOfRange && !wasOutOfRange) {
    LOGF("mq135", "pembacaan tidak wajar (ADC %.0f, %.2f V), periksa kabel A0 dan pembagi", adc, vAo);
  }
  if (outOfRange) return;

  const float rs = config::kMq135LoadKOhm * (config::kMq135SupplyV - vAo) / vAo;
  gasState.rsKOhm = rs;

  if (calActive) {
    calSum += rs / cleanAirRatio();
    ++calCount;
  }

  if (!warm) return;

  const float ppm = config::kMq135CurveA * powf(rs / config::kMq135R0KOhm, config::kMq135CurveB);
  gasState.ppm = isfinite(ppm) ? constrain(static_cast<int>(lroundf(ppm)), 0, config::kPpmMax) : config::kPpmMax;
  gasState.valid = true;
  if (!wasValid) LOGF("mq135", "pembacaan valid: %d ppm (Rs %.1f kOhm)", gasState.ppm, rs);
}

void sampleGas(uint32_t now) {
  if (now - adcLastSampleMs < config::kMq135SampleIntervalMs) return;
  adcLastSampleMs = now;

  adcSamples[adcIndex] = analogRead(A0);
  adcIndex = (adcIndex + 1) % config::kMq135Samples;
  if (adcCount < config::kMq135Samples) ++adcCount;
  if (adcCount == config::kMq135Samples) updateGas();
}

void tickCalibration(uint32_t now) {
  if (calRequested && !calActive && warm) {
    calRequested = false;
    calActive = true;
    calStartMs = now;
    calSum = 0;
    calCount = 0;
    LOGF("cal", "mulai kalibrasi R0 %u dtk; pastikan sensor di udara bersih (~%.0f ppm)",
         config::kCalibrationDurationMs / 1000, config::kMq135CleanAirPpm);
  }
  if (calActive && now - calStartMs >= config::kCalibrationDurationMs) finishCalibration();
}

}  // namespace

void begin() {
  dht.begin();
  warmupStartMs = millis();
  LOGF("mq135", "pemanasan %u dtk, R0 = %.2f kOhm", config::kWarmupMs / 1000, config::kMq135R0KOhm);
#if SIMONDARA_CALIBRATION
  LOGF("cal", "mode kalibrasi aktif (SIMONDARA_CALIBRATION=1)");
#endif
}

void loop() {
  const uint32_t now = millis();
  if (!warm && now - warmupStartMs >= config::kWarmupMs) {
    warm = true;
    LOGF("mq135", "pemanasan selesai");
  }
  readDht(now);
  sampleGas(now);
  tickCalibration(now);
}

Climate climate() { return climateState; }

Gas gas() { return gasState; }

bool dhtFault() { return fault::dhtFaulted(dhtHealth); }

bool gasFault() { return fault::mq135Faulted(gasHealth, warm, calActive); }

bool warmedUp() { return warm; }

uint32_t warmupRemainingMs() {
  if (warm) return 0;
  const uint32_t elapsed = millis() - warmupStartMs;
  return elapsed >= config::kWarmupMs ? 0 : config::kWarmupMs - elapsed;
}

uint8_t warmupPercent() {
  return static_cast<uint8_t>(100UL - (warmupRemainingMs() * 100UL) / config::kWarmupMs);
}

void startCalibration() {
  if (calActive) {
    LOGF("cal", "kalibrasi sedang berjalan");
    return;
  }
  calRequested = true;
  if (!warm) LOGF("cal", "kalibrasi dimulai setelah pemanasan (%u dtk lagi)", warmupRemainingMs() / 1000);
}

bool calibrating() { return calActive; }

}  // namespace sensors
