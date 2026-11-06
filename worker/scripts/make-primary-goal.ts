// primary-2028 §1.1: write the electoral goal and its one action for a targeted
// seat; the body is src/make-primary-goal.ts so the tests can run it on a fixture.
// It never edits members.csv or elections.csv: set `target_2028 = 1` (with the
// rc243 roll call) and add the elections row in the same data/ PR, citing the
// roll call; the seed refuses anything else. Ids come from data/ids.md.
//   npm run make-primary-goal -w worker -- <STATE> <district> [roll-call-url]
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makePrimaryGoal } from '../src/make-primary-goal';

const here = dirname(fileURLToPath(import.meta.url));
process.exit(makePrimaryGoal(join(here, '..', '..', 'data'), process.argv.slice(2)));
