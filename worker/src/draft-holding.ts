// state-holdings-sweep §1.1 draft-holding: fetch a treasurer report or pension disclosure, ask Haiku
// for the state's Israel-bond holding in USD, its date, the deciding body and a verbatim quote, then
// verify by code: the quote is on the page, the amount is in the quote, the date is well-formed.
// Prints one states.csv row for the maintainer to paste; never writes data/.
import { callMessage } from './anthropic';
import { DATE_RE, DRAFT_MODEL, csvCell, fetchPageText, normalise, quoteAppears } from './draft-shared';
import { HOLDINGS_STATUSES, type HoldingsStatus, type StateRow } from './types';

export const STATES_HEADER = 'state,treasurer_name,treasurer_phone,decider,israel_bonds_usd,holdings_date,holdings_source,campaign_name,campaign_url,next_comment_date,holdings_status';
export const STATE_CODE_RE = /^[A-Z]{2}$/;

export interface HoldingVerdict { status: HoldingsStatus; amount_usd: number; date: string; decider: string; quote: string; reason: string }
export const HOLDING_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: [...HOLDINGS_STATUSES], description: '"held" when the page states the state holds Israel bonds, "none" when it states it holds none, "unknown" when it says neither.' },
    amount_usd: { type: 'integer', description: 'The Israel-bond holding in whole US dollars as the page states it (12.5 million → 12500000); 0 when none or unknown.' },
    date: { type: 'string', description: 'The as-of date of the holding as YYYY-MM-DD, taken from the page; empty when the page shows none.' },
    decider: { type: 'string', description: 'The office or board the page names as deciding the holding (e.g. "State Treasurer", "Board of Trustees of the State Retirement System"); empty when the page names none.' },
    quote: { type: 'string', description: 'An exact, contiguous passage copied from the page that states the holding (or its absence), including the amount when held; empty when unknown.' },
    reason: { type: 'string', description: 'One sentence for the maintainer.' },
  },
  required: ['status', 'amount_usd', 'date', 'decider', 'quote', 'reason'],
  additionalProperties: false,
} as const;

const SYSTEM = `You read one public document (a state treasurer's investment report or a pension system's holdings disclosure) and report what it says about that state's holdings of Israel bonds (bonds issued by the State of Israel, often "Israel Bonds" or "State of Israel bonds").
Reply only from the page: copy the quote exactly as it appears (one contiguous passage, no edits, no ellipsis) and the as-of date the page shows for it as YYYY-MM-DD. The amount must be the figure inside the quote.
"held" means the page states the state or its pension system holds Israel bonds; "none" means the page states it holds none; "unknown" means the page does not say.
Never infer a holding from other securities, from a policy, or from silence. When unsure, answer "unknown".`;

const SCALE: Record<string, number> = { thousand: 1e3, k: 1e3, million: 1e6, mm: 1e6, m: 1e6, mn: 1e6, billion: 1e9, bn: 1e9, b: 1e9 };

/** Every dollar figure a passage states, as whole USD: "$12.5 million", "$62,000,000", "62M". */
export function amountsIn(text: string): number[] {
  const out: number[] = [];
  const re = /\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|mm|mn|bn|k|m|b)?\b/gi;
  for (const m of normalise(text).matchAll(re)) {
    const n = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    const scale = m[2] ? SCALE[m[2].toLowerCase()] ?? 1 : 1;
    out.push(Math.round(n * scale));
  }
  return out;
}

export interface HoldingInput { state: string; url: string; existing?: StateRow | null }
export type HoldingDraft =
  | { kind: 'row'; row: string; status: Exclude<HoldingsStatus, 'unknown'>; amount: number | null; date: string; decider: string | null; quote: string; reason: string }
  | { kind: 'none'; reason: string };

/** Ask the model, then verify by code: a row only when the quote is verbatim on the page, the amount is in the quote and the date is well-formed. */
export async function draftHolding(fetchImpl: typeof fetch, apiKey: string, input: HoldingInput): Promise<HoldingDraft> {
  const page = await fetchPageText(fetchImpl, input.url, 'draft-holding');
  if (page.kind === 'unsupported') return { kind: 'none', reason: page.reason };
  const text = page.text;
  if (text.length < 40) return { kind: 'none', reason: 'page has no readable text' };
  const r = await callMessage(fetchImpl, apiKey, {
    model: DRAFT_MODEL,
    max_tokens: 500,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `<state>${input.state}</state>\n<page url="${input.url}">\n${text}\n</page>` }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: HOLDING_SCHEMA } },
  });
  let v: Partial<HoldingVerdict> = {};
  try { v = JSON.parse(r.text) as Partial<HoldingVerdict>; } catch { return { kind: 'none', reason: 'model reply unreadable' }; }
  const status = HOLDINGS_STATUSES.find((s) => s === v.status) ?? 'unknown';
  const reason = String(v.reason ?? '').slice(0, 300);
  if (status === 'unknown') return { kind: 'none', reason: reason || 'page states no holding' };
  const quote = String(v.quote ?? '').trim();
  const date = String(v.date ?? '').trim();
  if (!quoteAppears(quote, text)) return { kind: 'none', reason: `quote not found verbatim on the page (${reason})` };
  if (!DATE_RE.test(date)) return { kind: 'none', reason: `quote found but the page shows no usable date (${reason})` };
  let amount: number | null = null;
  if (status === 'held') {
    const n = Number(v.amount_usd);
    if (!Number.isInteger(n) || n <= 0) return { kind: 'none', reason: `held but no whole-dollar amount (${reason})` };
    if (!amountsIn(quote).includes(n)) return { kind: 'none', reason: `amount ${n} is not a figure in the quote (${reason})` };
    amount = n;
  }
  const proposed = String(v.decider ?? '').trim();
  const decider = proposed && normalise(text).includes(normalise(proposed)) ? proposed : input.existing?.decider ?? null;
  const e = input.existing;
  const cells = [input.state, e?.treasurer_name ?? '', e?.treasurer_phone ?? '', decider ?? '', amount === null ? '' : String(amount), date, input.url, e?.campaign_name ?? '', e?.campaign_url ?? '', e?.next_comment_date ?? '', status];
  return { kind: 'row', row: cells.map(csvCell).join(','), status, amount, date, decider, quote, reason };
}
