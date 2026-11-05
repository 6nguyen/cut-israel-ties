import { useEffect, useRef, useState } from 'preact/hooks';
import { route } from '../lib/api';
import { STATES, cacheRoute, loadPlace, savePlace } from '../lib/store';

declare global { interface Window { turnstile?: { render: (el: HTMLElement, o: { sitekey: string; callback: (t: string) => void }) => void } } }

interface Props { siteKey?: string }

/** §1.1–§1.5: the address field, refusals, retry + manual picker, return-visit skip. */
export default function AddressForm({ siteKey }: Props) {
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [state, setState] = useState('');
  const [district, setDistrict] = useState('');
  const token = useRef<string | undefined>(undefined);
  const widget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // §1.5 return visit: skip the field.
    if (loadPlace()) { location.replace('/results'); return; }
    if (siteKey && widget.current) {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => widget.current && window.turnstile?.render(widget.current, { sitekey: siteKey, callback: (t) => { token.current = t; } });
      document.head.appendChild(s);
    }
  }, [siteKey]);

  async function go(body: Parameters<typeof route>[0]) {
    setBusy(true); setError(null);
    try {
      const r = await route({ ...body, turnstile: token.current });
      savePlace({ state: r.state, district: r.district });
      cacheRoute(r);
      location.assign('/results');
    } catch (e) {
      const err = e as { error?: string; message: string };
      setError(err.message);
      if (err.error === 'unresolved' || err.error === 'upstream' || err.error === 'no_delegation') setPicker(true);
      setBusy(false);
    }
  }

  return (
    <div class="w-full">
      <form class="flex flex-col sm:flex-row gap-3" onSubmit={(e) => { e.preventDefault(); void go({ address }); }}>
        <label class="sr-only" for="address">Street address</label>
        <input id="address" name="address" type="text" autocomplete="street-address" required class="input-field flex-1 text-base"
          placeholder="Street address, city, state" value={address} onInput={(e) => setAddress((e.target as HTMLInputElement).value)} />
        <button type="submit" class="btn btn-primary whitespace-nowrap" disabled={busy}>{busy ? 'Finding…' : 'Find my actions →'}</button>
      </form>
      <div ref={widget} class="mt-2" />
      <p class="mt-3 text-sm text-newsprint-muted"><span class="chip bg-acid text-ink mr-2">✓</span>Full street address needed: cities are split between districts. Nothing is stored.</p>
      {error && <p role="alert" class="mt-4 card border-crimson bg-newsprint text-ink px-4 py-3 text-sm font-semibold">{error}</p>}
      {picker && (
        <form class="mt-4 card bg-newsprint text-ink p-4 flex flex-col sm:flex-row gap-3 sm:items-end" onSubmit={(e) => { e.preventDefault(); void go({ state, district: Number(district) }); }}>
          <div class="flex-1">
            <label class="label-code block mb-1" for="state">State</label>
            <select id="state" required class="input-field" value={state} onChange={(e) => setState((e.target as HTMLSelectElement).value)}>
              <option value="">Pick</option>
              {STATES.map((s) => <option value={s}>{s}</option>)}
            </select>
          </div>
          <div class="flex-1">
            <label class="label-code block mb-1" for="district">District (0 = at large)</label>
            <input id="district" type="number" min="0" max="53" required class="input-field" value={district} onInput={(e) => setDistrict((e.target as HTMLInputElement).value)} />
          </div>
          <button type="submit" class="btn btn-ghost" disabled={busy}>Use this district</button>
        </form>
      )}
    </div>
  );
}
