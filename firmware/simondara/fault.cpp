#include "fault.h"

#include <math.h>

#include "config.h"

namespace fault {

DhtRead classifyDht(float celsius, float humidity) {
  if (isnan(celsius) || isnan(humidity)) return DhtRead::kFailed;
  const bool inRange = celsius >= config::kTempMinValid && celsius <= config::kTempMaxValid && humidity >= 0.0f &&
                       humidity <= 100.0f;
  return inRange ? DhtRead::kOk : DhtRead::kOutOfRange;
}

void recordDht(DhtHealth& health, DhtRead read) {
  if (read == DhtRead::kOk) {
    health = DhtHealth{};
    return;
  }
  if (health.failures < config::kDhtMaxFailures) ++health.failures;
  if (read == DhtRead::kOutOfRange) health.outOfRange = true;
}

bool dhtFaulted(const DhtHealth& health) {
  return health.outOfRange || health.failures >= config::kDhtMaxFailures;
}

float mq135Volts(float adc) { return adc / 1023.0f * config::kAdcFullScaleV * config::kMq135DividerFactor; }

bool mq135OutOfRange(float adc) {
  return adc < config::kMq135AdcMinValid || adc >= config::kMq135AdcRailMin || !isfinite(adc);
}

void recordMq135(Mq135Health& health, bool outOfRange) {
  health.outOfRange = outOfRange;
}

bool mq135Faulted(const Mq135Health& health, bool warm, bool calibrating) {
  return health.outOfRange && warm && !calibrating;
}

LcdChange lcdChange(bool wasResponding, bool responding) {
  if (wasResponding == responding) return LcdChange::kNone;
  return responding ? LcdChange::kRecovered : LcdChange::kLost;
}

uint8_t compose(bool dht, bool mq135, bool lcd) {
  return static_cast<uint8_t>((dht ? kDht : 0) | (mq135 ? kMq135 : 0) | (lcd ? kLcd : 0));
}

const char* label(uint8_t bit) {
  switch (bit) {
    case kDht:
      return "DHT11";
    case kMq135:
      return "MQ-135";
    case kLcd:
      return "LCD";
  }
  return "?";
}

}  // namespace fault
