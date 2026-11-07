// POST /api/route — §1.2–§1.4 + §5. Builds the response the results page renders.
import { TAKES_OFFICE, type Action, type Chamber, type Delegation, type ElectSeat, type Goal, type IncomingSeat, type Member, type Office, type Position, type Repo } from './types';
import { electoralSeat, topTwo } from './ranking';
import { fillAsk, holdingsLine } from './state-copy';
import { ELECTION_SOURCE_TITLE, recordFor, type RecordLine } from './electoral';

export interface TargetCard {
  bioguide_id: string | null; // the target id: a bioguide id, an elect_id for a member-elect (leadership-routing §2.6), null for a treasurer
  name: string;
  role: string; // "Rep.", "Sen.", "Treasurer", "Representative-elect", "Senator-elect"
  // urgency-and-readability §7: the card's role line ("Representative · KY-04", "Senator · VA"); null district = senator, treasurer or at-large.
  state?: string;
  district?: number | null;
  party: string | null;
  position: Position['position'];
  position_source_url: string | null;
  prior_vote: string;
  phone: string | null;
  // roster-freshness §1: the first district office in the member's state ("District: <city> <phone>"), after the DC number.
  district_phone?: string | null;
  district_city?: string | null;
  // State targets only (state-holdings-sweep §3): the states.csv cells behind the holdings line.
  holdings_status?: 'held' | 'none' | 'unknown';
  holdings_usd?: number | null;
  holdings_date?: string | null;
  holdings_source_url?: string | null;
  // Electoral targets only (primary-2028 §1.2): the member's position and vote on every goal this site tracked.
  record?: RecordLine[];
  // Members-elect only (leadership-routing §2.6): the office starts in January; the contact link stands in while there is no phone.
  elect?: { replaces_name: string; takes_office: string; contact_url: string };
}

export interface GoalCard {
  slug: string;
  category: Goal['category'];
  title: string;
  summary: string;
  decision_date: string | null;
  decision_at: string | null; // urgency-and-readability §4: countdown target when set
  decision_date_confirmed: boolean;
  this_week: string | null;
  ask_text: string;
  action_href: string;
  targets: TargetCard[];
  partner_url: string | null; // office-visits: the "Organise one" line offers the partner when there is one
  // Electoral goals only (primary-2028 §1.2): the elections.csv row the loader folded into the goal.
  election?: ElectionDates;
  // Leadership goals only (leadership-routing §2.3): the chamber this goal's action targets, and the other leadership goal sharing the slot.
  chamber?: Chamber;
  also?: GoalCard;
  // First leadership card only (§2.5): chambers where a departing D-caucus seat has no called race yet.
  uncalled?: Chamber[];
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

/** action-router §7: the Capitol switchboard, shown only when a member row has neither a DC nor a district number. */
export const SWITCHBOARD = '202-224-3121';

/** roster-freshness §1: the first office in the member's own state with a phone; a hand-filled district_phone stands in when there is none. */
export function districtLine(m: Member, offices: Office[]): { district_phone: string | null; district_city: string | null } {
  const o = offices.find((x) => x.bioguide_id === m.bioguide_id && x.state === m.state && x.phone);
  if (o) return { district_phone: o.phone, district_city: o.city };
  return { district_phone: m.district_phone, district_city: null };
}

function memberCard(m: Member, goal: Goal, positions: Position[], offices: Office[]): TargetCard {
  const p = positions.find((x) => x.bioguide_id === m.bioguide_id && x.goal_id === goal.id);
  const d = districtLine(m, offices);
  return {
    bioguide_id: m.bioguide_id,
    name: m.name,
    role: m.chamber === 'house' ? 'Rep.' : 'Sen.',
    state: m.state,
    district: m.chamber === 'house' ? m.district : null,
    party: m.party,
    position: p?.position ?? 'unknown',
    position_source_url: p?.source_url ?? null,
    prior_vote: priorVote(m, goal),
    phone: m.dc_phone ?? (d.district_phone ? null : SWITCHBOARD),
    ...d,
  };
}

/** leadership-routing §2.6: a member-elect as a target: no vote, no position row, and never the switchboard (the office does not exist yet). */
function electCard(e: ElectSeat): TargetCard {
  return {
    bioguide_id: e.elect_id,
    name: e.name,
    role: e.chamber === 'house' ? 'Representative-elect' : 'Senator-elect',
    state: e.state,
    district: e.chamber === 'house' ? e.district : null,
    party: e.party,
    position: 'unknown',
    position_source_url: null,
    prior_vote: NO_VOTE,
    phone: e.phone,
    elect: { replaces_name: e.replaces_name, takes_office: TAKES_OFFICE, contact_url: e.contact_url },
  };
}

/** Targets for a goal follow its first action's scope; §3 seed rules decide party filters. */
export function targetsFor(goal: Goal, action: Action | undefined, d: Delegation, positions: Position[], offices: Office[] = []): TargetCard[] {
  const scope = action?.target_scope ?? (goal.category === 'state' ? 'state' : 'both');
  if (scope === 'state') {
    const s = d.state_row;
    return [
      {
        bioguide_id: null,
        name: s?.treasurer_name || `${d.state} State Treasurer`,
        role: 'Treasurer',
        state: d.state,
        district: null,
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
  // leadership-routing §2.2: a leadership goal targets the incoming delegation (a member-elect stands in for a departing member), D caucus only.
  if (goal.category === 'leadership') {
    const seats: IncomingSeat[] = [];
    if ((scope === 'house' || scope === 'both') && d.incoming.house) seats.push(d.incoming.house);
    if (scope === 'senate' || scope === 'both') seats.push(...d.incoming.senators);
    return seats.filter((s) => s.caucus === 'D').map((s) => ('elect' in s ? electCard(s) : memberCard(s, goal, positions, offices)));
  }
  const out: Member[] = [];
  if ((scope === 'house' || scope === 'both') && d.house) out.push(d.house);
  if (scope === 'senate' || scope === 'both') out.push(...d.senators);
  // roster-freshness §4: a row with left_office is never a target (assembleDelegation drops it too); not_returning keeps every slot.
  out.splice(0, out.length, ...out.filter((m) => !m.left_office));
  let filtered = out;
  // An electoral goal names one seat (primary-2028 §1.1); any other district gets no target, whatever its member's flags.
  if (goal.category === 'electoral') {
    const seat = electoralSeat(goal.eligibility);
    filtered = filtered.filter((m) => seat !== null && m.chamber === 'house' && m.state === seat.state && m.district === seat.district);
  }
  return filtered.map((m) => memberCard(m, goal, positions, offices));
}

/** The delegation's district offices in one list (at most three members, so three small reads). */
async function officesFor(repo: Repo, members: Member[]): Promise<Office[]> {
  return (await Promise.all(members.map((m) => repo.offices(m.bioguide_id)))).flat();
}

export async function buildRoute(repo: Repo, state: string, district: number, today: Date): Promise<RouteResponse> {
  const d = await repo.delegation(state, district);
  const goals = await repo.activeGoals();
  const chosen = topTwo(goals, d, today);
  const slotGoals = chosen.flatMap((s) => (s.also ? [s.goal, s.also] : [s.goal]));
  const ids = slotGoals.map((g) => g.id);
  const members = [d.house, ...d.senators].filter((m): m is Member => m !== null);
  const [actions, positions, offices] = await Promise.all([
    repo.actionsFor(ids),
    repo.positionsFor(
      members.map((m) => m.bioguide_id),
      ids,
    ),
    officesFor(repo, members),
  ]);
  const record = slotGoals.some((g) => g.category === 'electoral') ? await memberRecord(repo, d.house) : null;
  const card = (g: Goal): GoalCard => {
    const action = actions.find((a) => a.goal_id === g.id);
    const scope = action?.target_scope;
    return {
      slug: g.slug,
      category: g.category,
      title: g.title,
      summary: g.summary,
      decision_date: g.decision_date,
      decision_at: g.decision_at,
      decision_date_confirmed: g.decision_date_confirmed === 1,
      this_week: g.this_week,
      ask_text: fillAsk(action?.ask_text ?? g.what_we_want, g.category === 'state' ? d.state_row : null),
      action_href: action ? `/goals/${g.slug}/act/${action.slug}` : `/goals/${g.slug}`,
      targets: targetsFor(g, action, d, positions, offices).map((t) => (g.category === 'electoral' && record ? { ...t, record } : t)),
      election: electionDates(g),
      partner_url: g.partner_url || null,
      ...(g.category === 'leadership' && (scope === 'house' || scope === 'senate') ? { chamber: scope } : {}),
    };
  };
  // §2.5: one line per chamber whose departing D-caucus seat has no called race; it rides on the leadership card.
  const uncalled = d.incoming.uncalled.filter((u) => u.caucus === 'D').map((u) => u.chamber);
  return {
    state: d.state,
    district: d.district,
    house: d.house,
    senators: d.senators,
    state_row: d.state_row,
    goals: chosen.map((s) => {
      const c = card(s.goal);
      if (s.also) c.also = card(s.also);
      if (s.goal.category === 'leadership' && uncalled.length) c.uncalled = uncalled;
      return c;
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
  const [actions, positions, offices] = await Promise.all([repo.actionsFor([goal.id]), repo.positionsFor(members.map((m) => m.bioguide_id), [goal.id]), officesFor(repo, members)]);
  const targets = targetsFor(goal, actions[0], d, positions, offices);
  if (goal.category !== 'electoral' || targets.length === 0) return { targets };
  const record = await memberRecord(repo, d.house);
  return { targets: targets.map((t) => ({ ...t, record })) };
}
