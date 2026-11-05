// The only thing the browser keeps about the visitor: {state, district} (§1.2).
export interface Place { state: string; district: number }
const KEY = 'cut-ties:place';

export function loadPlace(): Place | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Place;
    return /^[A-Z]{2}$/.test(p.state) && Number.isInteger(p.district) ? p : null;
  } catch { return null; }
}
export function savePlace(p: Place): void { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ } }
export function clearPlace(): void { try { localStorage.removeItem(KEY); sessionStorage.removeItem(ROUTE_KEY); } catch { /* ignore */ } }

// The last route response, so /results does not call the API twice after the form.
const ROUTE_KEY = 'cut-ties:route';
export function cacheRoute(r: unknown): void { try { sessionStorage.setItem(ROUTE_KEY, JSON.stringify(r)); } catch { /* ignore */ } }
export function takeRoute<T>(): T | null {
  try { const raw = sessionStorage.getItem(ROUTE_KEY); sessionStorage.removeItem(ROUTE_KEY); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}

export const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
