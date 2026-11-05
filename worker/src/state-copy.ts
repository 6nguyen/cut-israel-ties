// state-holdings-sweep §3: the state goal's copy, built by code from the states.csv row. Shared by
// the Worker (route cards, fact block) and the static pages, so every amount shown is the CSV cell.
import type { StateRow } from './types';

/** Where a visitor can help source a state that still reads "not yet sourced". */
export const RESEARCH_URL = 'https://github.com/6nguyen/cut-the-ties/blob/main/docs/research/state-israel-bonds.md';
export const DEFAULT_DECIDER = 'your state treasurer';

/** `{decider}` in an action's ask → the row's deciding body, else "your state treasurer". */
export function fillAsk(ask: string, row: StateRow | null | undefined): string {
  return ask.replace(/\{decider\}/g, row?.decider || DEFAULT_DECIDER);
}

/** Whole dollars with thousands separators; no rounding, no locale. */
export function moneyUsd(n: number): string {
  return `$${String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** The one-line holdings statement for a state target: the three `holdings_status` renderings. */
export function holdingsLine(row: StateRow | null | undefined): string {
  if (row?.holdings_status === 'held' && row.israel_bonds_usd !== null) return `Israel Bonds: holds ${moneyUsd(row.israel_bonds_usd)} (as of ${row.holdings_date ?? 'date not sourced'})`;
  if (row?.holdings_status === 'none') return `Israel Bonds: holds none (as of ${row.holdings_date ?? 'date not sourced'})`;
  return 'Israel Bonds: not yet sourced';
}
