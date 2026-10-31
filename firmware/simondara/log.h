// Logging Serial ringkas dengan uptime dan tag modul. Format string disimpan di
// flash (PSTR) agar tidak memakan RAM. Jangan pernah mencetak kredensial.
#pragma once

#include <Arduino.h>
#include <stdio.h>

// Cabang `if (false) printf(...)` hanya untuk pemeriksaan format oleh compiler
// (PSTR bukan string literal sehingga printf_P tidak diperiksa); dibuang optimizer.
#define LOGF(tag, fmt, ...)                                                                                    \
  do {                                                                                                         \
    if (false) printf(fmt, ##__VA_ARGS__);                                                                     \
    Serial.printf_P(PSTR("[%7lu.%03lu] [" tag "] " fmt "\n"), millis() / 1000, millis() % 1000, ##__VA_ARGS__); \
  } while (0)
