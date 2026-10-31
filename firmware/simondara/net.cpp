#include "net.h"

#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <time.h>

#include "config.h"
#include "log.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "secrets.h tidak ada: salin firmware/secrets.example.h ke firmware/simondara/secrets.h lalu isi kredensial"
#endif

#if !defined(WIFI_SSID) || !defined(WIFI_PASS) || !defined(MQTT_HOST) || !defined(MQTT_PORT) || \
    !defined(MQTT_USER) || !defined(MQTT_PASS) || !defined(MQTT_USE_TLS) || !defined(DEVICE_ID)
#error "secrets.h tidak lengkap: bandingkan dengan firmware/secrets.example.h"
#endif

#if MQTT_USE_TLS
#include "ca_cert.h"
#endif

namespace net {

namespace {

#if MQTT_USE_TLS
BearSSL::WiFiClientSecure transport;
BearSSL::X509List trustAnchors;
bool fragmentProbed = false;
#else
WiFiClient transport;
#endif
PubSubClient mqtt(transport);

CommandHandler commandHandler = nullptr;
ConnectHandler connectHandler = nullptr;

char clientId[48];
char topicTelemetry[64];
char topicState[64];
char topicCmd[64];
char topicOnline[64];
bool configValid = true;

bool wifiUp = false;
uint32_t wifiAttemptMs = 0;
uint32_t wifiRetryMs = config::kWifiConnectTimeoutMs;

bool timeSynced = false;
bool waitingTimeLogged = false;

bool mqttUp = false;
uint32_t mqttAttemptMs = 0;
uint32_t mqttBackoffMs = 0;  // 0 = coba segera

const char* nullIfEmpty(const char* s) { return s[0] == '\0' ? nullptr : s; }

uint32_t nextBackoff(uint32_t current) {
  if (current < config::kBackoffMinMs) return config::kBackoffMinMs;
  return current >= config::kBackoffMaxMs / 2 ? config::kBackoffMaxMs : current * 2;
}

bool validDeviceId(const char* id) {
  if (id[0] == '\0' || strlen(id) > 32) return false;
  for (const char* p = id; *p; ++p) {
    if (*p == '/' || *p == '+' || *p == '#' || *p <= ' ') return false;
  }
  return true;
}

void onMessage(char* topic, uint8_t* payload, unsigned int length) {
  if (strcmp(topic, topicCmd) != 0) return;
  if (length > config::kMqttMaxCmdBytes) {
    LOGF("mqtt", "cmd diabaikan: payload %u byte terlalu besar", length);
    return;
  }
  if (commandHandler != nullptr) commandHandler(reinterpret_cast<const char*>(payload), length);
}

void startWifi() {
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  wifiAttemptMs = millis();
}

void loopWifi(uint32_t now) {
  if (WiFi.status() == WL_CONNECTED) {
    if (!wifiUp) {
      wifiUp = true;
      wifiRetryMs = config::kWifiConnectTimeoutMs;
      LOGF("wifi", "terhubung, IP %s, RSSI %d dBm", WiFi.localIP().toString().c_str(), WiFi.RSSI());
    }
    return;
  }

  if (wifiUp) {
    wifiUp = false;
    wifiAttemptMs = now;  // beri kesempatan auto-reconnect SDK dulu
    LOGF("wifi", "terputus, menyambung ulang");
  }
  if (now - wifiAttemptMs >= wifiRetryMs) {
    LOGF("wifi", "belum terhubung (status %d), coba ulang; jeda berikut %u dtk", WiFi.status(),
         nextBackoff(wifiRetryMs) / 1000);
    wifiRetryMs = nextBackoff(wifiRetryMs);
    startWifi();
  }
}

void loopTime() {
  if (timeSynced) return;
  if (static_cast<uint32_t>(time(nullptr)) > config::kTimeValidAfter) {
    timeSynced = true;
    LOGF("ntp", "jam sinkron, epoch %lu", static_cast<unsigned long>(time(nullptr)));
  }
}

bool connectMqtt() {
#if MQTT_USE_TLS
  // Validasi masa berlaku sertifikat butuh jam yang benar.
  transport.setX509Time(time(nullptr));
  if (!fragmentProbed) {
    fragmentProbed = true;
    // Bila broker mendukung MFLN, buffer TLS dikecilkan dari 16 KB ke 1 KB.
    if (BearSSL::WiFiClientSecure::probeMaxFragmentLength(MQTT_HOST, MQTT_PORT, 1024)) {
      transport.setBufferSizes(1024, 1024);
      LOGF("tls", "MFLN 1024 didukung, buffer TLS diperkecil");
    } else {
      LOGF("tls", "MFLN tidak didukung, buffer TLS standar");
    }
  }
#endif

  LOGF("mqtt", "menghubungkan ke %s:%d (%s) sebagai %s", MQTT_HOST, MQTT_PORT, MQTT_USE_TLS ? "TLS" : "tanpa TLS",
       clientId);
  const bool ok = mqtt.connect(clientId, nullIfEmpty(MQTT_USER), nullIfEmpty(MQTT_PASS), topicOnline, 1, true, "0",
                               true);
  if (!ok) {
#if MQTT_USE_TLS
    char err[96];
    const int code = transport.getLastSSLError(err, sizeof err);
    if (code != 0) LOGF("tls", "galat %d: %s", code, err);
#endif
    LOGF("mqtt", "gagal (state %d)", mqtt.state());
    return false;
  }

  mqtt.publish(topicOnline, "1", true);
  if (!mqtt.subscribe(topicCmd, 1)) LOGF("mqtt", "subscribe %s gagal", topicCmd);
  LOGF("mqtt", "terhubung, subscribe %s", topicCmd);
  return true;
}

void loopMqtt(uint32_t now) {
  if (mqtt.connected()) {
    mqtt.loop();
    return;
  }

  if (mqttUp) {
    mqttUp = false;
    mqttAttemptMs = now;
    mqttBackoffMs = 0;
    LOGF("mqtt", "terputus (state %d)", mqtt.state());
  }
  if (!wifiUp || !configValid) return;
  if (MQTT_USE_TLS && !timeSynced) {
    if (!waitingTimeLogged) {
      waitingTimeLogged = true;
      LOGF("ntp", "menunggu sinkronisasi jam sebelum TLS");
    }
    return;
  }
  if (now - mqttAttemptMs < mqttBackoffMs) return;

  if (connectMqtt()) {
    mqttUp = true;
    mqttBackoffMs = 0;
    if (connectHandler != nullptr) connectHandler();
  } else {
    mqttBackoffMs = nextBackoff(mqttBackoffMs);
    LOGF("mqtt", "coba lagi dalam %u dtk", mqttBackoffMs / 1000);
  }
  // Waktu diambil setelah percobaan karena connect bisa memakan beberapa detik.
  mqttAttemptMs = millis();
}

}  // namespace

void begin(CommandHandler onCommand, ConnectHandler onConnect) {
  commandHandler = onCommand;
  connectHandler = onConnect;

  configValid = validDeviceId(DEVICE_ID);
  if (!configValid) LOGF("mqtt", "DEVICE_ID tidak valid (kosong, >32 karakter, atau berisi / + # spasi); MQTT nonaktif");

  const uint32_t chip = ESP.getChipId();
  snprintf(clientId, sizeof clientId, "simondara-%s-%06x", DEVICE_ID, chip);
  snprintf(topicTelemetry, sizeof topicTelemetry, "simondara/%s/telemetry", DEVICE_ID);
  snprintf(topicState, sizeof topicState, "simondara/%s/state", DEVICE_ID);
  snprintf(topicCmd, sizeof topicCmd, "simondara/%s/cmd", DEVICE_ID);
  snprintf(topicOnline, sizeof topicOnline, "simondara/%s/online", DEVICE_ID);

#if MQTT_USE_TLS
  trustAnchors.append(kDigiCertGlobalRootG2);
  trustAnchors.append(kDigiCertGlobalRootCA);
  transport.setTrustAnchors(&trustAnchors);
#endif
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMessage);
  mqtt.setBufferSize(config::kMqttBufferSize);
  mqtt.setKeepAlive(config::kMqttKeepAliveS);
  mqtt.setSocketTimeout(config::kMqttSocketTimeoutS);

  // UTC; SNTP berjalan otomatis begitu Wi-Fi tersambung.
  configTime(0, 0, "pool.ntp.org", "time.google.com", "time.cloudflare.com");

  char hostname[32];
  snprintf(hostname, sizeof hostname, "simondara-%06x", chip);
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.hostname(hostname);
  WiFi.setAutoReconnect(true);
  LOGF("wifi", "menghubungkan ke SSID \"%s\"", WIFI_SSID);
  startWifi();
}

void loop() {
  const uint32_t now = millis();
  loopWifi(now);
  loopTime();
  loopMqtt(now);
}

bool wifiConnected() { return wifiUp; }

bool online() { return mqtt.connected(); }

bool publishTelemetry(const char* json) { return mqtt.connected() && mqtt.publish(topicTelemetry, json, false); }

// PubSubClient hanya mendukung publish QoS0. State dikirim retained sehingga
// subscriber tetap menerima nilai terakhir, dan selalu dikirim ulang setiap
// kali tersambung kembali.
bool publishState(const char* json) { return mqtt.connected() && mqtt.publish(topicState, json, true); }

uint32_t unixTime() { return timeSynced ? static_cast<uint32_t>(time(nullptr)) : 0; }

const char* deviceId() { return DEVICE_ID; }

}  // namespace net
