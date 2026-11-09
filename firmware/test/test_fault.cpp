// Test host untuk penentu gangguan perangkat keras (firmware/simondara/fault.*).
// Jalankan: make -C firmware test
#include <cmath>
#include <cstdio>

#include "config.h"
#include "fault.h"

using namespace fault;

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

static void testClassifyDht() {
  CHECK(classifyDht(25, 50) == DhtRead::kOk);
  CHECK(classifyDht(config::kTempMinValid, 0) == DhtRead::kOk);
  CHECK(classifyDht(config::kTempMaxValid, 100) == DhtRead::kOk);
  CHECK(classifyDht(NAN, 50) == DhtRead::kFailed);
  CHECK(classifyDht(25, NAN) == DhtRead::kFailed);
  CHECK(classifyDht(config::kTempMaxValid + 1, 50) == DhtRead::kOutOfRange);
  CHECK(classifyDht(config::kTempMinValid - 1, 50) == DhtRead::kOutOfRange);
  CHECK(classifyDht(25, 101) == DhtRead::kOutOfRange);
}

static void testDhtFailuresInARow() {
  DhtHealth h;
  CHECK(!dhtFaulted(h));  // boot: belum gagal bukan gangguan

  for (uint8_t i = 1; i < config::kDhtMaxFailures; ++i) {
    recordDht(h, DhtRead::kFailed);
    CHECK(!dhtFaulted(h));
  }
  recordDht(h, DhtRead::kOk);  // gagal sesekali tidak terakumulasi
  for (uint8_t i = 1; i < config::kDhtMaxFailures; ++i) recordDht(h, DhtRead::kFailed);
  CHECK(!dhtFaulted(h));

  recordDht(h, DhtRead::kFailed);
  CHECK(dhtFaulted(h));
  recordDht(h, DhtRead::kFailed);  // jenuh, tidak overflow
  CHECK(dhtFaulted(h));

  recordDht(h, DhtRead::kOk);
  CHECK(!dhtFaulted(h));
}

static void testDhtOutOfRangeIsImmediate() {
  DhtHealth h;
  recordDht(h, DhtRead::kOutOfRange);
  CHECK(dhtFaulted(h));
  recordDht(h, DhtRead::kFailed);  // tidak pulih tanpa pembacaan valid
  CHECK(dhtFaulted(h));
  recordDht(h, DhtRead::kOk);
  CHECK(!dhtFaulted(h));
}

// Nilai dari alat tim: RL 1 kOhm, pembagi 2.0, ADC udara bersih ~8.6-10.
static void testMq135AdcRange() {
  CHECK(!mq135OutOfRange(9));
  CHECK(!mq135OutOfRange(8.6f));
  CHECK(!mq135OutOfRange(config::kMq135AdcMinValid));
  CHECK(mq135OutOfRange(1));
  CHECK(mq135OutOfRange(0));
  CHECK(mq135OutOfRange(1020));
  CHECK(mq135OutOfRange(config::kMq135AdcRailMin));

  // Sketch membatasi tegangan sebelum hitung Rs, tetapi ADC <1015 tetap valid.
  CHECK(!mq135OutOfRange(900));
  CHECK(!mq135OutOfRange(1014.99f));
  CHECK(mq135OutOfRange(NAN));
}
static void testMq135RangeChanges() {
  Mq135Health h;
  recordMq135(h, mq135OutOfRange(1));
  CHECK(h.outOfRange);
  recordMq135(h, mq135OutOfRange(9));
  CHECK(!h.outOfRange);
  recordMq135(h, mq135OutOfRange(1015));
  CHECK(h.outOfRange);
}

static void testMq135NotDuringWarmupOrCalibration() {
  Mq135Health bad;
  bad.outOfRange = true;
  CHECK(mq135Faulted(bad, true, false));
  CHECK(!mq135Faulted(bad, false, false));
  CHECK(!mq135Faulted(bad, true, true));
  CHECK(!mq135Faulted(Mq135Health{}, true, false));
}

static void testLcdChange() {
  CHECK(lcdChange(true, true) == LcdChange::kNone);
  CHECK(lcdChange(false, false) == LcdChange::kNone);  // tidak ada sejak boot tetap gangguan
  CHECK(lcdChange(true, false) == LcdChange::kLost);
  CHECK(lcdChange(false, true) == LcdChange::kRecovered);
}

static void testComposeMatchesContract() {
  CHECK(compose(false, false, false) == 0);
  CHECK(compose(true, false, false) == 1);
  CHECK(compose(false, true, false) == 2);
  CHECK(compose(false, false, true) == 4);
  CHECK(compose(true, true, true) == 7);
}

int main() {
  testClassifyDht();
  testDhtFailuresInARow();
  testDhtOutOfRangeIsImmediate();
  testMq135AdcRange();
  testMq135RangeChanges();
  testMq135NotDuringWarmupOrCalibration();
  testLcdChange();
  testComposeMatchesContract();

  std::printf("%d/%d checks passed\n", checks - failures, checks);
  return failures == 0 ? 0 : 1;
}
