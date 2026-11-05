// §2.2 share card: one 1200×630 PNG per published goal, rendered at build from the goal row.
import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { CATEGORY, publishedGoals, type Goal } from '../../../lib/goals';

export function getStaticPaths() {
  return publishedGoals().map((g) => ({ params: { slug: g.slug }, props: { goal: g } }));
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Greedy wrap by character count; the condensed face averages ~0.45 em per glyph. */
export function wrap(text: string, max: number, lines: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    if ((line + ' ' + w).trim().length > max && line) { out.push(line); line = w; } else line = (line + ' ' + w).trim();
  }
  if (line) out.push(line);
  if (out.length > lines) { out.length = lines; out[lines - 1] = out[lines - 1].replace(/\s*\S*$/, '') + '…'; }
  return out;
}

export function cardSvg(goal: Goal): string {
  const title = wrap(goal.title.toUpperCase(), 26, 3);
  const size = title.length === 3 ? 84 : 96;
  const lead = size * 1.02;
  const y0 = 330 - ((title.length - 1) * lead) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#090A0F"/>
  <rect x="0" y="0" width="1200" height="14" fill="#00E876"/>
  <text x="72" y="118" fill="#FACC15" font-family="'Space Mono', Menlo, monospace" font-size="26" font-weight="700" letter-spacing="2">${esc(CATEGORY[goal.category].toUpperCase())} · CUT THE TIES</text>
  ${title.map((l, i) => `<text x="72" y="${(y0 + i * lead).toFixed(0)}" fill="#FAF7F0" font-family="'Bebas Neue', Impact, 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif" font-size="${size}" font-weight="700" letter-spacing="2">${esc(l)}</text>`).join('\n  ')}
  <rect x="72" y="520" width="1056" height="4" fill="#E11148"/>
  <text x="72" y="572" fill="#FAF7F0" font-family="Inter, 'Helvetica Neue', Arial, sans-serif" font-size="28">${esc(wrap(goal.what_we_want, 70, 1)[0])}</text>
</svg>`;
}

export const GET: APIRoute = async ({ props }) => {
  const png = await sharp(Buffer.from(cardSvg((props as { goal: Goal }).goal))).png().toBuffer();
  return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
};
