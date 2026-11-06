// Node-only: read data/ into row objects. Shared by scripts/seed.ts and the tests.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { CONTACT_KINDS, HOLDINGS_STATUSES, type Action, type Goal, type Member, type Office, type Position, type StateRow } from './types';
import { parseRule } from './ranking';
import { checkPrep } from './prep';
import { HOUSE_SEATS, districtError } from './districts';
import { applyElections, checkElections, checkElectoral, parseElections, type ElectionRow } from './electoral';
import { checkId, readIds } from './ids';
import { checkStandardTemplates } from './standard';

export interface Rows {
  goals: Goal[];
  actions: Action[];
  members: Member[];
  offices: Office[]; // roster-freshness §1: data/district_offices.csv, file order
  positions: Position[];
  states: StateRow[];
  elections: ElectionRow[]; // primary-2028 §1: folded into the electoral goals' dates and sources, not a D1 table
}

/** One CSV line → cells. RFC 4180: a cell wrapped in double quotes may hold commas and doubled quotes. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === ',') { cells.push(cell); cell = ''; }
    else cell += ch;
  }
  cells.push(cell);
  return cells;
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line, i) => {
    const cells = splitCsvLine(line);
    if (cells.length !== header.length) throw new Error(`csv row ${i + 2}: ${cells.length} cells, expected ${header.length}`);
    return Object.fromEntries(header.map((h, j) => [h, cells[j]]));
  });
}

const str = (v: unknown): string | null => (v === undefined || v === null || v === '' ? null : String(v));
const int = (v: unknown): number => (v === undefined || v === null || v === '' ? 0 : Number(v));
const intOrNull = (v: unknown): number | null => (v === undefined || v === null || v === '' ? null : Number(v));
const numOrNull = intOrNull;
const json = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v ?? null));

const wordCount = (t: string): number => t.trim().split(/\s+/).filter(Boolean).length;

function checkJsonList(slug: string, field: string, raw: string, required: string[], max = Infinity): void {
  const list = JSON.parse(raw) as unknown;
  if (!Array.isArray(list)) throw new Error(`goal ${slug}: ${field} must be a list`);
  if (list.length > max) throw new Error(`goal ${slug}: ${field} holds ${list.length} entries, max ${max}`);
  list.forEach((e, i) => {
    for (const k of required) {
      if (typeof (e as Record<string, unknown>)?.[k] !== 'string' || (e as Record<string, string>)[k] === '') throw new Error(`goal ${slug}: ${field}[${i}] needs ${k}`);
    }
  });
}

/**
 * §2.3 lifecycle: a goal authored as `upcoming` stays hidden from the overview
 * and the ranking until the goal naming it as `successor_slug` is completed or
 * expired; then the next seed/deploy flips it to `active` with no code change.
 */
export function activateSuccessors(goals: Goal[]): void {
  for (const g of goals) {
    if (!g.successor_slug) continue;
    const next = goals.find((x) => x.slug === g.successor_slug);
    if (!next) throw new Error(`goal ${g.slug}: successor_slug ${g.successor_slug} names no goal`);
    if (next.slug === g.slug) throw new Error(`goal ${g.slug}: successor_slug points at itself`);
    if ((g.status === 'completed' || g.status === 'expired') && next.status === 'upcoming') next.status = 'active';
  }
}

/** Member-pages §1.3 seed checks on the raw CSV rows: one row per bioguide id, districts inside the state's count, senators without one. */
export function checkMembers(rows: Record<string, string>[]): void {
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.bioguide_id)) throw new Error(`members.csv: duplicate bioguide_id ${r.bioguide_id}`);
    seen.add(r.bioguide_id);
    if (r.chamber === 'senate' && r.district !== '') throw new Error(`members.csv: senator ${r.bioguide_id} has a district (${r.district})`);
    if (r.chamber === 'house') {
      const err = districtError(r.state, int(r.district));
      if (err) throw new Error(`members.csv: ${r.bioguide_id}: ${err}`);
    }
    if (r.contact_kind && !(CONTACT_KINDS as readonly string[]).includes(r.contact_kind)) throw new Error(`members.csv: ${r.bioguide_id}: unknown contact_kind ${r.contact_kind}`);
    if (r.contact_form_url && !r.contact_kind) throw new Error(`members.csv: ${r.bioguide_id}: contact_form_url without contact_kind`);
    if (r.left_office && !/^\d{4}-\d{2}-\d{2}$/.test(r.left_office)) throw new Error(`members.csv: ${r.bioguide_id}: left_office is not an ISO date (${r.left_office})`);
  }
}

/** roster-freshness §1: a ten-digit phone as NNN-NNN-NNNN, or null when the digits are not ten (a leading 1 is dropped). */
export function tenDigitPhone(raw: string | null | undefined): string | null {
  const d = String(raw ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : null;
}

/** roster-freshness §1 seed checks on district_offices.csv: known member, known state, ten-digit phone when present. */
export function checkOffices(rows: Record<string, string>[], memberIds: Set<string>): void {
  const seen = new Set<string>();
  for (const r of rows) {
    if (!memberIds.has(r.bioguide_id)) throw new Error(`district_offices.csv: ${r.office_id}: unknown bioguide_id ${r.bioguide_id}`);
    if (!HOUSE_SEATS[r.state]) throw new Error(`district_offices.csv: ${r.office_id}: unknown state ${r.state}`);
    if (r.phone && !tenDigitPhone(r.phone)) throw new Error(`district_offices.csv: ${r.office_id}: phone ${r.phone} is not ten digits`);
    if (seen.has(r.office_id)) throw new Error(`district_offices.csv: duplicate office_id ${r.office_id}`);
    seen.add(r.office_id);
  }
}

/** roster-freshness §1: an empty district_phone cell means "derive": the first office phone in file order. A filled cell wins. */
export function deriveDistrictPhones(members: Member[], offices: Office[]): void {
  for (const m of members) {
    if (m.district_phone) continue;
    m.district_phone = offices.find((o) => o.bioguide_id === m.bioguide_id && o.phone)?.phone ?? null;
  }
}

export function loadRows(dataDir: string, updatedAt = new Date().toISOString()): Rows {
  // stable-data-ids §2: ids come from the YAML and must match data/ids.md; the file order never numbers a row.
  const registry = readIds(dataDir);
  const goalIds = new Set<number>();
  const actionIds = new Set<number>();
  const goals: Goal[] = readdirSync(join(dataDir, 'goals'))
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .map((f) => {
      const y = parseYaml(readFileSync(join(dataDir, 'goals', f), 'utf8')) as Record<string, unknown>;
      const eligibility = json(y.eligibility);
      parseRule(eligibility);
      const g: Goal = {
        id: checkId(registry, 'goal', f, String(y.slug), y.id, goalIds),
        slug: String(y.slug),
        category: y.category as Goal['category'],
        title: String(y.title),
        summary: String(y.summary),
        what_we_want: String(y.what_we_want),
        status: y.status as Goal['status'],
        outcome_note: str(y.outcome_note),
        window_start: str(y.window_start),
        window_end: str(y.window_end),
        decision_date: str(y.decision_date),
        priority: int(y.priority),
        eligibility,
        our_picks: json(y.our_picks ?? []),
        sources: json(y.sources ?? []),
        decider: str(y.decider),
        successor_slug: str(y.successor_slug),
        this_week: str(y.this_week),
        this_week_date: str(y.this_week_date),
        detail_md: str(y.detail_md),
        prep_md: str(y.prep_md),
        partner_url: str(y.partner_url),
        updated_at: updatedAt,
      };
      if (g.slug !== f.replace(/\.yaml$/, '')) throw new Error(`goal slug ${g.slug} != file ${f}`);
      if (!['federal_vote', 'leadership', 'state', 'electoral'].includes(g.category)) throw new Error(`goal ${g.slug}: bad category`);
      if (!['upcoming', 'active', 'completed', 'expired'].includes(g.status)) throw new Error(`goal ${g.slug}: bad status`);
      if (!Number.isInteger(g.priority) || g.priority < 1) throw new Error(`goal ${g.slug}: priority must be a positive integer`);
      if (wordCount(g.summary) > 60) throw new Error(`goal ${g.slug}: summary is ${wordCount(g.summary)} words, max 60 (§2.1)`);
      if ((g.status === 'completed' || g.status === 'expired') && !g.outcome_note) throw new Error(`goal ${g.slug}: a ${g.status} goal needs outcome_note (§2.1)`);
      checkJsonList(g.slug, 'our_picks', g.our_picks, ['name', 'rationale', 'source_url'], 3);
      checkJsonList(g.slug, 'sources', g.sources, ['title', 'url']);
      checkPrep(g.slug, g.prep_md);
      return g;
    });
  activateSuccessors(goals);
  const goalId = (slug: string): number => {
    const g = goals.find((x) => x.slug === slug);
    if (!g) throw new Error(`unknown goal slug ${slug}`);
    return g.id;
  };

  const actions: Action[] = readdirSync(join(dataDir, 'actions'))
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .map((f) => {
      const y = parseYaml(readFileSync(join(dataDir, 'actions', f), 'utf8')) as Record<string, unknown>;
      const a: Action = {
        id: checkId(registry, 'action', f, String(y.slug), y.id, actionIds),
        goal_id: goalId(String(y.goal)),
        slug: String(y.slug),
        type: y.type as Action['type'],
        target_scope: y.target_scope as Action['target_scope'],
        order: int(y.order),
        ask_text: String(y.ask_text),
        form_schema: json(y.form_schema ?? { fields: [] }),
        prompt_template: str(y.prompt_template),
        doc_format: json(y.doc_format),
        standard_template: str(y.standard_template),
      };
      if (!['house', 'senate', 'both', 'state'].includes(a.target_scope)) throw new Error(`action ${a.slug}: bad target_scope`);
      return a;
    });

  const members: Member[] = parseCsv(readFileSync(join(dataDir, 'members.csv'), 'utf8')).map((r) => ({
    bioguide_id: r.bioguide_id,
    name: r.name,
    party: r.party as Member['party'],
    chamber: r.chamber as Member['chamber'],
    state: r.state,
    district: r.chamber === 'house' ? int(r.district) : null,
    dc_phone: str(r.dc_phone),
    district_phone: str(r.district_phone),
    contact_form_url: str(r.contact_form_url),
    hasc: int(r.hasc),
    conferee: int(r.conferee),
    rc243: str(r.rc243),
    jrd_april_2026: str(r.jrd_april_2026),
    btb_cosponsor: int(r.btb_cosponsor),
    target_2028: int(r.target_2028),
    money_url: str(r.money_url),
    district_office_address: str(r.district_office_address),
    district_office_city: str(r.district_office_city),
    contact_kind: str(r.contact_kind) as Member['contact_kind'],
    not_returning: int(r.not_returning),
    left_office: str(r.left_office),
  }));
  checkMembers(parseCsv(readFileSync(join(dataDir, 'members.csv'), 'utf8')));

  const officeRows = parseCsv(readFileSync(join(dataDir, 'district_offices.csv'), 'utf8'));
  checkOffices(officeRows, new Set(members.map((m) => m.bioguide_id)));
  const offices: Office[] = officeRows.map((r) => ({
    bioguide_id: r.bioguide_id,
    office_id: r.office_id,
    city: r.city,
    state: r.state,
    zip: str(r.zip),
    address: str(r.address),
    suite: str(r.suite),
    building: str(r.building),
    phone: str(r.phone),
    fax: str(r.fax),
    hours: str(r.hours),
    lat: numOrNull(r.lat),
    lng: numOrNull(r.lng),
  }));
  deriveDistrictPhones(members, offices);

  const positions: Position[] = [];
  for (const f of readdirSync(join(dataDir, 'positions')).filter((x) => x.endsWith('.csv')).sort()) {
    const gid = goalId(f.replace(/\.csv$/, ''));
    for (const r of parseCsv(readFileSync(join(dataDir, 'positions', f), 'utf8'))) {
      if (!r.source_url || !r.source_date) throw new Error(`positions/${f}: row for ${r.bioguide_id} has no source`);
      positions.push({ bioguide_id: r.bioguide_id, goal_id: gid, position: r.position as Position['position'], source_url: r.source_url, source_date: r.source_date });
    }
  }

  const states: StateRow[] = parseCsv(readFileSync(join(dataDir, 'states.csv'), 'utf8')).map((r) => ({
    state: r.state,
    treasurer_name: str(r.treasurer_name),
    treasurer_phone: str(r.treasurer_phone),
    decider: str(r.decider),
    israel_bonds_usd: intOrNull(r.israel_bonds_usd),
    holdings_date: str(r.holdings_date),
    holdings_source: str(r.holdings_source),
    campaign_name: str(r.campaign_name),
    campaign_url: str(r.campaign_url),
    next_comment_date: str(r.next_comment_date),
    holdings_status: (r.holdings_status || 'unknown') as StateRow['holdings_status'],
  }));
  checkStates(states, updatedAt.slice(0, 10));

  // primary-2028 §1: elections.csv (header-only until a seat is targeted) dates the electoral goals; the seed checks follow.
  const elections = parseElections(parseCsv(readFileSync(join(dataDir, 'elections.csv'), 'utf8')));
  checkElections(elections);
  applyElections(goals, elections);
  checkElectoral(goals, actions, members);
  // generation-cost §4: every active action's standard script fills and passes the output check for every target.
  checkStandardTemplates(goals, actions, members, positions, states);

  return { goals, actions, members, offices, positions, states, elections };
}

/** states.csv seed checks (state-holdings-sweep §1.2): no number without a source, no stale comment date. */
export function checkStates(states: StateRow[], today: string): void {
  for (const s of states) {
    const where = `states.csv: ${s.state}`;
    if (!HOLDINGS_STATUSES.includes(s.holdings_status)) throw new Error(`${where} holdings_status must be one of ${HOLDINGS_STATUSES.join(' | ')}`);
    if (s.israel_bonds_usd !== null && (!Number.isInteger(s.israel_bonds_usd) || s.israel_bonds_usd <= 0)) throw new Error(`${where} israel_bonds_usd must be a positive whole number of dollars`);
    if (s.israel_bonds_usd !== null && (!s.holdings_source || !s.holdings_date)) throw new Error(`${where} has israel_bonds_usd without holdings_source and holdings_date`);
    if (s.israel_bonds_usd !== null && s.holdings_status !== 'held') throw new Error(`${where} has israel_bonds_usd but holdings_status is ${s.holdings_status}`);
    if (s.holdings_status === 'held' && s.israel_bonds_usd === null) throw new Error(`${where} is held without israel_bonds_usd`);
    if (s.holdings_status === 'none' && (!s.holdings_source || !s.holdings_date)) throw new Error(`${where} is none without holdings_source and holdings_date`);
    if (s.holdings_date && !/^\d{4}-\d{2}-\d{2}$/.test(s.holdings_date)) throw new Error(`${where} holdings_date must be YYYY-MM-DD`);
    if (s.next_comment_date && !/^\d{4}-\d{2}-\d{2}$/.test(s.next_comment_date)) throw new Error(`${where} next_comment_date must be YYYY-MM-DD`);
    if (s.next_comment_date && s.next_comment_date < today) throw new Error(`${where} next_comment_date ${s.next_comment_date} is in the past`);
    if (s.campaign_url && !s.campaign_name) throw new Error(`${where} has campaign_url without campaign_name`);
  }
}
