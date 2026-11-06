// LCD 16x2 I2C. Hanya baris yang berubah yang ditulis ulang.
//
// Tata letak normal (16 kolom):
//   "Suhu:29.4 Lb:62%"
//   "Gas:820 Aman   x"   x = penanda offline di kolom 16
// LCD 16 kolom tidak muat "Suhu:29.4C Lb:62%" (17 karakter), jadi satuan C
// dihilangkan. Bila sensor terganggu, nilai diganti "DHT ERR" / "MQ ERR".
//
// display::loop() mengecek modul lewat I2C tiap config::kLcdProbeIntervalMs dan
// menginisialisasi ulang saat modul kembali menjawab.
#pragma once

#include <stdint.h>

#include "air_status.h"

namespace display {

struct View {
  bool warmingUp;
  uint32_t warmupRemainingMs;
  uint8_t warmupPercent;
  bool climateValid;
  float temperature;
  float humidity;
  bool gasValid;
  int ppm;
  bool statusKnown;
  air::Status status;
  bool online;
  uint8_t fault;  // bitmask fault.h
};

void begin();
void loop();
void render(const View& v);

// Modul LCD tidak menjawab I2C (termasuk tidak ada sejak boot).
bool faulted();

}  // namespace display
