// Contoh kredensial SIMONDARA. Salin ke firmware/simondara/secrets.h lalu isi:
//   cp firmware/secrets.example.h firmware/simondara/secrets.h
// secrets.h dikecualikan dari git (.gitignore). Jangan commit kredensial asli.
#pragma once

// Wi-Fi 2,4 GHz (ESP8266 tidak mendukung 5 GHz).
#define WIFI_SSID "nama-wifi"
#define WIFI_PASS "kata-sandi-wifi"

// Broker MQTT.
// HiveMQ Cloud (produksi): host <cluster>.s1.eu.hivemq.cloud, port 8883, MQTT_USE_TLS 1.
// Mosquitto lokal (pengembangan): IP komputer di LAN, port 1883, MQTT_USE_TLS 0.
#define MQTT_HOST "xxxxxxxxxxxxxxxx.s1.eu.hivemq.cloud"
#define MQTT_PORT 8883
#define MQTT_USER "simondara-device"  // kosongkan ("") bila broker anonim
#define MQTT_PASS "kata-sandi-mqtt"
#define MQTT_USE_TLS 1

// Bagian topik simondara/<DEVICE_ID>/...; harus sama dengan DEVICE_ID backend.
#define DEVICE_ID "kos-01"
