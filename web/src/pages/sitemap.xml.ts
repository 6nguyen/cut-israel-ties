// /sitemap.xml: landing, goals overview, every published goal, prep, whip and member page.
// Absolute URLs come from `site` (SITE_URL in the Pages build env); without it the paths are emitted bare.
import type { APIRoute } from 'astro';
import { prepGoals, publishedGoals } from '../lib/goals';
import { members, whipGoals } from '../lib/members';

export const GET: APIRoute = ({ site }) => {
  const origin = site ? site.origin : '';
  const paths = [
    '/', '/goals', '/about', '/donate', '/privacy',
    ...publishedGoals().map((g) => `/goals/${g.slug}`),
    ...prepGoals().map((g) => `/goals/${g.slug}/prep`),
    ...whipGoals().map((g) => `/goals/${g.slug}/whip`),
    ...members().map((m) => `/m/${m.bioguide_id}`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${origin}${p}</loc></url>`).join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
