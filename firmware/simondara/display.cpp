// LCD mengikuti cariAlamatLcd/perbaruiLcd sketch tim; cloud hanya di Serial.
#include "display.h"
#include <Arduino.h>
#include <LiquidCrystal_I2C.h>
#include <Wire.h>
#include <math.h>
#include "config.h"
namespace display {
namespace {
LiquidCrystal_I2C lcdDevice(0x27, 16, 2);
LiquidCrystal_I2C* lcd = nullptr;
uint8_t address = 0;
bool responding = false, backlight = true;
uint32_t lastProbe = 0, holdUntil = 0;
bool probe(uint8_t a) {
  Wire.beginTransmission(a);
  return Wire.endTransmission() == 0;
}
uint8_t findAddress() {
  uint8_t choice = 0;
  int count = 0;
  Serial.println("Memindai I2C...");
  for (uint8_t a = 1; a < 127; ++a) {
    if (probe(a)) {
      ++count;
      Serial.printf("  Ditemukan 0x%02X\n", a);
      const bool candidate = (a >= 0x20 && a <= 0x27) || (a >= 0x38 && a <= 0x3F);
      if (candidate && (choice == 0 || a == 0x27 || a == 0x3F)) choice = a;
    }
    yield();
  }
  if (!count) Serial.println("  Tidak ada perangkat I2C.");
  else if (!choice) Serial.println("  Ada perangkat, tapi bukan alamat LCD PCF8574.");
  return choice;
}
void writeLine(uint8_t row, const char* text) {
  if (!lcd || !responding) return;
  char buf[17];
  snprintf(buf, sizeof buf, "%-16.16s", text);
  lcd->setCursor(0, row);
  lcd->print(buf);
}
} // namespace
void rescan() {
  address = findAddress();
  lcd = nullptr;
  responding = address != 0;
  if (!responding) {
    Serial.println("LCD tidak terdeteksi. Monitoring tetap berjalan.");
    return;
  }
  lcdDevice = LiquidCrystal_I2C(address, 16, 2);
  lcd = &lcdDevice;
  lcd->init();
  Wire.begin(config::kPinI2cSda, config::kPinI2cScl);
  Wire.setClock(100000);
  lcd->backlight(); lcd->clear(); backlight = true;
  writeLine(0, "SIMONDARA"); writeLine(1, "Monitor aktif");
  holdUntil = millis() + 2000;
  Serial.printf("LCD memakai alamat 0x%02X\n", address);
}
void begin() {
  Wire.begin(config::kPinI2cSda, config::kPinI2cScl);
  Wire.setClock(100000);
  rescan();
  lastProbe = millis();
}
void loop() {
  const uint32_t now = millis();
  if (now - lastProbe < config::kLcdProbeIntervalMs) return;
  lastProbe = now;
  if (responding && probe(address)) return;
  responding = false;
  rescan(); // pemulihan cloud: scan/init ulang jika LCD tidak menjawab
}
bool faulted() { return !responding; }
void toggleBacklight() {
  if (!lcd || !responding) { Serial.println("LCD belum terdeteksi. Ketik s."); return; }
  backlight = !backlight;
  if (backlight) lcd->backlight(); else lcd->noBacklight();
}
void message(uint8_t row, const char* text, uint32_t holdMs) {
  if (row == 0 && lcd && responding) lcd->clear();
  writeLine(row, text);
  holdUntil = millis() + holdMs;
}
void render(const View& v) {
  if (!responding || static_cast<int32_t>(millis() - holdUntil) < 0) return;
  char text[24];
  if (isnan(v.temperature)) snprintf(text, sizeof text, "DHT belum terbaca");
  else snprintf(text, sizeof text, "S:%.1fC L:%.0f%%%s", v.temperature, v.humidity, v.dhtFailed ? "?" : "");
  writeLine(0, text);
  if (v.warmingUp) snprintf(text, sizeof text, "Pemanasan %lus", millis() / 1000);
  else if (v.r0KOhm <= 0) snprintf(text, sizeof text, "Gas blm kalibr.");
  else if (!v.gasValid) snprintf(text, sizeof text, "Cek sinyal MQ135");
  else if (v.ppm > config::kPpmMax) snprintf(text, sizeof text, ">5000ppm %s", air::statusLabel(v.status));
  else snprintf(text, sizeof text, "%4.0fppm %s", v.ppm, air::statusLabel(v.status));
  writeLine(1, text);
}
} // namespace display
