// personalised-documents §4: two numbers are labelled by office; the order follows DC hours (call-follow-through §2).
import { describe, expect, it } from 'vitest';
import { phoneOrder } from './ActForm';

const DC_OPEN = new Date('2026-11-02T15:00:00Z'); // Monday 10:00 Eastern
const DC_CLOSED = new Date('2026-11-02T03:00:00Z'); // Sunday 22:00 Eastern

describe('phoneOrder', () => {
  it('labels DC then district while the DC office is open', () => {
    expect(phoneOrder(['202-225-2965', '714-559-6190'], DC_OPEN)).toEqual([
      { phone: '202-225-2965', district: false, label: 'DC office' },
      { phone: '714-559-6190', district: true, label: 'District office' },
    ]);
  });
  it('puts the district office first, labels unchanged, when DC is closed', () => {
    expect(phoneOrder(['202-225-2965', '714-559-6190'], DC_CLOSED).map((p) => p.label)).toEqual(['District office', 'DC office']);
  });
  it('leaves a lone number unlabelled', () => {
    expect(phoneOrder(['555-0100'], DC_CLOSED)).toEqual([{ phone: '555-0100', district: false, label: null }]);
    expect(phoneOrder([], DC_OPEN)).toEqual([]);
  });
});
