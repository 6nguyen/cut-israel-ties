// §7.2 weekly maintainer digest. Counts are computed here, by code; the model only writes prose
// from those counts, and any number it adds that is not in the counts throws the prose away.
// Nothing in this file reads or writes `positions` (a report never changes a position).
import { SCREEN_MODEL, callMessage } from './anthropic';
import { STANDARD_MODEL, costUsd, currentCap, documentCount, monthStart, parseBudget, usd } from './cost';
import { DEFAULT_GLOBAL_CAP, digitRuns } from './generate';
import { reviewSection } from './visits';
import type { Action, BlockRow, Env, Goal, Member, Repo, ReportOutcome, ReportRow, ScreeningRow, TokenSum } from './types';

export const DIGEST_MODEL = SCREEN_MODEL; // claude-haiku-5-5
const WEEK = 7 * 86_400_000;

export interface DigestCount { bioguide_id: string; member: string; goal_slug: string; goal_title: string; outcome: ReportOutcome; n: number }
export interface Digest {
  since: string;
  now: string;
  total: number;
  counts: DigestCount[]; // member × goal × outcome, sorted by member name, goal slug, outcome
  csv: string; // the raw report rows, one line each, for the attachment
}

const OUTCOME_ORDER: ReportOutcome[] = ['will_support', 'undecided', 'opposed', 'no_answer', 'other'];

/** RFC 4180 cell: quoted when it holds a comma, quote or newline. */
export const csvCell = (v: string | number | null): string => {
  const s = v === null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const REPORT_CSV_HEADER = 'bioguide_id,member,goal_slug,outcome,note,created_at,device_hash';

/** Pure: group `reports` by member × goal × outcome and render the raw rows as CSV. */
export function buildDigest(reports: ReportRow[], members: Member[], goals: Goal[], since: Date, now: Date): Digest {
  const memberName = (id: string): string => members.find((m) => m.bioguide_id === id)?.name ?? id;
  const goalOf = (id: number): Goal | undefined => goals.find((g) => g.id === id);
  const key = (r: ReportRow): string => `${r.bioguide_id}\u0000${r.goal_id}\u0000${r.outcome}`;
  const buckets = new Map<string, DigestCount>();
  for (const r of reports) {
    const k = key(r);
    const b = buckets.get(k);
    if (b) { b.n++; continue; }
    const g = goalOf(r.goal_id);
    buckets.set(k, { bioguide_id: r.bioguide_id, member: memberName(r.bioguide_id), goal_slug: g?.slug ?? String(r.goal_id), goal_title: g?.title ?? String(r.goal_id), outcome: r.outcome, n: 1 });
  }
  const counts = [...buckets.values()].sort(
    (a, b) => a.member.localeCompare(b.member) || a.goal_slug.localeCompare(b.goal_slug) || OUTCOME_ORDER.indexOf(a.outcome) - OUTCOME_ORDER.indexOf(b.outcome),
  );
  const lines = [...reports]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((r) => [r.bioguide_id, memberName(r.bioguide_id), goalOf(r.goal_id)?.slug ?? String(r.goal_id), r.outcome, r.note, r.created_at, r.device_hash].map(csvCell).join(','));
  return { since: since.toISOString(), now: now.toISOString(), total: reports.length, counts, csv: [REPORT_CSV_HEADER, ...lines].join('\n') + '\n' };
}

export interface AbuseSummary { screenings: Partial<Record<ScreeningRow['class'], number>>; blocks: BlockRow[] }

export function summariseAbuse(screenings: ScreeningRow[], blocks: BlockRow[]): AbuseSummary {
  const s: AbuseSummary['screenings'] = {};
  for (const x of screenings) s[x.class] = (s[x.class] ?? 0) + 1;
  return { screenings: s, blocks };
}

// ---- generation-cost §2: LLM spend ----------------------------------------------------------
export interface ActionSpend { slug: string; docs: number; redrafts: number; standard: number; fails: Record<string, number> }
export interface Spend {
  window: { docs: number; redrafts: number; standard: number; usd: number }; // since the last run
  month: { usd: number; budget: number; pct: number }; // pct = whole-number share of the budget spent (0 when the budget is 0)
  cap: number; // today's dailyCap(...)
  actions: ActionSpend[]; // per action in the window, sorted by slug
}
/** Share of the budget to whole per cent; the 80% send compares the same arithmetic. */
export const BUDGET_ALERT_SHARE = 0.8;
export const redraftPct = (redrafts: number, docs: number): number => (docs > 0 ? Math.round((100 * redrafts) / docs) : 0);

/** Arithmetic over the token sums; the model never sees anything but the rendered result. */
export function buildSpend(window: TokenSum[], spentMonth: number, budget: number, cap: number, actions: Action[]): Spend {
  const slug = new Map(actions.map((a) => [a.id, a.slug]));
  const byAction = new Map<number, ActionSpend>();
  for (const t of window) {
    const a = byAction.get(t.action_id) ?? { slug: slug.get(t.action_id) ?? `action #${t.action_id}`, docs: 0, redrafts: 0, standard: 0, fails: {} };
    if (t.model === STANDARD_MODEL) a.standard += t.count;
    else {
      a.docs += t.count;
      a.redrafts += t.redrafts;
      if (t.check_fail) a.fails[t.check_fail] = (a.fails[t.check_fail] ?? 0) + t.count;
    }
    byAction.set(t.action_id, a);
  }
  const standard = window.filter((t) => t.model === STANDARD_MODEL).reduce((n, t) => n + t.count, 0);
  return {
    window: { docs: documentCount(window), redrafts: window.reduce((n, t) => n + t.redrafts, 0), standard, usd: costUsd(window) },
    month: { usd: spentMonth, budget, pct: budget > 0 ? Math.round((100 * spentMonth) / budget) : 0 },
    cap,
    actions: [...byAction.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
  };
}

export function spendTable(s: Spend): string {
  const out = [
    'LLM spend',
    `  since last run: ${s.window.docs} documents, ${s.window.redrafts} redrafts, ${s.window.standard} standard scripts, ${usd(s.window.usd)}`,
    `  month to date: ${usd(s.month.usd)} of ${usd(s.month.budget)} (${s.month.pct}%)`,
    `  today's cap: ${s.cap} documents`,
  ];
  for (const a of s.actions) {
    const fails = Object.entries(a.fails).sort().map(([k, v]) => `${k} ${v}`).join(', ');
    out.push(`  ${a.slug}: ${a.docs} documents, redrafts ${redraftPct(a.redrafts, a.docs)}%${fails ? ` (${fails})` : ''}${a.standard ? `, ${a.standard} standard` : ''}`);
  }
  return out.join('\n');
}

function spendDigits(s: Spend): string[] {
  const out = [s.window.docs, s.window.redrafts, s.window.standard, s.month.pct, s.cap].map(String);
  for (const v of [s.window.usd, s.month.usd, s.month.budget]) out.push(...digitRuns(usd(v)));
  for (const a of s.actions) out.push(String(a.docs), String(a.redrafts), String(a.standard), String(redraftPct(a.redrafts, a.docs)), ...Object.values(a.fails).map(String));
  return out;
}

/** The deterministic text: a table a maintainer can read without the model. */
export function digestTable(d: Digest, abuse: AbuseSummary, spend?: Spend): string {
  const out = [`Reports ${d.since.slice(0, 10)} → ${d.now.slice(0, 10)}: ${d.total}`, ''];
  let member = '';
  for (const c of d.counts) {
    if (c.member !== member) { member = c.member; out.push(`${c.member} (${c.bioguide_id})`); }
    out.push(`  ${c.goal_slug} · ${c.outcome}: ${c.n}`);
  }
  const sc = Object.entries(abuse.screenings).map(([k, v]) => `${k} ${v}`).join(', ') || 'none';
  out.push('', `Screened out: ${sc}`, `Blocked devices: ${abuse.blocks.length}`);
  for (const b of abuse.blocks) out.push(`  ${b.device_hash.slice(0, 12)}… until ${b.until}`);
  if (spend) out.push('', spendTable(spend));
  return out.join('\n');
}

/** Every digit run the prose may use: the counts, totals, the window dates and the spend block. */
export function allowedDigits(d: Digest, abuse: AbuseSummary, spend?: Spend): Set<string> {
  const s = new Set<string>([String(d.total), String(abuse.blocks.length), ...digitRuns(d.since.slice(0, 10)), ...digitRuns(d.now.slice(0, 10)), ...(spend ? spendDigits(spend) : [])]);
  for (const c of d.counts) s.add(String(c.n));
  for (const v of Object.values(abuse.screenings)) s.add(String(v));
  for (const c of d.counts) for (const x of [...digitRuns(c.goal_slug), ...digitRuns(c.goal_title)]) s.add(x);
  return s;
}

const PROSE_SYSTEM = `You write the one-paragraph summary at the top of a weekly maintainer digest for a civic-action site.
The digest lists how constituents say congressional offices answered an ask, grouped by member, goal and outcome.
Write 3–6 plain sentences for the maintainer: what moved, which members drew the most reports, anything worth a follow-up.
Use only the numbers in the table you are given; never compute, estimate or introduce another number. No headings, no lists, no markdown.`;

/** Haiku writes prose from the table. A reply with a number not in the counts, or any error, falls back to the table itself. */
export async function digestProse(fetchImpl: typeof fetch, apiKey: string | undefined, d: Digest, abuse: AbuseSummary, spend?: Spend): Promise<{ text: string; model: string | null }> {
  const table = digestTable(d, abuse, spend);
  if (!apiKey) return { text: table, model: null };
  try {
    const r = await callMessage(fetchImpl, apiKey, {
      model: DIGEST_MODEL,
      max_tokens: 600,
      system: [{ type: 'text', text: PROSE_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `<counts>\n${table}\n</counts>` }],
      output_config: { effort: 'low' },
    });
    const text = r.text.trim();
    const ok = allowedDigits(d, abuse, spend);
    if (!text || digitRuns(text).some((n) => !ok.has(n))) return { text: table, model: null };
    return { text, model: DIGEST_MODEL };
  } catch {
    return { text: table, model: null };
  }
}

// ---- mail -------------------------------------------------------------------------------------
export interface Mail { from: string; to: string; subject: string; text: string; attachment: { filename: string; content: string } }

function base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/(.{76})/g, '$1\r\n');
}

/** multipart/mixed: a UTF-8 text part and one base64 CSV attachment. */
export function buildMime(m: Mail, date: Date): string {
  const boundary = `=_digest_${date.getTime().toString(36)}`;
  return [
    `From: ${m.from}`,
    `To: ${m.to}`,
    `Subject: ${m.subject}`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: <digest-${date.getTime()}@${m.from.split('@')[1] ?? 'localhost'}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    m.text,
    '',
    `--${boundary}`,
    `Content-Type: text/csv; charset=utf-8; name="${m.attachment.filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${m.attachment.filename}"`,
    '',
    base64(m.attachment.content),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

/** Production sender: Cloudflare Email Routing. Imported lazily so vitest never loads `cloudflare:email`. */
export async function sendWithEmailRouting(env: Env, mail: Mail, now: Date): Promise<void> {
  if (!env.DIGEST_MAIL) throw new Error('digest: DIGEST_MAIL binding missing');
  const { EmailMessage } = await import('cloudflare:email');
  await env.DIGEST_MAIL.send(new EmailMessage(mail.from, mail.to, buildMime(mail, now)));
}

// ---- the job ---------------------------------------------------------------------------------
export interface DigestDeps {
  repo: Repo;
  fetch: typeof fetch;
  now: () => Date;
  send: (env: Env, mail: Mail, now: Date) => Promise<void>;
  log?: (line: string) => void;
}
export type DigestResult = { sent: false; reason: 'no_recipient' | 'no_reports'; since: string } | { sent: true; since: string; total: number; model: string | null; alert: 'budget80' | null };

/** The scheduled job: reports since the last run (or 24 h), abuse rows, prose, one email with the CSV attached. */
export async function runDigest(deps: DigestDeps, env: Env): Promise<DigestResult> {
  const now = deps.now();
  const log = deps.log ?? ((l: string) => console.log(l));
  const since = (await deps.repo.lastDigestRun()) ?? new Date(now.getTime() - WEEK);
  const to = env.MAINTAINER_EMAIL?.trim();
  if (!to) { log('digest: MAINTAINER_EMAIL unset, skipped'); return { sent: false, reason: 'no_recipient', since: since.toISOString() }; }
  const reports = await deps.repo.reportsSince(since);
  // office-visits §1.3: pending listings ride along, and alone are enough to send the mail.
  const pending = await deps.repo.pendingVisits();
  // generation-cost §2: the spend block, and the one 80% send a month. "Crossed" is arithmetic over the
  // same sums: the month's spend before the last run was under the share and the spend now is at or over it.
  const budget = parseBudget(env.LLM_MONTHLY_BUDGET_USD);
  const ceiling = Number(env.MAX_GENERATIONS_PER_DAY) > 0 ? Number(env.MAX_GENERATIONS_PER_DAY) : DEFAULT_GLOBAL_CAP;
  const [windowSums, { cap, spent }] = await Promise.all([deps.repo.tokensSince(since.toISOString()), currentCap(deps.repo, now, budget, ceiling)]);
  const spentBeforeRun = since.toISOString() >= monthStart(now) ? Math.max(0, spent - costUsd(windowSums)) : 0;
  const alert = budget > 0 && spentBeforeRun < BUDGET_ALERT_SHARE * budget && spent >= BUDGET_ALERT_SHARE * budget ? 'budget80' : null;
  if (reports.length === 0 && pending.length === 0 && !alert) {
    await deps.repo.recordDigestRun(now, 0);
    log(`digest: no reports since ${since.toISOString()}`);
    return { sent: false, reason: 'no_reports', since: since.toISOString() };
  }
  const from = env.DIGEST_FROM?.trim() || 'digest@localhost';
  const origin = from.includes('@') && !from.endsWith('@localhost') ? `https://${from.split('@')[1]}` : null;
  const visitNames = new Map((await Promise.all(pending.map((v) => deps.repo.member(v.bioguide_id)))).filter((m): m is Member => m !== null).map((m) => [m.bioguide_id, m.name]));
  const visitsText = await reviewSection(pending, (id) => visitNames.get(id) ?? id, origin, env.VISITS_REVIEW_SECRET?.trim() || undefined, now);
  const [goals, screenings, blocks] = await Promise.all([deps.repo.activeGoals(), deps.repo.screeningsSince(since), deps.repo.activeBlocks(now)]);
  const members = (await Promise.all([...new Set(reports.map((r) => r.bioguide_id))].map((id) => deps.repo.member(id)))).filter((m): m is Member => m !== null);
  const digest = buildDigest(reports, members, goals, since, now);
  const abuse = summariseAbuse(screenings, blocks);
  const spend = buildSpend(windowSums, spent, budget, cap, await deps.repo.actionsFor(goals.map((g) => g.id)));
  // No reports and no listing (an 80%-only send) → the table alone, no model call.
  const prose = reports.length || pending.length ? await digestProse(deps.fetch, env.ANTHROPIC_API_KEY, digest, abuse, spend) : { text: digestTable(digest, abuse, spend), model: null };
  const day = now.toISOString().slice(0, 10);
  const text = prose.model ? `${prose.text}\n\n---\n${digestTable(digest, abuse, spend)}` : prose.text;
  const parts = [
    ...(digest.total || !alert ? [`${digest.total} report${digest.total === 1 ? '' : 's'}`] : []),
    ...(pending.length ? [`${pending.length} visit listing${pending.length === 1 ? '' : 's'} to review`] : []),
    ...(alert ? ['LLM budget 80%'] : []),
  ];
  await deps.send(env, {
    from,
    to,
    subject: `[cut-ties] ${parts.join(' · ')} · ${day}`,
    text: `${text}${visitsText ? `\n\n---\n${visitsText}` : ''}\n\nRaw rows attached (reports-${day}.csv). Reports never change a position; paste sourced rows into data/positions/<goal>.csv.\n`,
    attachment: { filename: `reports-${day}.csv`, content: digest.csv },
  }, now);
  await deps.repo.recordDigestRun(now, digest.total); // after the send, so a failed send is retried by the next run
  log(`digest: sent ${digest.total} reports to maintainer (${prose.model ?? 'table only'}${alert ? ', LLM budget 80%' : ''})`);
  return { sent: true, since: since.toISOString(), total: digest.total, model: prose.model, alert };
}
