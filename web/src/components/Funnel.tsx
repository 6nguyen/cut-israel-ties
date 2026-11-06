import { useState } from 'preact/hooks';
import { districtLabel } from '../lib/api';
import type { Place } from '../lib/store';
import { CHANNELS, NAME_MAX, addCommitment, atDue, copyLine, defaultDue, fmtDue, maxDue, retryDue, retryFor, saveCaptain, validName, ymd, type Channel, type Person } from '../lib/commitments';
import { buildIcs, downloadIcs } from '../lib/ics';

interface Props {
  goal: string;
  action: string;
  target: string;
  /** The official's surname, for the §3.1 receipt line. */
  who?: string;
  title: string;
  type: 'call' | 'letter' | 'public_comment';
  decision: string | null;
  place: Place | null;
  /** Both steps answered or skipped: the parent may now offer "Share". */
  onFinished: () => void;
}

const BLANK = (): Person => ({ name: '', channel: 'text', done: false });

/** The commitment reminder: one 15-minute event at the due time, the goal deep link, no name. */
function reminderIcs(goal: string, title: string, due: string, url: string, retry = false): string {
  return buildIcs({ uid: `${goal}-${retry ? 'retry-' : ''}${Date.parse(due)}@cut-the-ties`, start: new Date(due), title: `${retry ? 'Try again' : 'Call about'}: ${title}`, url, description: `Your words are ready at ${url}` });
}

interface RetryProps { goal: string; action: string; target: string; who: string; title: string }
/** call-follow-through §1: under `no_answer`, the voicemail line and one "Try again" that stores a `retry` commitment due at the DC office's next open slot (≥60 min ahead). Nothing posts. */
export function Retry({ goal, action, target, who, title }: RetryProps) {
  const [due, setDue] = useState<string | null>(() => retryFor(goal, target)?.due ?? null);
  const url = `${location.origin}/goals/${goal}/act/${action}?target=${target}`;
  function tryAgain() {
    const iso = retryDue(new Date()).toISOString();
    addCommitment({ goal, action, target, due: iso, kind: 'retry', who });
    setDue(iso);
  }
  return (
    <div class="flex flex-col gap-2" data-retry>
      <p class="text-sm">Voicemail counts. Offices tally messages daily; say your street address so yours is logged.</p>
      {due ? (
        <div class="flex flex-wrap gap-2 items-center">
          <p class="text-sm font-semibold" data-retry-due>Try {who} again by {fmtDue(due)}. It's on your week.</p>
          <button type="button" class="btn btn-ghost" onClick={() => downloadIcs(`retry-${goal}`, reminderIcs(goal, title, due, url, true))}>Add reminder (.ics)</button>
        </div>
      ) : <button type="button" class="btn btn-ghost self-start" onClick={tryAgain}>Try again</button>}
    </div>
  );
}

/** commitment-funnel §1: one private commitment, then the captain list of three, before any share affordance. */
export default function Funnel({ goal, action, target, who, title, type, decision, place, onFinished }: Props) {
  const now = new Date();
  const [step, setStep] = useState<'commit' | 'captains' | 'done'>('commit');
  const [date, setDate] = useState(ymd(defaultDue(now, decision)));
  const [due, setDue] = useState<string>(defaultDue(now, decision).toISOString());
  const [people, setPeople] = useState<Person[]>([BLANK(), BLANK(), BLANK()]);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = `${location.origin}/goals/${goal}`;
  const maxDay = ymd(maxDue(now, decision, type === 'call'));
  const minDay = ymd(now);

  function finish() { setStep('done'); onFinished(); }
  function commit() {
    const d = atDue(date);
    const iso = (Number.isNaN(d.getTime()) ? defaultDue(now, decision) : d).toISOString();
    addCommitment({ goal, action, target, due: iso });
    setDue(iso);
    setStep('captains');
  }
  const problems = people.map((p) => (p.name && !validName(p.name) ? (/[\d@]/.test(p.name) ? 'First name only: no numbers or @.' : 'Letters and spaces only, 20 max.') : null));
  const allValid = people.every((p) => validName(p.name));
  function saveList() {
    if (!allValid) return;
    saveCaptain({ v: 1, goal, due, people: people.map((p) => ({ name: p.name.trim(), channel: p.channel, done: false })), who });
    setSaved(true);
    finish();
  }
  function reminder() { downloadIcs(`call-${goal}`, reminderIcs(goal, title, due, url)); }
  async function copy() { await navigator.clipboard?.writeText(copyLine(title, due, url)); setCopied(true); }

  if (step === 'commit') return (
    <div class="border-t-2 border-ink pt-3 flex flex-col gap-2" data-step="commit">
      <p class="font-semibold">{type === 'call' ? 'Will you call again before the vote?' : 'Will you call by '}{type !== 'call' && <span>{fmtDue(atDue(date).toISOString())}?</span>}</p>
      <div class="flex flex-wrap gap-2 items-center">
        <label class="label-code" for="commit-date">By</label>
        <input id="commit-date" type="date" class="input-field text-sm" value={date} min={minDay} max={maxDay} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
        <span class="text-sm">at 10 am</span>
        <button type="button" class="btn btn-primary" onClick={commit}>Yes, I'll call</button>
        <button type="button" class="btn btn-ghost" onClick={() => setStep('captains')}>Skip</button>
      </div>
      <p class="text-xs text-ink/70">Stays in this browser. Nothing is sent, nothing is shown to anyone.</p>
    </div>
  );

  if (step === 'captains') return (
    <form class="border-t-2 border-ink pt-3 flex flex-col gap-2" data-step="captains" onSubmit={(e) => { e.preventDefault(); saveList(); }}>
      <p class="font-semibold">Name three people{place ? ` in ${districtLabel(place.state, place.district)}` : ''} you'll ask to call by {fmtDue(due)}.</p>
      {people.map((p, i) => (
        <div class="flex flex-wrap gap-2 items-start">
          <div class="flex-1 min-w-[10rem]">
            <label class="sr-only" for={`captain-${i}`}>First name {i + 1}</label>
            <input id={`captain-${i}`} type="text" class="input-field w-full text-sm" placeholder="First name" maxLength={NAME_MAX} autocomplete="off" value={p.name}
              onInput={(e) => setPeople(people.map((x, j) => (j === i ? { ...x, name: (e.target as HTMLInputElement).value } : x)))} />
            {problems[i] && <p role="alert" class="label-ticker text-crimson mt-1">{problems[i]}</p>}
          </div>
          <select class="input-field text-sm" aria-label={`How you will reach person ${i + 1}`} value={p.channel} onChange={(e) => setPeople(people.map((x, j) => (j === i ? { ...x, channel: (e.target as HTMLSelectElement).value as Channel } : x)))}>
            {CHANNELS.map(([v, l]) => <option value={v}>{l}</option>)}
          </select>
        </div>
      ))}
      <div class="flex flex-wrap gap-2">
        <button type="submit" class="btn btn-primary" disabled={!allValid}>Save my three</button>
        <button type="button" class="btn btn-ghost" onClick={finish}>Skip</button>
      </div>
      <p class="text-xs text-ink/70">First names only, kept in this browser. No numbers, no emails; the names never leave your device.</p>
    </form>
  );

  return saved ? (
    <div class="border-t-2 border-ink pt-3 flex flex-col gap-2" data-step="saved">
      <p class="font-semibold">Saved. Your list is on the front page until you tick it off.</p>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn btn-ghost" onClick={reminder}>Add reminder (.ics)</button>
        <button type="button" class="btn btn-ghost" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy a message'}</button>
      </div>
      {/^[A-Z]\d{6}$/.test(target) && <p class="text-sm"><a href={`/m/${target}#organise`} class="underline" data-organise>Organise a district-office visit →</a></p>}
    </div>
  ) : null;
}
