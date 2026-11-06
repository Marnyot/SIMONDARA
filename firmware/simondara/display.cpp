#include "display.h"

#include <Arduino.h>
#include <LiquidCrystal_I2C.h>
#include <Wire.h>
#include <string.h>

#include "config.h"
#include "fault.h"
#include "log.h"

namespace display {

namespace {

constexpr uint8_t kOfflineGlyph = 0;
// Antena dengan tanda silang: koneksi broker terputus.
uint8_t offlineGlyph[8] = {0b10101, 0b01110, 0b00100, 0b00100, 0b00000, 0b10001, 0b01010, 0b10001};

constexpr size_t kLineLen = config::kLcdCols;

LiquidCrystal_I2C lcdPrimary(config::kLcdAddress, config::kLcdCols, config::kLcdRows);
LiquidCrystal_I2C lcdFallback(config::kLcdFallbackAddress, config::kLcdCols, config::kLcdRows);
LiquidCrystal_I2C* lcd = nullptr;
bool responding = false;
uint32_t lastProbeMs = 0;
char shown[config::kLcdRows][kLineLen + 1];

bool probe(uint8_t address) {
  Wire.beginTransmission(address);
  return Wire.endTransmission() == 0;
}

// Alamat modul yang menjawab, 0 bila tidak ada.
uint8_t findAddress() {
  if (probe(config::kLcdAddress)) return config::kLcdAddress;
  if (probe(config::kLcdFallbackAddress)) return config::kLcdFallbackAddress;
  return 0;
}

// Juga dipakai saat modul kembali menjawab: isi LCD hilang bila catunya sempat
// putus, jadi glyph dibuat ulang dan render berikutnya menulis semua baris.
void initLcd(uint8_t address) {
  lcd = address == config::kLcdAddress ? &lcdPrimary : &lcdFallback;
  lcd->init();
  lcd->backlight();
  lcd->createChar(kOfflineGlyph, offlineGlyph);
  lcd->clear();
  memset(shown, 0, sizeof shown);
  responding = true;
  LOGF("lcd", "LCD aktif di 0x%02X", address);
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
  snprintf(l1, kLineLen + 1, "%s", (v.fault & fault::kDht) ? "Panas DHT ERR" : "Pemanasan MQ135");
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
    snprintf(l1, kLineLen + 1, "DHT ERR");
  }

  const char* status = v.statusKnown ? air::statusLabel(v.status) : "-";
  if (v.fault & fault::kMq135) {
    snprintf(l2, kLineLen + 1, "MQ ERR %s", status);
    return;
  }
  char gas[6];
  if (v.gasValid) {
    snprintf(gas, sizeof gas, "%d", v.ppm);
  } else {
    snprintf(gas, sizeof gas, "err");
  }
  snprintf(l2, kLineLen + 1, "Gas:%s %s", gas, status);
}

}  // namespace

void begin() {
  Wire.begin(config::kPinI2cSda, config::kPinI2cScl);

  lastProbeMs = millis();
  const uint8_t address = findAddress();
  if (address == 0) {
    LOGF("lcd", "LCD tidak ditemukan di 0x%02X/0x%02X, dicoba lagi berkala", config::kLcdAddress,
         config::kLcdFallbackAddress);
    return;
  }

  initLcd(address);
  lcd->setCursor(0, 0);
  lcd->print(F("SIMONDARA"));
  lcd->setCursor(0, 1);
  lcd->print(F("Memulai..."));
}

void loop() {
  const uint32_t now = millis();
  if (now - lastProbeMs < config::kLcdProbeIntervalMs) return;
  lastProbeMs = now;

  const uint8_t address = findAddress();
  switch (fault::lcdChange(responding, address != 0)) {
    case fault::LcdChange::kLost:
      responding = false;
      LOGF("lcd", "LCD tidak menjawab I2C, periksa kabel SDA/SCL dan catu");
      break;
    case fault::LcdChange::kRecovered:
      initLcd(address);
      break;
    case fault::LcdChange::kNone:
      break;
  }
}

bool faulted() { return !responding; }

void render(const View& v) {
  if (!responding) return;

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
