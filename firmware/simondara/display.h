#pragma once
#include <stdint.h>
#include "air_status.h"
namespace display {
struct View {
  bool warmingUp;
  bool dhtFailed;
  float temperature;
  float humidity;
  bool gasValid;
  float ppm;
  float r0KOhm;
  air::Status status;
};
void begin();
void rescan();
void loop();
void render(const View& v);
bool faulted();
void toggleBacklight();
void message(uint8_t row, const char* text, uint32_t holdMs);
} // namespace display
