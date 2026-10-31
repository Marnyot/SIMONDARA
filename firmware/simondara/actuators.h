// LED status, buzzer aktif, dan relay kipas.
#pragma once

#include "air_status.h"

namespace actuators {

// Set level mati sebelum pin dijadikan OUTPUT (syarat boot D3/D4 HIGH).
void begin();

// Tulis keluaran ke pin; hanya pin yang berubah yang ditulis.
void apply(const air::Outputs& out);

}  // namespace actuators
