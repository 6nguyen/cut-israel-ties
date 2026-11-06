// call-follow-through §1, §3, §4: what the receipt screen adds after "I did it". ActForm imports this
// module lazily once a receipt exists, so the act page's own bundle does not carry it.
import { useState } from 'preact/hooks';
import { addCommitment, fmtDue, receiptedTargets, reminderIcs, retryDue, retryFor } from '../lib/commitments';
import { downloadIcs } from '../lib/ics';
export { default as Counts } from './Counts';

interface NextOfficeProps { goal: string; action: string; choices: { id: string; label: string }[] }
/** call-follow-through §3: after the private steps, "Next: <office>" for each target of the goal without a receipt from this device today; nothing when the goal lists one target. */
export function NextOffice({ goal, action, choices }: NextOfficeProps) {
  const named = choices.filter((c) => c.label);
  if (named.length < 2) return null;
  const done = receiptedTargets(goal, action);
  const left = named.filter((c) => !done.has(c.id));
  return (
    <div class="flex flex-wrap gap-2 items-center border-t-2 border-ink pt-3" data-next-office>
      {left.length ? left.map((c) => <a href={`/goals/${goal}/act/${action}?target=${c.id}`} class="btn btn-ghost">Next: {c.label}</a>)
        : <p class="text-sm font-semibold" data-next-done>{named.length === 3 ? 'All three called this week.' : 'All of your targets called this week.'}</p>}
    </div>
  );
}

interface RetryProps { goal: string; action: string; target: string; who: string; title: string }
/** call-follow-through §1: under `no_answer`, the voicemail line and one "Try again" that stores a `retry` commitment due at the DC office's next open slot (≥60 min ahead). Nothing posts. */
export function Retry({ goal, action, target, who, title }: RetryProps) {
  const [due, setDue] = useState<string | null>(() => retryFor(goal, target)?.due ?? null);
  const url = `${location.origin}/goals/${goal}/act/${action}?target=${target}`;
  function tryAgain() {
    const iso = retryDue(new Date()).toISOString();
    addCommitment({ goal, action, target, due: iso, kind: 'retry', who });
    setDue(iso);
  }
  return (
    <div class="flex flex-col gap-2" data-retry>
      <p class="text-sm">Voicemail counts. Offices tally messages daily; say your street address so yours is logged.</p>
      {due ? (
        <div class="flex flex-wrap gap-2 items-center">
          <p class="text-sm font-semibold" data-retry-due>Try {who} again by {fmtDue(due)}. It's on your week.</p>
          <button type="button" class="btn btn-ghost" onClick={() => downloadIcs(`retry-${goal}`, reminderIcs(goal, title, due, url, true))}>Add reminder (.ics)</button>
        </div>
      ) : <button type="button" class="btn btn-ghost self-start" onClick={tryAgain}>Try again</button>}
    </div>
  );
}

/** commitment-funnel §1: one private commitment, then the captain list of three, before any share affordance. */
