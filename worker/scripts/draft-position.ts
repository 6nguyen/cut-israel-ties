// §7.1 maintainer tool. Usage (from worker/, ANTHROPIC_API_KEY set):
//   npm run draft-position -- <bioguide_id> <url> [goal-slug]
// Prints ONE positions CSV row on stdout (header in data/positions/<goal>.csv) and the verbatim
// quote, date and reason on stderr; or "no stated position". It never writes data/.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRows } from '../src/load';
import { POSITIONS_HEADER, draftPosition } from '../src/draft-position';

const [bioguide, url, goalSlug = 'ndaa-1217'] = process.argv.slice(2);
if (!bioguide || !url) { console.error('usage: draft-position <bioguide_id> <url> [goal-slug]'); process.exit(64); }
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('ANTHROPIC_API_KEY is not set'); process.exit(78); }

const here = dirname(fileURLToPath(import.meta.url));
const rows = loadRows(join(here, '..', '..', 'data'));
const goal = rows.goals.find((g) => g.slug === goalSlug);
if (!goal) { console.error(`unknown goal slug ${goalSlug}; one of ${rows.goals.map((g) => g.slug).join(', ')}`); process.exit(65); }
const member = rows.members.find((m) => m.bioguide_id === bioguide);

const draft = await draftPosition(fetch, apiKey, { bioguide, memberName: member?.name, url, goal: goal.slug, goalAsk: goal.what_we_want });
if (draft.kind === 'none') {
  console.log(`# no stated position: ${bioguide} on ${goal.slug} at ${url} — ${draft.reason}`);
  process.exit(0);
}
console.error(`quote (${draft.date}): "${draft.quote}"\nreason: ${draft.reason}\npaste the row below into data/positions/${goal.slug}.csv (header: ${POSITIONS_HEADER}) in a PR:`);
console.log(draft.row);
