import { useEffect, useRef, useState } from 'preact/hooks';
import { route } from '../lib/api';
import { STATES, cacheRoute, loadPlace, savePlace } from '../lib/store';
import { hasOpenItems } from '../lib/commitments';
import { ATTRIBUTION, stepHighlight, suggest, suggestLoop } from '../lib/suggest';
import type { Loop, Provider, Suggester, Suggestion, Timings } from '../lib/suggest';
import { useTurnstile } from '../lib/turnstile';

/** §4 unresolved copy when a provider is set (the Worker's message serves the `none` build). */
export const UNRESOLVED_WITH_SUGGESTIONS = 'We could not place that address. Pick one of the suggestions, check the address, or pick your state and district.';

interface Props {
  siteKey?: string;
  /** address-autocomplete §1: `none` (default) renders the plain field; a provider turns it into a combobox. */
  provider?: Provider;
  /** Test seam: replaces the provider call. */
  suggester?: Suggester;
  /** Test seam: debounce and timeout in ms. */
  timings?: Timings;
}

/** §1.1–§1.5: the address field, refusals, retry + manual picker, return-visit skip. */
export default function AddressForm({ siteKey, provider = 'none', suggester, timings }: Props) {
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [state, setState] = useState('');
  const [district, setDistrict] = useState('');
  const ts = useTurnstile(siteKey);
  const [hasGeo, setHasGeo] = useState(false);
  const addressRef = useRef<HTMLInputElement>(null);
  const suggesting = provider !== 'none';
  const [options, setOptions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const loop = useRef<Loop | null>(null);

  useEffect(() => {
    // §1.6 return visit: skip the field, unless an open commitment or captain list puts "Your week" on this page (commitment-funnel §2.1).
    if (loadPlace() && !hasOpenItems()) location.replace('/results');
  }, []);

  // on-device-districts §2.1: the location control exists only where the browser can give a position.
  useEffect(() => { setHasGeo(typeof navigator !== 'undefined' && 'geolocation' in navigator); }, []);

  // address-autocomplete §1: one debounced, abortable request per edit; a failure or timeout just closes the list.
  useEffect(() => {
    if (!suggesting) return;
    const ask: Suggester = suggester ?? ((q, signal) => suggest(q, signal, provider));
    const l = suggestLoop(ask, (s) => { setOptions(s); setActive(-1); setOpen(s.length > 0); }, timings);
    loop.current = l;
    return () => { l.cancel(); loop.current = null; };
  }, [suggesting, provider, suggester]);

  function closeList() { setOpen(false); setActive(-1); }

  /**
   * address-autocomplete §3 pick: the label fills the field, the list closes and the route starts on the
   * device: only the suggestion's state file is loaded, the point is placed in it, and the Worker gets
   * `{state, district, by_suggestion}`. A point in no district falls through to the Census path (§4)
   * with the label as the address. The suggestion and its coordinates live only in this closure.
   */
  function pick(s: Suggestion) {
    loop.current?.cancel();
    setAddress(s.label); closeList(); addressRef.current?.focus();
    void resolvePick(s);
  }
  async function resolvePick(s: Suggestion) {
    setBusy(true); setError(null);
    const { resolveInState } = await import('../lib/pip');
    const place = await resolveInState(s.state, s.lon, s.lat).catch(() => null);
    if (place) await go({ state: place.state, district: place.district, by_suggestion: true });
    else await go({ address: s.label });
  }

  function onKey(e: KeyboardEvent) {
    if (!suggesting) return;
    if (e.key === 'Escape') { if (open) { e.preventDefault(); closeList(); } return; }
    if (e.key === 'Enter') { if (open && active >= 0 && options[active]) { e.preventDefault(); pick(options[active]); } return; }
    const next = stepHighlight(e.key, active, options.length);
    if (next === null) return;
    e.preventDefault();
    if (!open) setOpen(true);
    setActive(next);
  }

  async function go(body: Parameters<typeof route>[0]) {
    setBusy(true); setError(null);
    try {
      const turnstile = await ts.nextToken();
      const r = await route({ ...body, turnstile });
      savePlace({ state: r.state, district: r.district });
      cacheRoute(r);
      location.assign('/results');
    } catch (e) {
      const err = e as { error?: string; message: string };
      // A Turnstile token is consumed by the request it rode on; without a reset the retry fails as "Bot check failed".
      ts.reset();
      // §4: with suggestions on, the unresolved message points at the list first; `none` keeps the Worker's text.
      setError(err.error === 'unresolved' && suggesting ? UNRESOLVED_WITH_SUGGESTIONS : err.message);
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
        {suggesting ? (
          <div class="relative flex-1">
            <input id="address" name="address" type="text" autocomplete="off" required class="input-field text-base" ref={addressRef}
              role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="address-suggestions" aria-haspopup="listbox"
              aria-activedescendant={open && active >= 0 ? `address-option-${active}` : undefined}
              placeholder="Street address, city, state" value={address}
              onInput={(e) => { const v = (e.target as HTMLInputElement).value; setAddress(v); loop.current?.input(v); }}
              onKeyDown={onKey} onBlur={closeList} />
            {open && (
              <div class="absolute left-0 right-0 top-full z-20 mt-1 card text-ink text-left">
                <ul role="listbox" id="address-suggestions" aria-label="Address suggestions">
                  {options.map((s, i) => (
                    <li role="option" id={`address-option-${i}`} aria-selected={i === active} class={`cursor-pointer px-4 py-2 text-base ${i === active ? 'bg-acid' : ''}`}
                      onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)}>{s.label}</li>
                  ))}
                </ul>
                <p class="border-t border-rule px-4 py-1 text-xs"><a href={ATTRIBUTION[provider].href} target="_blank" rel="noopener">{ATTRIBUTION[provider].text}</a></p>
              </div>
            )}
            <p class="sr-only" aria-live="polite">{open ? `${options.length} ${options.length === 1 ? 'suggestion' : 'suggestions'} available. Use the arrow keys, then Enter.` : ''}</p>
          </div>
        ) : (
          <input id="address" name="address" type="text" autocomplete="street-address" required class="input-field flex-1 text-base" ref={addressRef}
            placeholder="Street address, city, state" value={address} onInput={(e) => setAddress((e.target as HTMLInputElement).value)} />
        )}
        <button type="submit" class="btn btn-primary whitespace-nowrap" disabled={busy}>{busy ? 'Finding…' : 'Find my actions →'}</button>
      </form>
      <div ref={ts.mount} class="mt-2" />
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
