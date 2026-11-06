// maintainer-research-routines §1: three routine prompts, one output contract shared verbatim.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'routines');
const ROUTINES = ['federal-positions', 'senate-leader-signals', 'state-holdings'];
const files = Object.fromEntries(ROUTINES.map((r) => [r, readFileSync(join(dir, `${r}.md`), 'utf8')]));

function contract(text: string): string {
  const section = text.split(/^(?=## )/m).find((s) => s.startsWith('## Output contract'));
  return section ?? '';
}

describe('routine prompt files', () => {
  it('are exactly the three routines', () => {
    expect(readdirSync(dir).filter((f) => f.endsWith('.md')).sort()).toEqual(ROUTINES.map((r) => `${r}.md`).sort());
  });

  it('share one output contract verbatim', () => {
    const [first, ...rest] = ROUTINES.map((r) => contract(files[r]));
    expect(first.length).toBeGreaterThan(500);
    for (const c of rest) expect(c).toBe(first);
  });

  it('state the branch, PR sections and run caps', () => {
    const c = contract(files['federal-positions']);
    for (const must of ['data/<routine>-<YYYY-MM-DD>', 'data: <routine> <YYYY-MM-DD>', '## Changed', '## VERIFY', '## Not found',
      '100 tool calls', '40 fetched pages', 'User-Agent: cut-the-ties-routine', 'no retry on 403', 'Never\n   push to `main`']) {
      expect(c).toContain(must);
    }
  });

  it('each name their task and a one-line stored prompt that only points at the file', () => {
    for (const r of ROUTINES) {
      expect(files[r]).toContain(`Scheduled task \`cut-ties/${r}\``);
      expect(files[r]).toContain(`\`Read .claude/routines/${r}.md in the repository and follow it.\``);
      expect(files[r]).toMatch(/^## Steps$/m);
      expect(files[r]).toMatch(/^## Cadence$/m);
    }
  });
});
