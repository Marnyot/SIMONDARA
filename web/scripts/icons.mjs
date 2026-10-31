import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
const logo = await readFile(new URL('../public/logo.svg', import.meta.url));
for (const [name, size] of [
  ['icon-192', 192],
  ['icon-512', 512],
  ['apple-touch-icon', 180],
]) {
  await sharp(logo)
    .resize(size, size)
    .png()
    .toFile(new URL(`../public/${name}.png`, import.meta.url).pathname);
}
const foreground = await sharp(logo).resize(360, 360).png().toBuffer();
await sharp({
  create: { width: 512, height: 512, channels: 4, background: '#0E7C66' },
})
  .composite([{ input: foreground, gravity: 'center' }])
  .png()
  .toFile(new URL('../public/icon-maskable-512.png', import.meta.url).pathname);
