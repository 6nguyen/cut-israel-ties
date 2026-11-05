// state-holdings-sweep §1.1 maintainer tool. Usage (from worker/, ANTHROPIC_API_KEY set):
//   npm run draft-holding -- <STATE> <url>
// Prints ONE states.csv row on stdout (replacing that state's row) and the verbatim quote, amount,
// date and reason on stderr; or "no sourced holding". HTML and plain-text pages only (no PDF
// parser ships here). It never writes data/.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRows } from '../src/load';
import { STATES_HEADER, STATE_CODE_RE, draftHolding } from '../src/draft-holding';

const [state, url] = process.argv.slice(2);
if (!state || !url) { console.error('usage: draft-holding <STATE> <url>'); process.exit(64); }
if (!STATE_CODE_RE.test(state)) { console.error(`state must be a two-letter postal code, got ${state}`); process.exit(65); }
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('ANTHROPIC_API_KEY is not set'); process.exit(78); }

const here = dirname(fileURLToPath(import.meta.url));
const rows = loadRows(join(here, '..', '..', 'data'));
const existing = rows.states.find((s) => s.state === state) ?? null;

const draft = await draftHolding(fetch, apiKey, { state, url, existing });
if (draft.kind === 'none') {
  console.log(`# no sourced holding: ${state} at ${url} — ${draft.reason}`);
  process.exit(0);
}
console.error(`${draft.status}${draft.amount === null ? '' : ` $${draft.amount}`} as of ${draft.date}; decider: ${draft.decider ?? 'not on the page'}\nquote: "${draft.quote}"\nreason: ${draft.reason}\nreplace the ${state} row in data/states.csv (header: ${STATES_HEADER}) with the row below in a PR:`);
console.log(draft.row);
