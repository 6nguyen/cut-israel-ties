// House seat table: 2020-census apportionment, unchanged from the 119th to the
// 120th Congress (next change 2033). SEATS_CONGRESS labels the table and the seed
// errors; the 2027-01-03 flip (docs/prd/district-vintage-rollover.md §3) sets it to
// 120 with ACTIVE_CONGRESS, counts untouched. A seat count of 1 means an at-large
// seat, stored as district 0 (the Census geocoder's CD "00" and the
// congress-legislators convention). Delegates have no floor vote and are kept
// out of whip counts; their district is 0 as well.
export const SEATS_CONGRESS = 119;
export const HOUSE_SEATS: Record<string, number> = {
  AL: 7, AK: 1, AZ: 9, AR: 4, CA: 52, CO: 8, CT: 5, DE: 1, FL: 28, GA: 14, HI: 2, ID: 2, IL: 17, IN: 9, IA: 4, KS: 4,
  KY: 6, LA: 6, ME: 2, MD: 8, MA: 9, MI: 13, MN: 8, MS: 4, MO: 8, MT: 2, NE: 3, NV: 4, NH: 2, NJ: 12, NM: 3, NY: 26,
  NC: 14, ND: 1, OH: 15, OK: 5, OR: 6, PA: 17, RI: 2, SC: 7, SD: 1, TN: 9, TX: 38, UT: 4, VT: 1, VA: 11, WA: 10,
  WV: 2, WI: 8, WY: 1,
  // Delegates and the Resident Commissioner: one non-voting House seat each.
  DC: 1, PR: 1, GU: 1, VI: 1, AS: 1, MP: 1,
};

export const DELEGATE_STATES = new Set(['DC', 'PR', 'GU', 'VI', 'AS', 'MP']);

export const isDelegate = (m: { chamber: string; state: string }): boolean => m.chamber === 'house' && DELEGATE_STATES.has(m.state);

/** null when the district is valid for the state; otherwise the reason. */
export function districtError(state: string, district: number): string | null {
  const seats = HOUSE_SEATS[state];
  if (!seats) return `unknown state ${state}`;
  if (seats === 1) return district === 0 ? null : `${state} is at large (district 0), got ${district}`;
  if (!Number.isInteger(district) || district < 1 || district > seats) return `${state} has districts 1-${seats} (${SEATS_CONGRESS}th Congress), got ${district}`;
  return null;
}
