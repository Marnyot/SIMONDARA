// LED status, buzzer aktif, dan relay kipas.
#pragma once

#include "air_status.h"

namespace actuators {

// Set level mati sebelum pin dijadikan OUTPUT (menghindari pulsa saat boot).
void begin();

// Tulis keluaran ke pin; hanya pin yang berubah yang ditulis.
void apply(const air::Outputs& out);

}  // namespace actuators
