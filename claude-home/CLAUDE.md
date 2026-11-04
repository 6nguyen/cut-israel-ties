# Global CLAUDE.md (all repos)

Source of truth: `llm-repo-template/claude-home/CLAUDE.md`, symlinked to
`~/.claude/CLAUDE.md` by `claude-home/install.sh`. Edit it there, then commit.
Project `CLAUDE.md` files hold only repo-specific facts (map, commands,
gotchas, gates) and win on conflict.

## Communication

Terseness is mode-dependent. Compress narration to nothing; never compress an
answer the user asked for.

- **Status / progress / confirmations → 1-3 lines.** "Done, 130 passed,
  pushed abc123." No preamble, no "I will now…", no recap, no unprompted
  next-steps list, no closing summary restating the message above it.
- **Requested analysis / design / debugging findings → complete.** Zero
  padding: no restating the question, no listing options you won't pursue.
- Never narrate tool calls or restate file/tool output back to the user.
- Same rule for your own writing: agent prompts are context packs (file:line
  + contract, not essays); commit bodies are what + why + QA evidence.

## Token efficiency

Cost = context size × request count, in the main thread and in every agent.
Bound both.

- Targeted reads: grep for the symbol, read that line range. Never read whole
  directories or re-read files already understood this session.
- Batch: independent tool calls in one message; several `sed -n a,bp` ranges
  in one Bash call; related edits in one pass.
- Biggest levers, in order: (1) don't spawn agents that don't earn the
  orientation tax, (2) don't rework — read the repo's Hard gotchas before
  debugging, (3) don't re-run suites that can't tell you anything new.
- Build/test through `scripts/quiet-check.sh <target>` when the repo has it
  (full log to `ops/logs/`, ≤60-line summary to context).

## Agents: when and how

Every spawn pays ~30-50k tokens to orient plus its report. Delegate only when
the work exceeds that AND doesn't need your judgment mid-flight:

1. **Reading you don't want to keep?** → Agent (context firewall: research,
   cross-cutting audits, "where is X used").
2. **Independent workstreams on disjoint files?** → parallel agents with
   strict file ownership. Two agents wanting one file → sequence them.
3. **Needs iteration with your judgment between steps?** → inline, always.

None of the above → inline. Default to inline for ≤3 files already in
context. Prefer hybrid: scout inline, then hand over exact file:line pointers.
Testable work is safe to delegate; taste/visual judgment is not.

Rules for any spawn:
- Context pack, not a reading list. Point agents at the repo's area maps
  (listed in its CLAUDE.md) instead of letting them re-derive architecture.
- Hard caps: ≤100 tool calls and ≤200k context per agent. Split work into
  steps that fit.
- Model tiers: mechanical work (renames, copy, fixtures, sweeps) → cheaper
  model/effort; full power for design, concurrency, data/decoding and hard
  debugging.
- Terse reports: ≤10 lines — changed / tests run / deviations.
- Reuse warm agents (SendMessage) for follow-ups on the same files.
- Single-layer verification: agents run scoped tests; the orchestrator runs
  the full suite once at merge.
- Sequential steps are commits in ONE session, not chained agents.
- Fan-out guard: check `/usage` before spawning. Above ~60% of the session
  window, at most one heavy agent; never more than two per 5-hour window.
- Payloads stay out of the orchestrator: agents `SendUserFile` their own
  screenshots and return paths; wireframes/HTML come from an agent that
  returns a path. Don't `Read` an image unless the user's feedback needs it.
- Research returns ≤40 lines; long form goes to `docs/research/<topic>.md`
  (header and supersede rules in its README), which builds never read.

Spawn recipe — paste verbatim at the end of EVERY Agent prompt:

```text
Scope caps (binding): ≤100 tool calls and ≤200k context. Batch reads: one
Bash call with several `sed -n a,bp` ranges; grep first, then read each file
at most once. Build/test output goes through `scripts/quiet-check.sh` when it
exists, never raw build/test commands. Never Read an image you produced;
SendUserFile it and report the path. If you approach either cap: commit,
push, update the PRD "## State" block, and stop with a ≤15-line report: PR
URL, files:lines touched, how to run, what is left.
```

## Sessions

- One session = one workstream = one model. New session for a different
  feature, a device-debug loop, or a Q&A. Never switch model mid-session (the
  prompt cache is per model; a switch rewrites the whole context).
- `/compact` only mid-feature after a large payload has served its purpose.
- The PRD `## State` block + git are the memory. End a feature session with
  `/handoff`; start a PRD-scoped build with `/implement-prd-section`.

## Git

- Never commit or push to `main`. Feature branch off an up-to-date `main`,
  then a PR (`gh pr create`). Merge via PR only; the owner merges.
- One enhancement = one fresh branch = one PR. Never stack a new capability
  on an unmerged branch. Feedback on an open PR's own feature stays on it.
- Commit at every green milestone and push immediately after.
- Before pushing more commits to an open PR's branch, check it is still
  open (`gh pr view <n> --json state`); merged → new branch off `main`.
- Branch names `type/short-kebab`: `feat/`, `fix/`, `docs/`, `chore/`, `qa/`.
- Commit messages: imperative summary ≤72 chars; body = what + why + QA
  evidence (test counts), not a file list.
- Push over HTTPS:
  `git -c credential.helper='!gh auth git-credential' push origin <branch>`
- Never force-push. Never rewrite pushed history.

## PRD-first (repos with `docs/prd/`)

- No feature work without `docs/prd/<feature>.md` (template in
  `docs/prd/README.md`): problem, expected behavior, acceptance criteria,
  non-goals — approved BEFORE code.
- A PRD opened as a PR is APPROVED on creation unless an open question is
  `[blocking]`: its answer changes behavior, contracts, acceptance criteria
  or scope, or is costly to reverse. Every other question carries a
  `Proposal:` that becomes the decision (logged under `## Changes`).
  Blocking → stay DRAFT, list them in the PR body, no code until answered.
- Every behavior change updates the same PRD in the same PR (status line +
  `## Changes`). Behavior-preserving fixes/refactors need no PRD.
- With `docs/specs/`: PRDs are changes carrying a `## Spec delta`; each
  merged section folds its delta into `docs/specs/` and the final one
  archives the PRD to `docs/prd/archive/`, in the same PR.
- New surfaces: note what the best existing products do → adopt / adapt /
  reject, one line each.
- Medium/long features keep a `## State` block (≤30 lines) current.

## Verification cadence

- Docs/spec-only change → no test runs.
- Only run the suites whose code the diff touches.
- Scoped tests during development; full suite ONCE per merge (twice only when
  the diff touches shared surfaces or a flake was seen this session).
- Flake → root-cause it immediately; never re-run to green.

## Quality bar

- Behavior changes ship WITH spec updates and new coverage.
- Never weaken an assertion that still applies; never edit tests to mask a
  product bug.
- Flaky test = fix the app or make the test assert a deterministic end state.
- Every feature meets the performance budget its PRD names; the PR's QA line
  quotes the measured number. A regression past budget is a bug.
- A change to a mapped area's contracts, entry points or invariants updates
  its map (`<area>/CLAUDE.md`, listed in CLAUDE.md §Area maps) in the same PR.

## Don'ts

- Don't create docs/summaries nobody asked for.
- Don't let an LLM layer compute numbers the product shows; deterministic
  code does arithmetic.
