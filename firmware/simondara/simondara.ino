// SIMONDARA - firmware NodeMCU ESP8266.
//
// Membaca DHT11 + MQ-135, menentukan status kualitas udara, mengendalikan LED,
// buzzer, dan relay kipas, menampilkan data di LCD, serta bertukar pesan dengan
// backend melalui MQTT (docs/CONTRACT.md). Logika lokal tetap berjalan saat
// Wi-Fi/MQTT terputus. Akuisisi gas memakai burst 64 sampel (~32 ms).

#include <ArduinoJson.h>
#include <math.h>

#include "actuators.h"
#include "air_status.h"
#include "config.h"
#include "display.h"
#include "fault.h"
#include "log.h"
#include "net.h"
#include "sensors.h"

namespace {

constexpr const char* kFirmwareVersion = "1.0.0";

air::ControlState control;
uint8_t activeFault = 0;

struct PublishedState {
  air::Status status;
  bool fan;
  air::Mode mode;
  air::Led led;
  bool buzzer;
  bool mute;
  uint8_t fault;

  bool operator==(const PublishedState& o) const {
    return status == o.status && fan == o.fan && mode == o.mode && led == o.led && buzzer == o.buzzer &&
           mute == o.mute && fault == o.fault;
  }
};

PublishedState lastPublished;
bool statePending = true;  // kirim state saat connect dan saat berubah

uint32_t lastTelemetryMs = 0;
uint32_t lastDisplayMs = 0;
const char* lastTelemetrySkip = nullptr;

uint32_t lastStatusMs = 0;

PublishedState snapshot() {
  return {control.status, control.out.fan, control.mode, control.out.led, control.out.buzzer && !sensors::calibrating(), control.mute, activeFault};
}

air::Readings currentReadings() {
  const sensors::Climate c = sensors::climate();
  const sensors::Gas g = sensors::gas();
  return {!isnan(c.temperature), c.temperature, c.humidity, g.valid, g.ppm};
}

// ---------------------------------------------------------------------------
// Perintah MQTT
// ---------------------------------------------------------------------------

int8_t commandField(JsonObjectConst obj, const char* key, int8_t max) {
  JsonVariantConst v = obj[key];
  if (v.isNull()) return air::kAbsent;
  const int8_t value = v.is<long>() ? air::validField(v.as<long>(), max) : air::kAbsent;
  if (value == air::kAbsent) LOGF("cmd", "field \"%s\" tidak valid, diabaikan", key);
  return value;
}

void onCommand(const char* payload, size_t length) {
  LOGF("cmd", "diterima: %.*s", static_cast<int>(length), payload);

  JsonDocument doc;
  const DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    LOGF("cmd", "JSON tidak valid (%s), diabaikan", err.c_str());
    return;
  }
  if (!doc.is<JsonObjectConst>()) {
    LOGF("cmd", "payload bukan objek JSON, diabaikan");
    return;
  }

  const JsonObjectConst obj = doc.as<JsonObjectConst>();
  air::Command cmd;
  cmd.mode = commandField(obj, "mode", air::kManual);
  cmd.fan = commandField(obj, "fan", 1);
  cmd.led = commandField(obj, "led", air::kLedRed);
  cmd.buzzer = commandField(obj, "buzzer", 1);
  cmd.mute = commandField(obj, "mute", 1);

  const air::Mode previousMode = control.mode;
  if (air::applyCommand(control, cmd, millis())) LOGF("cmd", "fan/led/buzzer diabaikan pada mode otomatis");
  if (control.mode != previousMode) LOGF("cmd", "mode -> %s", control.mode == air::kManual ? "manual" : "otomatis");
  if (cmd.mute != air::kAbsent) {
    LOGF("cmd", "mute -> %u (mode %s, status %s, buzzer %u)", control.mute,
         control.mode == air::kManual ? "manual" : "otomatis",
         control.evaluated ? air::statusLabel(control.status) : "-", control.out.buzzer);
  }
  // Keluaran sudah dihitung ulang di applyCommand; loop() iterasi yang sama
  // (updateControl -> publishStateIfChanged) menerapkan pin dan publish state.
}

void onConnected() { statePending = true; }

// ---------------------------------------------------------------------------
// Kontrol, publikasi, tampilan
// ---------------------------------------------------------------------------

void updateControl() {
  if (!sensors::calibrating()) {
    const air::Status previous = control.status;
    air::evaluate(control, currentReadings(), millis());
    if (control.status != previous && !sensors::plotting()) {
      char trigger[32] = "";
      if (control.status != air::kSafe) {
        if (control.temperatureStatus == control.status) strcat(trigger, "suhu ");
        if (control.humidityStatus == control.status) strcat(trigger, "lembap ");
        if (control.gasStatus == control.status) strcat(trigger, "gas ");
      }
      Serial.printf(">>> STATUS: %s -> %s%s%s\n", air::statusLabel(previous), air::statusLabel(control.status),
                    trigger[0] ? " | pemicu: " : "", trigger);
    }
  }
  air::Outputs physical = control.out;
  if (sensors::calibrating()) physical.buzzer = false;
  actuators::apply(physical);
}

void updateFault() {
  const uint8_t now = fault::compose(sensors::dhtFault(), sensors::gasFault(), display::faulted());
  const uint8_t changed = now ^ activeFault;
  if (changed == 0) return;
  for (const uint8_t bit : {fault::kDht, fault::kMq135, fault::kLcd}) {
    if (changed & bit) LOGF("fault", "%s %s", fault::label(bit), (now & bit) ? "terganggu" : "pulih");
  }
  activeFault = now;
}

void publishTelemetryIfDue(bool force = false);

void publishStateIfChanged() {
  const PublishedState now = snapshot();
  if (!statePending && now == lastPublished) return;
  if (!net::online()) {
    statePending = true;  // kirim ulang begitu tersambung
    return;
  }
  // Status berubah: kirim telemetri terbaru dulu, supaya notifikasi Bahaya/Aman
  // di backend memakai angka saat itu, bukan angka 10 detik sebelumnya.
  if (now.status != lastPublished.status) publishTelemetryIfDue(true);

  char json[96];
  snprintf(json, sizeof json, "{\"status\":%u,\"fan\":%u,\"mode\":%u,\"led\":%u,\"buzzer\":%u,\"mute\":%u,\"fault\":%u}",
           now.status, now.fan, now.mode, now.led, now.buzzer, now.mute, now.fault);
  if (net::publishState(json)) {
    lastPublished = now;
    statePending = false;
    LOGF("mqtt", "state %s", json);
  } else {
    LOGF("mqtt", "publish state gagal");
  }
}

void publishTelemetryIfDue(bool force) {
  const uint32_t now = millis();
  if (!force && now - lastTelemetryMs < config::kTelemetryIntervalMs) return;
  lastTelemetryMs = now;

  const sensors::Climate c = sensors::climate();
  const sensors::Gas g = sensors::gas();
  const char* skip = nullptr;
  if (sensors::calibrating()) {
    skip = "MQ-135 kalibrasi";
  } else if (!g.ready) {
    skip = "MQ-135 pemanasan";
  } else if (!c.valid || !g.valid) {
    skip = "sensor tidak valid";
  } else if (!net::online()) {
    skip = "offline";
  }
  if (skip != lastTelemetrySkip) {
    if (skip != nullptr) LOGF("telemetry", "dilewati: %s", skip);
    lastTelemetrySkip = skip;
  }
  if (skip != nullptr) return;

  char json[96];
  snprintf(json, sizeof json, "{\"t\":%.1f,\"h\":%.1f,\"ppm\":%d,\"ts\":%lu}", c.temperature, c.humidity, static_cast<int>(lroundf(fminf(g.ppm, config::kPpmMax))),
           static_cast<unsigned long>(net::unixTime()));
  if (!net::publishTelemetry(json)) LOGF("telemetry", "publish gagal");
}

void updateDisplay() {
  const uint32_t now = millis();
  if (lastDisplayMs != 0 && now - lastDisplayMs < config::kDisplayIntervalMs) return;
  lastDisplayMs = now;

  const sensors::Climate c = sensors::climate();
  const sensors::Gas g = sensors::gas();
  display::render({!sensors::warmedUp(), c.failed, c.temperature, c.humidity,
                   g.valid, g.ppm, g.r0KOhm, control.status});
}

// ---------------------------------------------------------------------------
// Perintah Serial dan format cetakStatus dari sketch tim.
// ---------------------------------------------------------------------------

void cetakStatus() {
  const auto climate = sensors::climate();
  const auto gas = sensors::gas();
  if (sensors::plotting()) return;

  if (control.mode == air::kManual) Serial.print("[MANUAL] ");
  else            Serial.printf("[OTOMATIS%s] ", control.mute ? ",BISU" : "");

  if (isnan(climate.temperature)) {
    Serial.print("DHT belum terbaca | ");
  } else {
    Serial.printf("Suhu %.1f C (%s) | Lembap %.0f %% (%s)%s | ",
                  climate.temperature, air::statusLabel(control.temperatureStatus), climate.humidity, air::statusLabel(control.humidityStatus),
                  climate.failed ? " [data lama]" : "");
  }

  Serial.printf("ADC %.2f | ", gas.adc);

  if (!gas.ready)               Serial.print("Gas: pemanasan | ");
  else if (gas.r0KOhm <= 0)         Serial.print("Gas: belum kalibrasi (k) | ");
  else if (!gas.valid)          Serial.print("Gas: sinyal tidak valid | ");
  else if (gas.ppm > 5000.0)
    Serial.printf("Gas >%.0f ppm (%s) | ", 5000.0, air::statusLabel(control.gasStatus));
  else
    Serial.printf("Gas %.0f ppm (%s) | ", gas.ppm, air::statusLabel(control.gasStatus));

  const char* infoBuzzer;
  if (control.mode == air::kManual)                                    infoBuzzer = control.out.buzzer ? "ON" : "OFF";
  else if (control.status == air::kDanger && control.mute)             infoBuzzer = "BISU";
  else if (control.status == air::kDanger)                     infoBuzzer = "BIP";
  else                                               infoBuzzer = "OFF";

  Serial.printf("STATUS %s | Kipas %s | Buzzer %s\n",
                air::statusLabel(control.status), control.out.fan ? "ON" : "OFF", infoBuzzer);

  if (!(control.mode == air::kManual) && control.out.fan && control.status == air::kWarning) {
    Serial.println("  Kipas tetap ON sampai status kembali AMAN.");
  }
  if (gas.adc >= 0 && gas.adc < config::kMq135AdcMinValid) Serial.println("  Sinyal MQ135 hampir nol. Cek catu dan AO.");
  if (gas.adc >= config::kMq135AdcRailMin)                Serial.println("  ADC mentok. Cek pembagi tegangan.");
}

void tampilkanMenu() {
  Serial.println();
  Serial.println("=========== MENU SIMONDARA ===========");
  Serial.println(" a : mode OTOMATIS");
  Serial.println(" n / f : kipas manual ON / OFF");
  Serial.println(" 1 / 0 : buzzer manual ON / OFF");
  Serial.println(" c : ganti LED manual (mati-hijau-kuning-merah)");
  Serial.println(" m : bisu / bunyikan buzzer otomatis");
  Serial.println(" k : kalibrasi MQ135 (udara bersih)");
  Serial.println(" r : info kalibrasi");
  Serial.println(" x : hapus R0 tersimpan");
  Serial.println(" w : lewati pemanasan");
  Serial.println(" p : mode Serial Plotter");
  Serial.println(" s : pindai dan hubungkan LCD");
  Serial.println(" b : backlight LCD");
  Serial.println(" h : menu");
  Serial.println("--------------------------------------");
  Serial.printf(" Suhu   : AMAN %.0f-%.0f C, BAHAYA > %.0f C\n", config::kTempSafeMin, config::kTempSafeMax, config::kTempWarnMax);
  Serial.printf(" Lembap : AMAN %.0f-%.0f %%, BAHAYA < %.0f atau > %.0f %%\n",
                config::kHumSafeMin, config::kHumSafeMax, config::kHumDangerBelow, config::kHumWarnMax);
  Serial.printf(" Gas    : AMAN <= %.0f, BAHAYA > %.0f ppm\n", static_cast<double>(config::kGasSafeMax), static_cast<double>(config::kGasWarnMax));
  Serial.println(" Kipas ON saat BAHAYA, OFF setelah kembali AMAN.");
  Serial.println("======================================");
  Serial.println();
}

void serialCommand(char c) {
  if (c == '\n' || c == '\r' || c == ' ') return;
  if (c >= 'A' && c <= 'Z') c += 'a' - 'A';
  air::Command cmd;
  switch (c) {
    case 'a': cmd.mode = air::kAuto; Serial.println("Mode OTOMATIS."); break;
    case 'n': case 'f': cmd.mode = air::kManual; cmd.fan = c == 'n'; Serial.printf("Kipas manual %s.\n", c == 'n' ? "ON" : "OFF"); break;
    case '1': case '0': cmd.mode = air::kManual; cmd.buzzer = c == '1'; Serial.printf("Buzzer manual %s.\n", c == '1' ? "ON" : "OFF"); break;
    case 'c': {
      cmd.mode = air::kManual; cmd.led = (control.out.led + 1) % 4;
      const char* names[] = {"mati", "hijau", "kuning", "merah"};
      Serial.printf("LED manual: %s%s\n", names[cmd.led], config::kUseLeds ? "" : " (PAKAI_LED = false)"); break;
    }
    case 'm': cmd.mute = !control.mute; Serial.println(cmd.mute ? "Buzzer otomatis dibisukan." : "Buzzer otomatis aktif."); break;
    case 'k': sensors::startCalibration(); return;
    case 'r': sensors::printCalibration(); return;
    case 'x': sensors::clearCalibration(); return;
    case 'w': sensors::skipWarmup(); return;
    case 'p': sensors::togglePlotter(); return;
    case 's': display::rescan(); return;
    case 'b': display::toggleBacklight(); return;
    case 'h': tampilkanMenu(); return;
    default: Serial.println("Perintah tidak dikenal. Ketik h."); return;
  }
  if (cmd.mode == air::kManual && control.mode != air::kManual) Serial.println("Masuk mode MANUAL.");
  air::applyCommand(control, cmd, millis());
}
void handleSerial() {
  while (Serial.available()) serialCommand(static_cast<char>(Serial.read()));
}

}  // namespace

void setup() {
  actuators::begin();  // paling awal: aktuator langsung di level aman
  Serial.begin(115200);
  Serial.println();
  LOGF("boot", "SIMONDARA fw %s, reset: %s", kFirmwareVersion, ESP.getResetReason().c_str());
  LOGF("act", "buzzer mati (%s)", config::BUZZER_OFF_HIGH_Z && config::BUZZER_ACTIVE_LOW ? "high-Z" : "level OFF");

  display::begin();
  sensors::begin();
  net::begin(onCommand, onConnected);
  lastPublished = snapshot();
  tampilkanMenu();
}

void loop() {
  net::loop();
  handleSerial();
  sensors::loop();
  display::loop();
  updateControl();
  updateFault();
  publishStateIfChanged();
  publishTelemetryIfDue();
  updateDisplay();
  if (millis() - lastStatusMs >= config::kDhtIntervalMs && !sensors::calibrating()) {
    lastStatusMs = millis();
    cetakStatus();
  }
}
