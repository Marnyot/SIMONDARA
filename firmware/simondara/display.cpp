#include "display.h"

#include <Arduino.h>
#include <LiquidCrystal_I2C.h>
#include <Wire.h>
#include <string.h>

#include "config.h"
#include "log.h"

namespace display {

namespace {

constexpr uint8_t kOfflineGlyph = 0;
// Antena dengan tanda silang: koneksi broker terputus.
uint8_t offlineGlyph[8] = {0b10101, 0b01110, 0b00100, 0b00100, 0b00000, 0b10001, 0b01010, 0b10001};

constexpr size_t kLineLen = config::kLcdCols;

LiquidCrystal_I2C* lcd = nullptr;
char shown[config::kLcdRows][kLineLen + 1];

bool probe(uint8_t address) {
  Wire.beginTransmission(address);
  return Wire.endTransmission() == 0;
}

// Pad dengan spasi hingga 16 kolom; bila offline, kolom terakhir diganti glyph.
void finishLine(char* line, bool markOffline) {
  size_t len = strlen(line);
  while (len < kLineLen) line[len++] = ' ';
  line[kLineLen] = '\0';
  if (markOffline) line[kLineLen - 1] = static_cast<char>(kOfflineGlyph);
}

void writeLine(uint8_t row, const char* line) {
  if (memcmp(shown[row], line, kLineLen) == 0) return;
  memcpy(shown[row], line, kLineLen + 1);
  lcd->setCursor(0, row);
  for (size_t i = 0; i < kLineLen; ++i) lcd->write(static_cast<uint8_t>(line[i]));
}

void renderWarmup(const View& v, char* l1, char* l2) {
  snprintf(l1, kLineLen + 1, "Pemanasan MQ135");
  // Bilah 11 sel + " m:ss".
  constexpr uint8_t kBarCells = 11;
  const uint8_t filled = static_cast<uint8_t>((v.warmupPercent * kBarCells) / 100);
  for (uint8_t i = 0; i < kBarCells; ++i) l2[i] = i < filled ? '\xff' : '-';
  const uint32_t secs = (v.warmupRemainingMs + 999) / 1000;
  char remaining[24];
  snprintf(remaining, sizeof remaining, " %u:%02u", secs / 60, secs % 60);
  strncpy(l2 + kBarCells, remaining, kLineLen - kBarCells);
}

void renderReadings(const View& v, char* l1, char* l2) {
  if (v.climateValid) {
    snprintf(l1, kLineLen + 1, "Suhu:%.1f Lb:%d%%", v.temperature, static_cast<int>(lroundf(v.humidity)));
  } else {
    snprintf(l1, kLineLen + 1, "Sensor DHT error");
  }

  char gas[6];
  if (v.gasValid) {
    snprintf(gas, sizeof gas, "%d", v.ppm);
  } else {
    snprintf(gas, sizeof gas, "err");
  }
  snprintf(l2, kLineLen + 1, "Gas:%s %s", gas, v.statusKnown ? air::statusLabel(v.status) : "-");
}

}  // namespace

void begin() {
  Wire.begin(config::kPinI2cSda, config::kPinI2cScl);

  uint8_t address = config::kLcdAddress;
  if (!probe(address)) {
    address = config::kLcdFallbackAddress;
    if (!probe(address)) {
      LOGF("lcd", "LCD tidak ditemukan di 0x%02X/0x%02X, tampilan dinonaktifkan", config::kLcdAddress,
           config::kLcdFallbackAddress);
      return;
    }
  }

  lcd = new LiquidCrystal_I2C(address, config::kLcdCols, config::kLcdRows);
  lcd->init();
  lcd->backlight();
  lcd->createChar(kOfflineGlyph, offlineGlyph);
  lcd->clear();
  lcd->setCursor(0, 0);
  lcd->print(F("SIMONDARA"));
  lcd->setCursor(0, 1);
  lcd->print(F("Memulai..."));
  memset(shown, 0, sizeof shown);
  LOGF("lcd", "LCD aktif di 0x%02X", address);
}

void render(const View& v) {
  if (lcd == nullptr) return;

  char l1[kLineLen + 1] = {0};
  char l2[kLineLen + 1] = {0};
  if (v.warmingUp) {
    renderWarmup(v, l1, l2);
    finishLine(l1, !v.online);
    finishLine(l2, false);
  } else {
    renderReadings(v, l1, l2);
    finishLine(l1, false);
    finishLine(l2, !v.online);
  }
  writeLine(0, l1);
  writeLine(1, l2);
}

}  // namespace display
