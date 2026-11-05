import type {
  Action, Delegation, GenerationCounts, GenerationRow, Goal, Member, Position, ReceiptRow, Repo, ReportRow, ScreenClass, StateRow,
} from './types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (d: Date): string => d.toISOString();

/** D1-backed Repo. Only the §4 endpoints write; nothing on the /api/route path does. */
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

  async actionBySlug(slug: string): Promise<Action | null> {
    return (await this.db.prepare(`SELECT * FROM actions WHERE slug = ?`).bind(slug).first<Action>()) ?? null;
  }
  async goalById(id: number): Promise<Goal | null> {
    return (await this.db.prepare(`SELECT * FROM goals WHERE id = ?`).bind(id).first<Goal>()) ?? null;
  }
  async member(bioguideId: string): Promise<Member | null> {
    return (await this.db.prepare(`SELECT * FROM members WHERE bioguide_id = ?`).bind(bioguideId).first<Member>()) ?? null;
  }
  async stateRow(state: string): Promise<StateRow | null> {
    return (await this.db.prepare(`SELECT * FROM states WHERE state = ?`).bind(state).first<StateRow>()) ?? null;
  }

  async generationCounts(deviceHash: string, ipHash: string, actionId: number, now: Date): Promise<GenerationCounts> {
    const hourAgo = iso(new Date(now.getTime() - HOUR));
    const dayAgo = iso(new Date(now.getTime() - DAY));
    const row = await this.db
      .prepare(
        `SELECT
           SUM(device_hash = ?1 AND created_at >= ?4) AS device_hour,
           SUM(device_hash = ?1 AND created_at >= ?5) AS device_day,
           SUM(device_hash = ?1 AND action_id = ?3 AND created_at >= ?5) AS device_action_day,
           SUM(ip_hash = ?2 AND created_at >= ?5) AS ip_day,
           SUM(created_at >= ?5) AS global_day
         FROM generations WHERE created_at >= ?5`,
      )
      .bind(deviceHash, ipHash, actionId, hourAgo, dayAgo)
      .first<Record<keyof GenerationCounts, number | null>>();
    return {
      device_hour: row?.device_hour ?? 0,
      device_day: row?.device_day ?? 0,
      device_action_day: row?.device_action_day ?? 0,
      ip_day: row?.ip_day ?? 0,
      global_day: row?.global_day ?? 0,
    };
  }
  async recentShingles(actionId: number, limit: number): Promise<Uint32Array[]> {
    const { results } = await this.db
      .prepare(`SELECT shingles FROM generations WHERE action_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`)
      .bind(actionId, limit)
      .all<{ shingles: ArrayBuffer }>();
    return results.map((r) => new Uint32Array(r.shingles));
  }
  async insertGeneration(row: GenerationRow): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO generations (action_id, target_id, shingles, created_at, device_hash, ip_hash, input_tokens, output_tokens, model)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(row.action_id, row.target_id, row.shingles.buffer, row.created_at, row.device_hash, row.ip_hash, row.input_tokens, row.output_tokens, row.model)
      .run();
  }
  async screenedOutCount(deviceHash: string, since: Date): Promise<number> {
    const row = await this.db
      .prepare(`SELECT COUNT(*) AS n FROM screenings WHERE device_hash = ? AND created_at >= ?`)
      .bind(deviceHash, iso(since))
      .first<{ n: number }>();
    return row?.n ?? 0;
  }
  async insertScreening(deviceHash: string, actionId: number, cls: ScreenClass, at: Date): Promise<void> {
    await this.db
      .prepare(`INSERT INTO screenings (device_hash, action_id, class, created_at) VALUES (?, ?, ?, ?)`)
      .bind(deviceHash, actionId, cls, iso(at))
      .run();
  }
  async blockedUntil(deviceHash: string): Promise<Date | null> {
    const row = await this.db.prepare(`SELECT until FROM blocks WHERE device_hash = ?`).bind(deviceHash).first<{ until: string }>();
    return row ? new Date(row.until) : null;
  }
  async block(deviceHash: string, until: Date): Promise<void> {
    await this.db
      .prepare(`INSERT INTO blocks (device_hash, until) VALUES (?, ?) ON CONFLICT(device_hash) DO UPDATE SET until = excluded.until`)
      .bind(deviceHash, iso(until))
      .run();
  }
  async insertReceipt(row: ReceiptRow): Promise<number> {
    const r = await this.db
      .prepare(`INSERT INTO receipts (goal_id, action_id, target_id, state, district, created_at, device_hash) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(row.goal_id, row.action_id, row.target_id, row.state, row.district, row.created_at, row.device_hash)
      .run();
    return Number(r.meta.last_row_id);
  }
  async insertReport(row: ReportRow): Promise<number> {
    const r = await this.db
      .prepare(`INSERT INTO reports (bioguide_id, goal_id, outcome, note, created_at, device_hash, hidden) VALUES (?, ?, ?, ?, ?, ?, 0)`)
      .bind(row.bioguide_id, row.goal_id, row.outcome, row.note, row.created_at, row.device_hash)
      .run();
    return Number(r.meta.last_row_id);
  }
}

export function assembleDelegation(state: string, district: number, members: Member[], stateRow: StateRow | null): Delegation {
  const house = members.find((m) => m.chamber === 'house' && m.district === district) ?? null;
  const senators = members.filter((m) => m.chamber === 'senate').sort((a, b) => a.name.localeCompare(b.name));
  return { state, district, house, senators, state_row: stateRow };
}

/** In-memory Repo over the same rows seed.ts emits. Used by tests and `seed.ts --check`. */
export class MemoryRepo implements Repo {
  generations: GenerationRow[] = [];
  screenings: { device_hash: string; action_id: number; class: ScreenClass; created_at: string }[] = [];
  blocks = new Map<string, string>();
  receipts: ReceiptRow[] = [];
  reports: ReportRow[] = [];

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

  async actionBySlug(slug: string): Promise<Action | null> { return this.rows.actions.find((a) => a.slug === slug) ?? null; }
  async goalById(id: number): Promise<Goal | null> { return this.rows.goals.find((g) => g.id === id) ?? null; }
  async member(bioguideId: string): Promise<Member | null> { return this.rows.members.find((m) => m.bioguide_id === bioguideId) ?? null; }
  async stateRow(state: string): Promise<StateRow | null> { return this.rows.states.find((s) => s.state === state) ?? null; }

  async generationCounts(deviceHash: string, ipHash: string, actionId: number, now: Date): Promise<GenerationCounts> {
    const hourAgo = iso(new Date(now.getTime() - HOUR));
    const dayAgo = iso(new Date(now.getTime() - DAY));
    const day = this.generations.filter((g) => g.created_at >= dayAgo);
    return {
      device_hour: day.filter((g) => g.device_hash === deviceHash && g.created_at >= hourAgo).length,
      device_day: day.filter((g) => g.device_hash === deviceHash).length,
      device_action_day: day.filter((g) => g.device_hash === deviceHash && g.action_id === actionId).length,
      ip_day: day.filter((g) => g.ip_hash === ipHash).length,
      global_day: day.length,
    };
  }
  async recentShingles(actionId: number, limit: number): Promise<Uint32Array[]> {
    return this.generations.filter((g) => g.action_id === actionId).slice(-limit).reverse().map((g) => g.shingles);
  }
  async insertGeneration(row: GenerationRow): Promise<void> { this.generations.push(row); }
  async screenedOutCount(deviceHash: string, since: Date): Promise<number> {
    const s = iso(since);
    return this.screenings.filter((x) => x.device_hash === deviceHash && x.created_at >= s).length;
  }
  async insertScreening(deviceHash: string, actionId: number, cls: ScreenClass, at: Date): Promise<void> {
    this.screenings.push({ device_hash: deviceHash, action_id: actionId, class: cls, created_at: iso(at) });
  }
  async blockedUntil(deviceHash: string): Promise<Date | null> {
    const u = this.blocks.get(deviceHash);
    return u ? new Date(u) : null;
  }
  async block(deviceHash: string, until: Date): Promise<void> { this.blocks.set(deviceHash, iso(until)); }
  async insertReceipt(row: ReceiptRow): Promise<number> { this.receipts.push(row); return this.receipts.length; }
  async insertReport(row: ReportRow): Promise<number> { this.reports.push(row); return this.reports.length; }
}
