// leadership-routing §2.4–2.5: the leadership card renders a House block then a Senate block, an uncalled seat as
// one line, and a member-elect with the takes-office line and a Contact link in place of a phone. Rendered with
// preact-render-to-string under node; every value is a data/ row shape.
import { h } from 'preact';
import { render } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import type { GoalCard, TargetCard } from '../lib/api';
import { Card } from './Results';
import { Target } from './Target';

const wiener: TargetCard = {
  bioguide_id: 'CA-11-wiener', name: 'Scott Wiener', party: 'D', role: 'Representative-elect', phone: null, position: 'unknown',
  position_source_url: null, prior_vote: 'No recorded vote yet', elect: { replaces_name: 'Nancy Pelosi', takes_office: '2027-01-03', contact_url: 'https://scottwiener.com/' },
} as TargetCard;
const padilla: TargetCard = { bioguide_id: 'P000145', name: 'Alex Padilla', party: 'D', role: 'Sen.', phone: '202-224-3553', position: 'unknown', position_source_url: null, prior_vote: 'No recorded vote yet' } as TargetCard;
const goal = (o: Partial<GoalCard>): GoalCard => ({
  slug: 'house-caucus', title: 'Kick out Hakeem Jeffries', category: 'leadership', summary: 'S', decision_date: '2026-11-18', ask_text: 'Ask H',
  action_href: '/goals/house-caucus/act/house-caucus-call', partner_url: null, targets: [], ...o,
} as GoalCard);
const senate = goal({ slug: 'senate-leader', title: 'Senate', chamber: 'senate', decision_date: '2027-01-05', ask_text: 'Ask S', action_href: '/goals/senate-leader/act/senate-leader-call', targets: [padilla] });
const html = (g: GoalCard) => render(h(Card, { g, n: 2, state: 'CA', district: 11 }));

describe('leadership card blocks', () => {
  it('renders House then Senate, each with its own date, targets, ask and CTA', () => {
    const out = html(goal({ chamber: 'house', targets: [wiener], also: senate }));
    const house = out.indexOf('data-block="house"'), sen = out.indexOf('data-block="senate"');
    expect(house).toBeGreaterThan(-1);
    expect(sen).toBeGreaterThan(house);
    expect(out).toContain('House · Decision: Nov 18, 2026');
    expect(out).toContain('Senate · Decision: Jan 5, 2027');
    expect(out).toContain('Ask H');
    expect(out).toContain('Ask S');
    expect(out).toContain('/goals/house-caucus/act/house-caucus-call');
    expect(out).toContain('/goals/senate-leader/act/senate-leader-call');
    expect(out).not.toContain('data-uncalled');
  });
  it('an uncalled House seat is one line before the Senate block; a lone leadership goal is a plain card', () => {
    const out = html({ ...senate, uncalled: ['house'] });
    const line = out.indexOf('House seat: race not called yet.'), sen = out.indexOf('data-block="senate"');
    expect(line).toBeGreaterThan(-1);
    expect(sen).toBeGreaterThan(line);
    expect(out).not.toContain('data-block="house"');
    const plain = html({ ...senate, uncalled: [] });
    expect(plain).not.toContain('Senate · Decision');
    expect(plain).toContain('Decision: Jan 5, 2027');
    expect(plain).toContain('data-block="senate"');
  });
  it('a member-elect shows role, the takes-office line and a Contact link, never a tel: or the switchboard', () => {
    const out = render(h(Target, { t: wiener }));
    expect(out).toContain('Representative-elect Scott Wiener');
    expect(out).toContain('Takes office Jan 3, 2027, replaces Nancy Pelosi');
    expect(out).toContain('href="https://scottwiener.com/"');
    expect(out).toContain('>Contact<');
    expect(out).not.toContain('tel:');
    expect(out).not.toContain('224-3121');
    const sitting = render(h(Target, { t: padilla }));
    expect(sitting).toContain('tel:2022243553');
    expect(sitting).not.toContain('Contact');
    expect(sitting).not.toContain('data-elect-line');
  });
});
