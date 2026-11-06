// generation-cost §1: dollars and the daily cap are arithmetic over stored rows; the acceptance figures by hand.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { CAP_FLOOR, DEFAULT_BLENDED_USD, SCREEN_ALLOWANCE_USD, blendedCost, costUsd, currentCap, dailyCap, daysLeftInMonth, documentCount, monthStart, parseBudget, usd } from '../src/cost';
import { loadRows } from '../src/load';
import { MemoryRepo, sumTokens } from '../src/repo';
import type { GenerationRow } from '../src/types';

const rows = loadRows(join(__dirname, '..', '..', 'data'), '2026-11-04T00:00:00Z');
const row = (over: Partial<GenerationRow>): GenerationRow => ({
  action_id: 2, target_id: 'C001110', shingles: new Uint32Array(0), created_at: '2026-11-03T12:00:00Z', device_hash: 'x', ip_hash: 'y',
  input_tokens: 900, output_tokens: 200, model: 'claude-opus-5-5', attempt: 1, check_fail: null, ...over,
});
/** 10 rows, two models, one redraft: 8 × opus (900/200) + 1 × opus redraft (1800/400) + 1 × sonnet (1000/300). */
const FIXTURE: GenerationRow[] = [
  ...Array.from({ length: 8 }, () => row({})),
  row({ input_tokens: 1800, output_tokens: 400, attempt: 2, check_fail: 'digit' }),
  row({ model: 'claude-sonnet-5-5', input_tokens: 1000, output_tokens: 300, action_id: 3 }),
];

describe('costUsd / blendedCost (generation-cost §1)', () => {
  it('matches the hand-computed figure to the cent and a standard row adds $0', () => {
    // opus: 9000 in × $4 + 2000 out × $20 per MTok = 0.036 + 0.040; sonnet: 1000 × $2 + 300 × $10 = 0.002 + 0.003; screen 10 × 0.0001.
    const expected = 0.036 + 0.04 + 0.002 + 0.003 + 10 * SCREEN_ALLOWANCE_USD;
    expect(costUsd(sumTokens(FIXTURE))).toBeCloseTo(expected, 6);
    expect(Math.round(costUsd(sumTokens(FIXTURE)) * 100) / 100).toBe(0.08);
    const withStandard = [...FIXTURE, row({ model: 'standard', input_tokens: 0, output_tokens: 0 }), row({ model: 'standard', input_tokens: 5000, output_tokens: 5000 })];
    expect(costUsd(sumTokens(withStandard))).toBeCloseTo(expected, 6);
    expect(documentCount(sumTokens(withStandard))).toBe(10);
  });

  it('sumTokens groups by model × action × first-failure class and counts redrafts', () => {
    const sums = sumTokens(FIXTURE);
    expect(sums).toHaveLength(3);
    expect(sums.find((s) => s.model === 'claude-opus-5-5' && s.check_fail === null)).toMatchObject({ action_id: 2, input: 7200, output: 1600, count: 8, redrafts: 0 });
    expect(sums.find((s) => s.check_fail === 'digit')).toMatchObject({ input: 1800, output: 400, count: 1, redrafts: 1 });
    expect(sums.find((s) => s.model === 'claude-sonnet-5-5')).toMatchObject({ action_id: 3, count: 1 });
  });

  it('blended cost is the default under 20 documents, else the trailing mean', () => {
    expect(blendedCost(sumTokens(FIXTURE))).toBe(DEFAULT_BLENDED_USD);
    const twenty = Array.from({ length: 20 }, () => row({}));
    expect(blendedCost(sumTokens(twenty))).toBeCloseTo((900 * 4 + 200 * 20) / 1e6 + SCREEN_ALLOWANCE_USD, 9);
    expect(blendedCost([])).toBe(DEFAULT_BLENDED_USD);
  });
});

describe('dailyCap (generation-cost §1 acceptance)', () => {
  it('Nov 1 empty → 20; $14 spent on the 28th → 20 (floor); $0 on the 15th at $0.01 blended → 93', () => {
    expect(daysLeftInMonth(new Date('2026-11-01T00:00:00Z'))).toBe(30);
    expect(dailyCap(0, 0.025, new Date('2026-11-01T00:00:00Z'), 15, 500)).toBe(20);
    expect(dailyCap(14, 0.025, new Date('2026-11-28T12:00:00Z'), 15, 500)).toBe(20);
    expect(dailyCap(0, 0.01, new Date('2026-11-15T12:00:00Z'), 15, 500)).toBe(93);
  });

  it('clamps to the ceiling, never below the floor while the budget is positive, and is 0 at budget 0', () => {
    expect(dailyCap(0, 0.001, new Date('2026-11-15T12:00:00Z'), 15, 500)).toBe(500);
    expect(dailyCap(0, 0.001, new Date('2026-11-15T12:00:00Z'), 15, 2)).toBe(CAP_FLOOR);
    expect(dailyCap(100, 0.025, new Date('2026-11-15T12:00:00Z'), 15, 500)).toBe(CAP_FLOOR);
    expect(dailyCap(0, 0, new Date('2026-11-15T12:00:00Z'), 15, 500)).toBe(dailyCap(0, DEFAULT_BLENDED_USD, new Date('2026-11-15T12:00:00Z'), 15, 500));
    expect(dailyCap(0, 0.025, new Date('2026-11-15T12:00:00Z'), 0, 500)).toBe(0);
    expect(dailyCap(0, 0.025, new Date('2026-11-15T12:00:00Z'), -3, 500)).toBe(0);
  });

  it('month arithmetic is UTC: Feb 2028 has 29 days, Dec 31 has one day left', () => {
    expect(daysLeftInMonth(new Date('2028-02-01T00:00:00Z'))).toBe(29);
    expect(daysLeftInMonth(new Date('2026-12-31T23:59:59Z'))).toBe(1);
    expect(monthStart(new Date('2026-11-04T12:00:00Z'))).toBe('2026-11-01T00:00:00.000Z');
  });

  it('currentCap reads the month and the trailing week from one repo query each', async () => {
    const repo = new MemoryRepo(rows);
    const nov1 = new Date('2026-11-01T06:00:00Z');
    expect(await currentCap(repo, nov1, 15, 500)).toEqual({ cap: 20, spent: 0, blended: DEFAULT_BLENDED_USD });
    repo.generations.push(...Array.from({ length: 25 }, () => row({ created_at: '2026-11-14T12:00:00Z', input_tokens: 1000, output_tokens: 300 })));
    repo.generations.push(row({ created_at: '2026-10-20T12:00:00Z', input_tokens: 1_000_000, output_tokens: 0 })); // last month: not spent, not blended
    const nov15 = new Date('2026-11-15T12:00:00Z');
    const perDoc = (1000 * 4 + 300 * 20) / 1e6 + SCREEN_ALLOWANCE_USD; // 0.0101
    const r = await currentCap(repo, nov15, 15, 500);
    expect(r.spent).toBeCloseTo(25 * perDoc, 9);
    expect(r.blended).toBeCloseTo(perDoc, 9);
    expect(r.cap).toBe(Math.floor((15 - 25 * perDoc) / 16 / perDoc));
    expect((await currentCap(repo, nov15, 0, 500)).cap).toBe(0);
  });
});

describe('parseBudget / usd', () => {
  it('"0" is zero; unset, blank or junk is the $15 default', () => {
    expect(parseBudget(undefined)).toBe(15);
    expect(parseBudget('')).toBe(15);
    expect(parseBudget(' ')).toBe(15);
    expect(parseBudget('abc')).toBe(15);
    expect(parseBudget('-2')).toBe(15);
    expect(parseBudget('0')).toBe(0);
    expect(parseBudget('7.5')).toBe(7.5);
  });
  it('usd prints two decimals', () => {
    expect(usd(0.0101)).toBe('$0.01');
    expect(usd(15)).toBe('$15.00');
    expect(usd(0.005)).toBe('$0.01');
  });
});
