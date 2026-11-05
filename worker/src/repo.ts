import type { Action, Delegation, Goal, Member, Position, Repo, StateRow } from './types';

/** D1-backed Repo. Read-only: nothing on the §1 path writes. */
export class D1Repo implements Repo {
  constructor(private db: D1Database) {}

  async activeGoals(): Promise<Goal[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM goals WHERE status = 'active' ORDER BY priority DESC, slug`)
      .all<Goal>();
    return results;
  }

  async goalBySlug(slug: string): Promise<Goal | null> {
    return (await this.db.prepare(`SELECT * FROM goals WHERE slug = ?`).bind(slug).first<Goal>()) ?? null;
  }

  async actionsFor(goalIds: number[]): Promise<Action[]> {
    if (goalIds.length === 0) return [];
    const marks = goalIds.map(() => '?').join(',');
    const { results } = await this.db
      .prepare(`SELECT * FROM actions WHERE goal_id IN (${marks}) ORDER BY goal_id, "order"`)
      .bind(...goalIds)
      .all<Action>();
    return results;
  }

  async positionsFor(bioguideIds: string[], goalIds: number[]): Promise<Position[]> {
    if (bioguideIds.length === 0 || goalIds.length === 0) return [];
    const m1 = bioguideIds.map(() => '?').join(',');
    const m2 = goalIds.map(() => '?').join(',');
    const { results } = await this.db
      .prepare(
        `SELECT bioguide_id, goal_id, position, source_url, source_date FROM positions
         WHERE bioguide_id IN (${m1}) AND goal_id IN (${m2}) ORDER BY changed_at DESC`,
      )
      .bind(...bioguideIds, ...goalIds)
      .all<Position>();
    return results;
  }

  async delegation(state: string, district: number): Promise<Delegation> {
    const [members, stateRow] = await Promise.all([
      this.db
        .prepare(
          `SELECT * FROM members WHERE state = ? AND (chamber = 'senate' OR (chamber = 'house' AND district = ?))`,
        )
        .bind(state, district)
        .all<Member>(),
      this.db.prepare(`SELECT * FROM states WHERE state = ?`).bind(state).first<StateRow>(),
    ]);
    return assembleDelegation(state, district, members.results, stateRow ?? null);
  }
}

export function assembleDelegation(state: string, district: number, members: Member[], stateRow: StateRow | null): Delegation {
  const house = members.find((m) => m.chamber === 'house' && m.district === district) ?? null;
  const senators = members.filter((m) => m.chamber === 'senate').sort((a, b) => a.name.localeCompare(b.name));
  return { state, district, house, senators, state_row: stateRow };
}

/** In-memory Repo over the same rows seed.ts emits. Used by tests and `seed.ts --check`. */
export class MemoryRepo implements Repo {
  constructor(
    private rows: { goals: Goal[]; actions: Action[]; members: Member[]; positions: Position[]; states: StateRow[] },
  ) {}

  async activeGoals(): Promise<Goal[]> {
    return this.rows.goals
      .filter((g) => g.status === 'active')
      .sort((a, b) => b.priority - a.priority || a.slug.localeCompare(b.slug));
  }
  async goalBySlug(slug: string): Promise<Goal | null> {
    return this.rows.goals.find((g) => g.slug === slug) ?? null;
  }
  async actionsFor(goalIds: number[]): Promise<Action[]> {
    return this.rows.actions.filter((a) => goalIds.includes(a.goal_id)).sort((a, b) => a.goal_id - b.goal_id || a.order - b.order);
  }
  async positionsFor(bioguideIds: string[], goalIds: number[]): Promise<Position[]> {
    return this.rows.positions.filter((p) => bioguideIds.includes(p.bioguide_id) && goalIds.includes(p.goal_id));
  }
  async delegation(state: string, district: number): Promise<Delegation> {
    const members = this.rows.members.filter(
      (m) => m.state === state && (m.chamber === 'senate' || (m.chamber === 'house' && m.district === district)),
    );
    return assembleDelegation(state, district, members, this.rows.states.find((s) => s.state === state) ?? null);
  }
}
