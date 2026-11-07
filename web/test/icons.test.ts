// urgency-and-readability §6: the committed icon set is what `npm run icons -w web` renders from
// web/src/assets/logo-1024.png, the header mark stays under the landing budget's 8 KB line, and the
// favicon.ico container carries the three classic sizes. The comparison is per pixel, not per byte:
// libvips' palette quantiser differs between the macOS and Linux sharp binaries (CI run 42330477243).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ICO_SIZES, MANIFEST, PNGS, PUBLIC, renderIcons } from '../scripts/icons';

/** Mean absolute RGBA difference per channel between two PNGs of the same size (fails on a size mismatch). */
async function pixelDiff(a: Buffer, b: Buffer): Promise<number> {
  const [ra, rb] = await Promise.all([a, b].map((buf) => sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
  expect([ra.info.width, ra.info.height]).toEqual([rb.info.width, rb.info.height]);
  let sum = 0;
  for (let i = 0; i < ra.data.length; i++) sum += Math.abs(ra.data[i] - rb.data[i]);
  return sum / ra.data.length;
}

describe('icon set', () => {
  it('regenerates to the committed files: same names, sizes and pixels, identical manifest', async () => {
    const files = await renderIcons();
    expect(Object.keys(files).sort()).toEqual(['apple-touch-icon.png', 'favicon-32.png', 'favicon.ico', 'icon-192.png', 'icon-512.png', 'mark-64.png', 'site.webmanifest']);
    for (const [name, size] of Object.entries(PNGS)) {
      const committed = readFileSync(join(PUBLIC, name));
      const meta = await sharp(committed).metadata();
      expect([meta.width, meta.height], name).toEqual([size, size]);
      expect(await pixelDiff(committed, files[name]), name).toBeLessThan(2);
    }
    expect(readFileSync(join(PUBLIC, 'site.webmanifest')).equals(files['site.webmanifest'])).toBe(true);
    const ico = readFileSync(join(PUBLIC, 'favicon.ico'));
    expect(ico.readUInt16LE(4)).toBe(files['favicon.ico'].readUInt16LE(4));
  }, 30_000);
  it('the header mark is at most 8 KB and the 32 px favicon at most 4 KB', () => {
    expect(readFileSync(join(PUBLIC, 'mark-64.png')).length).toBeLessThanOrEqual(8 * 1024);
    expect(readFileSync(join(PUBLIC, 'favicon-32.png')).length).toBeLessThanOrEqual(4 * 1024);
  });
  it('favicon.ico holds 16, 32 and 48 px PNG images', () => {
    const b = readFileSync(join(PUBLIC, 'favicon.ico'));
    expect(b.readUInt16LE(2)).toBe(1);
    expect(b.readUInt16LE(4)).toBe(ICO_SIZES.length);
    ICO_SIZES.forEach((size, i) => {
      const e = 6 + i * 16;
      expect(b.readUInt8(e)).toBe(size);
      const offset = b.readUInt32LE(e + 12);
      expect(b.subarray(offset, offset + 8).toString('hex')).toBe('89504e470d0a1a0a');
    });
  });
  it('the manifest names both PWA icons and the ink/newsprint colours', () => {
    const m = JSON.parse(readFileSync(join(PUBLIC, 'site.webmanifest'), 'utf8'));
    expect(m).toEqual(MANIFEST);
    expect(m.theme_color).toBe('#090A0F');
    expect(m.background_color).toBe('#FAF7F0');
  });
});
