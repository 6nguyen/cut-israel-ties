// Vitest setup: a plain in-memory Web Storage. Node ≥22 ships an experimental `localStorage`
// global without methods, which shadows the DOM environment's; tests need the real contract.
class MemStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
}
for (const name of ['localStorage', 'sessionStorage'] as const) {
  const store = new MemStorage();
  for (const target of [globalThis, (globalThis as { window?: object }).window].filter(Boolean) as object[]) {
    Object.defineProperty(target, name, { value: store, configurable: true, writable: true });
  }
}
