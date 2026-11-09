// Penentu gangguan perangkat keras: field `fault` di payload state (docs/CONTRACT.md).
//
// Modul ini murni (tanpa Arduino) agar dapat diuji di host: lihat firmware/test.
//
// DHT: >=3 kegagalan beruntun atau nilai di luar rentang (kontrak cloud).
// MQ135: ADC di luar [2,1015), dilaporkan setelah pemanasan/di luar kalibrasi.
// LCD: tidak menjawab probe I2C berkala.
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
  bool outOfRange = false;  // hasil ADC terakhir
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
