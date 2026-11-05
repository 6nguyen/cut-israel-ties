// Node-only: read data/ into row objects. Shared by scripts/seed.ts and the tests.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Action, Goal, Member, Position, StateRow } from './types';
import { parseRule } from './ranking';

export interface Rows {
  goals: Goal[];
  actions: Action[];
  members: Member[];
  positions: Position[];
  states: StateRow[];
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const header = lines[0].split(',');
  return lines.slice(1).map((line, i) => {
    const cells = line.split(',');
    if (cells.length !== header.length) throw new Error(`csv row ${i + 2}: ${cells.length} cells, expected ${header.length}`);
    return Object.fromEntries(header.map((h, j) => [h, cells[j]]));
  });
}

const str = (v: unknown): string | null => (v === undefined || v === null || v === '' ? null : String(v));
const int = (v: unknown): number => (v === undefined || v === null || v === '' ? 0 : Number(v));
const intOrNull = (v: unknown): number | null => (v === undefined || v === null || v === '' ? null : Number(v));
const json = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v ?? null));

export function loadRows(dataDir: string, updatedAt = new Date().toISOString()): Rows {
  const goals: Goal[] = readdirSync(join(dataDir, 'goals'))
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .map((f, i) => {
      const y = parseYaml(readFileSync(join(dataDir, 'goals', f), 'utf8')) as Record<string, unknown>;
      const eligibility = json(y.eligibility);
      parseRule(eligibility);
      const g: Goal = {
        id: i + 1,
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
      if (!['active', 'completed', 'expired'].includes(g.status)) throw new Error(`goal ${g.slug}: bad status`);
      if (!Number.isInteger(g.priority) || g.priority < 1) throw new Error(`goal ${g.slug}: priority must be a positive integer`);
      return g;
    });
  const goalId = (slug: string): number => {
    const g = goals.find((x) => x.slug === slug);
    if (!g) throw new Error(`unknown goal slug ${slug}`);
    return g.id;
  };

  const actions: Action[] = readdirSync(join(dataDir, 'actions'))
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .map((f, i) => {
      const y = parseYaml(readFileSync(join(dataDir, 'actions', f), 'utf8')) as Record<string, unknown>;
      const a: Action = {
        id: i + 1,
        goal_id: goalId(String(y.goal)),
        slug: String(y.slug),
        type: y.type as Action['type'],
        target_scope: y.target_scope as Action['target_scope'],
        order: int(y.order),
        ask_text: String(y.ask_text),
        form_schema: json(y.form_schema ?? { fields: [] }),
        prompt_template: str(y.prompt_template),
        doc_format: json(y.doc_format),
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
  }));

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
  }));

  return { goals, actions, members, positions, states };
}
