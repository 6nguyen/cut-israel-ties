import { useEffect, useRef, useState } from 'preact/hooks';
import type { DocFormat, FormField, GenerateDone } from '@worker/generate';
import type { TargetCard } from '../lib/api';
import { loadPlace } from '../lib/store';

interface Props {
  goal: string;
  action: string;
  type: 'call' | 'letter' | 'public_comment';
  scope: 'house' | 'senate' | 'both' | 'state';
  fields: FormField[];
  fmt: DocFormat;
  siteKey?: string;
}

interface Choice { id: string; label: string }
type Phase = { kind: 'form' } | { kind: 'generating'; stage: string } | { kind: 'output'; doc: GenerateDone } | { kind: 'refused'; message: string };
const OUTCOMES: [string, string][] = [['will_support', 'Will support'], ['undecided', 'Undecided'], ['opposed', 'Opposed'], ['no_answer', 'No answer'], ['other', 'Other']];
const DEVICE_KEY = 'cut-ties:device';

/** A random per-browser id; the Worker stores only its SHA-256. */
function deviceId(): string {
  try {
    const have = localStorage.getItem(DEVICE_KEY);
    if (have && have.length >= 16) return have;
  } catch { /* private mode */ }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const id = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  try { localStorage.setItem(DEVICE_KEY, id); } catch { /* ignore */ }
  return id;
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
export default function ActForm({ goal, action, type, scope, fields, fmt, siteKey }: Props) {
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
  const token = useRef<string | undefined>(undefined);
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const place = loadPlace();

  useEffect(() => {
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

  useEffect(() => {
    if (!siteKey || !widget.current) return;
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => {
      const ts = (window as unknown as { turnstile?: { render: (el: HTMLElement, o: { sitekey: string; callback: (t: string) => void }) => string } }).turnstile;
      if (widget.current && ts) widgetId.current = ts.render(widget.current, { sitekey: siteKey, callback: (t) => { token.current = t; } });
    };
    document.head.appendChild(s);
  }, [siteKey]);

  const valid = !!target && fields.every((f) => {
    const v = (values[f.name] ?? '').trim();
    return (!f.required || v.length > 0) && v.length <= f.max;
  });

  async function generate() {
    setError(null); setText(''); setReceipt(null); setReported(false); setOutcome(''); setNote('');
    setPhase({ kind: 'generating', stage: 'Drafting…' });
    const body = { action, target, fields: Object.fromEntries(fields.map((f) => [f.name, (values[f.name] ?? '').trim()]).filter(([, v]) => v)), device: deviceId(), turnstile: token.current };
    try {
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({ message: 'The server sent something we could not read.' }))) as { message?: string };
        throw new Error(err.message ?? `Request failed (${res.status}).`);
      }
      let buf = '';
      let final: GenerateDone | null = null;
      let refused: string | null = null;
      await readSse(res.body, (event, data) => {
        if (event === 'status') setPhase({ kind: 'generating', stage: data.stage === 'redrafting' ? 'Redrafting…' : 'Drafting…' });
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
      const ts = (window as unknown as { turnstile?: { reset?: (id?: string) => void } }).turnstile;
      ts?.reset?.(widgetId.current);
      token.current = undefined;
    }
  }

  async function didIt() {
    const res = await fetch('/api/receipt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal, action, target, state: place?.state, district: place?.district, device: deviceId() }) });
    const data = (await res.json().catch(() => ({}))) as { id?: number; message?: string };
    if (!res.ok || !data.id) { setError(data.message ?? 'Could not record that.'); return; }
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

  return (
    <div class="flex flex-col gap-6">
      {phase.kind === 'form' && (
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
                <label class="label-code block mb-1" for={f.name}>{f.label}{f.required ? '' : ' (optional)'}</label>
                {f.multiline ? <textarea rows={3} {...common} /> : <input type="text" {...common} />}
                <p class={`label-ticker mt-1 ${over ? 'text-crimson' : 'text-ink/60'}`}>{f.hint ? `${f.hint} ` : ''}{v.length}/{f.max}</p>
              </div>
            );
          })}
          <div ref={widget} />
          <button type="submit" class="btn btn-primary self-start" disabled={!valid}>Write my {kind} →</button>
          <p class="text-xs text-ink/70">Your lines are used as material for one {kind}, checked by code, and not stored. {fmt.min_words}–{fmt.max_words} words.</p>
        </form>
      )}
      {error && <p role="alert" class="card border-crimson bg-newsprint text-ink px-4 py-3 text-sm font-semibold">{error}</p>}

      {(generating || phase.kind === 'output') && (
        <div class="card p-4">
          <p class="label-code" aria-live="polite">{generating ? phase.stage : `Your ${kind} · ${phase.kind === 'output' ? phase.doc.words : 0} words`}</p>
          {phase.kind === 'output' && phase.doc.subject && <p class="font-syne font-extrabold mt-3">{phase.doc.subject}</p>}
          <pre class="whitespace-pre-wrap font-sans text-base leading-relaxed mt-3 min-h-[8rem]">{text}{generating && <span class="animate-pulse">▍</span>}</pre>
        </div>
      )}

      {phase.kind === 'refused' && (
        <div class="card p-4" role="alert">
          <p class="font-semibold">{phase.message}</p>
          <button type="button" class="btn btn-ghost mt-4" onClick={() => setPhase({ kind: 'form' })}>Edit my lines</button>
        </div>
      )}

      {phase.kind === 'output' && (
        <div class="flex flex-col gap-4">
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn btn-ghost" onClick={() => { void navigator.clipboard?.writeText(text); setCopied(true); }}>{copied ? 'Copied' : 'Copy'}</button>
            <button type="button" class="btn btn-ghost" onClick={() => download(phase.doc)}>Download .txt</button>
            <button type="button" class="btn btn-ghost" onClick={() => void generate()}>Regenerate</button>
          </div>
          <div class="flex flex-wrap gap-2 items-center">
            {phase.doc.target.phones.map((p) => (
              <a href={`tel:${p.replace(/[^\d+]/g, '')}`} class="btn btn-primary">Call {phase.doc.target.role} {phase.doc.target.name} · {p}</a>
            ))}
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
                <div class="flex flex-wrap gap-2">
                  <button type="button" class="btn btn-ghost" onClick={() => void share()}>{copied ? 'Link copied' : 'Share'}</button>
                  <a href="/results" class="btn btn-ghost">Your other action</a>
                </div>
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
