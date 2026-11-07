// urgency-and-readability §6: the committed icon set is exactly what `npm run icons -w web` renders from
// web/src/assets/logo-1024.png, the header mark stays under the landing budget's 8 KB line, and the
// favicon.ico container carries the three classic sizes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ICO_SIZES, MANIFEST, PUBLIC, renderIcons } from '../scripts/icons';

describe('icon set', () => {
  it('regenerates byte-identical to the committed files', async () => {
    const files = await renderIcons();
    expect(Object.keys(files).sort()).toEqual(['apple-touch-icon.png', 'favicon-32.png', 'favicon.ico', 'icon-192.png', 'icon-512.png', 'mark-64.png', 'site.webmanifest']);
    for (const [name, data] of Object.entries(files)) expect(readFileSync(join(PUBLIC, name)).equals(data), name).toBe(true);
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
