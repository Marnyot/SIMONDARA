// Logika status kualitas udara dan aturan aktuator SIMONDARA.
//
// Modul ini murni (tanpa Arduino) agar dapat diuji di host: lihat firmware/test.
//
// Aturan (README "Logika Penentuan Status" + docs/CONTRACT.md):
// - Status = parameter terburuk di antara parameter yang valid.
// - Histeresis kipas gas: latch nyala bila ppm > 1000, padam bila ppm < 900.
// - Mode otomatis:
//     Aman    -> LED hijau, buzzer mati, kipas mati (kecuali latch gas masih nyala,
//                yaitu ppm turun ke 900..1000 setelah sempat > 1000)
//     Waspada -> LED kuning, buzzer mati, kipas tidak diubah (nyala bila latch gas)
//     Bahaya  -> LED merah, kipas nyala, buzzer nyala kecuali dibisukan
//   Mute direset otomatis saat status kembali Aman.
// - Mode manual: aktuator mengikuti cmd terakhir; status tetap dihitung.
// - cmd: mode & mute selalu diterima; fan/led/buzzer hanya pada mode manual
//   (diproses setelah mode, sehingga {"mode":1,"fan":1} langsung berlaku).
#pragma once

#include <stdint.h>

namespace air {

enum Status : uint8_t { kSafe = 0, kWarning = 1, kDanger = 2 };
enum Led : uint8_t { kLedOff = 0, kLedGreen = 1, kLedYellow = 2, kLedRed = 3 };
enum Mode : uint8_t { kAuto = 0, kManual = 1 };

struct Readings {
  bool climateValid;  // suhu & kelembapan (DHT11)
  float temperature;  // degC
  float humidity;     // % RH
  bool gasValid;      // MQ-135 (sudah pemanasan dan pembacaan masuk akal)
  int ppm;
};

struct Outputs {
  bool fan;
  Led led;
  bool buzzer;
};

struct ControlState {
  Mode mode = kAuto;
  bool mute = false;
  Status status = kSafe;
  bool evaluated = false;  // false selama pemanasan / belum ada data valid
  bool gasFanLatch = false;
  Outputs out = {false, kLedOff, false};
};

// Nilai field cmd yang tidak ada / tidak valid adalah kAbsent.
constexpr int8_t kAbsent = -1;

struct Command {
  int8_t mode = kAbsent;
  int8_t fan = kAbsent;
  int8_t led = kAbsent;
  int8_t buzzer = kAbsent;
  int8_t mute = kAbsent;
};

Status classifyTemperature(float celsius);
Status classifyHumidity(float percent);
Status classifyGas(int ppm);

// Status terburuk dari parameter valid. Mengembalikan false bila tidak ada
// parameter valid (status tidak diubah).
bool worstStatus(const Readings& r, Status* out);

// Histeresis kipas gas (1000/900 ppm).
bool nextGasFanLatch(bool latch, int ppm);

// Hitung status + histeresis dari pembacaan baru lalu perbarui keluaran otomatis.
void evaluate(ControlState& s, const Readings& r);

// Hitung ulang keluaran mode otomatis dari status saat ini (mis. setelah mute).
// Tidak melakukan apa-apa pada mode manual atau sebelum status pertama.
void refreshAutoOutputs(ControlState& s);

// Terapkan cmd yang sudah divalidasi. Mengembalikan true bila ada field
// aktuator yang diabaikan karena mode otomatis.
bool applyCommand(ControlState& s, const Command& c);

// Validasi nilai cmd mentah: kembalikan nilai bila dalam [0, max], selain itu kAbsent.
int8_t validField(long value, int8_t max);

const char* statusLabel(Status s);

}  // namespace air
