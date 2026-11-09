// Logika lokal sketch v2, murni dan dapat dites tanpa Arduino.
#pragma once
#include <stdint.h>
namespace air {
enum Status : uint8_t { kSafe = 0, kWarning = 1, kDanger = 2 };
enum Led : uint8_t { kLedOff = 0, kLedGreen = 1, kLedYellow = 2, kLedRed = 3 };
enum Mode : uint8_t { kAuto = 0, kManual = 1 };
struct Readings {
  bool climateValid;
  float temperature;
  float humidity;
  bool gasValid;
  float ppm;
};
struct Outputs { bool fan; Led led; bool buzzer; };
struct ControlState {
  Mode mode = kAuto;
  bool mute = false;
  Status status = kSafe;
  bool evaluated = false;
  Status temperatureStatus = kSafe;
  Status humidityStatus = kSafe;
  Status gasStatus = kSafe;
  bool autoFan = false;
  uint32_t beepStartMs = 0;
  Outputs out = {false, kLedOff, false};
};
constexpr int8_t kAbsent = -1;
struct Command {
  int8_t mode = kAbsent;
  int8_t fan = kAbsent;
  int8_t led = kAbsent;
  int8_t buzzer = kAbsent;
  int8_t mute = kAbsent;
};
Status classifyTemperature(float value, float margin = 0);
Status classifyHumidity(float value, float margin = 0);
Status classifyGas(float value, float margin = 0);
Status hysteresis(Status previous, Status raw, Status strict);
bool worstStatus(const Readings& r, Status* out);
bool nextAutoFan(bool previous, Status status);
bool autoBuzzer(Status status, bool mute, uint32_t elapsedMs);
void evaluate(ControlState& s, const Readings& r, uint32_t now = 0);
void refreshAutoOutputs(ControlState& s, uint32_t now = 0);
bool applyCommand(ControlState& s, const Command& c, uint32_t now = 0);
int8_t validField(long value, int8_t max);
const char* statusLabel(Status s);
} // namespace air
