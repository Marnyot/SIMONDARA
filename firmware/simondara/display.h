// LCD 16x2 I2C. Hanya baris yang berubah yang ditulis ulang.
//
// Tata letak normal (16 kolom):
//   "Suhu:29.4 Lb:62%"
//   "Gas:820 Aman   x"   x = penanda offline di kolom 16
// LCD 16 kolom tidak muat "Suhu:29.4C Lb:62%" (17 karakter), jadi satuan C
// dihilangkan. Bila sensor tidak valid, nilai diganti pesan error.
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
};

void begin();
void render(const View& v);

}  // namespace display
