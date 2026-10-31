// Pembacaan DHT11 (suhu, kelembapan) dan MQ-135 (estimasi ppm setara CO2).
//
// Semua fungsi non-blocking: sensors::loop() dipanggil di setiap iterasi loop()
// dan melakukan sampling sesuai interval di config.h.
#pragma once

#include <stdint.h>

namespace sensors {

struct Climate {
  bool valid;
  float temperature;
  float humidity;
};

struct Gas {
  bool ready;  // false selama pemanasan
  bool valid;  // ready dan tegangan sensor masuk akal
  int ppm;
  float rsKOhm;
};

void begin();
void loop();

Climate climate();
Gas gas();

// Pemanasan MQ-135.
bool warmedUp();
uint32_t warmupRemainingMs();
uint8_t warmupPercent();

// Kalibrasi R0: rata-rata R0 di udara bersih (420 ppm) selama
// config::kCalibrationDurationMs, hasil dicetak ke Serial.
void startCalibration();
bool calibrating();

}  // namespace sensors
