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
  district_office_address: string | null; // office-visits: empty until a data/ PR fills it
  district_office_city: string | null;
  // roster-freshness §2/§4: how the contact link was obtained, and the transition flags.
  contact_kind: ContactKind | null;
  not_returning: number; // 1 = hand-set from election results; keeps every target slot
  left_office: string | null; // ISO date set by the import once the member drops out of the roster (never before 2027-01-03)
}

export const CONTACT_KINDS = ['form', 'zip_gate', 'homepage'] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

/** roster-freshness §1: one district office row from data/district_offices.csv (upstream legislators-district-offices.yaml). */
export interface Office {
  bioguide_id: string;
  office_id: string;
  city: string;
  state: string;
  zip: string | null;
  address: string | null;
  suite: string | null;
  building: string | null;
  phone: string | null;
  fax: string | null;
  hours: string | null;
  lat: number | null;
  lng: number | null;
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
  /** generation-cost §4: plain text with {{placeholders}}, rendered by worker/src/standard.ts when no model runs. */
  standard_template: string | null;
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
  model: string; // DOC_MODEL, or 'standard' for a code-built script (generation-cost §4)
  attempt: number; // 1, or 2 when a redraft ran (generation-cost §3)
  check_fail: string | null; // the failure class of attempt 1 when a redraft ran
}

/** generation-cost §1: per-(model, action, first-failure class) token sums since an instant; `costUsd` prices them. */
export interface TokenSum { model: string; action_id: number; check_fail: string | null; input: number; output: number; count: number; redrafts: number }
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
  // roster-freshness §1: a member's district offices in file order (route.ts reads them for the district line).
  offices(bioguideId: string): Promise<Office[]>;
  // §4 writes and counters (worker/src/generate.ts is the only caller)
  generationCounts(deviceHash: string, ipHash: string, actionId: number, now: Date): Promise<GenerationCounts>;
  recentShingles(actionId: number, limit: number): Promise<Uint32Array[]>;
  insertGeneration(row: GenerationRow): Promise<void>;
  // generation-cost §1: one query behind the daily cap and the digest's spend block.
  tokensSince(iso: string): Promise<TokenSum[]>;
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
  // primary-2028 §1.2: every goal the site tracked (active or closed, never upcoming) for the electoral record.
  trackedGoals(): Promise<Goal[]>;
  // office-visits (worker/src/index.ts and digest.ts are the only callers). Requests are counted by code.
  insertVisit(row: VisitRow): Promise<number>;
  visit(id: number): Promise<Visit | null>;
  /** Approved listings for one member with their stored request count; the caller drops expired ones. */
  approvedVisits(bioguideId: string): Promise<{ visit: Visit; requests: number }[]>;
  pendingVisits(): Promise<Visit[]>;
  pendingVisitCount(deviceHash: string): Promise<number>;
  setVisitStatus(id: number, status: VisitStatus, at: Date): Promise<void>;
  /** Deletes the listing and every request on it. */
  deleteVisit(id: number): Promise<void>;
  hasVisitRequest(visitId: number, deviceHash: string): Promise<boolean>;
  visitRequestsSince(deviceHash: string, since: Date): Promise<number>;
  insertVisitRequest(visitId: number, deviceHash: string, at: Date): Promise<void>;
  deleteVisitRequest(visitId: number, deviceHash: string): Promise<void>;
}

/** What a member page shows of a constituent report: no device hash, no id. */
export interface LatestReport { outcome: ReportOutcome; note: string | null; created_at: string }

/** office-visits rows. `starts_at`/`ends_at` are office local time `YYYY-MM-DDTHH:MM`; `contact_url` never leaves the Worker except to a device whose request is stored. */
export type VisitStatus = 'pending' | 'approved' | 'rejected' | 'hidden';
export interface VisitRow { bioguide_id: string; office_city: string; starts_at: string; ends_at: string; contact_url: string; note: string | null; status: VisitStatus; device_hash: string; created_at: string; reviewed_at: string | null }
export interface Visit extends VisitRow { id: number }
export interface VisitRequestRow { visit_id: number; device_hash: string; created_at: string }
/** What GET /api/visits returns per listing: no contact, no device hash. */
export interface VisitPublic { id: number; bioguide_id: string; office_city: string; starts_at: string; ends_at: string; note: string | null; requests: number }

export interface Env {
  DB: D1Database;
  TURNSTILE_SECRET?: string;
  GEOCODER_URL?: string;
  // district-vintage-rollover §1: geocoder vintage (ACS2025_Current = 119th map until 2027-01-03).
  DISTRICT_VINTAGE?: string;
  ANTHROPIC_API_KEY?: string;
  MAX_GENERATIONS_PER_DAY?: string;
  // generation-cost §1: the month's LLM budget in USD (default 15; "0" = standard scripts only).
  LLM_MONTHLY_BUDGET_USD?: string;
  // §7.2 nightly digest: Email Routing binding, recipient and sender (an address on the zone).
  DIGEST_MAIL?: SendEmail;
  MAINTAINER_EMAIL?: string;
  DIGEST_FROM?: string;
  // district-counters: hide buckets below this (default 5); daily salt for receipts.ip_hash (secret).
  COUNT_THRESHOLD?: string;
  IP_SALT?: string;
  // office-visits: "0" pauses listings (POST routes 503, GET empty); the secret signs the digest's review links.
  VISITS_ENABLED?: string;
  VISITS_REVIEW_SECRET?: string;
}
