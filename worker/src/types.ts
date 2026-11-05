// Row shapes mirror schema.sql; see docs/prd/action-router.md "Data & contracts".
export type Party = 'D' | 'R' | 'I';
export type Chamber = 'house' | 'senate';

export interface Member {
  bioguide_id: string;
  name: string;
  party: Party;
  chamber: Chamber;
  state: string;
  district: number | null;
  dc_phone: string | null;
  district_phone: string | null;
  contact_form_url: string | null;
  hasc: number;
  conferee: number;
  rc243: string | null;
  jrd_april_2026: string | null;
  btb_cosponsor: number;
  target_2028: number;
  money_url: string | null;
}

export const HOLDINGS_STATUSES = ['held', 'none', 'unknown'] as const;
export type HoldingsStatus = (typeof HOLDINGS_STATUSES)[number];

export interface StateRow {
  state: string;
  treasurer_name: string | null;
  treasurer_phone: string | null;
  decider: string | null;
  israel_bonds_usd: number | null;
  holdings_date: string | null;
  holdings_source: string | null;
  campaign_name: string | null;
  campaign_url: string | null;
  next_comment_date: string | null;
  holdings_status: HoldingsStatus; // held | none | unknown; `held` rows carry amount, date and source
}

export interface Goal {
  id: number;
  slug: string;
  category: 'federal_vote' | 'leadership' | 'state' | 'electoral';
  title: string;
  summary: string;
  what_we_want: string;
  status: 'upcoming' | 'active' | 'completed' | 'expired'; // upcoming = hidden until its predecessor closes (§2.3)
  outcome_note: string | null;
  window_start: string | null;
  window_end: string | null;
  decision_date: string | null;
  priority: number;
  eligibility: string; // JSON rule, see ranking.ts
  our_picks: string; // JSON [{name, rationale, source_url, signal, signal_date}]
  sources: string; // JSON [{title, url}]
  decider: string | null; // who decides, one line (§2.2)
  successor_slug: string | null;
  this_week: string | null;
  this_week_date: string | null;
  detail_md: string | null;
  prep_md: string | null;
  partner_url: string | null;
  updated_at: string;
}

export interface Action {
  id: number;
  goal_id: number;
  slug: string;
  type: 'call' | 'letter' | 'public_comment';
  target_scope: 'house' | 'senate' | 'both' | 'state';
  order: number;
  ask_text: string;
  form_schema: string;
  prompt_template: string | null;
  doc_format: string;
}

export interface Position {
  bioguide_id: string;
  goal_id: number;
  position: 'for' | 'uncommitted' | 'against' | 'unknown';
  source_url: string;
  source_date: string;
}

/** Everything the ranking needs about one visitor (§5.1). */
export interface Delegation {
  state: string;
  district: number;
  house: Member | null;
  senators: Member[];
  state_row: StateRow | null;
}

/** §4 write-side rows. None holds document text, an address or a user field. */
export interface GenerationRow {
  action_id: number;
  target_id: string;
  shingles: Uint32Array; // hashed 8-gram shingles of the shown document (§4.4)
  created_at: string;
  device_hash: string;
  ip_hash: string;
  input_tokens: number;
  output_tokens: number;
  model: string;
}
export type ReceiptKind = 'action' | 'captain-list'; // commitment-funnel §2.1: 'captain-list' rows have no action and no target
export interface ReceiptRow { goal_id: number; action_id: number | null; target_id: string | null; state: string | null; district: number | null; created_at: string; device_hash: string; kind: ReceiptKind; ip_hash: string | null }
/** district-counters §1: one COUNT per bucket; `calls|letters|comments` follow the action `type`, `captain_lists` the receipt kind. */
export interface ReceiptBuckets { calls: number; letters: number; comments: number; captain_lists: number }
/** district-counters §3: the receipt limits read; windows are [now − 24 h, now] and [now − 10 min, now]. */
export interface ReceiptLimitCounts { device_day: number; repeat: number; ip_day: number }
export type ReportOutcome = 'will_support' | 'undecided' | 'opposed' | 'no_answer' | 'other';
export interface ReportRow { bioguide_id: string; goal_id: number; outcome: ReportOutcome; note: string | null; created_at: string; device_hash: string }
export type ScreenClass = 'off_topic' | 'injection' | 'harmful';
/** §7.2 digest reads: a screening row without content, an active block, the last digest run. */
export interface ScreeningRow { device_hash: string; action_id: number; class: ScreenClass; created_at: string }
export interface BlockRow { device_hash: string; until: string }

/** Counts the §4.7 limits read; every window is [since, now]. */
export interface GenerationCounts { device_hour: number; device_day: number; device_action_day: number; ip_day: number; global_day: number }

/** Read-only data access; D1 in production, in-memory in tests and seed. */
export interface Repo {
  activeGoals(): Promise<Goal[]>;
  goalBySlug(slug: string): Promise<Goal | null>;
  actionsFor(goalIds: number[]): Promise<Action[]>;
  positionsFor(bioguideIds: string[], goalIds: number[]): Promise<Position[]>;
  delegation(state: string, district: number): Promise<Delegation>;
  // §4 lookups
  actionBySlug(slug: string): Promise<Action | null>;
  goalById(id: number): Promise<Goal | null>;
  member(bioguideId: string): Promise<Member | null>;
  stateRow(state: string): Promise<StateRow | null>;
  // §4 writes and counters (worker/src/generate.ts is the only caller)
  generationCounts(deviceHash: string, ipHash: string, actionId: number, now: Date): Promise<GenerationCounts>;
  recentShingles(actionId: number, limit: number): Promise<Uint32Array[]>;
  insertGeneration(row: GenerationRow): Promise<void>;
  screenedOutCount(deviceHash: string, since: Date): Promise<number>;
  insertScreening(deviceHash: string, actionId: number, cls: ScreenClass, at: Date): Promise<void>;
  blockedUntil(deviceHash: string): Promise<Date | null>;
  block(deviceHash: string, until: Date): Promise<void>;
  insertReceipt(row: ReceiptRow): Promise<number>;
  insertReport(row: ReportRow): Promise<number>;
  // §7.2 digest reads and its run marker (worker/src/digest.ts is the only caller). Nothing here touches `positions`.
  reportsSince(since: Date): Promise<ReportRow[]>;
  screeningsSince(since: Date): Promise<ScreeningRow[]>;
  activeBlocks(now: Date): Promise<BlockRow[]>;
  lastDigestRun(): Promise<Date | null>;
  recordDigestRun(at: Date, reportCount: number): Promise<void>;
  // member-pages §2.2: the newest visible office response for one member and goal (GET /api/members/:id/reports).
  latestReport(bioguideId: string, goalId: number): Promise<LatestReport | null>;
  // district-counters §1/§3 (worker/src/counts.ts and POST /api/receipt are the only callers).
  countReceipts(goalId: number, state: string, district: number | null, sinceIso: string): Promise<{ district: ReceiptBuckets; state: ReceiptBuckets }>;
  receiptLimitCounts(deviceHash: string, ipHash: string, goalId: number, actionId: number | null, kind: ReceiptKind, now: Date): Promise<ReceiptLimitCounts>;
}

/** What a member page shows of a constituent report: no device hash, no id. */
export interface LatestReport { outcome: ReportOutcome; note: string | null; created_at: string }

export interface Env {
  DB: D1Database;
  TURNSTILE_SECRET?: string;
  GEOCODER_URL?: string;
  ANTHROPIC_API_KEY?: string;
  MAX_GENERATIONS_PER_DAY?: string;
  // §7.2 nightly digest: Email Routing binding, recipient and sender (an address on the zone).
  DIGEST_MAIL?: SendEmail;
  MAINTAINER_EMAIL?: string;
  DIGEST_FROM?: string;
  // district-counters: hide buckets below this (default 5); daily salt for receipts.ip_hash (secret).
  COUNT_THRESHOLD?: string;
  IP_SALT?: string;
}
