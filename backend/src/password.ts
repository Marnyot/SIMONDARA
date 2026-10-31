import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
// Fixed Node scrypt defaults: N=16384, r=8, p=1, 64-byte key; salt is 16 random bytes.
export const passwordHashPattern = /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/;
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = (await derive(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  if (!passwordHashPattern.test(hash)) return false;
  const [, salt, encoded] = hash.split('$');
  const actual = (await derive(password, salt!, 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(encoded!, 'hex'));
}
