import { useEffect, useState } from 'preact/hooks';
import { openChip, type Office } from '../lib/hours';

/** call-follow-through §2: "Open now" or "Closed · opens <weekday> <time>" beside a `tel:` button, from the user's clock. No `state` means the DC office. */
export default function OpenChip({ state, hours }: Office) {
  const [chip, setChip] = useState<ReturnType<typeof openChip> | null>(null);
  useEffect(() => { setChip(openChip(new Date(), { state, hours })); }, [state, hours]);
  if (!chip) return null;
  return <span class={`chip text-xs ${chip.open ? 'bg-acid text-ink' : 'bg-newsprint text-ink'}`} data-open={chip.open ? 'yes' : 'no'}>{chip.text}</span>;
}
