// Contoh kredensial SIMONDARA. Salin ke firmware/simondara/secrets.h lalu isi:
//   cp firmware/secrets.example.h firmware/simondara/secrets.h
// secrets.h dikecualikan dari git (.gitignore). Jangan commit kredensial asli.
#pragma once

// Wi-Fi 2,4 GHz (ESP8266 tidak mendukung 5 GHz).
#define WIFI_SSID "nama-wifi"
#define WIFI_PASS "kata-sandi-wifi"

// Broker MQTT.
// EMQX Cloud Serverless (produksi): host l4919106.ala.asia-southeast1.emqxsl.com, port 8883, MQTT_USE_TLS 1.
// Serverless hanya menyediakan TLS; isi password akun perangkat sendiri.
// Mosquitto lokal (pengembangan): host 192.168.1.10 (IP laptop di LAN),
// port 1883, user device, password dev, MQTT_USE_TLS 0.
#define MQTT_HOST "l4919106.ala.asia-southeast1.emqxsl.com"
#define MQTT_PORT 8883
#define MQTT_USER "simondara-device"
#define MQTT_PASS ""  // isi sendiri; jangan commit password produksi
#define MQTT_USE_TLS 1

// Bagian topik simondara/<DEVICE_ID>/...; harus sama dengan DEVICE_ID backend.
#define DEVICE_ID "kos-01"
