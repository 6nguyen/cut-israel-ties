// primary-2028 §1: an electoral goal is a sourced record of one House member
// before the 2028 primary. Pure functions over data/ rows, shared by the
// loader, the Worker, the web build and `scripts/make-primary-goal.ts`.
// Nothing here names a candidate (Open question 1) and nothing is estimated.
import { districtError } from './districts';
import { electoralSeat } from './ranking';
import { latestPosition, whipTargets } from './whip';
import type { Action, Goal, Member, Position } from './types';

/** One `data/elections.csv` row: the state election office's primary date and filing deadline for a seat. */
export interface ElectionRow {
  state: string;
  district: number;
  primary_date: string;
  filing_deadline: string;
  source_url: string;
}

export const ELECTIONS_HEADER = ['state', 'district', 'primary_date', 'filing_deadline', 'source_url'] as const;
/** Title prefix of the `sources` row the loader adds from elections.csv; `route.ts` finds the URL by it. */
export const ELECTION_SOURCE_TITLE = 'Primary date and filing deadline';

export const primarySlug = (state: string, district: number): string => `primary-${state.toLowerCase()}-${district}`;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** True for a real calendar date written YYYY-MM-DD (2028-02-30 is not one). */
export function isIsoDate(d: string): boolean {
  if (!ISO.test(d)) return false;
  const t = Date.parse(d + 'T00:00:00Z');
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
}

/** parseCsv rows → typed rows; the header must be exactly ELECTIONS_HEADER. */
export function parseElections(rows: Record<string, string>[]): ElectionRow[] {
  return rows.map((r, i) => {
    for (const k of ELECTIONS_HEADER) if (!(k in r)) throw new Error(`elections.csv row ${i + 2}: missing column ${k}`);
    return { state: r.state, district: Number(r.district), primary_date: r.primary_date, filing_deadline: r.filing_deadline, source_url: r.source_url };
  });
}

/** Seed checks (PRD Data & contracts): a known seat, two real ISO dates in order, an https source, no duplicate seat. */
export function checkElections(rows: ElectionRow[]): void {
  const seen = new Set<string>();
  for (const e of rows) {
    const where = `elections.csv: ${e.state}-${e.district}`;
    if (!Number.isInteger(e.district) || e.district < 0) throw new Error(`${where}: district must be a whole number`);
    const err = districtError(e.state, e.district);
    if (err) throw new Error(`${where}: ${err}`);
    if (!isIsoDate(e.primary_date)) throw new Error(`${where}: primary_date must be a real YYYY-MM-DD date, got ${JSON.stringify(e.primary_date)}`);
    if (!isIsoDate(e.filing_deadline)) throw new Error(`${where}: filing_deadline must be a real YYYY-MM-DD date, got ${JSON.stringify(e.filing_deadline)}`);
    if (e.filing_deadline > e.primary_date) throw new Error(`${where}: filing_deadline ${e.filing_deadline} is after primary_date ${e.primary_date}`);
    if (!/^https:\/\/\S+$/.test(e.source_url)) throw new Error(`${where}: source_url must be an https URL (the state election office page)`);
    const key = `${e.state}-${e.district}`;
    if (seen.has(key)) throw new Error(`${where}: duplicate row`);
    seen.add(key);
  }
}

export const electionFor = (rows: ElectionRow[], state: string, district: number): ElectionRow | null =>
  rows.find((e) => e.state === state && e.district === district) ?? null;

/**
 * §1.2: an electoral goal's dates come from elections.csv, not from the YAML.
 * The loader fills `decision_date` (primary) and `window_end` (filing deadline)
 * and adds the office's page to `sources`; a YAML date that disagrees with the
 * CSV fails the seed so the two can never drift apart.
 */
export function applyElections(goals: Goal[], elections: ElectionRow[]): void {
  for (const g of goals) {
    if (g.category !== 'electoral') continue;
    const seat = electoralSeat(g.eligibility);
    if (!seat) throw new Error(`goal ${g.slug}: an electoral goal's eligibility must be {"house": {"target_2028": 1, "state": "XX", "district": N}} (primary-2028 §1.1)`);
    if (g.slug !== primarySlug(seat.state, seat.district)) throw new Error(`goal ${g.slug}: slug must be ${primarySlug(seat.state, seat.district)} for seat ${seat.state}-${seat.district}`);
    const e = electionFor(elections, seat.state, seat.district);
    if (!e) throw new Error(`goal ${g.slug}: no data/elections.csv row for ${seat.state}-${seat.district}; add one with the state election office's URL`);
    if (g.decision_date && g.decision_date !== e.primary_date) throw new Error(`goal ${g.slug}: decision_date ${g.decision_date} disagrees with elections.csv primary_date ${e.primary_date}; leave it empty`);
    if (g.window_end && g.window_end !== e.filing_deadline) throw new Error(`goal ${g.slug}: window_end ${g.window_end} disagrees with elections.csv filing_deadline ${e.filing_deadline}; leave it empty`);
    g.decision_date = e.primary_date;
    g.window_end = e.filing_deadline;
    const sources = JSON.parse(g.sources) as { title: string; url: string }[];
    if (!sources.some((s) => s.url === e.source_url)) {
      sources.push({ title: `${ELECTION_SOURCE_TITLE} (${seat.state} election office)`, url: e.source_url });
      g.sources = JSON.stringify(sources);
    }
  }
}

/**
 * Open question 1: no advocacy language about any candidate, anywhere in an
 * electoral goal or action. Whole words with their common inflections;
 * "election" and "electoral" are not matched.
 */
export const FORBIDDEN =
  /\b(vote\s+for|vote\s+against|supports?|supported|supporting|opposes?|opposed|opposing|elects?|elected|electing|defeats?|defeated|defeating|re-?elects?|re-?elected|re-?election)\b/gi;
export function forbiddenPhrases(text: string): string[] {
  return [...new Set((text.match(FORBIDDEN) ?? []).map((s) => s.toLowerCase().replace(/\s+/g, ' ')))];
}

/**
 * §1.1 + §1.3 seed checks: the seat's member carries `target_2028 = 1` and a
 * recorded roll call (`rc243`, the citation the data/ PR made); priority is 1;
 * no forbidden phrase in the goal's or its actions' copy.
 */
export function checkElectoral(goals: Goal[], actions: Action[], members: Member[]): void {
  for (const g of goals) {
    if (g.category !== 'electoral') continue;
    const seat = electoralSeat(g.eligibility)!; // applyElections ran first
    const m = members.find((x) => x.chamber === 'house' && x.state === seat.state && x.district === seat.district);
    if (!m) throw new Error(`goal ${g.slug}: no House member on file for ${seat.state}-${seat.district}`);
    if (m.target_2028 !== 1) throw new Error(`goal ${g.slug}: ${m.name} (${seat.state}-${seat.district}) has target_2028 = ${m.target_2028}; set it to 1 in the data/ PR that cites the roll call (primary-2028 §1.1)`);
    if (!m.rc243) throw new Error(`goal ${g.slug}: ${m.name} has target_2028 = 1 but no rc243 roll-call vote; a target needs a recorded vote to keep the section (primary-2028 §1.1)`);
    if (g.priority !== 1) throw new Error(`goal ${g.slug}: an electoral goal has priority 1 (primary-2028 §1.3)`);
    const copy = [g.title, g.summary, g.what_we_want, g.decider, g.this_week, g.detail_md, g.prep_md, g.outcome_note].filter(Boolean).join('\n');
    const bad = forbiddenPhrases(copy);
    if (bad.length) throw new Error(`goal ${g.slug}: electoral copy must not say ${bad.join(', ')} (primary-2028 Open question 1)`);
    if (JSON.parse(g.our_picks).length) throw new Error(`goal ${g.slug}: our_picks must stay empty until primary-2028 §2 is unblocked`);
    for (const a of actions.filter((x) => x.goal_id === g.id)) {
      const abad = forbiddenPhrases([a.ask_text, a.prompt_template ?? '', a.doc_format, a.standard_template ?? ''].join('\n'));
      if (abad.length) throw new Error(`action ${a.slug}: electoral copy must not say ${abad.join(', ')} (primary-2028 Open question 1)`);
    }
  }
}

/** One line of the record: the member's newest sourced position and recorded vote on one tracked goal. */
export interface RecordLine {
  goal_slug: string;
  goal_title: string;
  goal_status: Goal['status'];
  decision_date: string | null;
  position: Position['position'];
  source_url: string | null;
  source_date: string | null;
  vote: string;
}

/**
 * §1.2: the member's position and vote on every goal this site tracked
 * (active or closed, never upcoming or electoral) that targeted them, newest
 * decision first. `voteLine` is `route.priorVote`; every value is a data/ row.
 */
export function recordFor(m: Member, goals: Goal[], actions: Action[], positions: Position[], voteLine: (m: Member, g: Goal) => string): RecordLine[] {
  return goals
    .filter((g) => g.status !== 'upcoming' && g.category !== 'electoral')
    .filter((g) => whipTargets(g, actions.find((a) => a.goal_id === g.id), [m]).length === 1)
    .sort((a, b) => (b.decision_date ?? '').localeCompare(a.decision_date ?? '') || a.slug.localeCompare(b.slug))
    .map((g) => {
      const p = latestPosition(positions, m.bioguide_id, g.id);
      return {
        goal_slug: g.slug,
        goal_title: g.title,
        goal_status: g.status,
        decision_date: g.decision_date,
        position: p?.position ?? 'unknown',
        source_url: p?.source_url ?? null,
        source_date: p?.source_date ?? null,
        vote: voteLine(m, g),
      };
    });
}

// ---- Templates for `npm run make-primary-goal -w worker` (§1.1). Strings are JSON-quoted so names with colons stay valid YAML.
const q = (s: string): string => JSON.stringify(s);
const seatLabel = (m: Member): string => (m.district === 0 ? `${m.state} at large` : `${m.state}-${String(m.district).padStart(2, '0')}`);

export function goalYaml(id: number, m: Member, e: ElectionRow, rollCallUrl?: string): string {
  const slug = primarySlug(m.state, m.district ?? 0);
  const seat = seatLabel(m);
  const sources = rollCallUrl ? `\n  - {title: ${q(`Roll call 243 (House vote on the integration section): ${m.name} voted ${m.rc243}`)}, url: ${q(rollCallUrl)}}` : ' []';
  return [
    `id: ${id}   # from data/ids.md; never changed, never reused (stable-data-ids §1)`,
    `slug: ${slug}`,
    'category: electoral',
    `title: ${q(`Rep. ${m.name}'s record before the ${seat} 2028 primary`)}`,
    `summary: ${q(`Rep. ${m.name} voted to keep the integration section (roll call 243: ${m.rc243}). This is the record of that vote and of every position this site tracked, with the 2028 primary date and the candidate filing deadline from the ${m.state} election office.`)}`,
    `what_we_want: ${q(`A sourced record of where Rep. ${m.name} stood, and the dates that decide who is on the ${seat} 2028 primary ballot.`)}`,
    'status: upcoming   # flip to active in a data/ PR when the federal goal it follows closes (primary-2028 §1.1)',
    'window_start: ""',
    'window_end: ""     # filled from data/elections.csv at seed: the filing deadline (§1.2)',
    'decision_date: ""  # filled from data/elections.csv at seed: the primary date (§1.2)',
    'priority: 1        # surfaces only when the federal and state goals are closed or ineligible (§1.3)',
    `eligibility: {"house": {"target_2028": 1, "state": ${q(m.state)}, "district": ${m.district ?? 0}}}`,
    'our_picks: []      # §2 blocked: no candidate is named anywhere on this site until the owner records counsel\'s answer',
    `sources:${sources}`,
    `decider: ${q(`Voters in ${seat}, in the 2028 primary`)}`,
    'this_week: ""',
    'this_week_date: ""',
    'detail_md: ""',
    'prep_md: ""',
    'partner_url: ""',
    '',
  ].join('\n');
}

export const ELECTORAL_ASK = "Ask the office who is running against them in the 2028 primary and say why you're asking.";

export function actionYaml(id: number, m: Member): string {
  const slug = primarySlug(m.state, m.district ?? 0);
  return [
    `id: ${id}   # from data/ids.md; never changed, never reused (stable-data-ids §1)`,
    `slug: ${slug}-call`,
    `goal: ${slug}`,
    'type: call',
    'target_scope: house',
    'order: 1',
    `ask_text: ${q(ELECTORAL_ASK)}`,
    'form_schema:',
    '  fields:',
    '    - {name: first_name, label: First name, max: 40, required: true}',
    '    - {name: city, label: City, max: 60, required: true}',
    "    - {name: why, label: Why you're asking, max: 280, required: true, multiline: true, hint: One or two sentences in your own words.}",
    '    - {name: affiliation, label: Occupation or affiliation (optional), max: 80, required: false}',
    'prompt_template: |',
    '  Open with the caller\'s first name and city. State the member\'s recorded vote exactly as the facts list gives it, then',
    '  ask the office who has filed to run against the member in the 2028 primary and say, in the caller\'s own words, why the',
    '  caller is asking. Close by asking for the candidate filing deadline. Name no candidate and do not say how anyone should',
    '  vote.',
    'doc_format: {"kind": "call_script", "min_words": 60, "max_words": 120, "mentions": ["primary"], "ask": "who is running against"}',
    // generation-cost §4: the code-built script when no model may run; same placeholders as data/actions/*.yaml.
    'standard_template: |',
    "  Hi, my name is {{user_first_name}} and I live in {{user_city}}, in {{target_role}} {{target_name}}'s district. {{prior_vote_line}}",
    '  I am calling to ask who is running against {{target_role}} {{target_name}} in the next primary, and who has filed so far.',
    '  {{user_why}}',
    '  Can you also tell me the candidate filing deadline, and whether the office can send me a written answer? I will share what I hear with my neighbors. Thank you for your time.',
    '',
  ].join('\n');
}
