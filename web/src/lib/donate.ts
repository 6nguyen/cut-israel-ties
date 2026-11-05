// Build-time donation config (Pages build env). The site is static, so these are
// read when `astro build` runs, not by the Worker: MONTHLY_COST_USD (number) and
// STRIPE_LINKS (JSON of Stripe Payment Link URLs). Unset or invalid values fall
// back to safe defaults; a missing link renders a disabled button.
export type DonateKey = 'once_5' | 'once_20' | 'once_50' | 'monthly_5';

export const DONATE_OPTIONS: { key: DonateKey; label: string; note: string }[] = [
  { key: 'once_5', label: '$5', note: 'one time' },
  { key: 'once_20', label: '$20', note: 'one time' },
  { key: 'once_50', label: '$50', note: 'one time' },
  { key: 'monthly_5', label: '$5', note: 'every month' },
];

// PRD estimate: <= $15/month at 1,000 documents/month.
export const DEFAULT_MONTHLY_COST_USD = 15;

export function parseMonthlyCost(raw: string | undefined): number {
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : DEFAULT_MONTHLY_COST_USD;
}

export function formatUsd(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

export function parseStripeLinks(raw: string | undefined): Partial<Record<DonateKey, string>> {
  if (!raw) return {};
  let obj: unknown;
  try { obj = JSON.parse(raw); } catch { return {}; }
  const out: Partial<Record<DonateKey, string>> = {};
  for (const { key } of DONATE_OPTIONS) {
    const v = (obj as Record<string, unknown> | null)?.[key];
    if (typeof v === 'string' && /^https:\/\//.test(v)) out[key] = v;
  }
  return out;
}

export const monthlyCost = parseMonthlyCost(process.env.MONTHLY_COST_USD);
export const stripeLinks = parseStripeLinks(process.env.STRIPE_LINKS);
