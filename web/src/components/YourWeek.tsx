import { useEffect, useState } from 'preact/hooks';
import { districtLabel } from '../lib/api';
import { clearPlace, deviceId, loadPlace, type Place } from '../lib/store';
import { clearFunnel, fmtDay, fmtDue, isOverdue, loadCaptain, loadCommitments, receiptLine, saveCaptain, saveCommitments, ymd, type Captain, type Commitment } from '../lib/commitments';

/** The build-time slice of every published goal the card needs (index.astro passes it). */
export interface WeekGoal { slug: string; title: string; status: 'upcoming' | 'active' | 'completed' | 'expired'; decision_date: string | null; outcome_note: string | null }
interface Props { goals: WeekGoal[] }

const FONT = "'Bebas Neue', Impact, 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif";
/** §3.2 share image: goal, district and date only, drawn on the device from the goal-card template. */
export async function shareImage(title: string, district: string, due: string): Promise<File | null> {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 1200; c.height = 630;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#090A0F'; g.fillRect(0, 0, 1200, 630);
  g.fillStyle = '#00E876'; g.fillRect(0, 0, 1200, 14);
  g.fillStyle = '#FACC15'; g.font = "700 26px 'Space Mono', Menlo, monospace"; g.fillText(`${district.toUpperCase()} · CUT THE TIES`, 72, 118);
  g.fillStyle = '#FAF7F0'; g.font = `700 84px ${FONT}`;
  const words = title.toUpperCase().split(/\s+/); const lines: string[] = []; let line = '';
  for (const w of words) { if (g.measureText(`${line} ${w}`.trim()).width > 1056 && line) { lines.push(line); line = w; } else line = `${line} ${w}`.trim(); }
  if (line) lines.push(line);
  lines.slice(0, 3).forEach((l, i) => g.fillText(l, 72, 250 + i * 88));
  g.fillStyle = '#E11148'; g.fillRect(72, 520, 1056, 4);
  g.fillStyle = '#FAF7F0'; g.font = "28px Inter, 'Helvetica Neue', Arial, sans-serif"; g.fillText(`Three of us are calling before ${fmtDay(due)}.`, 72, 572);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  return blob ? new File([blob], 'cut-the-ties.png', { type: 'image/png' }) : null;
}

/** commitment-funnel §2: the return visitor's checklist above the address field; §3: share after a completed list. */
export default function YourWeek({ goals }: Props) {
  const [place, setPlace] = useState<Place | null>(null);
  const [items, setItems] = useState<Commitment[]>([]);
  const [captain, setCaptain] = useState<Captain | null>(null);
  const [dropped, setDropped] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const goalOf = (slug: string) => goals.find((g) => g.slug === slug);

  useEffect(() => {
    const p = loadPlace();
    setPlace(p);
    if (!p) return;
    // §2.2 closed goals: drop the item, say the outcome once.
    const gone: string[] = [];
    const closed = (slug: string) => { const g = goalOf(slug); if (g && g.status === 'active') return false; gone.push(g ? `${g.title}: ${g.outcome_note ?? (g.status === 'expired' ? 'the window closed' : 'closed')}.` : 'One goal is no longer listed; its item was dropped.'); return true; };
    const keep = loadCommitments().filter((c) => !closed(c.goal));
    saveCommitments(keep);
    setItems(keep);
    const cap = loadCaptain();
    if (cap && (cap.receipted || closed(cap.goal))) saveCaptain(null); else setCaptain(cap);
    setDropped([...new Set(gone)]);
  }, []);

  if (!place) return null;
  const where = districtLabel(place.state, place.district);
  const open = items.filter((c) => !hidden.includes(c.goal));
  if (open.length === 0 && !captain && dropped.length === 0) return null;

  function update(list: Commitment[]) { saveCommitments(list); setItems(list); }
  function setCap(c: Captain | null) { saveCaptain(c); setCaptain(c); }
  function newDate(key: string, apply: (iso: string) => void) {
    const d = new Date(`${date}T17:00:00`);
    if (Number.isNaN(d.getTime())) return;
    apply(d.toISOString()); setEditing(null);
  }
  async function tick(i: number, done: boolean) {
    if (!captain) return;
    const next = { ...captain, people: captain.people.map((p, j) => (j === i ? { ...p, done } : p)) };
    setCap(next);
    if (next.people.every((p) => p.done)) await complete(next);
  }
  /** §2.1: three ticks → one receipt, no names. */
  async function complete(c: Captain) {
    if (c.receipted) return;
    setError(null);
    const res = await fetch('/api/receipt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: c.goal, action: 'captain-list', state: place?.state, district: place?.district, device: deviceId() }) });
    if (!res.ok) { setError('Could not count that. Your list is still here.'); return; }
    setCap({ ...c, people: c.people.map((p) => ({ ...p, done: true })), receipted: true });
  }
  async function share(c: Captain) {
    const url = `${location.origin}/goals/${c.goal}`;
    const text = receiptLine(where, c.who, c.due);
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share) {
      const img = await shareImage(goalOf(c.goal)?.title ?? c.goal, where, c.due);
      const data: ShareData = img && nav.canShare?.({ files: [img] }) ? { title: 'Cut the Ties', text, url, files: [img] } : { title: 'Cut the Ties', text, url };
      try { await nav.share(data); } catch { /* dismissed */ }
    } else { await navigator.clipboard?.writeText(`${text} ${url}`); setCopied(true); }
  }
  function startOver() { clearFunnel(); clearPlace(); setItems([]); setCaptain(null); setDropped([]); setPlace(null); }

  const dateInput = (key: string, apply: (iso: string) => void) => (
    <span class="flex flex-wrap gap-2 items-center">
      <input type="date" class="input-field text-sm" aria-label="New date" min={ymd(new Date())} value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
      <button type="button" class="btn btn-ghost" onClick={() => newDate(key, apply)}>Set</button>
    </span>
  );

  return (
    <section class="card bg-newsprint text-ink p-4 mb-6 flex flex-col gap-3" aria-labelledby="your-week" data-your-week>
      <div class="flex flex-wrap justify-between gap-2 items-baseline">
        <h2 id="your-week" class="headline-md">Your week</h2>
        <span class="label-code">{where}</span>
      </div>
      {dropped.map((line) => <p class="text-sm" data-outcome>{line}</p>)}
      {open.map((c) => {
        const g = goalOf(c.goal);
        const late = isOverdue(c.due);
        const key = `c:${c.goal}`;
        return (
          <div class="border-t-2 border-ink pt-3 flex flex-col gap-2" data-commitment>
            <p class="font-semibold">{late ? 'Still on? ' : ''}You said you'd call about <a href={`/goals/${c.goal}/act/${c.action}`} class="underline">{g?.title ?? c.goal}</a> by {fmtDue(c.due)}.</p>
            <div class="flex flex-wrap gap-2 items-center">
              <button type="button" class="btn btn-primary" onClick={() => update(items.filter((x) => x.goal !== c.goal))}>Done</button>
              {late ? (
                <>
                  {editing === key ? dateInput(key, (iso) => update(items.map((x) => (x.goal === c.goal ? { ...x, due: iso } : x)))) : <button type="button" class="btn btn-ghost" onClick={() => { setDate(ymd(new Date())); setEditing(key); }}>New date</button>}
                  <button type="button" class="btn btn-ghost" onClick={() => update(items.filter((x) => x.goal !== c.goal))}>Drop</button>
                </>
              ) : <button type="button" class="btn btn-ghost" onClick={() => setHidden([...hidden, c.goal])}>Not yet</button>}
            </div>
          </div>
        );
      })}
      {captain && (() => {
        const c = captain;
        const late = !c.receipted && isOverdue(c.due) && c.people.some((p) => !p.done);
        return (
          <div class="border-t-2 border-ink pt-3 flex flex-col gap-2" data-captain>
            <p class="font-semibold">{late ? 'Still on? ' : ''}Three people you'll ask to call about <a href={`/goals/${c.goal}`} class="underline">{goalOf(c.goal)?.title ?? c.goal}</a> by {fmtDue(c.due)}.</p>
            <ul class="flex flex-col gap-1">
              {c.people.map((p, i) => (
                <li>
                  <label class="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={p.done} disabled={!!c.receipted} onChange={(e) => void tick(i, (e.target as HTMLInputElement).checked)} /> {p.name} <span class="label-ticker text-ink/60">· {p.channel.replace('_', ' ')}</span>
                  </label>
                </li>
              ))}
            </ul>
            {error && <p role="alert" class="text-sm text-crimson font-semibold">{error}</p>}
            {c.receipted ? (
              <div class="flex flex-wrap gap-2 items-center" data-share>
                <p class="text-sm"><span class="chip bg-acid text-ink mr-2">✓</span>Counted: one list for {where}, no names.</p>
                <button type="button" class="btn btn-primary" onClick={() => void share(c)}>{copied ? 'Line copied' : 'Share'}</button>
              </div>
            ) : late && (
              <div class="flex flex-wrap gap-2 items-center">
                <button type="button" class="btn btn-primary" onClick={() => void complete({ ...c, people: c.people.map((p) => ({ ...p, done: true })) })}>Done</button>
                {editing === 'cap' ? dateInput('cap', (iso) => setCap({ ...c, due: iso })) : <button type="button" class="btn btn-ghost" onClick={() => { setDate(ymd(new Date())); setEditing('cap'); }}>New date</button>}
                <button type="button" class="btn btn-ghost" onClick={() => setCap(null)}>Drop</button>
              </div>
            )}
          </div>
        );
      })()}
      <div class="border-t-2 border-ink pt-3 flex flex-wrap gap-3 items-center text-sm">
        <a href="/results" class="underline font-semibold">Your two actions →</a>
        <button type="button" class="underline" onClick={() => { clearPlace(); setPlace(null); }}>Change address</button>
        <button type="button" class="underline text-ink/70 ml-auto" onClick={startOver}>Start over</button>
      </div>
    </section>
  );
}
