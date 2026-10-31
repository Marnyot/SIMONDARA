// Test host untuk logika status & histeresis (firmware/simondara/air_status.*).
// Jalankan: make -C firmware test
#include <cstdio>

#include "air_status.h"

using namespace air;

static int failures = 0;
static int checks = 0;

#define CHECK(cond)                                                  \
  do {                                                               \
    ++checks;                                                        \
    if (!(cond)) {                                                   \
      ++failures;                                                    \
      std::printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond);    \
    }                                                                \
  } while (0)

static Readings reading(float t, float h, int ppm) { return {true, t, h, true, ppm}; }

static void testClassifyTemperature() {
  CHECK(classifyTemperature(17.9f) == kWarning);
  CHECK(classifyTemperature(18.0f) == kSafe);
  CHECK(classifyTemperature(30.0f) == kSafe);
  CHECK(classifyTemperature(30.1f) == kWarning);
  CHECK(classifyTemperature(33.0f) == kWarning);
  CHECK(classifyTemperature(33.1f) == kDanger);
}

static void testClassifyHumidity() {
  CHECK(classifyHumidity(29.9f) == kDanger);
  CHECK(classifyHumidity(30.0f) == kWarning);
  CHECK(classifyHumidity(39.9f) == kWarning);
  CHECK(classifyHumidity(40.0f) == kSafe);
  CHECK(classifyHumidity(60.0f) == kSafe);
  CHECK(classifyHumidity(60.1f) == kWarning);
  CHECK(classifyHumidity(70.0f) == kWarning);
  CHECK(classifyHumidity(70.1f) == kDanger);
}

static void testClassifyGas() {
  CHECK(classifyGas(420) == kSafe);
  CHECK(classifyGas(1000) == kSafe);
  CHECK(classifyGas(1001) == kWarning);
  CHECK(classifyGas(2000) == kWarning);
  CHECK(classifyGas(2001) == kDanger);
}

static void testWorstParameterWins() {
  Status s;
  CHECK(worstStatus(reading(25, 50, 500), &s) && s == kSafe);
  CHECK(worstStatus(reading(31, 50, 500), &s) && s == kWarning);
  CHECK(worstStatus(reading(25, 75, 1500), &s) && s == kDanger);
  CHECK(worstStatus(reading(25, 50, 2500), &s) && s == kDanger);

  // Parameter tidak valid diabaikan.
  CHECK(worstStatus({false, 40, 10, true, 500}, &s) && s == kSafe);
  CHECK(worstStatus({true, 34, 50, false, 5000}, &s) && s == kDanger);
  CHECK(!worstStatus({false, 0, 0, false, 0}, &s));
}

static void testGasHysteresis() {
  bool latch = false;
  latch = nextGasFanLatch(latch, 1000);
  CHECK(!latch);
  latch = nextGasFanLatch(latch, 1001);
  CHECK(latch);
  latch = nextGasFanLatch(latch, 950);
  CHECK(latch);
  latch = nextGasFanLatch(latch, 900);
  CHECK(latch);
  latch = nextGasFanLatch(latch, 899);
  CHECK(!latch);
  latch = nextGasFanLatch(latch, 950);
  CHECK(!latch);
}

static void testAutoOutputs() {
  ControlState s;
  CHECK(s.out.led == kLedOff && !s.out.fan && !s.out.buzzer);  // sebelum evaluasi pertama

  evaluate(s, reading(25, 50, 500));
  CHECK(s.status == kSafe && s.out.led == kLedGreen && !s.out.fan && !s.out.buzzer);

  evaluate(s, reading(25, 50, 1500));
  CHECK(s.status == kWarning && s.out.led == kLedYellow && s.out.fan && !s.out.buzzer);

  // Gas turun ke pita histeresis: status Aman, kipas tetap nyala.
  evaluate(s, reading(25, 50, 950));
  CHECK(s.status == kSafe && s.out.led == kLedGreen && s.out.fan);

  evaluate(s, reading(25, 50, 850));
  CHECK(s.status == kSafe && !s.out.fan);

  evaluate(s, reading(34, 50, 500));
  CHECK(s.status == kDanger && s.out.led == kLedRed && s.out.fan && s.out.buzzer);

  // Waspada: kipas tidak diubah (tetap nyala dari Bahaya).
  evaluate(s, reading(31, 50, 500));
  CHECK(s.status == kWarning && s.out.fan && !s.out.buzzer);

  evaluate(s, reading(25, 50, 500));
  CHECK(s.status == kSafe && !s.out.fan);

  // Waspada dari Aman: kipas tetap mati.
  evaluate(s, reading(31, 50, 500));
  CHECK(s.status == kWarning && !s.out.fan);
}

static void testMute() {
  ControlState s;
  evaluate(s, reading(25, 50, 2500));
  CHECK(s.out.buzzer);

  Command mute;
  mute.mute = 1;
  CHECK(!applyCommand(s, mute));
  CHECK(s.mute && !s.out.buzzer && s.out.fan);

  evaluate(s, reading(25, 50, 1500));
  CHECK(s.mute);  // belum Aman, mute bertahan

  evaluate(s, reading(25, 50, 2500));
  CHECK(!s.out.buzzer);

  evaluate(s, reading(25, 50, 500));
  CHECK(s.status == kSafe && !s.mute);  // reset saat kembali Aman

  evaluate(s, reading(25, 50, 2500));
  CHECK(s.out.buzzer);
}

static void testMuteResetIsPerMode() {
  ControlState s;
  Command manual;
  manual.mode = kManual;
  manual.mute = 1;
  applyCommand(s, manual);
  evaluate(s, reading(34, 50, 500));
  CHECK(s.mute);
  evaluate(s, reading(25, 50, 500));
  CHECK(!s.mute);  // reset juga berlaku di mode manual
}

static void testCommands() {
  ControlState s;
  evaluate(s, reading(25, 50, 500));

  // Mode otomatis: aktuator dari cmd diabaikan.
  Command fanOn;
  fanOn.fan = 1;
  CHECK(applyCommand(s, fanOn));
  CHECK(!s.out.fan);

  // Mode + aktuator sekaligus: mode diproses dulu.
  Command manualFan;
  manualFan.mode = kManual;
  manualFan.fan = 1;
  CHECK(!applyCommand(s, manualFan));
  CHECK(s.mode == kManual && s.out.fan && s.out.led == kLedGreen);

  Command led;
  led.led = kLedRed;
  led.buzzer = 1;
  applyCommand(s, led);
  CHECK(s.out.led == kLedRed && s.out.buzzer && s.out.fan);

  // Evaluasi pada mode manual tidak mengubah aktuator.
  evaluate(s, reading(25, 50, 2500));
  CHECK(s.status == kDanger && s.out.led == kLedRed && s.out.fan);
  evaluate(s, reading(25, 50, 500));
  CHECK(s.status == kSafe && s.out.fan && s.out.buzzer);

  // Kembali otomatis: keluaran dihitung ulang dari status.
  Command autoMode;
  autoMode.mode = kAuto;
  applyCommand(s, autoMode);
  CHECK(s.mode == kAuto && !s.out.fan && s.out.led == kLedGreen && !s.out.buzzer);
}

static void testAutoBeforeEvaluation() {
  ControlState s;
  Command c;
  c.mode = kAuto;
  c.mute = 1;
  applyCommand(s, c);
  CHECK(!s.evaluated && s.out.led == kLedOff && !s.out.fan && !s.out.buzzer);
}

static void testValidField() {
  CHECK(validField(0, 1) == 0);
  CHECK(validField(1, 1) == 1);
  CHECK(validField(2, 1) == kAbsent);
  CHECK(validField(-1, 3) == kAbsent);
  CHECK(validField(3, 3) == 3);
  CHECK(validField(4, 3) == kAbsent);
}

int main() {
  testClassifyTemperature();
  testClassifyHumidity();
  testClassifyGas();
  testWorstParameterWins();
  testGasHysteresis();
  testAutoOutputs();
  testMute();
  testMuteResetIsPerMode();
  testCommands();
  testAutoBeforeEvaluation();
  testValidField();

  std::printf("%d/%d checks passed\n", checks - failures, checks);
  return failures == 0 ? 0 : 1;
}
