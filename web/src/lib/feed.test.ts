// call-follow-through §5: the feed's goal set over the real data rows.
import { describe, expect, it } from 'vitest';
import { feedGoals } from './goals';

describe('feedGoals', () => {
  it('holds every upcoming or active goal with a decision date, soonest first, and nothing closed or undated', () => {
    const list = feedGoals();
    for (const g of list) {
      expect(['upcoming', 'active']).toContain(g.status);
      expect(g.decision_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(list.map((g) => g.decision_date)).toEqual([...list.map((g) => g.decision_date)].sort());
    expect(new Set(list.map((g) => g.slug)).size).toBe(list.length);
  });
});
