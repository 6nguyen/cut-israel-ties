// urgency-and-readability §6: the favicon set, PWA icons and manifest, rendered from the one logo
// source with sharp. `npm run icons -w web` writes them into web/public; the output is committed and
// web/test/icons.test.ts fails when a regeneration differs from what is checked in.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
export const SOURCE = join(here, '..', 'src', 'assets', 'logo-1024.png');
export const PUBLIC = join(here, '..', 'public');

/** Every file the script writes, by public path. Sizes in CSS pixels. */
export const PNGS: Record<string, number> = { 'favicon-32.png': 32, 'mark-64.png': 64, 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 };
export const ICO_SIZES = [16, 32, 48];

export const MANIFEST = {
  name: 'Cut the Ties',
  short_name: 'Cut the Ties',
  description: 'Find the two things you can do this week to cut US military ties with Israel.',
  start_url: '/',
  display: 'standalone',
  background_color: '#FAF7F0',
  theme_color: '#090A0F',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
};

/** The source PNG carries a 22 KB text comment that libvips copies into every output; drop text chunks so a 32 px icon is 1-2 KB. */
export function stripText(png: Buffer): Buffer {
  const parts: Buffer[] = [png.subarray(0, 8)];
  for (let o = 8; o < png.length; ) {
    const len = png.readUInt32BE(o);
    const type = png.toString('ascii', o + 4, o + 8);
    const end = o + 12 + len;
    if (!/^(tEXt|iTXt|zTXt)$/.test(type)) parts.push(png.subarray(o, end));
    o = end;
  }
  return Buffer.concat(parts);
}

async function png(size: number): Promise<Buffer> {
  return stripText(await sharp(SOURCE).resize(size, size, { kernel: 'lanczos3' }).png({ compressionLevel: 9, palette: true }).toBuffer());
}

/** An ICO container holding PNG-encoded images (every browser since 2010 reads them); 6-byte header, 16-byte entries, then the images. */
export function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach((im, i) => {
    const e = i * 16;
    dir.writeUInt8(im.size === 256 ? 0 : im.size, e); // width (0 means 256)
    dir.writeUInt8(im.size === 256 ? 0 : im.size, e + 1); // height
    dir.writeUInt8(0, e + 2); // colour count
    dir.writeUInt8(0, e + 3); // reserved
    dir.writeUInt16LE(1, e + 4); // planes
    dir.writeUInt16LE(32, e + 6); // bits per pixel
    dir.writeUInt32LE(im.data.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += im.data.length;
  });
  return Buffer.concat([header, dir, ...images.map((im) => im.data)]);
}

/** Render the whole set into memory: {public path → bytes}. */
export async function renderIcons(): Promise<Record<string, Buffer>> {
  const out: Record<string, Buffer> = {};
  for (const [name, size] of Object.entries(PNGS)) out[name] = await png(size);
  out['favicon.ico'] = ico(await Promise.all(ICO_SIZES.map(async (size) => ({ size, data: await png(size) }))));
  out['site.webmanifest'] = Buffer.from(`${JSON.stringify(MANIFEST, null, 2)}\n`);
  return out;
}

export async function writeIcons(dir = PUBLIC): Promise<string[]> {
  mkdirSync(dir, { recursive: true });
  const files = await renderIcons();
  for (const [name, data] of Object.entries(files)) writeFileSync(join(dir, name), data);
  return Object.keys(files);
}

if (process.argv[1] && /icons\.ts$/.test(process.argv[1])) {
  writeIcons().then((names) => console.log(`web/public: ${names.join(', ')}`));
}
