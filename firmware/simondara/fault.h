// Penentu gangguan perangkat keras: field `fault` di payload state (docs/CONTRACT.md).
//
// Modul ini murni (tanpa Arduino) agar dapat diuji di host: lihat firmware/test.
//
// Aturan:
// - DHT11: gagal baca >= kDhtMaxFailures beruntun, atau nilai di luar rentang valid.
//   Pulih hanya setelah ada pembacaan valid.
// - MQ-135: rata-rata ADC < kMq135AdcMinValid (sensor lepas), >= kMq135AdcRailMin
//   (mentok), atau tegangan AO >= VCC (pembagi bermasalah). Berubah hanya setelah
//   kondisi bertahan kMq135FaultConfirmSamples sampel beruntun, dan tidak dilaporkan
//   selama pemanasan/kalibrasi.
// - LCD: modul I2C tidak menjawab probe, termasuk bila tidak ada sejak boot.
#pragma once

#include <stdint.h>

namespace fault {

constexpr uint8_t kDht = 1;
constexpr uint8_t kMq135 = 2;
constexpr uint8_t kLcd = 4;

enum class DhtRead : uint8_t { kOk, kFailed, kOutOfRange };

struct DhtHealth {
  uint8_t failures = 0;
  bool outOfRange = false;
};

struct Mq135Health {
  bool outOfRange = false;  // nilai yang sudah terkonfirmasi (debounce)
  uint8_t streak = 0;       // sampel beruntun yang berbeda dari outOfRange
};

enum class LcdChange : uint8_t { kNone, kLost, kRecovered };

DhtRead classifyDht(float celsius, float humidity);
void recordDht(DhtHealth& health, DhtRead read);
bool dhtFaulted(const DhtHealth& health);

// Tegangan pin AO modul dari rata-rata ADC (sebelum pembagi eksternal).
float mq135Volts(float adc);
// Satu sampel rata-rata ADC tidak dapat dipakai untuk menghitung Rs.
bool mq135OutOfRange(float adc);
void recordMq135(Mq135Health& health, bool outOfRange);
bool mq135Faulted(const Mq135Health& health, bool warm, bool calibrating);

LcdChange lcdChange(bool wasResponding, bool responding);

uint8_t compose(bool dht, bool mq135, bool lcd);

// Nama komponen satu bit fault untuk log.
const char* label(uint8_t bit);

}  // namespace fault
