// Default share card for pages that are not a goal (landing, results, goals overview).
import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { cardSvg } from './goals/[slug]/card.png';
import type { Goal } from '../lib/goals';

const SITE = { category: 'federal_vote', title: 'Find the two things you can do this week', what_we_want: 'End US aid, military partnership and integration with Israel. Enter your address; we find your members of Congress.' } as Goal;

export const GET: APIRoute = async () => {
  const png = await sharp(Buffer.from(cardSvg(SITE).replace('FEDERAL VOTE · ', 'CONSTITUENT ACTION · '))).png().toBuffer();
  return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
};
