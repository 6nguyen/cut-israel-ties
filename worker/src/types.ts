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
}

export interface Goal {
  id: number;
  slug: string;
  category: 'federal_vote' | 'leadership' | 'state' | 'electoral';
  title: string;
  summary: string;
  what_we_want: string;
  status: 'active' | 'completed' | 'expired';
  outcome_note: string | null;
  window_start: string | null;
  window_end: string | null;
  decision_date: string | null;
  priority: number;
  eligibility: string; // JSON rule, see ranking.ts
  our_picks: string;
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

/** Read-only data access; D1 in production, in-memory in tests and seed. */
export interface Repo {
  activeGoals(): Promise<Goal[]>;
  actionsFor(goalIds: number[]): Promise<Action[]>;
  positionsFor(bioguideIds: string[], goalIds: number[]): Promise<Position[]>;
  delegation(state: string, district: number): Promise<Delegation>;
}

export interface Env {
  DB: D1Database;
  TURNSTILE_SECRET?: string;
  GEOCODER_URL?: string;
}
