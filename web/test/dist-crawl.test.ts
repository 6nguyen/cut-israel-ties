// office-visits §3 static check: no built page carries an organiser contact. The contact is fetched
// per request at runtime, so the only way one could reach web/dist is a build-time leak; this walks
// every HTML file in web/dist (when a build exists) and asserts none holds a contact_url-like value.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIST = join(process.cwd(), 'dist');
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith('.html')) out.push(p); }
  return out;
}

describe('built pages', () => {
  const built = existsSync(DIST);
  it.skipIf(!built)('carry no contact_url and no visit contact value', () => {
    const pages = walk(DIST);
    expect(pages.length).toBeGreaterThan(0);
    for (const p of pages) {
      const html = readFileSync(p, 'utf8');
      expect(html, p).not.toMatch(/contact_url/);
      expect(html, p).not.toMatch(/signal\.group|t\.me\/\+|chat\.whatsapp\.com/);
    }
  });
  if (!built) it('skipped: no web/dist (run quiet-check build first)', () => { expect(true).toBe(true); });
});
