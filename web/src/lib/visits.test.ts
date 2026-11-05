// office-visits client store: the joined-visit record, the shown line, and the open-items gate.
import { beforeEach, describe, expect, it } from 'vitest';
import { VISITS_KEY, addVisit, clearFunnel, hasOpenItems, joinedVisit, loadVisits, removeVisit } from './commitments';
import { LISTED_KEY, SHOW_COUNT_FROM, listed, markListed, unlist, visitLine } from './visits';

const J = { id: 3, member: 'C001110', name: 'Lou Correa', city: 'Santa Ana', starts_at: '2026-11-10T10:00', ends_at: '2026-11-10T11:00', contact_url: 'https://signal.group/#abc' };

describe('joined visits', () => {
  beforeEach(() => { localStorage.clear(); });
  it('round-trips a v:1 record under cut-ties:visits and gates the front-page redirect', () => {
    expect(hasOpenItems()).toBe(false);
    addVisit(J);
    expect(JSON.parse(localStorage.getItem(VISITS_KEY)!)[0]).toMatchObject({ v: 1, id: 3 });
    expect(joinedVisit(3)?.contact_url).toBe(J.contact_url);
    expect(hasOpenItems()).toBe(true);
    addVisit({ ...J, city: 'Anaheim' }); // same id replaces
    expect(loadVisits()).toHaveLength(1);
    removeVisit(3);
    expect(loadVisits()).toEqual([]);
    expect(localStorage.getItem(VISITS_KEY)).toBeNull();
  });
  it('ignores foreign shapes and is cleared by Start over', () => {
    localStorage.setItem(VISITS_KEY, JSON.stringify([{ v: 2, id: 1 }, { id: 'x' }, { ...J, v: 1 }]));
    expect(loadVisits()).toHaveLength(1);
    clearFunnel();
    expect(loadVisits()).toEqual([]);
  });
  it('the line names city and date; the count appears from two', () => {
    expect(SHOW_COUNT_FROM).toBe(2);
    expect(visitLine({ office_city: 'Santa Ana', starts_at: '2026-11-10T10:00', requests: 1 })).toBe('Visit Santa Ana on Nov 10');
    expect(visitLine({ office_city: 'Santa Ana', starts_at: '2026-11-10T10:00', requests: 2 })).toBe('Visit Santa Ana on Nov 10 with 2 others');
  });
  it('remembers listings this device made', () => {
    markListed(5); markListed(5); markListed(7);
    expect(listed()).toEqual([5, 7]);
    unlist(5);
    expect(JSON.parse(localStorage.getItem(LISTED_KEY)!)).toEqual([7]);
  });
});
