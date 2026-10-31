// Wi-Fi + NTP + MQTT (PubSubClient) dengan reconnect non-blocking berbasis millis.
//
// Topik (docs/CONTRACT.md), prefix simondara/<DEVICE_ID>/:
//   telemetry  ESP ->  QoS0, tidak retained
//   state      ESP ->  retained (lihat catatan QoS di net.cpp)
//   cmd        -> ESP  subscribe QoS1
//   online     ESP ->  "1" retained saat connect, LWT "0" retained QoS1
#pragma once

#include <stddef.h>
#include <stdint.h>

namespace net {

using CommandHandler = void (*)(const char* payload, size_t length);
using ConnectHandler = void (*)();

void begin(CommandHandler onCommand, ConnectHandler onConnect);
void loop();

bool wifiConnected();
bool online();  // terhubung ke broker MQTT

bool publishTelemetry(const char* json);
bool publishState(const char* json);

// Detik unix dari NTP, 0 bila jam belum sinkron.
uint32_t unixTime();

const char* deviceId();

}  // namespace net
