import { expect, test } from 'vitest';
import { transitionDirection } from './motion';

test.each([
  ['/', '/kamar/room-a', 'forward'],
  ['/kamar/riwayat', '/kamar/riwayat/kontrol/', 'forward'],
  ['/kamar/kontrol/riwayat/', '/kamar/kontrol/', 'back'],
  ['/kamar/room-a', '/', 'back'],
  ['/kamar/room-a', '/kamar/room-a/kontrol', 'forward'],
  ['/kamar/room-a/kontrol', '/kamar/room-a/riwayat', 'forward'],
  ['/kamar/room-a/riwayat', '/kamar/room-a/kontrol', 'back'],
  ['/kamar/room-a/kontrol', '/kamar/room-a', 'back'],
])('%s → %s enters %s', (from, to, direction) => {
  expect(transitionDirection(from, to)).toBe(direction);
});
