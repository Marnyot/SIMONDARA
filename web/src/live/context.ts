import { createContext, useContext } from 'react';
import type { LiveState } from './reducer';
import type { Command } from '../api/types';
export interface LiveContextValue extends LiveState {
  error: string | null;
  retry: () => void;
  sendCommand: (command: Command) => Promise<void>;
}
export const LiveContext = createContext<LiveContextValue | null>(null);
export function useLive() {
  const value = useContext(LiveContext);
  if (!value) throw new Error('useLive membutuhkan LiveProvider');
  return value;
}
