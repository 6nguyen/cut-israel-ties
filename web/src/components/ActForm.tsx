import { useEffect, useState } from 'preact/hooks';
import type { DocFormat, FormField, GenerateDone } from '@worker/generate';
import type { TargetCard } from '../lib/api';
import { deviceId, loadPlace } from '../lib/store';
import { commitmentFor, fmtDue, logReceipt } from '../lib/commitments';
import Funnel from './Funnel';
import OpenChip from './OpenChip';
import { isOpen } from '../lib/hours';
import { useTurnstile } from '../lib/turnstile';
import type { Reason } from '../lib/goals';

interface Props {
  goal: string;
  action: string;
  type: 'call' | 'letter' | 'public_comment';
  scope: 'house' | 'senate' | 'both' | 'state';
  fields: FormField[];
  fmt: DocFormat;
  siteKey?: string;
  /** Goal title and decision date for the commitment step (commitment-funnel §1). */
  title?: string;
  decision?: string | null;
  /** Goal `reasons`: first-person starting points shown above the "why" field, grouped by angle. */
  reasons?: Reason[];
}

interface Choice { id: string; label: string }
type Phase = { kind: 'form' } | { kind: 'generating'; stage: string } | { kind: 'output'; doc: GenerateDone } | { kind: 'refused'; message: string };
/** generation-cost §4: the one line of why under a standard script. */
const STANDARD_WHY: Record<string, string> = {
  capacity: "Today's personalised drafts are used up, so this one is built from our template with your lines dropped in.",
  budget: "This month's drafting budget is spent, so this one is built from our template with your lines dropped in.",
  unconfigured: 'Drafting is not configured on this server, so this one is built from our template with your lines dropped in.',
  upstream: 'The drafting service is not answering, so this one is built from our template with your lines dropped in.',
};
const OUTCOMES: [string, string][] = [['will_support', 'Will support'], ['undecided', 'Undecided'], ['opposed', 'Opposed'], ['no_answer', 'No answer'], ['other', 'Other']];

/** call-follow-through §2: the Worker lists the DC number first, the district number second; when DC is closed the district office (no sourced hours yet) goes first. */
export function phoneOrder(phones: string[], now: Date = new Date()): { phone: string; district: boolean }[] {
  const list = phones.map((phone, i) => ({ phone, district: phones.length > 1 && i === 1 }));
  return list.length > 1 && !isOpen(now) ? [list[1], list[0]] : list;
}

/** Parses the Worker's SSE body (`event:` + `data:` lines, blank-line separated). */
async function readSse(body: ReadableStream<Uint8Array>, on: (event: string, data: Record<string, unknown>) => void): Promise<void> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    buf += done ? '' : dec.decode(value, { stream: true });
    let at: number;
    while ((at = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, at);
      buf = buf.slice(at + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (data.length) { try { on(event, JSON.parse(data.join('\n')) as Record<string, unknown>); } catch { /* keep-alive */ } }
    }
    if (done) return;
  }
}

/** §4.1–4.6: the form, the streamed document, receipt, share and the office-response report. */
export default function ActForm({ goal, action, type, scope, fields, fmt, siteKey, title, decision, reasons }: Props) {
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [target, setTarget] = useState<string>('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<number | null>(null);
  const [outcome, setOutcome] = useState('');
  const [note, setNote] = useState('');
  const [reported, setReported] = useState(false);
  const [copied, setCopied] = useState(false);
  const [funnelDone, setFunnelDone] = useState(false);
  const [promised, setPromised] = useState<string | null>(null);
  const ts = useTurnstile(siteKey);
  const place = loadPlace();
  const [extras, setExtras] = useState<typeof import('./ReceiptExtras') | null>(null); // call-follow-through: loaded once a receipt exists

  useEffect(() => {
    if (receipt === null || extras) return;
    import('./ReceiptExtras').then(setExtras).catch(() => {});
  }, [receipt]);

  useEffect(() => {
    setPromised(commitmentFor(goal)?.due ?? null); // commitment-funnel §2.4
    const fromUrl = new URLSearchParams(location.search).get('target');
    if (fromUrl) { setTarget(fromUrl); setChoices([{ id: fromUrl, label: '' }]); }
    if (!place) { if (!fromUrl) setChoices([]); return; }
    fetch(`/api/goals/${encodeURIComponent(goal)}/targets?state=${place.state}&district=${place.district}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { targets?: TargetCard[] };
        const list = (body.targets ?? []).map((t): Choice => ({ id: scope === 'state' ? place.state : t.bioguide_id ?? '', label: `${t.role} ${t.name}` })).filter((c) => c.id);
        setChoices(list);
        if (fromUrl) { const hit = list.find((c) => c.id === fromUrl); if (hit) return; }
        if (!fromUrl && list[0]) setTarget(list[0].id);
      })
      .catch(() => { if (!fromUrl) setChoices([]); });
  }, [goal, scope]);

  const valid = !!target && fields.every((f) => {
    const v = (values[f.name] ?? '').trim();
    return (!f.required || v.length > 0) && v.length <= f.max;
  });

  async function generate() {
    setError(null); setText(''); setReceipt(null); setReported(false); setOutcome(''); setNote(''); setFunnelDone(false);
    setPhase({ kind: 'generating', stage: 'Drafting…' });
    // leader-call-scripts §2: a fresh seed per request, so "Another version" composes a different standard script.
    const variant = Math.floor(Math.random() * 2 ** 31);
    const fieldValues = Object.fromEntries(fields.map((f) => [f.name, (values[f.name] ?? '').trim()]).filter(([, v]) => v));
    const send = async (turnstile: string | undefined) =>
      fetch('/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, target, fields: fieldValues, device: deviceId(), turnstile, variant }) });
    try {
      let res = await send(await ts.nextToken());
      if (res.status === 403) {
        // The token can be spent or expired between the widget issuing it and the submit: one retry with a fresh one.
        const err = (await res.clone().json().catch(() => ({}))) as { error?: string };
        if (err.error === 'turnstile') { ts.reset(); res = await send(await ts.nextToken()); }
      }
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({ message: 'The server sent something we could not read.' }))) as { message?: string };
        throw new Error(err.message ?? `Request failed (${res.status}).`);
      }
      let buf = '';
      let final: GenerateDone | null = null;
      let refused: string | null = null;
      await readSse(res.body, (event, data) => {
        if (event === 'status') setPhase({ kind: 'generating', stage: data.stage === 'redrafting' ? 'Redrafting…' : data.stage === 'standard' ? 'Building the standard script…' : 'Drafting…' });
        else if (event === 'delta') { buf += String(data.text ?? ''); setText(buf); }
        else if (event === 'reset') { buf = ''; setText(''); }
        else if (event === 'done') final = data as unknown as GenerateDone;
        else if (event === 'error') refused = String(data.message ?? 'Could not draft this one.');
      });
      if (final) { setText((final as GenerateDone).body); setPhase({ kind: 'output', doc: final }); }
      else setPhase({ kind: 'refused', message: refused ?? 'The draft ended early. Try again.' });
    } catch (e) {
      setError((e as Error).message);
      setPhase({ kind: 'form' });
    } finally {
      ts.reset(); // the token rode on this request; the widget issues the next one
    }
  }

  async function didIt() {
    const res = await fetch('/api/receipt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal, action, target, state: place?.state, district: place?.district, device: deviceId() }) });
    const data = (await res.json().catch(() => ({}))) as { id?: number; message?: string };
    if (!res.ok || !data.id) { setError(data.message ?? 'Could not record that.'); return; }
    logReceipt({ goal, action, target }); // call-follow-through §3
    setReceipt(data.id);
  }

  async function share() {
    const url = `${location.origin}/goals/${goal}`;
    const payload = { title: 'Cut the Ties', text: 'I just made my call. Yours takes two minutes:', url };
    if (navigator.share) { try { await navigator.share(payload); } catch { /* dismissed */ } }
    else { await navigator.clipboard?.writeText(url); setCopied(true); }
  }

  async function report() {
    const res = await fetch('/api/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal, target, outcome, note: note.trim() || undefined, device: deviceId() }) });
    if (res.ok) setReported(true); else setError('Could not send that.');
  }

  function download(doc: GenerateDone) {
    const blob = new Blob([doc.subject ? `${doc.subject}\n\n${doc.body}` : doc.body], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${action}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (choices === null) return <p class="label-code" aria-busy="true">Loading your target…</p>;
  if (choices.length === 0) return (
    <div class="card p-4">
      <p class="font-semibold">Enter your address so we know who you are writing to.</p>
      <a href="/" class="btn btn-primary mt-4 self-start">Enter your address →</a>
    </div>
  );

  const kind = type === 'call' ? 'call script' : type === 'letter' ? 'letter' : 'comment';
  const generating = phase.kind === 'generating';
  const whyField = fields.find((f) => f.multiline);
  /** Reasons panel: append a starting point to the "why" field and put the cursor there, so the caller rewrites it. */
  function addReason(point: string) {
    if (!whyField) return;
    setValues((cur) => { const v = (cur[whyField.name] ?? '').trim(); return { ...cur, [whyField.name]: v ? `${v} ${point}` : point }; });
    document.getElementById(whyField.name)?.focus();
  }

  return (
    <div class="flex flex-col gap-6">
      {phase.kind === 'form' && (
        <div class="lg:grid lg:grid-cols-[minmax(0,42rem)_minmax(16rem,22rem)] lg:gap-8 lg:items-start">
        <div class="flex flex-col gap-6">
        {promised && <p class="label-code" data-promise><span class="chip bg-acid text-ink mr-2">✓</span>You said you'd call by {fmtDue(promised)}.</p>}
        <form class="card p-4 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (valid) void generate(); }}>
          {choices.length > 1 && (
            <fieldset class="flex flex-col gap-2">
              <legend class="label-code mb-1">Who you are writing to</legend>
              {choices.map((c) => (
                <label class="flex items-center gap-2 text-sm">
                  <input type="radio" name="target" value={c.id} checked={target === c.id} onChange={() => setTarget(c.id)} /> {c.label || c.id}
                </label>
              ))}
            </fieldset>
          )}
          {choices.length === 1 && choices[0].label && <p class="label-code">To {choices[0].label}</p>}
          {fields.map((f) => {
            const v = values[f.name] ?? '';
            const over = v.length > f.max;
            const common = { id: f.name, name: f.name, required: f.required, maxLength: f.max, class: 'input-field w-full text-base', value: v, onInput: (e: Event) => setValues({ ...values, [f.name]: (e.target as HTMLInputElement).value }) };
            return (
              <div>
                <label class="label-code block mb-1" for={f.name}>{f.label}{f.required || /optional/i.test(f.label) ? '' : ' (optional)'}</label>
                {f.multiline ? <textarea rows={3} {...common} /> : <input type="text" {...common} />}
                <p class={`label-ticker mt-1 ${over ? 'text-crimson' : 'text-ink/60'}`}>{f.hint ? `${f.hint} ` : ''}{v.length}/{f.max}</p>
              </div>
            );
          })}
          <button type="submit" class="btn btn-primary self-start" disabled={!valid}>Write my {kind} →</button>
          <p class="text-xs text-ink/70">Your lines are used as material for one {kind}, checked by code, and not stored. {fmt.min_words}–{fmt.max_words} words.</p>
        </form>
        </div>
        {whyField && reasons && reasons.length > 0 && (
          <aside class="card p-4 mt-6 lg:mt-0 text-sm flex flex-col gap-4" aria-labelledby="reasons-heading" data-reasons>
            <div>
              <h2 id="reasons-heading" class="font-syne font-extrabold text-lg leading-tight">Not sure what to say?</h2>
              <p class="text-ink/70 mt-1">Reasons people give, from a few angles. Tap one to drop it into your lines, then change it so it sounds like you.</p>
            </div>
            {reasons.map((r) => (
              <div>
                <p class="label-code">{r.angle}</p>
                <ul class="mt-1 flex flex-col gap-1.5">
                  {r.points.map((p) => (
                    <li>
                      <button type="button" class="text-left underline decoration-dotted hover:decoration-solid" onClick={() => addReason(p)}>{p}</button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p class="text-xs text-ink/70">Your own words carry more weight than ours.</p>
          </aside>
        )}
        </div>
      )}
      {/* Outside the form so the widget survives into the output phase: Regenerate needs a fresh token too. */}
      <div ref={ts.mount} class="empty:hidden" />
      {error && <p role="alert" class="card border-crimson bg-newsprint text-ink px-4 py-3 text-sm font-semibold max-w-2xl">{error}</p>}

      {(generating || phase.kind === 'output') && (
        <div class="card p-4 max-w-2xl">
          <p class="label-code" aria-live="polite">{generating ? phase.stage : phase.kind === 'output' && phase.doc.standard ? `Standard script — not personalised today · ${phase.doc.words} words` : `Your ${kind} · ${phase.kind === 'output' ? phase.doc.words : 0} words`}</p>
          {phase.kind === 'output' && phase.doc.standard && <p class="text-xs text-ink/70 mt-1">{STANDARD_WHY[phase.doc.reason ?? 'capacity'] ?? STANDARD_WHY.capacity}</p>}
          {phase.kind === 'output' && phase.doc.subject && <p class="font-syne font-extrabold mt-3">{phase.doc.subject}</p>}
          <pre class="whitespace-pre-wrap font-sans text-base leading-relaxed mt-3 min-h-[8rem]">{text}{generating && <span class="animate-pulse">▍</span>}</pre>
        </div>
      )}

      {phase.kind === 'refused' && (
        <div class="card p-4 max-w-2xl" role="alert">
          <p class="font-semibold">{phase.message}</p>
          <button type="button" class="btn btn-ghost mt-4" onClick={() => setPhase({ kind: 'form' })}>Edit my lines</button>
        </div>
      )}

      {phase.kind === 'output' && (
        <div class="flex flex-col gap-4 max-w-2xl">
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn btn-ghost" onClick={() => { void navigator.clipboard?.writeText(text); setCopied(true); }}>{copied ? 'Copied' : 'Copy'}</button>
            <button type="button" class="btn btn-ghost" onClick={() => download(phase.doc)}>Download .txt</button>
            <button type="button" class="btn btn-ghost" onClick={() => void generate()}>{phase.doc.standard && phase.doc.variant ? 'Another version' : 'Regenerate'}</button>
          </div>
          <div class="flex flex-wrap gap-2 items-center">
            {phoneOrder(phase.doc.target.phones).map(({ phone, district }) => (
              <span class="flex items-center gap-2">
                <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} class="btn btn-primary" data-office={district ? 'district' : 'dc'}>Call {phase.doc.target.role} {phase.doc.target.name} · {phone}</a>
                <OpenChip state={district ? place?.state : undefined} />
              </span>
            ))}
            {phoneOrder(phase.doc.target.phones)[0]?.district && <p class="text-sm w-full" data-dc-closed>DC office closed; district office answers in office hours.</p>}
            {type !== 'call' && phase.doc.target.contact_form_url && (
              <a href={phase.doc.target.contact_form_url} class="btn btn-primary" rel="noopener" target="_blank">Open the contact form ↗</a>
            )}
          </div>
          <div class="card p-4 flex flex-col gap-3">
            {receipt === null ? (
              <button type="button" class="btn btn-primary self-start" onClick={() => void didIt()}>I did it</button>
            ) : (
              <>
                <p class="font-semibold"><span class="chip bg-acid text-ink mr-2">✓</span>Counted. No name, no address: just this goal, this office, today.</p>
                <Funnel goal={goal} action={action} target={target} who={phase.doc.target.name.trim().split(/\s+/).pop()} title={title ?? goal} type={type} decision={decision ?? null} place={place} onFinished={() => setFunnelDone(true)} />
                {funnelDone && (
                  <>
                    {extras && <extras.NextOffice goal={goal} action={action} choices={choices} />}
                    {extras && place && <extras.Counts goal={goal} state={place.state} district={scope === 'state' ? null : place.district} echo />}
                    <div class="flex flex-wrap gap-2">
                      <button type="button" class="btn btn-ghost" onClick={() => void share()}>{copied ? 'Link copied' : 'Share'}</button>
                      <a href="/results" class="btn btn-ghost">Your other action</a>
                    </div>
                  </>
                )}
                {!reported ? (
                  <form class="flex flex-col gap-2 border-t-2 border-ink pt-3" onSubmit={(e) => { e.preventDefault(); if (outcome) void report(); }}>
                    <p class="label-code">What did the office say? (optional)</p>
                    <div class="flex flex-wrap gap-2">
                      {OUTCOMES.map(([v, l]) => (
                        <label class={`chip cursor-pointer ${outcome === v ? 'bg-ink text-paper' : 'bg-newsprint'}`}>
                          <input type="radio" name="outcome" value={v} class="sr-only" checked={outcome === v} onChange={() => setOutcome(v)} />{l}
                        </label>
                      ))}
                    </div>
                    {outcome === 'other' && <input type="text" maxLength={140} class="input-field text-sm" placeholder="In a few words (140 max)" value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} />}
                    <button type="submit" class="btn btn-ghost self-start" disabled={!outcome}>Send</button>
                  </form>
                ) : <p class="text-sm">Thanks. Reports go to the maintainer; they never change a listed position on their own.</p>}
                {outcome === 'no_answer' && extras && <extras.Retry goal={goal} action={action} target={target} who={`${phase.doc.target.role} ${phase.doc.target.name}`} title={title ?? goal} />}
                <div class="border-t-2 border-ink pt-3">
                  <label class="label-code block mb-1" for="reflection">One line for yourself: how did it feel? (stays on this page)</label>
                  <input id="reflection" type="text" class="input-field w-full text-sm" />
                </div>
                <p class="text-sm">This site is one person's project. <a href="/donate" class="underline font-semibold">Chip in for the hosting and the drafts →</a></p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
