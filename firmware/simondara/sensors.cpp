// Acquisition/EEPROM/pemanasan mengikuti simondara_full.ino v2 tim.
#include "sensors.h"
#include <Arduino.h>
#include <DHT.h>
#include <EEPROM.h>
#include <math.h>
#include "config.h"
#include "fault.h"
#include "display.h"
namespace sensors {
namespace {
DHT dht(config::kPinDht, DHT11);
fault::DhtHealth dhtHealth;
fault::Mq135Health gasHealth;
float suhu = NAN, lembap = NAN;
bool dhtGagal = false;
float adcHalus = -1, vao = 0, rs = 0, ppm = NAN, r0Kohm = 0;
bool masihPanas = true, modePlotter = false;
float adcAcuanStabil = -1;
unsigned long waktuAcuanStabil = 0;
uint32_t lastGas = 0, lastDht = 0;
bool calActive = false;
uint32_t lastCal = 0;
uint8_t calCount = 0;
float calTotal = 0, calMin = 1e9, calMax = 0;
struct DataKalibrasi {
  uint32_t kode;
  float    r0;
  float    rl;
  float    faktor;
};
const uint32_t KODE_VALID = 0x53494D44;  // "SIMD"

void simpanR0(float nilai) {
  DataKalibrasi d = {KODE_VALID, nilai, config::kMq135LoadKOhm, config::kMq135DividerFactor};
  EEPROM.put(0, d);
  EEPROM.commit();
}

void hapusR0() {
  DataKalibrasi d = {0, 0, 0, 0};
  EEPROM.put(0, d);
  EEPROM.commit();
}

bool muatR0() {
  DataKalibrasi d;
  EEPROM.get(0, d);
  if (d.kode != KODE_VALID) return false;

  if (!isfinite(d.rl) || !isfinite(d.faktor) || fabsf(d.rl - config::kMq135LoadKOhm) > 0.001f || fabsf(d.faktor - config::kMq135DividerFactor) > 0.001f) {
    Serial.printf("R0 tersimpan dibuat dengan RL=%.2f dan pembagi=%.2f.\n", d.rl, d.faktor);
    Serial.println("Pengaturan sekarang berbeda, jadi R0 lama diabaikan. Kalibrasi ulang (k).");
    return false;
  }
  if (!isfinite(d.r0) || d.r0 <= 0) return false;

  r0Kohm = d.r0;
  return true;
}

// =====================================================================
// 9. MQ135
// =====================================================================
float bacaAdcRataRata() {
  long total = 0;
  for (int i = 0; i < config::kMq135Samples; i++) {
    total += analogRead(A0);
    delayMicroseconds(500);
  }
  return total / (float)config::kMq135Samples;
}

float adcKeVao(float adc) {
  return fault::mq135Volts(adc);
}

float hitungRs(float v) {
  if (v < 0.001f)      v = 0.001f;
  if (v > config::kMq135SupplyV - 0.001f) v = config::kMq135SupplyV - 0.001f;
  return config::kMq135LoadKOhm * (config::kMq135SupplyV - v) / v;
}

float hitungR0(float rsBersih) {
  return rsBersih * powf(config::kMq135CleanAirPpm / config::kMq135CurveA, 1.0f / config::kMq135CurveB);
}

float hitungPpm(float rsNow) {
  return config::kMq135CurveA * powf(rsNow / r0Kohm, -config::kMq135CurveB);
}

bool adcValid(float adc) {
  return adc >= config::kMq135AdcMinValid && adc < config::kMq135AdcRailMin;
}

bool gasSiap() {
  return r0Kohm > 0 && !masihPanas && isfinite(ppm) && adcValid(adcHalus);
}

void selesaiPemanasan(const char* alasan) {
  masihPanas = false;
  if (!modePlotter) {
    Serial.printf(">>> Pemanasan selesai (%s) setelah %lu detik.\n", alasan, millis() / 1000);
  }
}

// Pemanasan selesai jika ADC stabil dalam satu jendela waktu.
void cekPemanasan() {
  if (!masihPanas) return;
  unsigned long t = millis();

  if (t >= config::kWarmupMs) {
    selesaiPemanasan("batas waktu maksimal");
    return;
  }

  if (adcAcuanStabil < 0) {
    adcAcuanStabil = adcHalus;
    waktuAcuanStabil = t;
    return;
  }

  if (t - waktuAcuanStabil >= config::kStableWindowMs) {
    float perubahan = fabsf(adcHalus - adcAcuanStabil) / fmaxf(adcAcuanStabil, 1.0f);
    if (t >= config::kWarmupMinMs && perubahan < config::kStableFraction) {
      selesaiPemanasan("pembacaan stabil");
    } else {
      adcAcuanStabil = adcHalus;
      waktuAcuanStabil = t;
    }
  }
}

void bacaGas() {
  float adcBaru = bacaAdcRataRata();
  adcHalus = (adcHalus < 0) ? adcBaru : config::kMq135EmaAlpha * adcBaru + (1.0f - config::kMq135EmaAlpha) * adcHalus;

  vao = adcKeVao(adcHalus);
  rs  = hitungRs(vao);
  ppm = (r0Kohm > 0) ? hitungPpm(rs) : NAN;

  fault::recordMq135(gasHealth, fault::mq135OutOfRange(adcHalus));
  cekPemanasan();

  if (modePlotter) {
    if (gasSiap()) Serial.printf("ppm:%.0f\n", fminf(ppm, static_cast<float>(config::kPpmMax)));
    else           Serial.printf("ADC:%.2f\n", adcHalus);
  }
}

// =====================================================================
// 10. DHT11
// =====================================================================
void bacaDht() {
  float h = dht.readHumidity();
  float t = dht.readTemperature();

  if (isnan(h) || isnan(t)) {
    dhtGagal = true;
    fault::recordDht(dhtHealth, fault::DhtRead::kFailed);
    if (!modePlotter) Serial.println("DHT11 gagal dibaca. Cek DATA D4, catu, dan GND.");
    return;
  }
  dhtGagal = false;
  fault::recordDht(dhtHealth, fault::classifyDht(t, h));
  suhu = t;
  lembap = h;
}


// Satu sampel kalibrasi per detik; loop cloud tetap hidup selama 30 sampel.
void tickCalibration(uint32_t now) {
  if (!calActive || now - lastCal < 1000) return;
  lastCal = now;
  const float adc = bacaAdcRataRata();
  if (!adcValid(adc)) {
    Serial.printf("ADC %.2f tidak valid. Kalibrasi dibatalkan, cek kabel MQ135.\n", adc);
    display::message(1, "Cek kabel MQ135", 3000);
    calActive = false;
    return;
  }
  const float r = hitungRs(adcKeVao(adc));
  calTotal += r;
  calMin = fminf(calMin, r);
  calMax = fmaxf(calMax, r);
  ++calCount;
  Serial.printf("%2d/%d ADC %.2f Rs %.3f kOhm\n", calCount, config::kCalibrationSamples, adc, r);
  char text[17];
  snprintf(text, sizeof text, "Sampel %2d/%d", calCount, config::kCalibrationSamples);
  display::message(1, text, 1100);
  if (calCount < config::kCalibrationSamples) return;
  calActive = false;
  const float average = calTotal / calCount;
  const float spread = (calMax - calMin) / average * 100;
  const float result = hitungR0(average);
  if (!isfinite(result) || result <= 0) {
    Serial.println("Hasil R0 tidak valid.");
    display::message(1, "Kalibrasi gagal", 3000);
    return;
  }
  r0Kohm = result;
  simpanR0(r0Kohm);
  Serial.printf("Kalibrasi selesai. R0 = %.4f kOhm (tersimpan di EEPROM)\n", r0Kohm);
  Serial.printf("Sebaran Rs selama kalibrasi: %.2f %%\n", spread);
  if (spread > config::kCalibrationSpreadPercent) {
    Serial.println("PERINGATAN: Rs masih bergeser, sensor kemungkinan belum stabil.");
    Serial.println("Disarankan ulangi kalibrasi beberapa menit lagi.");
  }
  snprintf(text, sizeof text, "R0:%.3fk", r0Kohm);
  display::message(1, text, 3000);
  adcHalus = -1;
  bacaGas();
}
} // namespace
void begin() {
  EEPROM.begin(64);
  if (muatR0()) Serial.printf("R0 dimuat dari EEPROM: %.4f kOhm\n", r0Kohm);
  else {
    r0Kohm = config::kMq135R0KOhm;
    Serial.printf("R0 cadangan dari kode: %.4f kOhm\n", r0Kohm);
  }
  dht.begin();
}
void loop() {
  const uint32_t now = millis();
  if (calActive) { tickCalibration(now); return; }
  if (now - lastGas >= config::kGasIntervalMs) { lastGas = now; bacaGas(); }
  if (now - lastDht >= config::kDhtIntervalMs) { lastDht = now; bacaDht(); }
}
Climate climate() { return {!dhtGagal && !isnan(suhu) && !fault::dhtFaulted(dhtHealth), suhu, lembap, dhtGagal}; }
Gas gas() { return {!masihPanas, gasSiap(), ppm, rs, adcHalus, r0Kohm}; }
bool dhtFault() { return fault::dhtFaulted(dhtHealth); }
bool gasFault() { return fault::mq135Faulted(gasHealth, !masihPanas, calActive); }
bool warmedUp() { return !masihPanas; }
void skipWarmup() {
  if (masihPanas) selesaiPemanasan("dilewati manual");
  else Serial.println("Pemanasan sudah selesai.");
}
void startCalibration() {
  if (calActive) return;
  if (masihPanas) {
    Serial.println("Sensor masih pemanasan. Tunggu sampai selesai, atau ketik w untuk melewati.");
    return;
  }
  calActive = true;
  calCount = 0; calTotal = 0; calMin = 1e9; calMax = 0;
  lastCal = millis() - 1000;
  Serial.println("=== KALIBRASI MQ135 ===");
  Serial.println("Lakukan di udara bersih (dekat jendela/luar ruangan), jauh dari napas dan asap.");
  Serial.printf("Mengambil %d sampel, sekitar %d detik.\n", config::kCalibrationSamples, config::kCalibrationSamples);
  display::message(0, "Kalibrasi MQ135", 31000);
}
bool calibrating() { return calActive; }
void clearCalibration() {
  calActive = false;
  hapusR0(); r0Kohm = 0; ppm = NAN;
  Serial.println("R0 dihapus. Ketik k untuk kalibrasi ulang.");
}
void printCalibration() {
  Serial.printf("R0 = %.4f kOhm | RL = %.2f kOhm | pembagi = %.2f\n", r0Kohm, config::kMq135LoadKOhm, config::kMq135DividerFactor);
  Serial.printf("Rs sekarang = %.3f kOhm | Rs/R0 = %.3f\n", rs, r0Kohm > 0 ? rs / r0Kohm : 0);
}
void togglePlotter() { modePlotter = !modePlotter; }
bool plotting() { return modePlotter; }
} // namespace sensors
