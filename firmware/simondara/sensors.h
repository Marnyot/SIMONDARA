#pragma once
#include <stdint.h>
namespace sensors {
struct Climate {
  bool valid; // data terbaru valid untuk telemetri; nilai lama tetap disimpan
  float temperature;
  float humidity;
  bool failed;
};
struct Gas {
  bool ready;
  bool valid;
  float ppm; // tanpa pembulatan/pembatasan untuk status lokal
  float rsKOhm;
  float adc;
  float r0KOhm;
};
void begin();
void loop();
Climate climate();
Gas gas();
bool dhtFault();
bool gasFault();
bool warmedUp();
void skipWarmup();
void startCalibration();
bool calibrating();
void clearCalibration();
void printCalibration();
void togglePlotter();
bool plotting();
} // namespace sensors
