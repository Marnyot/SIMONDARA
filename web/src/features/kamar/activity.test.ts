import { describe, expect, it } from 'vitest';
import { mergeRoomEvents } from './activity';
import type { RoomEvents } from './activity';

const batches: RoomEvents[] = [
  {
    deviceId: 'a',
    name: 'Kamar 1',
    events: [
      { at: '2026-11-07T10:00:00Z', type: 'status', value: 2 },
      { at: '2026-11-07T09:00:00Z', type: 'online', value: true },
    ],
  },
  {
    deviceId: 'b',
    name: 'Kamar 2',
    events: [
      { at: '2026-11-07T11:00:00+01:00', type: 'online', value: false },
      { at: '2026-11-07T10:30:00Z', type: 'status', value: 1 },
    ],
  },
];
describe('aktivitas lintas kamar', () => {
  it('menggabungkan dan mengurutkan waktu terbaru sambil mempertahankan identitas kamar', () => {
    expect(
      mergeRoomEvents(batches).map(({ name, type, at }) => [name, type, at]),
    ).toEqual([
      ['Kamar 2', 'status', '2026-11-07T10:30:00Z'],
      ['Kamar 1', 'status', '2026-11-07T10:00:00Z'],
      ['Kamar 2', 'online', '2026-11-07T11:00:00+01:00'],
      ['Kamar 1', 'online', '2026-11-07T09:00:00Z'],
    ]);
    expect(batches[1]!.events[0]!.type).toBe('online');
  });
  it('membatasi hasil setelah seluruh kamar digabung dan diurutkan', () => {
    expect(mergeRoomEvents(batches, 1)[0]).toMatchObject({
      deviceId: 'b',
      type: 'status',
    });
    expect(
      mergeRoomEvents([
        {
          ...batches[0]!,
          events: Array.from({ length: 15 }, () => batches[0]!.events[0]!),
        },
      ]),
    ).toHaveLength(12);
  });
  it('menerima kamar kosong dan tidak menghapus peristiwa yang waktunya sama', () => {
    expect(mergeRoomEvents([])).toEqual([]);
    expect(
      mergeRoomEvents([
        { deviceId: 'c', name: 'Kosong', events: [] },
        ...batches,
      ]),
    ).toHaveLength(4);
    expect(
      mergeRoomEvents(batches).filter(
        (event) => Date.parse(event.at) === Date.parse('2026-11-07T10:00:00Z'),
      ),
    ).toHaveLength(2);
  });
});
