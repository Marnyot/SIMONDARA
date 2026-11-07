import {
  gasStatus,
  humidityStatus,
  temperatureStatus,
  THRESHOLDS,
} from '../../live/status';

/** Labels use the same inclusive boundaries as the live air status. */
export function assessTemperature(value: number) {
  return {
    status: temperatureStatus(value),
    label:
      value < THRESHOLDS.temperature.min
        ? 'Dingin'
        : value > THRESHOLDS.temperature.danger
          ? 'Sangat panas'
          : value > THRESHOLDS.temperature.warning
            ? 'Panas'
            : 'Nyaman',
  };
}
export function assessHumidity(value: number) {
  return {
    status: humidityStatus(value),
    label:
      value < THRESHOLDS.humidity.min
        ? 'Kering'
        : value > THRESHOLDS.humidity.max
          ? 'Lembap'
          : 'Nyaman',
  };
}
export function assessGas(value: number) {
  const status = gasStatus(value);
  return {
    status,
    label: status === 2 ? 'Sangat tinggi' : status === 1 ? 'Tinggi' : 'Normal',
  };
}
