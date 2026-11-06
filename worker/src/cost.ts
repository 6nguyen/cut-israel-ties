// generation-cost §1: dollars from `generations` token sums and the budget-derived daily cap.
// Pure functions; every number here is arithmetic over stored rows, never a model's estimate.
import type { Repo, TokenSum } from './types';

const DAY = 86_400_000;

/** USD per million tokens (Claude API price list as read on PRICES_READ; docs/research/generation-cost.md §1). */
export const PRICES_READ = '2026-10-06';
export const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
};
/** Fixed allowance per model-drafted document for the Haiku screen call, whose tokens are not stored. */
export const SCREEN_ALLOWANCE_USD = 0.0001;
/** The row a code-built standard script writes: no model, no tokens, no cost. */
export const STANDARD_MODEL = 'standard';
/** Blended cost per document while fewer than MIN_SAMPLE generations exist (research §3 working figure). */
export const DEFAULT_BLENDED_USD = 0.025;
export const MIN_SAMPLE = 20;
/** `LLM_MONTHLY_BUDGET_USD` default; the same figure as `MONTHLY_COST_USD` on /donate. */
export const DEFAULT_BUDGET_USD = 15;
/** No day serves fewer personalised documents than this while the budget is above zero. */
export const CAP_FLOOR = 20;

const isModelRow = (r: TokenSum): boolean => r.model !== STANDARD_MODEL;

/** Σ input × in + output × out over per-model sums, plus the screen allowance per model-drafted row. Unknown models cost $0. */
export function costUsd(rows: TokenSum[]): number {
  let usd = 0;
  for (const r of rows) {
    if (!isModelRow(r)) continue;
    const p = PRICES[r.model];
    if (p) usd += (r.input * p.input + r.output * p.output) / 1_000_000;
    usd += r.count * SCREEN_ALLOWANCE_USD;
  }
  return usd;
}

/** Model-drafted documents in the sums (standard rows excluded). */
export function documentCount(rows: TokenSum[]): number {
  return rows.filter(isModelRow).reduce((n, r) => n + r.count, 0);
}

/** Trailing mean cost per model-drafted document, or the default while the sample is under MIN_SAMPLE. */
export function blendedCost(rows: TokenSum[]): number {
  const n = documentCount(rows);
  return n < MIN_SAMPLE ? DEFAULT_BLENDED_USD : costUsd(rows) / n;
}

/** Days from `today` (inclusive) to the end of its UTC month. */
export function daysLeftInMonth(today: Date): number {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return days - today.getUTCDate() + 1;
}

/** First instant of `today`'s UTC month, ISO. */
export function monthStart(today: Date): string {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString();
}

/**
 * clamp(floor((budget − spent) / daysLeft / blended), CAP_FLOOR, ceiling). A budget of 0 (or less) means
 * no model calls at all: the cap is 0 and every request gets the standard script.
 */
export function dailyCap(spentMonthToDate: number, blended: number, today: Date, budget: number, ceiling: number): number {
  if (!(budget > 0)) return 0;
  const perDay = (budget - spentMonthToDate) / daysLeftInMonth(today) / (blended > 0 ? blended : DEFAULT_BLENDED_USD);
  const raw = Number.isFinite(perDay) ? Math.floor(perDay) : 0;
  return Math.min(Math.max(raw, CAP_FLOOR), Math.max(ceiling, CAP_FLOOR));
}

/** Today's cap and the month's spend from the two `tokensSince` sums the cap and the digest share. */
export async function currentCap(repo: Pick<Repo, 'tokensSince'>, now: Date, budget: number, ceiling: number): Promise<{ cap: number; spent: number; blended: number }> {
  const [month, week] = await Promise.all([repo.tokensSince(monthStart(now)), repo.tokensSince(new Date(now.getTime() - 7 * DAY).toISOString())]);
  const spent = costUsd(month);
  const blended = blendedCost(week);
  return { cap: dailyCap(spent, blended, now, budget, ceiling), spent, blended };
}

/** `LLM_MONTHLY_BUDGET_USD`: "0" is a real zero; unset, blank or unparsable reads as the default. */
export function parseBudget(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_BUDGET_USD;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_BUDGET_USD;
}

/** Two decimals, no rounding surprises for the digest and tests. */
export const usd = (n: number): string => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
