// §7.2 nightly maintainer digest. Counts are computed here, by code; the model only writes prose
// from those counts, and any number it adds that is not in the counts throws the prose away.
// Nothing in this file reads or writes `positions` (a report never changes a position).
import { SCREEN_MODEL, callMessage } from './anthropic';
import { digitRuns } from './generate';
import type { BlockRow, Env, Goal, Member, Repo, ReportOutcome, ReportRow, ScreeningRow } from './types';

export const DIGEST_MODEL = SCREEN_MODEL; // claude-haiku-5-5
const DAY = 86_400_000;

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

/** The deterministic text: a table a maintainer can read without the model. */
export function digestTable(d: Digest, abuse: AbuseSummary): string {
  const out = [`Reports ${d.since.slice(0, 10)} → ${d.now.slice(0, 10)}: ${d.total}`, ''];
  let member = '';
  for (const c of d.counts) {
    if (c.member !== member) { member = c.member; out.push(`${c.member} (${c.bioguide_id})`); }
    out.push(`  ${c.goal_slug} · ${c.outcome}: ${c.n}`);
  }
  const sc = Object.entries(abuse.screenings).map(([k, v]) => `${k} ${v}`).join(', ') || 'none';
  out.push('', `Screened out: ${sc}`, `Blocked devices: ${abuse.blocks.length}`);
  for (const b of abuse.blocks) out.push(`  ${b.device_hash.slice(0, 12)}… until ${b.until}`);
  return out.join('\n');
}

/** Every digit run the prose may use: the counts, totals and the window dates. */
export function allowedDigits(d: Digest, abuse: AbuseSummary): Set<string> {
  const s = new Set<string>([String(d.total), String(abuse.blocks.length), ...digitRuns(d.since.slice(0, 10)), ...digitRuns(d.now.slice(0, 10))]);
  for (const c of d.counts) s.add(String(c.n));
  for (const v of Object.values(abuse.screenings)) s.add(String(v));
  for (const c of d.counts) for (const x of [...digitRuns(c.goal_slug), ...digitRuns(c.goal_title)]) s.add(x);
  return s;
}

const PROSE_SYSTEM = `You write the one-paragraph summary at the top of a nightly maintainer digest for a civic-action site.
The digest lists how constituents say congressional offices answered an ask, grouped by member, goal and outcome.
Write 3–6 plain sentences for the maintainer: what moved, which members drew the most reports, anything worth a follow-up.
Use only the numbers in the table you are given; never compute, estimate or introduce another number. No headings, no lists, no markdown.`;

/** Haiku writes prose from the table. A reply with a number not in the counts, or any error, falls back to the table itself. */
export async function digestProse(fetchImpl: typeof fetch, apiKey: string | undefined, d: Digest, abuse: AbuseSummary): Promise<{ text: string; model: string | null }> {
  const table = digestTable(d, abuse);
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
    const ok = allowedDigits(d, abuse);
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
export type DigestResult = { sent: false; reason: 'no_recipient' | 'no_reports'; since: string } | { sent: true; since: string; total: number; model: string | null };

/** The scheduled job: reports since the last run (or 24 h), abuse rows, prose, one email with the CSV attached. */
export async function runDigest(deps: DigestDeps, env: Env): Promise<DigestResult> {
  const now = deps.now();
  const log = deps.log ?? ((l: string) => console.log(l));
  const since = (await deps.repo.lastDigestRun()) ?? new Date(now.getTime() - DAY);
  const to = env.MAINTAINER_EMAIL?.trim();
  if (!to) { log('digest: MAINTAINER_EMAIL unset, skipped'); return { sent: false, reason: 'no_recipient', since: since.toISOString() }; }
  const reports = await deps.repo.reportsSince(since);
  if (reports.length === 0) {
    await deps.repo.recordDigestRun(now, 0);
    log(`digest: no reports since ${since.toISOString()}`);
    return { sent: false, reason: 'no_reports', since: since.toISOString() };
  }
  const [goals, screenings, blocks] = await Promise.all([deps.repo.activeGoals(), deps.repo.screeningsSince(since), deps.repo.activeBlocks(now)]);
  const members = (await Promise.all([...new Set(reports.map((r) => r.bioguide_id))].map((id) => deps.repo.member(id)))).filter((m): m is Member => m !== null);
  const digest = buildDigest(reports, members, goals, since, now);
  const abuse = summariseAbuse(screenings, blocks);
  const prose = await digestProse(deps.fetch, env.ANTHROPIC_API_KEY, digest, abuse);
  const day = now.toISOString().slice(0, 10);
  const text = prose.model ? `${prose.text}\n\n---\n${digestTable(digest, abuse)}` : prose.text;
  await deps.send(env, {
    from: env.DIGEST_FROM?.trim() || 'digest@localhost',
    to,
    subject: `[cut-ties] ${digest.total} report${digest.total === 1 ? '' : 's'} · ${day}`,
    text: `${text}\n\nRaw rows attached (reports-${day}.csv). Reports never change a position; paste sourced rows into data/positions/<goal>.csv.\n`,
    attachment: { filename: `reports-${day}.csv`, content: digest.csv },
  }, now);
  await deps.repo.recordDigestRun(now, digest.total); // after the send, so a failed send is retried by the next run
  log(`digest: sent ${digest.total} reports to maintainer (${prose.model ?? 'table only'})`);
  return { sent: true, since: since.toISOString(), total: digest.total, model: prose.model };
}
