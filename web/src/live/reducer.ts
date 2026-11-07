import { z } from 'zod';
import {
  notificationsSchema,
  deviceIdSchema,
  deviceStateSchema,
  roomsPayloadSchema,
  telemetrySchema,
} from '../api/types';
import { statusAdvice } from '../features/beranda/statusAdvice';
import { roomStatus } from '../features/kamar/rooms';
import { faultLabels } from './status';
import type {
  Notifications,
  DeviceState,
  Room,
  RoomsPayload,
  Telemetry,
  UnregisteredDevice,
} from '../api/types';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting';
export type NoticeKind =
  | 'danger'
  | 'safe'
  | 'offline'
  | 'online'
  | 'fault'
  | 'faultCleared'
  | 'newDevice';
export interface LiveNotice {
  id: number;
  kind: NoticeKind;
  deviceId: string;
  message: string;
}
export const MAX_NOTICES = 3;
export interface LiveState {
  notifications?: Notifications | null;
  rooms: Room[];
  unregistered: UnregisteredDevice[];
  connection: ConnectionStatus;
  ready: boolean;
  /** The stream delivered a room list; a slower REST response must not override it. */
  streamedRooms: boolean;
  notices: LiveNotice[];
  noticeCount: number;
  /** Rooms in a Bahaya episode, which only ends when the room is Aman again. */
  dangerRooms: ReadonlySet<string>;
}
export const initialLiveState: LiveState = {
  rooms: [],
  unregistered: [],
  connection: 'connecting',
  ready: false,
  streamedRooms: false,
  notices: [],
  noticeCount: 0,
  dangerRooms: new Set(),
};
export type LiveAction =
  /** `snapshot` is the first list of a stream connection: a baseline, never a change to announce. */
  | {
      type: 'rooms';
      data: RoomsPayload;
      source: 'rest' | 'snapshot' | 'stream';
    }
  | { type: 'state'; deviceId: string; data: DeviceState; at: string }
  | { type: 'telemetry'; deviceId: string; data: Telemetry; at: string }
  | { type: 'online'; deviceId: string; online: boolean; at: string }
  | { type: 'notifications'; data: Notifications }
  | { type: 'roomSaved'; room: Room }
  | { type: 'roomDeleted'; deviceId: string }
  | { type: 'dismissNotice'; id: number }
  | { type: 'connection'; value: ConnectionStatus };

const addressed = z.object({ deviceId: deviceIdSchema });
const onlineSchema = addressed.extend({ online: z.boolean() });

export function parseLiveEvent(
  type: string,
  raw: string,
  at = new Date().toISOString(),
): LiveAction | null {
  try {
    const data: unknown = JSON.parse(raw);
    if (type === 'notifications')
      return { type, data: notificationsSchema.parse(data) };
    if (type === 'rooms')
      return {
        type,
        data: roomsPayloadSchema.parse(data),
        source: 'stream',
      };
    if (type === 'state')
      return {
        type,
        deviceId: addressed.parse(data).deviceId,
        data: deviceStateSchema.parse(data),
        at,
      };
    if (type === 'telemetry')
      return {
        type,
        deviceId: addressed.parse(data).deviceId,
        data: telemetrySchema.parse(data),
        at,
      };
    if (type === 'online') return { type, ...onlineSchema.parse(data), at };
  } catch {
    console.warn('Pesan SSE tidak valid diabaikan:', type);
  }
  return null;
}

/** Replaces one room and keeps every other room's identity, so their memoized cards skip rendering. */
function updateRoom(
  current: LiveState,
  deviceId: string,
  update: (room: Room) => Room,
): LiveState {
  let changed = false;
  const rooms = current.rooms.map((room) => {
    if (room.deviceId !== deviceId) return room;
    const next = update(room);
    changed ||= next !== room;
    return next;
  });
  // Events for unknown rooms are dropped: only `rooms` decides membership.
  return changed ? { ...current, rooms } : current;
}

function notify(current: LiveState, notice: Omit<LiveNotice, 'id'>): LiveState {
  const notices = [
    ...current.notices,
    { ...notice, id: current.noticeCount + 1 },
  ];
  if (notices.length > MAX_NOTICES) {
    // A burst must not push out a Bahaya warning.
    const oldest = notices.findIndex(({ kind }) => kind !== 'danger');
    notices.splice(Math.max(oldest, 0), 1);
  }
  return { ...current, notices, noticeCount: current.noticeCount + 1 };
}

function notifyFaults(current: LiveState, room: Room, before: number) {
  const { deviceId, name } = room;
  const after = room.state?.fault ?? 0;
  const appeared = faultLabels(after & ~before);
  const cleared = faultLabels(before & ~after);
  const withAppeared = appeared
    ? notify(current, {
        kind: 'fault',
        deviceId,
        message: `${name}: Gangguan ${appeared}`,
      })
    : current;
  return cleared
    ? notify(withAppeared, {
        kind: 'faultCleared',
        deviceId,
        message: `${name}: ${cleared} normal kembali`,
      })
    : withAppeared;
}

const sameState = (a: DeviceState | null, b: DeviceState) =>
  a !== null &&
  (Object.keys(b) as (keyof DeviceState)[]).every((key) => a[key] === b[key]);

export function liveReducer(current: LiveState, action: LiveAction): LiveState {
  switch (action.type) {
    case 'notifications':
      return { ...current, notifications: action.data };
    case 'rooms': {
      if (action.source === 'rest' && current.streamedRooms) return current;
      const known = new Map(current.rooms.map((room) => [room.deviceId, room]));
      const rooms = action.data.rooms.map((room) => {
        const previous = known.get(room.deviceId);
        // Last known readings stay on screen if the list carries none.
        return {
          ...room,
          state: room.state ?? previous?.state ?? null,
          telemetry: room.telemetry ?? previous?.telemetry ?? null,
          updatedAt: room.updatedAt ?? previous?.updatedAt ?? null,
        };
      });
      // Lists only reset the baseline; room alerts come from later live events.
      const dangerRooms = new Set<string>();
      for (const room of rooms) {
        const status = roomStatus(room);
        if (
          status === 2 ||
          (status === 1 && current.dangerRooms.has(room.deviceId))
        )
          dangerRooms.add(room.deviceId);
      }
      const next: LiveState = {
        ...current,
        rooms,
        unregistered: action.data.unregistered,
        ready: true,
        streamedRooms: current.streamedRooms || action.source !== 'rest',
        dangerRooms,
      };
      if (action.source !== 'stream') return next;
      const seen = new Set(current.unregistered.map((item) => item.deviceId));
      return action.data.unregistered
        .filter(({ deviceId }) => !seen.has(deviceId))
        .reduce(
          (state, { deviceId }) =>
            notify(state, {
              kind: 'newDevice',
              deviceId,
              message: `Perangkat baru terdeteksi: ${deviceId}`,
            }),
          next,
        );
    }
    case 'connection':
      return { ...current, connection: action.value };
    // Connecting replays `state`/`online`; unchanged values are not new data,
    // so they must not refresh `updatedAt`.
    case 'state': {
      const before = current.rooms.find((r) => r.deviceId === action.deviceId);
      const next = updateRoom(current, action.deviceId, (room) =>
        sameState(room.state, action.data)
          ? room
          : { ...room, state: action.data, updatedAt: action.at },
      );
      const room = next.rooms.find((r) => r.deviceId === action.deviceId);
      if (next === current || !room) return next;
      return notifyFaults(next, room, before?.state?.fault ?? 0);
    }
    case 'online': {
      const next = updateRoom(current, action.deviceId, (room) =>
        room.online === action.online
          ? room
          : { ...room, online: action.online, updatedAt: action.at },
      );
      const room = next.rooms.find((r) => r.deviceId === action.deviceId);
      if (next === current || !room) return next;
      return notify(next, {
        kind: action.online ? 'online' : 'offline',
        deviceId: room.deviceId,
        message: action.online
          ? `${room.name}: kembali online.`
          : `${room.name}: terputus. Perangkat berhenti mengirim data.`,
      });
    }
    case 'telemetry': {
      const next = updateRoom(current, action.deviceId, (room) => ({
        ...room,
        telemetry: action.data,
        updatedAt: action.data.at ?? action.at,
      }));
      const room = next.rooms.find((r) => r.deviceId === action.deviceId);
      if (next === current || !room) return next;
      const { deviceId, name } = room;
      const status = roomStatus(room);
      const inDanger = next.dangerRooms.has(deviceId);
      if (status === 2 && !inDanger)
        return notify(
          { ...next, dangerRooms: new Set(next.dangerRooms).add(deviceId) },
          {
            kind: 'danger',
            deviceId,
            message: `${name}: BAHAYA — ${statusAdvice(action.data)}`,
          },
        );
      if (status === 0 && inDanger) {
        const dangerRooms = new Set(next.dangerRooms);
        dangerRooms.delete(deviceId);
        return notify(
          { ...next, dangerRooms },
          {
            kind: 'safe',
            deviceId,
            message: `${name}: kembali Aman. Kualitas udara sudah normal.`,
          },
        );
      }
      return next;
    }
    case 'roomSaved': {
      const { room } = action;
      const exists = current.rooms.some(
        ({ deviceId }) => deviceId === room.deviceId,
      );
      return {
        ...current,
        // A rename must not roll live readings back to the response's copy.
        rooms: exists
          ? current.rooms.map((item) =>
              item.deviceId === room.deviceId
                ? { ...item, name: room.name, notify: room.notify }
                : item,
            )
          : [...current.rooms, room],
        unregistered: current.unregistered.filter(
          ({ deviceId }) => deviceId !== room.deviceId,
        ),
      };
    }
    case 'roomDeleted': {
      const dangerRooms = new Set(current.dangerRooms);
      dangerRooms.delete(action.deviceId);
      return {
        ...current,
        rooms: current.rooms.filter(
          ({ deviceId }) => deviceId !== action.deviceId,
        ),
        dangerRooms,
      };
    }
    case 'dismissNotice':
      return {
        ...current,
        notices: current.notices.filter(({ id }) => id !== action.id),
      };
  }
}
