import { useEffect, useRef, useState } from 'preact/hooks';
import { route } from '../lib/api';
import { STATES, cacheRoute, loadPlace, savePlace } from '../lib/store';
import { hasOpenItems } from '../lib/commitments';

declare global { interface Window { turnstile?: { render: (el: HTMLElement, o: { sitekey: string; callback: (t: string) => void }) => string; reset: (id?: string) => void } } }

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
  const widgetId = useRef<string | undefined>(undefined);
  const waiting = useRef<((t: string | undefined) => void)[]>([]);
  const widget = useRef<HTMLDivElement>(null);
  const [hasGeo, setHasGeo] = useState(false);
  const addressRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // §1.6 return visit: skip the field, unless an open commitment or captain list puts "Your week" on this page (commitment-funnel §2.1).
    if (loadPlace() && !hasOpenItems()) { location.replace('/results'); return; }
    if (siteKey && widget.current) {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => {
        if (!widget.current) return;
        widgetId.current = window.turnstile?.render(widget.current, { sitekey: siteKey, callback: (t) => { token.current = t; waiting.current.splice(0).forEach((w) => w(t)); } });
      };
      document.head.appendChild(s);
    }
  }, [siteKey]);

  // on-device-districts §2.1: the location control exists only where the browser can give a position.
  useEffect(() => { setHasGeo(typeof navigator !== 'undefined' && 'geolocation' in navigator); }, []);

  /** The current Turnstile token, or the next one when a reset is still running (≤4 s). Tokens are single-use. */
  function nextToken(): Promise<string | undefined> {
    if (!siteKey || token.current) return Promise.resolve(token.current);
    return new Promise((ok) => { waiting.current.push(ok); setTimeout(() => ok(undefined), 4000); });
  }

  async function go(body: Parameters<typeof route>[0]) {
    setBusy(true); setError(null);
    try {
      const turnstile = await nextToken();
      const r = await route({ ...body, turnstile });
      savePlace({ state: r.state, district: r.district });
      cacheRoute(r);
      location.assign('/results');
    } catch (e) {
      const err = e as { error?: string; message: string };
      // A Turnstile token is consumed by the request it rode on; without a reset the retry fails as "Bot check failed".
      token.current = undefined;
      window.turnstile?.reset(widgetId.current);
      setError(err.message);
      if (err.error === 'unresolved' || err.error === 'upstream' || err.error === 'no_delegation') setPicker(true);
      setBusy(false);
    }
  }

  /** on-device-districts §2: one-time position → lookup in the browser → the existing {state, district} route. Coordinates never leave this function. */
  async function locate() {
    setBusy(true); setError(null);
    let pos: GeolocationPosition;
    try {
      pos = await new Promise<GeolocationPosition>((ok, fail) => navigator.geolocation.getCurrentPosition(ok, fail, { maximumAge: 0, enableHighAccuracy: false, timeout: 20000 }));
    } catch {
      setError('No location shared. Enter an address instead.'); setPicker(true); setBusy(false); addressRef.current?.focus(); return;
    }
    const { resolvePoint } = await import('../lib/pip');
    const place = await resolvePoint(pos.coords.longitude, pos.coords.latitude).catch(() => null);
    if (!place) { setError("We couldn't place that point. Enter an address."); setPicker(true); setBusy(false); addressRef.current?.focus(); return; }
    await go({ state: place.state, district: place.district, by_location: true });
  }

  return (
    <div class="w-full">
      <form class="flex flex-col sm:flex-row gap-3" onSubmit={(e) => { e.preventDefault(); void go({ address }); }}>
        <label class="sr-only" for="address">Street address</label>
        <input id="address" name="address" type="text" autocomplete="street-address" required class="input-field flex-1 text-base" ref={addressRef}
          placeholder="Street address, city, state" value={address} onInput={(e) => setAddress((e.target as HTMLInputElement).value)} />
        <button type="submit" class="btn btn-primary whitespace-nowrap" disabled={busy}>{busy ? 'Finding…' : 'Find my actions →'}</button>
      </form>
      <div ref={widget} class="mt-2" />
      {hasGeo && <button type="button" class="btn btn-ghost mt-3 text-sm" disabled={busy} onClick={() => void locate()}>Use my location instead</button>}
      <p class="mt-3 text-sm text-newsprint-muted"><span class="chip bg-acid text-ink mr-2">✓</span>Full street address, or use your location: nothing is stored.</p>
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
