// Member share card: "<name> on <goal>" over the position line, rendered at build like the goal cards.
import type { APIRoute } from 'astro';
import { cardSvg, renderCard } from '../../goals/[slug]/card.png';
import type { Goal } from '../../../lib/goals';
import { goalsFor, members, positionLine, role, type Member } from '../../../lib/members';

export function getStaticPaths() {
  return members().map((m) => ({ params: { id: m.bioguide_id }, props: { member: m } }));
}

export const GET: APIRoute = async ({ props }) => {
  const m = (props as { member: Member }).member;
  const first = goalsFor(m)[0];
  const card = { category: first?.goal.category ?? 'federal_vote', title: first ? `${m.name} on ${first.goal.title}` : `${role(m)} ${m.name}`, what_we_want: positionLine(m, first) } as Goal;
  const png = await renderCard(cardSvg(card)); // urgency-and-readability §6.4: the logo mark, like the goal cards
  return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
};
