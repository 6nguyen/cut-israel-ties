// POST /api/route — §1.2–§1.4 + §5. Builds the response the results page renders.
import type { Action, Delegation, Goal, Member, Position, Repo } from './types';
import { topTwo } from './ranking';

export interface TargetCard {
  bioguide_id: string | null;
  name: string;
  role: string; // "Rep.", "Sen.", "Treasurer"
  party: string | null;
  position: Position['position'];
  position_source_url: string | null;
  prior_vote: string;
  phone: string | null;
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
        prior_vote: s?.israel_bonds_usd ? `Holds Israel Bonds (${s.holdings_date ?? 'date not sourced'})` : 'Holdings not yet sourced',
        phone: s?.treasurer_phone ?? null,
      },
    ];
  }
  const out: Member[] = [];
  if ((scope === 'house' || scope === 'both') && d.house) out.push(d.house);
  if (scope === 'senate' || scope === 'both') out.push(...d.senators);
  // Leadership goals only make sense for the party holding the vote.
  const filtered = goal.category === 'leadership' ? out.filter((m) => m.party === 'D') : out;
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
        ask_text: action?.ask_text ?? g.what_we_want,
        action_href: action ? `/goals/${g.slug}/act/${action.slug}` : `/goals/${g.slug}`,
        targets: targetsFor(g, action, d, positions),
      };
    }),
  };
}
