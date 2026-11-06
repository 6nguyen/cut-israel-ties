// /feeds/decisions.ics (call-follow-through §5): one all-day event per upcoming or active goal with a
// decision date. Emitted at build into dist/feeds/; UIDs are per goal so a moved date updates the event
// and a closed goal drops out. Absolute URLs come from `site` (SITE_URL); without it the paths are bare.
import type { APIRoute } from 'astro';
import { feedGoals } from '../../lib/goals';
import { buildFeed } from '../../lib/ics';

export const GET: APIRoute = ({ site }) => {
  const origin = site ? site.origin : '';
  const ics = buildFeed(feedGoals().map((g) => ({ uid: `decision-${g.slug}@cut-the-ties`, date: g.decision_date!, title: `Decision: ${g.title}`, url: `${origin}/goals/${g.slug}` })), new Date());
  return new Response(ics, { headers: { 'content-type': 'text/calendar; charset=utf-8' } });
};
