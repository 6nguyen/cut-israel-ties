// district-counters PRD §1 and §3: per-district and per-state receipt counts over the last 7 days,
// the threshold that hides small numbers, and the receipt abuse limits. Every number here is a
// COUNT over `receipts` rows (D1 SQL or the in-memory array); no LLM is anywhere near it.
import type { Env, ReceiptBuckets, ReceiptKind, Repo } from './types';
import { sha256Hex } from './generate';

export const DAY_MS = 86_400_000;
/** §1.1: receipts newer than now − 7 days count. */
export const COUNT_WINDOW_DAYS = 7;
/** §1.2: a bucket below this is returned as 0 (`COUNT_THRESHOLD` Worker var overrides). */
export const DEFAULT_COUNT_THRESHOLD = 5;
/** §1.1: edge cache lifetime, seconds. */
export const COUNT_CACHE_SECONDS = 300;

export interface CountsResponse { district: ReceiptBuckets; state: ReceiptBuckets; since: string }

export const EMPTY_BUCKETS: ReceiptBuckets = { calls: 0, letters: 0, comments: 0, captain_lists: 0 };
export const BUCKETS = ['calls', 'letters', 'comments', 'captain_lists'] as const;

/** Which bucket one receipt falls in: the action's `type`, or `captain_lists` for a captain-list receipt. */
export function bucketOf(kind: ReceiptKind, type: string | null | undefined): keyof ReceiptBuckets | null {
  if (kind === 'captain-list') return 'captain_lists';
  if (type === 'call') return 'calls';
  if (type === 'letter') return 'letters';
  if (type === 'public_comment') return 'comments';
  return null;
}

/** `COUNT_THRESHOLD` when it is a positive integer, else the default. */
export function thresholdFrom(env: Pick<Env, 'COUNT_THRESHOLD'>): number {
  const n = Number(env.COUNT_THRESHOLD);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_COUNT_THRESHOLD;
}

/** §1.2: every bucket under the threshold becomes 0, so the response never carries 1…threshold−1. */
export function applyThreshold(b: ReceiptBuckets, threshold: number): ReceiptBuckets {
  const out = { ...EMPTY_BUCKETS };
  for (const k of BUCKETS) out[k] = b[k] >= threshold ? b[k] : 0;
  return out;
}

/** The `/api/counts` body for one goal and place. `district` null (a senator's page) leaves the district buckets at 0. */
export async function counts(repo: Repo, goalId: number, state: string, district: number | null, now: Date, threshold: number): Promise<CountsResponse> {
  const since = new Date(now.getTime() - COUNT_WINDOW_DAYS * DAY_MS).toISOString();
  const raw = await repo.countReceipts(goalId, state, district, since);
  return { district: applyThreshold(raw.district, threshold), state: applyThreshold(raw.state, threshold), since };
}

// ---- §3 abuse limits on POST /api/receipt ---------------------------------------------------------
/** §3.1–3.2: per device per day, per device+goal+action per 10 minutes, per IP hash per day. */
export const RECEIPT_LIMITS = { device_day: 10, repeat_minutes: 10, ip_day: 50 } as const;

let saltWarned = false;
/**
 * §3.2: SHA-256 of the client IP, a daily salt and the UTC date, so one day's hashes cannot be joined
 * with another's. With no `IP_SALT` secret the salt is empty and the date alone rotates the hash
 * (a warning is logged once per isolate; set the secret in production).
 */
export async function receiptIpHash(ip: string | undefined, salt: string | undefined, now: Date): Promise<string> {
  if (!salt && !saltWarned) { saltWarned = true; console.warn('receipt: IP_SALT is unset; ip_hash rotates on the UTC date only'); }
  return sha256Hex(`${ip ?? 'unknown'}|${salt ?? ''}|${now.toISOString().slice(0, 10)}`);
}
