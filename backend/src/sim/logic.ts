import type { Command, State, Telemetry } from '../schemas.js';
export const initialState: State = {
  status: 0,
  fan: 0,
  mode: 0,
  led: 1,
  buzzer: 0,
  mute: 0,
};
export function statusFor({ t, h, ppm }: Telemetry): State['status'] {
  if (t > 33 || h < 30 || h > 70 || ppm > 2000) return 2;
  if (t < 18 || t > 30 || h < 40 || h > 60 || ppm > 1000) return 1;
  return 0;
}

// Keep the gas latch separate from fan output, as firmware air_status does.
export class Simulator {
  state: State = { ...initialState };
  private gasFanLatch = false;

  evaluate(telemetry: Telemetry): State {
    const status = statusFor(telemetry);
    this.state = {
      ...this.state,
      status,
      mute: this.state.status !== 0 && status === 0 ? 0 : this.state.mute,
    };
    if (telemetry.ppm > 1000) this.gasFanLatch = true;
    else if (telemetry.ppm < 900) this.gasFanLatch = false;
    return this.refreshAutoOutputs();
  }

  applyCommand(command: Command): State {
    this.state = {
      ...this.state,
      mode: command.mode ?? this.state.mode,
      mute: command.mute ?? this.state.mute,
    };
    if (this.state.mode === 1) {
      this.state = {
        ...this.state,
        fan: command.fan ?? this.state.fan,
        led: command.led ?? this.state.led,
        buzzer: command.buzzer ?? this.state.buzzer,
      };
      return this.state;
    }
    return this.refreshAutoOutputs();
  }

  private refreshAutoOutputs(): State {
    if (this.state.mode === 1) return this.state;
    const { status, fan, mute } = this.state;
    this.state = {
      ...this.state,
      fan:
        status === 2 || this.gasFanLatch || (status === 1 && fan === 1) ? 1 : 0,
      led: (status + 1) as State['led'],
      buzzer: status === 2 && !mute ? 1 : 0,
    };
    return this.state;
  }
}
