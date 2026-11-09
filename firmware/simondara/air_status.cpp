#include "air_status.h"
#include <math.h>
#include "config.h"
namespace air {
namespace {
Status worse(Status a, Status b) { return a > b ? a : b; }
}
Status classifyTemperature(float t, float m) {
  if (t > config::kTempWarnMax - m) return kDanger;
  if (t < config::kTempSafeMin + m || t > config::kTempSafeMax - m) return kWarning;
  return kSafe;
}
Status classifyHumidity(float h, float m) {
  if (h < config::kHumDangerBelow + m || h > config::kHumWarnMax - m) return kDanger;
  if (h < config::kHumSafeMin + m || h > config::kHumSafeMax - m) return kWarning;
  return kSafe;
}
Status classifyGas(float p, float m) {
  if (p > config::kGasWarnMax - m) return kDanger;
  if (p > config::kGasSafeMax - m) return kWarning;
  return kSafe;
}
Status hysteresis(Status previous, Status raw, Status strict) {
  if (raw >= previous) return raw;
  return strict < previous ? strict : previous;
}
bool worstStatus(const Readings& r, Status* out) {
  *out = kSafe;
  if (r.climateValid) *out = worse(classifyTemperature(r.temperature), classifyHumidity(r.humidity));
  if (r.gasValid) *out = worse(*out, classifyGas(r.ppm));
  return true; // sensor invalid = AMAN, seperti sketch
}
bool nextAutoFan(bool previous, Status status) {
  return status == kDanger || (status == kWarning && previous);
}
bool autoBuzzer(Status status, bool mute, uint32_t elapsedMs) {
  return status == kDanger && !mute && elapsedMs % config::kBeepPeriodMs < config::kBeepDurationMs;
}
void evaluate(ControlState& s, const Readings& r, uint32_t now) {
  s.temperatureStatus = !r.climateValid || isnan(r.temperature) ? kSafe :
      hysteresis(s.temperatureStatus, classifyTemperature(r.temperature), classifyTemperature(r.temperature, config::kTempMargin));
  s.humidityStatus = !r.climateValid || isnan(r.humidity) ? kSafe :
      hysteresis(s.humidityStatus, classifyHumidity(r.humidity), classifyHumidity(r.humidity, config::kHumMargin));
  s.gasStatus = !r.gasValid ? kSafe :
      hysteresis(s.gasStatus, classifyGas(r.ppm), classifyGas(r.ppm, config::kGasMargin));
  const Status next = worse(worse(s.temperatureStatus, s.humidityStatus), s.gasStatus);
  if (next != s.status) {
    if (next == kDanger) s.beepStartMs = now;
    // Perbedaan sengaja dari sketch: mute cloud berakhir saat kembali AMAN.
    if (next == kSafe) s.mute = false;
  }
  s.status = next;
  s.evaluated = true;
  refreshAutoOutputs(s, now);
}
void refreshAutoOutputs(ControlState& s, uint32_t now) {
  if (s.mode != kAuto) return;
  s.autoFan = nextAutoFan(s.autoFan, s.status);
  s.out = {s.autoFan, static_cast<Led>(s.status + 1), autoBuzzer(s.status, s.mute, now - s.beepStartMs)};
}
bool applyCommand(ControlState& s, const Command& c, uint32_t now) {
  if (c.mode != kAbsent) {
    const Mode next = c.mode == kManual ? kManual : kAuto;
    if (next == kManual && s.mode != kManual) s.out.buzzer = false;
    if (next == kAuto) {
      s.autoFan = s.status == kDanger;
      s.beepStartMs = now;
    }
    s.mode = next;
  }
  if (c.mute != kAbsent) s.mute = c.mute != 0;
  const bool hasActuator = c.fan != kAbsent || c.led != kAbsent || c.buzzer != kAbsent;
  if (s.mode == kAuto) {
    refreshAutoOutputs(s, now);
    return hasActuator;
  }
  if (c.fan != kAbsent) s.out.fan = c.fan != 0;
  if (c.led != kAbsent) s.out.led = static_cast<Led>(c.led);
  if (c.buzzer != kAbsent) s.out.buzzer = c.buzzer != 0;
  return false;
}
int8_t validField(long value, int8_t max) {
  return value >= 0 && value <= max ? static_cast<int8_t>(value) : kAbsent;
}
const char* statusLabel(Status s) {
  switch (s) {
    case kSafe: return "AMAN";
    case kWarning: return "WASPADA";
    case kDanger: return "BAHAYA";
  }
  return "?";
}
} // namespace air
