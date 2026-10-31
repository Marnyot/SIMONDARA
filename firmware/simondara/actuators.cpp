#include "actuators.h"

#include <Arduino.h>

#include "config.h"
#include "log.h"

namespace actuators {

namespace {

struct Pin {
  uint8_t gpio;
  bool activeLow;
};

constexpr Pin kGreen = {config::kPinLedGreen, config::LED_GREEN_ACTIVE_LOW};
constexpr Pin kYellow = {config::kPinLedYellow, config::LED_YELLOW_ACTIVE_LOW};
constexpr Pin kRed = {config::kPinLedRed, config::LED_RED_ACTIVE_LOW};
constexpr Pin kBuzzer = {config::kPinBuzzer, config::BUZZER_ACTIVE_LOW};
constexpr Pin kRelay = {config::kPinRelay, config::RELAY_ACTIVE_LOW};

air::Outputs current = {false, air::kLedOff, false};

void write(const Pin& pin, bool on) { digitalWrite(pin.gpio, on != pin.activeLow ? HIGH : LOW); }

void initOff(const Pin& pin) {
  write(pin, false);  // latch level aman dulu agar tidak ada glitch saat pinMode
  pinMode(pin.gpio, OUTPUT);
  write(pin, false);
}

void writeLed(air::Led led) {
  write(kGreen, led == air::kLedGreen);
  write(kYellow, led == air::kLedYellow);
  write(kRed, led == air::kLedRed);
}

}  // namespace

void begin() {
  initOff(kGreen);
  initOff(kYellow);
  initOff(kRed);
  initOff(kBuzzer);
  initOff(kRelay);
  current = {false, air::kLedOff, false};
}

void apply(const air::Outputs& out) {
  if (out.fan != current.fan) {
    write(kRelay, out.fan);
    LOGF("act", "kipas %s", out.fan ? "NYALA" : "mati");
  }
  if (out.led != current.led) writeLed(out.led);
  if (out.buzzer != current.buzzer) {
    write(kBuzzer, out.buzzer);
    LOGF("act", "buzzer %s", out.buzzer ? "NYALA" : "mati");
  }
  current = out;
}

}  // namespace actuators
