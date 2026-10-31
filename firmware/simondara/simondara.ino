// SIMONDARA - firmware NodeMCU ESP8266.
//
// Membaca DHT11 + MQ-135, menentukan status kualitas udara, mengendalikan LED,
// buzzer, dan relay kipas, menampilkan data di LCD, serta bertukar pesan dengan
// backend melalui MQTT (docs/CONTRACT.md). Logika lokal tetap berjalan saat
// Wi-Fi/MQTT terputus. Seluruh loop non-blocking.

#include <ArduinoJson.h>

#include "actuators.h"
#include "air_status.h"
#include "config.h"
#include "display.h"
#include "log.h"
#include "net.h"
#include "sensors.h"

namespace {

constexpr const char* kFirmwareVersion = "1.0.0";

air::ControlState control;

struct PublishedState {
  air::Status status;
  bool fan;
  air::Mode mode;
  air::Led led;
  bool buzzer;
  bool mute;

  bool operator==(const PublishedState& o) const {
    return status == o.status && fan == o.fan && mode == o.mode && led == o.led && buzzer == o.buzzer &&
           mute == o.mute;
  }
};

PublishedState lastPublished;
bool statePending = true;  // kirim state saat connect dan saat berubah

uint32_t lastTelemetryMs = 0;
uint32_t lastDisplayMs = 0;
const char* lastTelemetrySkip = nullptr;

char serialLine[32];
size_t serialLen = 0;

PublishedState snapshot() {
  return {control.status, control.out.fan, control.mode, control.out.led, control.out.buzzer, control.mute};
}

air::Readings currentReadings() {
  const sensors::Climate c = sensors::climate();
  const sensors::Gas g = sensors::gas();
  return {c.valid, c.temperature, c.humidity, g.valid, g.ppm};
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
  if (air::applyCommand(control, cmd)) LOGF("cmd", "fan/led/buzzer diabaikan pada mode otomatis");
  if (control.mode != previousMode) LOGF("cmd", "mode -> %s", control.mode == air::kManual ? "manual" : "otomatis");
}

void onConnected() { statePending = true; }

// ---------------------------------------------------------------------------
// Kontrol, publikasi, tampilan
// ---------------------------------------------------------------------------

void updateControl() {
  if (sensors::warmedUp()) {
    const air::Readings r = currentReadings();
    const bool wasEvaluated = control.evaluated;
    const air::Status previous = control.status;
    air::evaluate(control, r);
    if (control.evaluated && (!wasEvaluated || control.status != previous)) {
      LOGF("status", "%s -> %s (t=%.1f h=%.0f ppm=%d%s%s)", wasEvaluated ? air::statusLabel(previous) : "-",
           air::statusLabel(control.status), r.temperature, r.humidity, r.ppm, r.climateValid ? "" : " DHT invalid",
           r.gasValid ? "" : " gas invalid");
    }
  }
  actuators::apply(control.out);
}

void publishStateIfChanged() {
  const PublishedState now = snapshot();
  if (!statePending && now == lastPublished) return;
  if (!net::online()) {
    statePending = true;  // kirim ulang begitu tersambung
    return;
  }

  char json[96];
  snprintf(json, sizeof json, "{\"status\":%u,\"fan\":%u,\"mode\":%u,\"led\":%u,\"buzzer\":%u,\"mute\":%u}",
           now.status, now.fan, now.mode, now.led, now.buzzer, now.mute);
  if (net::publishState(json)) {
    lastPublished = now;
    statePending = false;
    LOGF("mqtt", "state %s", json);
  } else {
    LOGF("mqtt", "publish state gagal");
  }
}

void publishTelemetryIfDue() {
  const uint32_t now = millis();
  if (now - lastTelemetryMs < config::kTelemetryIntervalMs) return;
  lastTelemetryMs = now;

  const sensors::Climate c = sensors::climate();
  const sensors::Gas g = sensors::gas();
  const char* skip = nullptr;
  if (!g.ready) {
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
  snprintf(json, sizeof json, "{\"t\":%.1f,\"h\":%.1f,\"ppm\":%d,\"ts\":%lu}", c.temperature, c.humidity, g.ppm,
           static_cast<unsigned long>(net::unixTime()));
  if (!net::publishTelemetry(json)) LOGF("telemetry", "publish gagal");
}

void updateDisplay() {
  const uint32_t now = millis();
  if (lastDisplayMs != 0 && now - lastDisplayMs < config::kDisplayIntervalMs) return;
  lastDisplayMs = now;

  const sensors::Climate c = sensors::climate();
  const sensors::Gas g = sensors::gas();
  display::render({!sensors::warmedUp(), sensors::warmupRemainingMs(), sensors::warmupPercent(), c.valid,
                   c.temperature, c.humidity, g.valid, g.ppm, control.evaluated, control.status, net::online()});
}

// ---------------------------------------------------------------------------
// Perintah Serial: status | cal | help
// ---------------------------------------------------------------------------

void printStatus() {
  const sensors::Climate c = sensors::climate();
  const sensors::Gas g = sensors::gas();
  LOGF("info", "device %s, fw %s, heap %u B, wifi %s, mqtt %s, ntp %lu", net::deviceId(), kFirmwareVersion,
       ESP.getFreeHeap(), net::wifiConnected() ? "ya" : "tidak", net::online() ? "ya" : "tidak",
       static_cast<unsigned long>(net::unixTime()));
  LOGF("info", "DHT %s t=%.1f h=%.1f | MQ-135 %s ppm=%d Rs=%.2f kOhm R0=%.2f kOhm",
       c.valid ? "ok" : "invalid", c.temperature, c.humidity,
       !g.ready ? "pemanasan" : (g.valid ? "ok" : "invalid"), g.ppm, g.rsKOhm, config::kMq135R0KOhm);
  LOGF("info", "mode %s, status %s, kipas %u, led %u, buzzer %u, mute %u",
       control.mode == air::kManual ? "manual" : "otomatis",
       control.evaluated ? air::statusLabel(control.status) : "-", control.out.fan, control.out.led,
       control.out.buzzer, control.mute);
}

void handleSerialLine(const char* line) {
  if (strcmp(line, "status") == 0) {
    printStatus();
  } else if (strcmp(line, "cal") == 0) {
    sensors::startCalibration();
  } else if (line[0] != '\0') {
    LOGF("info", "perintah: status | cal (kalibrasi R0 di udara bersih) | help");
  }
}

void handleSerial() {
  while (Serial.available() > 0) {
    const char ch = static_cast<char>(Serial.read());
    if (ch == '\r') continue;
    if (ch == '\n') {
      serialLine[serialLen] = '\0';
      handleSerialLine(serialLine);
      serialLen = 0;
    } else if (serialLen < sizeof serialLine - 1) {
      serialLine[serialLen++] = ch;
    }
  }
}

}  // namespace

void setup() {
  actuators::begin();  // paling awal: aktuator langsung di level aman
  Serial.begin(115200);
  Serial.println();
  LOGF("boot", "SIMONDARA fw %s, reset: %s", kFirmwareVersion, ESP.getResetReason().c_str());

  display::begin();
  sensors::begin();
  net::begin(onCommand, onConnected);
  lastPublished = snapshot();
}

void loop() {
  net::loop();
  sensors::loop();
  handleSerial();
  updateControl();
  publishStateIfChanged();
  publishTelemetryIfDue();
  updateDisplay();
}
