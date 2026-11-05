// §3 prep pages: the markdown contract for goals.prep_md and the unified ask.
// Pure and Node-free so the loader, the static site and the generator share it.

/** Required `## ` headings of prep_md, in order (PRD §3.1; "our pick" comes from our_picks). */
export const PREP_HEADINGS = [
  'Where things stand',
  'Timeline',
  'What to say in 30 seconds',
  'Likely pushback and answers',
  'What counts as a win',
  'Sources',
] as const;

export interface PrepSection { title: string; id: string; body: string }

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Split prep_md on its `## ` headings. Text before the first heading is dropped. */
export function prepSections(md: string | null): PrepSection[] {
  if (!md) return [];
  const out: PrepSection[] = [];
  let cur: { title: string; lines: string[] } | null = null;
  const flush = () => { if (cur) out.push({ title: cur.title, id: slugify(cur.title), body: cur.lines.join('\n').trim() }); };
  for (const line of md.replace(/\r\n/g, '\n').split('\n')) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) { flush(); cur = { title: m[1], lines: [] }; } else cur?.lines.push(line);
  }
  flush();
  return out;
}

/** Throws when a non-empty prep_md lacks a required heading, has them out of order, or leaves "Where things stand" undated. */
export function checkPrep(slug: string, md: string | null): void {
  if (!md) return;
  const sections = prepSections(md);
  const got = sections.map((s) => s.title.toLowerCase());
  const want = PREP_HEADINGS.map((h) => h.toLowerCase());
  if (got.length !== want.length || want.some((h, i) => got[i] !== h)) {
    throw new Error(`goal ${slug}: prep_md headings must be exactly, in order: ${PREP_HEADINGS.map((h) => `## ${h}`).join(' | ')} (found: ${sections.map((s) => s.title).join(' | ') || 'none'}) (§3.1)`);
  }
  if (!/\b\d{4}-\d{2}-\d{2}\b/.test(sections[0].body)) throw new Error(`goal ${slug}: prep_md "Where things stand" must carry an ISO date, e.g. "As of 2026-11-04" (§3.1)`);
  for (const s of sections) if (!s.body) throw new Error(`goal ${slug}: prep_md section "${s.title}" is empty (§3.1)`);
}

/** The one ask every surface repeats (§3.2): the goal's condition plus the first pick, when there is one. */
export function unifiedAsk(whatWeWant: string, firstPick?: string | null): string {
  return firstPick ? `${whatWeWant.replace(/\s+$/, '')} Our first pick: ${firstPick}.` : whatWeWant;
}
