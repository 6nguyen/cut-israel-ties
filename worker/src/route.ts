// POST /api/route — §1.2–§1.4 + §5. Builds the response the results page renders.
import type { Action, Delegation, Goal, Member, Position, Repo } from './types';
import { electoralSeat, topTwo } from './ranking';
import { fillAsk, holdingsLine } from './state-copy';
import { ELECTION_SOURCE_TITLE, recordFor, type RecordLine } from './electoral';

export interface TargetCard {
  bioguide_id: string | null;
  name: string;
  role: string; // "Rep.", "Sen.", "Treasurer"
  party: string | null;
  position: Position['position'];
  position_source_url: string | null;
  prior_vote: string;
  phone: string | null;
  // State targets only (state-holdings-sweep §3): the states.csv cells behind the holdings line.
  holdings_status?: 'held' | 'none' | 'unknown';
  holdings_usd?: number | null;
  holdings_date?: string | null;
  holdings_source_url?: string | null;
  // Electoral targets only (primary-2028 §1.2): the member's position and vote on every goal this site tracked.
  record?: RecordLine[];
}

export interface GoalCard {
  slug: string;
  category: Goal['category'];
  title: string;
  summary: string;
  decision_date: string | null;
  this_week: string | null;
  ask_text: string;
  action_href: string;
  targets: TargetCard[];
  // Electoral goals only (primary-2028 §1.2): the elections.csv row the loader folded into the goal.
  election?: ElectionDates;
}

export interface ElectionDates { primary_date: string | null; filing_deadline: string | null; source_url: string | null }

/** The dates an electoral goal carries (`decision_date` = primary, `window_end` = filing deadline) and the office page the loader added to `sources`. */
export function electionDates(goal: Goal): ElectionDates | undefined {
  if (goal.category !== 'electoral') return undefined;
  const src = (JSON.parse(goal.sources) as { title: string; url: string }[]).find((s) => s.title.startsWith(ELECTION_SOURCE_TITLE));
  return { primary_date: goal.decision_date, filing_deadline: goal.window_end, source_url: src?.url ?? null };
}

/** primary-2028 §1.2: the House member's record across every tracked goal; empty when the visitor has no representative. */
async function memberRecord(repo: Repo, m: Member | null): Promise<RecordLine[]> {
  if (!m) return [];
  const tracked = await repo.trackedGoals();
  const ids = tracked.map((g) => g.id);
  const [actions, positions] = await Promise.all([repo.actionsFor(ids), repo.positionsFor([m.bioguide_id], ids)]);
  return recordFor(m, tracked, actions, positions, priorVote);
}

export interface RouteResponse {
  state: string;
  district: number;
  house: Member | null;
  senators: Member[];
  state_row: Delegation['state_row'];
  goals: GoalCard[];
}

const NO_VOTE = 'No recorded vote yet';

/** One sourced line per member; empty flags render as "no recorded vote". Never computed by an LLM. */
export function priorVote(m: Member, goal: Goal): string {
  if (goal.slug === 'ndaa-1217') {
    if (m.chamber === 'house' && m.rc243) return `Roll call 243: ${m.rc243}`;
    if (m.chamber === 'senate' && m.jrd_april_2026) return `April 2026 JRD vote: ${m.jrd_april_2026}`;
  }
  return NO_VOTE;
}

function memberCard(m: Member, goal: Goal, positions: Position[]): TargetCard {
  const p = positions.find((x) => x.bioguide_id === m.bioguide_id && x.goal_id === goal.id);
  return {
    bioguide_id: m.bioguide_id,
    name: m.name,
    role: m.chamber === 'house' ? 'Rep.' : 'Sen.',
    party: m.party,
    position: p?.position ?? 'unknown',
    position_source_url: p?.source_url ?? null,
    prior_vote: priorVote(m, goal),
    phone: m.dc_phone,
  };
}

/** Targets for a goal follow its first action's scope; §3 seed rules decide party filters. */
export function targetsFor(goal: Goal, action: Action | undefined, d: Delegation, positions: Position[]): TargetCard[] {
  const scope = action?.target_scope ?? (goal.category === 'state' ? 'state' : 'both');
  if (scope === 'state') {
    const s = d.state_row;
    return [
      {
        bioguide_id: null,
        name: s?.treasurer_name || `${d.state} State Treasurer`,
        role: 'Treasurer',
        party: null,
        position: 'unknown',
        position_source_url: null,
        prior_vote: holdingsLine(s),
        phone: s?.treasurer_phone ?? null,
        holdings_status: s?.holdings_status ?? 'unknown',
        holdings_usd: s?.holdings_status === 'held' ? s.israel_bonds_usd : null,
        holdings_date: s?.holdings_status === 'unknown' ? null : s?.holdings_date ?? null,
        holdings_source_url: s?.holdings_status === 'unknown' ? null : s?.holdings_source ?? null,
      },
    ];
  }
  const out: Member[] = [];
  if ((scope === 'house' || scope === 'both') && d.house) out.push(d.house);
  if (scope === 'senate' || scope === 'both') out.push(...d.senators);
  // Leadership goals only make sense for the party holding the vote.
  let filtered = goal.category === 'leadership' ? out.filter((m) => m.party === 'D') : out;
  // An electoral goal names one seat (primary-2028 §1.1); any other district gets no target, whatever its member's flags.
  if (goal.category === 'electoral') {
    const seat = electoralSeat(goal.eligibility);
    filtered = filtered.filter((m) => seat !== null && m.chamber === 'house' && m.state === seat.state && m.district === seat.district);
  }
  return filtered.map((m) => memberCard(m, goal, positions));
}

export async function buildRoute(repo: Repo, state: string, district: number, today: Date): Promise<RouteResponse> {
  const d = await repo.delegation(state, district);
  const goals = await repo.activeGoals();
  const chosen = topTwo(goals, d, today);
  const ids = chosen.map((g) => g.id);
  const members = [d.house, ...d.senators].filter((m): m is Member => m !== null);
  const [actions, positions] = await Promise.all([
    repo.actionsFor(ids),
    repo.positionsFor(
      members.map((m) => m.bioguide_id),
      ids,
    ),
  ]);
  const record = chosen.some((g) => g.category === 'electoral') ? await memberRecord(repo, d.house) : null;
  return {
    state: d.state,
    district: d.district,
    house: d.house,
    senators: d.senators,
    state_row: d.state_row,
    goals: chosen.map((g) => {
      const action = actions.find((a) => a.goal_id === g.id);
      return {
        slug: g.slug,
        category: g.category,
        title: g.title,
        summary: g.summary,
        decision_date: g.decision_date,
        this_week: g.this_week,
        ask_text: fillAsk(action?.ask_text ?? g.what_we_want, g.category === 'state' ? d.state_row : null),
        action_href: action ? `/goals/${g.slug}/act/${action.slug}` : `/goals/${g.slug}`,
        targets: targetsFor(g, action, d, positions).map((t) => (g.category === 'electoral' && record ? { ...t, record } : t)),
        election: electionDates(g),
      };
    }),
  };
}

/** §2.2 targets for one active goal and a {state, district}; same rules as the results cards. */
export async function goalTargets(repo: Repo, slug: string, state: string, district: number): Promise<{ targets: TargetCard[] } | 'no_goal' | 'no_delegation'> {
  const goal = await repo.goalBySlug(slug);
  if (!goal || goal.status !== 'active') return 'no_goal';
  const d = await repo.delegation(state, district);
  if (!d.house && d.senators.length === 0) return 'no_delegation';
  const members = [d.house, ...d.senators].filter((m): m is Member => m !== null);
  const [actions, positions] = await Promise.all([repo.actionsFor([goal.id]), repo.positionsFor(members.map((m) => m.bioguide_id), [goal.id])]);
  const targets = targetsFor(goal, actions[0], d, positions);
  if (goal.category !== 'electoral' || targets.length === 0) return { targets };
  const record = await memberRecord(repo, d.house);
  return { targets: targets.map((t) => ({ ...t, record })) };
}
