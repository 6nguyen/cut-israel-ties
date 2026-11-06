import type {
  Action, BlockRow, Delegation, GenerationCounts, GenerationRow, Goal, Member, Office, Position, ReceiptRow, Repo, ReportRow, ScreenClass, ScreeningRow, StateRow,
  LatestReport, ReceiptBuckets, ReceiptKind, ReceiptLimitCounts, Visit, VisitRequestRow, VisitRow, VisitStatus,
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
  async offices(bioguideId: string): Promise<Office[]> {
    return (await this.db.prepare(`SELECT * FROM district_offices WHERE bioguide_id = ? ORDER BY rowid`).bind(bioguideId).all<Office>()).results;
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
      .prepare(`INSERT INTO receipts (goal_id, action_id, target_id, state, district, created_at, device_hash, kind, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(row.goal_id, row.action_id, row.target_id, row.state, row.district, row.created_at, row.device_hash, row.kind, row.ip_hash)
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
  // ---- §7.2 digest reads ----
  async reportsSince(since: Date): Promise<ReportRow[]> {
    const { results } = await this.db
      .prepare(`SELECT bioguide_id, goal_id, outcome, note, created_at, device_hash FROM reports WHERE created_at > ? AND hidden = 0 ORDER BY created_at`)
      .bind(iso(since)).all<ReportRow>();
    return results;
  }
  async screeningsSince(since: Date): Promise<ScreeningRow[]> {
    const { results } = await this.db
      .prepare(`SELECT device_hash, action_id, class, created_at FROM screenings WHERE created_at > ? ORDER BY created_at`)
      .bind(iso(since)).all<ScreeningRow>();
    return results;
  }
  async activeBlocks(now: Date): Promise<BlockRow[]> {
    const { results } = await this.db.prepare(`SELECT device_hash, until FROM blocks WHERE until > ? ORDER BY until`).bind(iso(now)).all<BlockRow>();
    return results;
  }
  async lastDigestRun(): Promise<Date | null> {
    const row = await this.db.prepare(`SELECT MAX(ran_at) AS ran_at FROM digest_runs`).first<{ ran_at: string | null }>();
    return row?.ran_at ? new Date(row.ran_at) : null;
  }
  async recordDigestRun(at: Date, reportCount: number): Promise<void> {
    await this.db.prepare(`INSERT INTO digest_runs (ran_at, report_count) VALUES (?, ?)`).bind(iso(at), reportCount).run();
  }

  async latestReport(bioguideId: string, goalId: number): Promise<LatestReport | null> {
    return (await this.db
      .prepare(`SELECT outcome, note, created_at FROM reports WHERE bioguide_id = ? AND goal_id = ? AND hidden = 0 ORDER BY created_at DESC, id DESC LIMIT 1`)
      .bind(bioguideId, goalId)
      .first<LatestReport>()) ?? null;
  }

  // ---- office-visits ----
  async insertVisit(row: VisitRow): Promise<number> {
    const r = await this.db
      .prepare(`INSERT INTO visits (bioguide_id, office_city, starts_at, ends_at, contact_url, note, status, device_hash, created_at, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
      .bind(row.bioguide_id, row.office_city, row.starts_at, row.ends_at, row.contact_url, row.note, row.status, row.device_hash, row.created_at, row.reviewed_at)
      .first<{ id: number }>();
    return r!.id;
  }
  async visit(id: number): Promise<Visit | null> {
    return (await this.db.prepare(`SELECT * FROM visits WHERE id = ?`).bind(id).first<Visit>()) ?? null;
  }
  async approvedVisits(bioguideId: string): Promise<{ visit: Visit; requests: number }[]> {
    const { results } = await this.db
      .prepare(`SELECT v.*, (SELECT COUNT(*) FROM visit_requests r WHERE r.visit_id = v.id) AS requests FROM visits v WHERE v.bioguide_id = ? AND v.status = 'approved' ORDER BY v.starts_at, v.id`)
      .bind(bioguideId)
      .all<Visit & { requests: number }>();
    return results.map(({ requests, ...visit }) => ({ visit, requests }));
  }
  async pendingVisits(): Promise<Visit[]> {
    return (await this.db.prepare(`SELECT * FROM visits WHERE status = 'pending' ORDER BY created_at, id`).all<Visit>()).results;
  }
  async pendingVisitCount(deviceHash: string): Promise<number> {
    const r = await this.db.prepare(`SELECT COUNT(*) AS n FROM visits WHERE device_hash = ? AND status = 'pending'`).bind(deviceHash).first<{ n: number }>();
    return r?.n ?? 0;
  }
  async setVisitStatus(id: number, status: VisitStatus, at: Date): Promise<void> {
    await this.db.prepare(`UPDATE visits SET status = ?, reviewed_at = ? WHERE id = ?`).bind(status, iso(at), id).run();
  }
  async deleteVisit(id: number): Promise<void> {
    await this.db.batch([
      this.db.prepare(`DELETE FROM visit_requests WHERE visit_id = ?`).bind(id),
      this.db.prepare(`DELETE FROM visits WHERE id = ?`).bind(id),
    ]);
  }
  async hasVisitRequest(visitId: number, deviceHash: string): Promise<boolean> {
    return !!(await this.db.prepare(`SELECT 1 AS x FROM visit_requests WHERE visit_id = ? AND device_hash = ?`).bind(visitId, deviceHash).first());
  }
  async visitRequestsSince(deviceHash: string, since: Date): Promise<number> {
    const r = await this.db.prepare(`SELECT COUNT(*) AS n FROM visit_requests WHERE device_hash = ? AND created_at >= ?`).bind(deviceHash, iso(since)).first<{ n: number }>();
    return r?.n ?? 0;
  }
  async insertVisitRequest(visitId: number, deviceHash: string, at: Date): Promise<void> {
    await this.db.prepare(`INSERT OR IGNORE INTO visit_requests (visit_id, device_hash, created_at) VALUES (?, ?, ?)`).bind(visitId, deviceHash, iso(at)).run();
  }
  async deleteVisitRequest(visitId: number, deviceHash: string): Promise<void> {
    await this.db.prepare(`DELETE FROM visit_requests WHERE visit_id = ? AND device_hash = ?`).bind(visitId, deviceHash).run();
  }
  async trackedGoals(): Promise<Goal[]> {
    const { results } = await this.db.prepare(`SELECT * FROM goals WHERE status != 'upcoming' ORDER BY priority DESC, slug`).all<Goal>();
    return results;
  }

  // district-counters §1: one query, grouped by in-district flag, kind and action type; code sums the buckets.
  async countReceipts(goalId: number, state: string, district: number | null, sinceIso: string): Promise<{ district: ReceiptBuckets; state: ReceiptBuckets }> {
    const { results } = await this.db
      .prepare(
        `SELECT (r.district = ?3) AS in_district, r.kind, a.type, COUNT(*) AS n
         FROM receipts r LEFT JOIN actions a ON a.id = r.action_id
         WHERE r.goal_id = ?1 AND r.state = ?2 AND r.created_at >= ?4
         GROUP BY in_district, r.kind, a.type`,
      )
      .bind(goalId, state, district, sinceIso)
      .all<{ in_district: number | null; kind: ReceiptKind; type: string | null; n: number }>();
    return foldBuckets(results.map((r) => ({ inDistrict: r.in_district === 1, kind: r.kind, type: r.type, n: Number(r.n) })));
  }
  // district-counters §3: the three receipt limits in one read.
  async receiptLimitCounts(deviceHash: string, ipHash: string, goalId: number, actionId: number | null, kind: ReceiptKind, now: Date): Promise<ReceiptLimitCounts> {
    const dayAgo = iso(new Date(now.getTime() - DAY));
    const tenAgo = iso(new Date(now.getTime() - 10 * 60_000));
    const row = await this.db
      .prepare(
        `SELECT
           SUM(device_hash = ?1) AS device_day,
           SUM(device_hash = ?1 AND goal_id = ?3 AND kind = ?5 AND action_id IS ?4 AND created_at >= ?6) AS repeat,
           SUM(ip_hash = ?2) AS ip_day
         FROM receipts WHERE created_at >= ?7`,
      )
      .bind(deviceHash, ipHash, goalId, actionId, kind, tenAgo, dayAgo)
      .first<Record<keyof ReceiptLimitCounts, number | null>>();
    return { device_day: row?.device_day ?? 0, repeat: row?.repeat ?? 0, ip_day: row?.ip_day ?? 0 };
  }
}

/** Sums grouped receipt rows into state buckets (every row) and district buckets (in-district rows). */
export function foldBuckets(rows: { inDistrict: boolean; kind: ReceiptKind; type: string | null | undefined; n: number }[]): { district: ReceiptBuckets; state: ReceiptBuckets } {
  const district: ReceiptBuckets = { calls: 0, letters: 0, comments: 0, captain_lists: 0 };
  const state: ReceiptBuckets = { calls: 0, letters: 0, comments: 0, captain_lists: 0 };
  for (const r of rows) {
    const b = r.kind === 'captain-list' ? 'captain_lists' : r.type === 'call' ? 'calls' : r.type === 'letter' ? 'letters' : r.type === 'public_comment' ? 'comments' : null;
    if (!b) continue;
    state[b] += r.n;
    if (r.inDistrict) district[b] += r.n;
  }
  return { district, state };
}

export function assembleDelegation(state: string, district: number, allMembers: Member[], stateRow: StateRow | null): Delegation {
  const members = allMembers.filter((m) => !m.left_office); // roster-freshness §4: a departed member is never a target; the row stays for receipts
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
  digestRuns: { ran_at: string; report_count: number }[] = [];
  visits: Visit[] = [];
  visitRequests: VisitRequestRow[] = [];
  private visitsDeleted = 0; // keeps ids unique after a delete, like AUTOINCREMENT would

  constructor(
    private rows: { goals: Goal[]; actions: Action[]; members: Member[]; positions: Position[]; states: StateRow[]; offices?: Office[] },
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
  async offices(bioguideId: string): Promise<Office[]> { return (this.rows.offices ?? []).filter((o) => o.bioguide_id === bioguideId); }

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
  async reportsSince(since: Date): Promise<ReportRow[]> { const s = iso(since); return this.reports.filter((r) => r.created_at > s); }
  async screeningsSince(since: Date): Promise<ScreeningRow[]> { const s = iso(since); return this.screenings.filter((x) => x.created_at > s); }
  async activeBlocks(now: Date): Promise<BlockRow[]> {
    const n = iso(now);
    return [...this.blocks].filter(([, until]) => until > n).map(([device_hash, until]) => ({ device_hash, until }));
  }
  async lastDigestRun(): Promise<Date | null> {
    const last = this.digestRuns.map((r) => r.ran_at).sort().at(-1);
    return last ? new Date(last) : null;
  }
  async recordDigestRun(at: Date, reportCount: number): Promise<void> { this.digestRuns.push({ ran_at: iso(at), report_count: reportCount }); }
  async latestReport(bioguideId: string, goalId: number): Promise<LatestReport | null> {
    const r = this.reports.filter((x) => x.bioguide_id === bioguideId && x.goal_id === goalId).at(-1);
    return r ? { outcome: r.outcome, note: r.note, created_at: r.created_at } : null;
  }
  async countReceipts(goalId: number, state: string, district: number | null, sinceIso: string): Promise<{ district: ReceiptBuckets; state: ReceiptBuckets }> {
    const type = (id: number | null) => this.rows.actions.find((a) => a.id === id)?.type ?? null;
    return foldBuckets(
      this.receipts
        .filter((r) => r.goal_id === goalId && r.state === state && r.created_at >= sinceIso)
        .map((r) => ({ inDistrict: district !== null && r.district === district, kind: r.kind, type: type(r.action_id), n: 1 })),
    );
  }
  async receiptLimitCounts(deviceHash: string, ipHash: string, goalId: number, actionId: number | null, kind: ReceiptKind, now: Date): Promise<ReceiptLimitCounts> {
    const dayAgo = iso(new Date(now.getTime() - DAY));
    const tenAgo = iso(new Date(now.getTime() - 10 * 60_000));
    const day = this.receipts.filter((r) => r.created_at >= dayAgo);
    return {
      device_day: day.filter((r) => r.device_hash === deviceHash).length,
      repeat: day.filter((r) => r.device_hash === deviceHash && r.goal_id === goalId && r.kind === kind && r.action_id === actionId && r.created_at >= tenAgo).length,
      ip_day: day.filter((r) => r.ip_hash === ipHash).length,
    };
  }
  async trackedGoals(): Promise<Goal[]> {
    return this.rows.goals.filter((g) => g.status !== 'upcoming').sort((a, b) => b.priority - a.priority || a.slug.localeCompare(b.slug));
  }

  // ---- office-visits ----
  async insertVisit(row: VisitRow): Promise<number> {
    const id = this.visits.length + 1 + this.visitsDeleted;
    this.visits.push({ ...row, id });
    return id;
  }
  async visit(id: number): Promise<Visit | null> { return this.visits.find((v) => v.id === id) ?? null; }
  async approvedVisits(bioguideId: string): Promise<{ visit: Visit; requests: number }[]> {
    return this.visits
      .filter((v) => v.bioguide_id === bioguideId && v.status === 'approved')
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.id - b.id)
      .map((visit) => ({ visit, requests: this.visitRequests.filter((r) => r.visit_id === visit.id).length }));
  }
  async pendingVisits(): Promise<Visit[]> { return this.visits.filter((v) => v.status === 'pending'); }
  async pendingVisitCount(deviceHash: string): Promise<number> { return this.visits.filter((v) => v.device_hash === deviceHash && v.status === 'pending').length; }
  async setVisitStatus(id: number, status: VisitStatus, at: Date): Promise<void> {
    const v = this.visits.find((x) => x.id === id);
    if (v) { v.status = status; v.reviewed_at = iso(at); }
  }
  async deleteVisit(id: number): Promise<void> {
    if (this.visits.some((v) => v.id === id)) this.visitsDeleted++;
    this.visits = this.visits.filter((v) => v.id !== id);
    this.visitRequests = this.visitRequests.filter((r) => r.visit_id !== id);
  }
  async hasVisitRequest(visitId: number, deviceHash: string): Promise<boolean> { return this.visitRequests.some((r) => r.visit_id === visitId && r.device_hash === deviceHash); }
  async visitRequestsSince(deviceHash: string, since: Date): Promise<number> {
    const s = iso(since);
    return this.visitRequests.filter((r) => r.device_hash === deviceHash && r.created_at >= s).length;
  }
  async insertVisitRequest(visitId: number, deviceHash: string, at: Date): Promise<void> {
    if (!(await this.hasVisitRequest(visitId, deviceHash))) this.visitRequests.push({ visit_id: visitId, device_hash: deviceHash, created_at: iso(at) });
  }
  async deleteVisitRequest(visitId: number, deviceHash: string): Promise<void> {
    this.visitRequests = this.visitRequests.filter((r) => !(r.visit_id === visitId && r.device_hash === deviceHash));
  }
}
