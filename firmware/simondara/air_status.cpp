#include "air_status.h"

#include "config.h"

namespace air {

namespace {

Status worse(Status a, Status b) { return a > b ? a : b; }

}  // namespace

Status classifyTemperature(float celsius) {
  if (celsius > config::kTempWarnMax) return kDanger;
  if (celsius > config::kTempSafeMax || celsius < config::kTempSafeMin) return kWarning;
  return kSafe;
}

Status classifyHumidity(float percent) {
  if (percent < config::kHumDangerBelow || percent > config::kHumWarnMax) return kDanger;
  if (percent < config::kHumSafeMin || percent > config::kHumSafeMax) return kWarning;
  return kSafe;
}

Status classifyGas(int ppm) {
  if (ppm > config::kGasWarnMax) return kDanger;
  if (ppm > config::kGasSafeMax) return kWarning;
  return kSafe;
}

bool worstStatus(const Readings& r, Status* out) {
  if (!r.climateValid && !r.gasValid) return false;
  Status s = kSafe;
  if (r.climateValid) {
    s = worse(s, classifyTemperature(r.temperature));
    s = worse(s, classifyHumidity(r.humidity));
  }
  if (r.gasValid) s = worse(s, classifyGas(r.ppm));
  *out = s;
  return true;
}

bool nextGasFanLatch(bool latch, int ppm) {
  if (ppm > config::kGasFanOnAbove) return true;
  if (ppm < config::kGasFanOffBelow) return false;
  return latch;
}

void evaluate(ControlState& s, const Readings& r) {
  Status next;
  if (!worstStatus(r, &next)) return;

  if (s.evaluated && s.status != kSafe && next == kSafe) s.mute = false;
  s.status = next;
  s.evaluated = true;
  if (r.gasValid) s.gasFanLatch = nextGasFanLatch(s.gasFanLatch, r.ppm);

  refreshAutoOutputs(s);
}

void refreshAutoOutputs(ControlState& s) {
  if (s.mode != kAuto || !s.evaluated) return;

  switch (s.status) {
    case kSafe:
      s.out = {s.gasFanLatch, kLedGreen, false};
      break;
    case kWarning:
      s.out = {s.gasFanLatch || s.out.fan, kLedYellow, false};
      break;
    case kDanger:
      s.out = {true, kLedRed, !s.mute};
      break;
  }
}

bool applyCommand(ControlState& s, const Command& c) {
  if (c.mode != kAbsent) s.mode = c.mode == kManual ? kManual : kAuto;
  if (c.mute != kAbsent) s.mute = c.mute != 0;

  const bool hasActuator = c.fan != kAbsent || c.led != kAbsent || c.buzzer != kAbsent;
  if (s.mode == kAuto) {
    refreshAutoOutputs(s);
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
    case kSafe:
      return "Aman";
    case kWarning:
      return "Waspada";
    case kDanger:
      return "Bahaya";
  }
  return "?";
}

}  // namespace air
