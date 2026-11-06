import { useState } from 'preact/hooks';
import { deviceId } from '../lib/store';
import { useTurnstile } from '../lib/turnstile';
import { markListed } from '../lib/visits';

interface Props { member: string; name: string; city: string | null; siteKey?: string; onListed?: (id: number) => void }
const NOTE_MAX = 140;

/** office-visits §1.1: list a district-office visit. No phone, no email, no address: one link or handle, a window, 140 chars. */
export default function VisitForm({ member, name, city, siteKey, onListed }: Props) {
  const [town, setTown] = useState(city ?? '');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('11:00');
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const ts = useTurnstile(siteKey);

  const today = new Date(); const min = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const valid = town.trim().length > 0 && date >= min && start < end && contact.trim().length > 0 && note.length <= NOTE_MAX;

  async function submit(e: Event) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setError(null);
    const turnstile = await ts.nextToken();
    const res = await fetch('/api/visits', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ member, city: town.trim(), date, start, end, contact: contact.trim(), note: note.trim(), device: deviceId(), turnstile }) }).catch(() => null);
    setBusy(false);
    const body = (await res?.json().catch(() => ({}))) as { id?: number; message?: string } | undefined;
    if (!res || !res.ok || typeof body?.id !== 'number') {
      setError(body?.message ?? (res?.status === 503 ? 'Visit listings are paused for now.' : 'Could not list that. Try again.'));
      ts.reset(); // the token rode on that request
      return;
    }
    markListed(body.id);
    setDone(true);
    onListed?.(body.id);
  }

  if (done) return <p class="font-semibold" data-listed>Listed. It shows here once a maintainer has checked it, usually by the next morning. You can remove it any time from this device.</p>;
  return (
    <form class="flex flex-col gap-3" onSubmit={(e) => void submit(e)} data-visit-form>
      <p class="text-sm">A visit to <strong>{name}</strong>'s district office. Three constituents in the lobby beat thirty emails; the office address stays on the office's own site.</p>
      <label class="flex flex-col gap-1 text-sm">Office city
        <input class="input-field text-sm" value={town} readOnly={!!city} required maxLength={40} onInput={(e) => setTown((e.target as HTMLInputElement).value)} />
      </label>
      <div class="flex flex-wrap gap-3">
        <label class="flex flex-col gap-1 text-sm">Date<input type="date" class="input-field text-sm" min={min} value={date} required onInput={(e) => setDate((e.target as HTMLInputElement).value)} /></label>
        <label class="flex flex-col gap-1 text-sm">From<input type="time" class="input-field text-sm" value={start} required onInput={(e) => setStart((e.target as HTMLInputElement).value)} /></label>
        <label class="flex flex-col gap-1 text-sm">To<input type="time" class="input-field text-sm" value={end} required onInput={(e) => setEnd((e.target as HTMLInputElement).value)} /></label>
      </div>
      <label class="flex flex-col gap-1 text-sm">How people reach you (one link or @handle; never a phone or email)
        <input class="input-field text-sm" value={contact} required maxLength={200} placeholder="https://signal.group/… or @handle" inputMode="url" onInput={(e) => setContact((e.target as HTMLInputElement).value)} />
      </label>
      <label class="flex flex-col gap-1 text-sm">Note ({NOTE_MAX - note.length} left)
        <input class="input-field text-sm" value={note} maxLength={NOTE_MAX} placeholder="Meet by the flagpole; bring one question" onInput={(e) => setNote((e.target as HTMLInputElement).value)} />
      </label>
      <p class="text-xs text-ink/70">Shown to others only after review, and only as the city, the time and your note. Whoever says they'll come gets your link; nobody else does.</p>
      {siteKey && <div ref={ts.mount} />}
      {error && <p role="alert" class="text-sm text-crimson font-semibold">{error}</p>}
      <button type="submit" class="btn btn-primary self-start" disabled={!valid || busy}>{busy ? 'Listing…' : 'List this visit'}</button>
    </form>
  );
}
