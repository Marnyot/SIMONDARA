import { createContext, useContext } from 'react';
import type { ConnectionStatus, LiveState } from './reducer';
import type { Command, Room } from '../api/types';

export interface LiveContextValue extends LiveState {
  error: string | null;
  retry: () => void;
  createRoom: (input: { deviceId: string; name: string }) => Promise<Room>;
  renameRoom: (deviceId: string, name: string) => Promise<Room>;
  deleteRoom: (deviceId: string) => Promise<void>;
  dismissNotice: (id: number) => void;
}
export const LiveContext = createContext<LiveContextValue | null>(null);
export function useLive() {
  const value = useContext(LiveContext);
  if (!value) throw new Error('useLive membutuhkan LiveProvider');
  return value;
}

/** Live data of the room the current `/kamar/:deviceId` route points at. */
export interface RoomContextValue extends Room {
  connection: ConnectionStatus;
  sendCommand: (command: Command) => Promise<void>;
}
export const RoomContext = createContext<RoomContextValue | null>(null);
export function useRoom() {
  const value = useContext(RoomContext);
  if (!value) throw new Error('useRoom membutuhkan RoomLayout');
  return value;
}
