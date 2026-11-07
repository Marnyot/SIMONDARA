import type { Event } from '../../api/types';

export type RoomEvents = { deviceId: string; name: string; events: Event[] };

/** Keep room identity through the merge; timestamps can match across devices. */
export function mergeRoomEvents(rooms: RoomEvents[], limit = 12) {
  return rooms
    .flatMap(({ deviceId, name, events }) =>
      events.map((event) => ({ ...event, deviceId, name })),
    )
    .sort(
      (a, b) =>
        Date.parse(b.at) - Date.parse(a.at) ||
        a.deviceId.localeCompare(b.deviceId),
    )
    .slice(0, limit);
}
