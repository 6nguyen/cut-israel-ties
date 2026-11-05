// §7.1 draft-position: fetch a page, ask Haiku for the member's stated position on a goal with a
// verbatim quote and a date, then verify the quote against the fetched text by code. Prints one
// positions CSV row for the maintainer to paste; never writes data/.
import { callMessage } from './anthropic';
import { DATE_RE, DRAFT_MODEL, MAX_CHARS, csvCell, fetchPageText, quoteAppears } from './draft-shared';

export { DRAFT_MODEL, normalise, quoteAppears, stripTags } from './draft-shared';
export const POSITIONS = ['for', 'uncommitted', 'against', 'unknown'] as const;
export type PositionValue = (typeof POSITIONS)[number];
export const POSITIONS_HEADER = 'bioguide_id,position,source_url,source_date,changed_by';
export const CHANGED_BY = 'draft-position';

export interface ModelVerdict { position: PositionValue; quote: string; date: string; reason: string }
export const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    position: { type: 'string', enum: [...POSITIONS], description: 'The position the page states on the goal; "unknown" when the page states none.' },
    quote: { type: 'string', description: 'An exact, contiguous sentence copied from the page that states the position; empty when unknown.' },
    date: { type: 'string', description: 'The date of the statement as YYYY-MM-DD, taken from the page; empty when the page shows none.' },
    reason: { type: 'string', description: 'One sentence for the maintainer.' },
  },
  required: ['position', 'quote', 'date', 'reason'],
  additionalProperties: false,
} as const;

const SYSTEM = `You read one web page and report what it says about a named member of Congress's position on a civic goal.
Reply only from the page: copy the quote exactly as it appears (one contiguous passage, no edits, no ellipsis) and the date the page shows for it as YYYY-MM-DD.
"for" means the member supports what the goal asks; "against" means they oppose it; "uncommitted" means they addressed it without committing; "unknown" means the page does not state a position on this goal.
Never infer a position from party, votes on other matters, or silence. When unsure, answer "unknown".`;

export interface DraftInput { bioguide: string; memberName?: string; url: string; goal: string; goalAsk?: string }
export type Draft =
  | { kind: 'row'; row: string; quote: string; date: string; reason: string }
  | { kind: 'none'; reason: string };

/** Ask the model, then verify by code: a row only when the quote is verbatim on the page and the date is well-formed. */
export async function draftPosition(fetchImpl: typeof fetch, apiKey: string, input: DraftInput): Promise<Draft> {
  const page = await fetchPageText(fetchImpl, input.url, 'draft-position');
  if (page.kind === 'unsupported') return { kind: 'none', reason: page.reason };
  const text = page.text.slice(0, MAX_CHARS);
  if (text.length < 40) return { kind: 'none', reason: 'page has no readable text' };
  const who = input.memberName ? `${input.memberName} (${input.bioguide})` : input.bioguide;
  const goal = input.goalAsk ? `${input.goal}: ${input.goalAsk}` : input.goal;
  const r = await callMessage(fetchImpl, apiKey, {
    model: DRAFT_MODEL,
    max_tokens: 500,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `<member>${who}</member>\n<goal>${goal}</goal>\n<page url="${input.url}">\n${text}\n</page>` }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: VERDICT_SCHEMA } },
  });
  let v: Partial<ModelVerdict> = {};
  try { v = JSON.parse(r.text) as Partial<ModelVerdict>; } catch { return { kind: 'none', reason: 'model reply unreadable' }; }
  const position = POSITIONS.find((p) => p === v.position) ?? 'unknown';
  const reason = String(v.reason ?? '').slice(0, 300);
  if (position === 'unknown') return { kind: 'none', reason: reason || 'page states no position' };
  const quote = String(v.quote ?? '').trim();
  const date = String(v.date ?? '').trim();
  if (!quoteAppears(quote, text)) return { kind: 'none', reason: `quote not found verbatim on the page (${reason})` };
  if (!DATE_RE.test(date)) return { kind: 'none', reason: `quote found but the page shows no usable date (${reason})` };
  return { kind: 'row', row: [input.bioguide, position, input.url, date, CHANGED_BY].map(csvCell).join(','), quote, date, reason };
}
