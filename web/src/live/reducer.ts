import { z } from 'zod';
import { deviceStateSchema, telemetrySchema } from '../api/types';
import type { DeviceState, Snapshot, Telemetry } from '../api/types';
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting';
export interface LiveState {
  state: DeviceState | null;
  telemetry: Telemetry | null;
  online: boolean;
  updatedAt: string | null;
  connection: ConnectionStatus;
  ready: boolean;
  receivedState: boolean;
  receivedOnline: boolean;
}
export const initialLiveState: LiveState = {
  state: null,
  telemetry: null,
  online: false,
  updatedAt: null,
  connection: 'connecting',
  ready: false,
  receivedState: false,
  receivedOnline: false,
};
export type LiveAction =
  | { type: 'snapshot'; data: Snapshot }
  | { type: 'state'; data: DeviceState; at: string }
  | { type: 'telemetry'; data: Telemetry; at: string }
  | { type: 'online'; data: { online: boolean }; at: string }
  | { type: 'connection'; value: ConnectionStatus };
export function parseLiveEvent(
  type: string,
  raw: string,
  at = new Date().toISOString(),
): LiveAction | null {
  try {
    const data: unknown = JSON.parse(raw);
    if (type === 'state')
      return { type, data: deviceStateSchema.parse(data), at };
    if (type === 'telemetry')
      return { type, data: telemetrySchema.parse(data), at };
    if (type === 'online')
      return { type, data: z.object({ online: z.boolean() }).parse(data), at };
  } catch {
    console.warn('Pesan SSE tidak valid diabaikan:', type);
  }
  return null;
}
export function liveReducer(current: LiveState, action: LiveAction): LiveState {
  switch (action.type) {
    case 'snapshot':
      return {
        ...current,
        ...action.data,
        // REST fills missing initial fields; newer SSE values must win the startup race.
        state: current.receivedState ? current.state : action.data.state,
        online: current.receivedOnline ? current.online : action.data.online,
        telemetry: current.telemetry ?? action.data.telemetry,
        updatedAt: current.updatedAt ?? action.data.updatedAt,
        ready: true,
        receivedState: true,
        receivedOnline: true,
      };
    case 'connection':
      return { ...current, connection: action.value };
    case 'state':
      return {
        ...current,
        state: action.data,
        updatedAt: action.at,
        receivedState: true,
        ready: current.receivedOnline,
      };
    case 'online':
      return {
        ...current,
        online: action.data.online,
        updatedAt: action.at,
        receivedOnline: true,
        ready: current.receivedState,
      };
    case 'telemetry':
      return {
        ...current,
        telemetry: action.data,
        updatedAt: action.data.at ?? action.at,
      };
  }
}
