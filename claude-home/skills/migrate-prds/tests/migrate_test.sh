#!/usr/bin/env bash
# Tests for the migrate-prds skill scripts (docs/specs/prd-migration.md,
# prd-fold.md invariants). Run: scripts/quiet-check.sh migrate-prds
# Fixture repos under a temp dir; `gh` is a stub on PATH (GH_MODE=fail|json).
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
INV="$HERE/scripts/inventory.sh"
MOVE="$HERE/scripts/move.sh"
FOLD="$HERE/scripts/fold.sh"
RELINK="$HERE/scripts/relink.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.com GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.com
export GIT_AUTHOR_DATE=2025-03-15T12:00:00 GIT_COMMITTER_DATE=2025-03-15T12:00:00

mkdir -p "$T/bin"
cat >"$T/bin/gh" <<'SH'
#!/usr/bin/env bash
[ "${GH_MODE:-fail}" = json ] || { echo "gh: not logged in" >&2; exit 1; }
echo '[{"number":4,"state":"OPEN","headRefName":"feat/billing-flow-v2","title":"Billing v2"},
{"number":2,"state":"MERGED","headRefName":"feat/billing-flow","title":"Billing"},
{"number":7,"state":"CLOSED","headRefName":"spike/ideas","title":"Ideas spike"}]'
SH
chmod +x "$T/bin/gh"
export PATH="$T/bin:$PATH" GH_MODE=fail

PASS=0 FAIL=0
ok() { PASS=$((PASS + 1)); echo "PASS: $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }
check() { local name="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$name"; else bad "$name"; fi; }
commit_all() { git -C "$1" add -A; git -C "$1" commit -qm "$2"; }
on_branch() {  # on_branch <repo> <branch> <file> : one commit on a new branch
  git -C "$1" switch -qc "$2"; echo "change" >>"$1/$3"; commit_all "$1" "$2"; git -C "$1" switch -q main
}
merge_branch() { git -C "$1" merge -q --no-ff -m "merge $2" "$2"; }
heads() { printf '## Problem\nx\n## Goals / Non-goals\nx\n## Expected behavior\nx\n## Acceptance criteria\nx\n'; }
row() { grep -F "| $2 |" "$1"; }  # row <out> <path>

# --- Fixture: PRDs in docs/, design/ and root; mixed statuses; no State ----
R="$T/app"; mkdir -p "$R/docs/specs" "$R/docs/prd" "$R/design" "$R/node_modules/x"
git -C "$R" init -q -b main
printf '# Goals\nStatus: SHIPPED 2024-11\n\nbody\n' >"$R/docs/goals.md"
printf '# Onboarding PRD\n\n**Status:** Approved\n' >"$R/design/Onboarding PRD.md"
{ echo "# Search"; heads; } >"$R/search-prd.md"
printf '# Billing flow\nStatus: DRAFT\n' >"$R/docs/Billing_Flow.md"
{ echo "# Notes"; heads; } >"$R/docs/notes.md"
{ echo "# Export"; heads; } >"$R/docs/export.md"
printf '# Sync PRD\n\nbody\n' >"$R/docs/sync.md"
printf '# Ready\nStatus: APPROVED\n\n## State\n- Sections:\n## Spec delta\n' >"$R/docs/prd/ready.md"
# In docs/prd/ with no marker: prose status mid-line, no PRD word, 1 heading.
printf '# Pilot: Requirements\n\nOwner: J. Status: pilot.\n\n## State\n- x\n' >"$R/docs/prd/pilot.md"
# Not candidates: READMEs, specs, plan file, vendor dirs, too few headings.
printf '# App\nStatus: SHIPPED\n' >"$R/README.md"
printf '# Read me PRD\nStatus: DRAFT\n' >"$R/docs/readme.md"
printf '# Spec\nStatus: SHIPPED\n' >"$R/docs/specs/goals.md"
printf '# Migration plan\nStatus: x\n' >"$R/docs/prd/migration-plan.md"
printf '# Dep PRD\nStatus: DRAFT\n' >"$R/node_modules/x/prd.md"
printf '# Guide\n## Problem\n## Goals\n' >"$R/docs/guide.md"
printf '# Deprecation of PRDs\n' >"$R/docs/history.md"  # "PRDs" is not "PRD"
printf '# Research PRD\nStatus: x\n' >"$R/docs/prd/research-model.md"
mkdir -p "$R/docs/research"; printf '# Old study PRD\nStatus: DRAFT\n' >"$R/docs/research/old.md"
commit_all "$R" init
on_branch "$R" feat/onboarding-prd-ui "design/Onboarding PRD.md"; merge_branch "$R" feat/onboarding-prd-ui
on_branch "$R" feat/search-prd-x search-prd.md
on_branch "$R" feat/export docs/export.md; merge_branch "$R" feat/export
on_branch "$R" feat/sync-a docs/sync.md; merge_branch "$R" feat/sync-a
on_branch "$R" feat/sync-b docs/sync.md
git -C "$R" branch feat/notes-empty   # no commits past main: not evidence

"$INV" "$R" >"$T/out1" 2>&1; RC=$?
check "inventory: exit 0" test "$RC" = 0
O="$T/out1"
check "class: SHIPPED status -> shipped, archived by last-commit month" \
  sh -c "grep -F '| docs/goals.md |' '$O' | grep -qF '| shipped | docs/prd/archive/2025-03-goals.md |'"
check "class: approved + merged branch -> partial, PRD token dropped from name" \
  sh -c "grep -F '| design/Onboarding PRD.md |' '$O' | grep -qF '| APPROVED |' && grep -F '| design/Onboarding PRD.md |' '$O' | grep -qF '| partial | docs/prd/onboarding.md |'"
check "class: no status + unmerged branch -> active, name kept" \
  sh -c "grep -F '| search-prd.md |' '$O' | grep -qF '| active | docs/prd/search-prd.md — name kept: open branch feat/search-prd-x |'"
check "class: DRAFT, no evidence -> active, kebab name" \
  sh -c "grep -F '| docs/Billing_Flow.md |' '$O' | grep -qF '| active | docs/prd/billing-flow.md |'"
check "class: no status, no evidence -> unknown, stays put" \
  sh -c "grep -F '| docs/notes.md |' '$O' | grep -qF '| — | unknown | (in place) |'"
check "class: empty branch is not evidence" sh -c "! grep -q 'notes-empty' '$O'"
check "class: no status + all merged -> shipped" \
  sh -c "grep -F '| docs/export.md |' '$O' | grep -qF 'branch feat/export merged | shipped |'"
check "class: merged + unmerged -> partial" \
  sh -c "grep -F '| docs/sync.md |' '$O' | grep -qF 'branch feat/sync-a merged; branch feat/sync-b unmerged | partial |'"
check "flags: State+Sections+Delta, already in docs/prd stays" \
  sh -c "grep -F '| docs/prd/ready.md |' '$O' | grep -qF '| State+Sections+Delta |' && grep -F '| docs/prd/ready.md |' '$O' | grep -qF '| (in place) |'"
check "docs/prd file with no marker is a candidate" \
  sh -c "grep -F '| docs/prd/pilot.md |' '$O' | grep -qF '| unknown | (in place) |'"
check "class: docs/prd/research-* -> research, prefix dropped" \
  sh -c "grep -F '| docs/prd/research-model.md |' '$O' | grep -qF '| research | docs/research/model.md |'"
check "counts line" grep -qxF 'Counts: shipped 2 · active 3 · partial 2 · unknown 2 · research 1' "$O"
check "10 candidates" grep -qF 'PRD inventory: 10 candidates (default branch: main)' "$O"
for f in README.md docs/readme.md docs/specs/goals.md docs/prd/migration-plan.md node_modules/x/prd.md docs/guide.md docs/history.md docs/research/old.md; do
  check "not a PRD candidate: $f" sh -c "! grep -F '| $f |' '$O' | grep -qv '| doc:'"
done
check "non-PRD docs are doc rows: docs/guide.md" sh -c "grep -F '| docs/guide.md |' '$O' | grep -qF '| doc:unknown |'"
check "PRD rows sorted by path" sh -c "grep '^| [^P-]' '$O' | grep -v '| doc:' | cut -d'|' -f2 | LC_ALL=C sort -c"
check "doc rows after PRD rows" sh -c "grep '^| [^P-]' '$O' | cut -d'|' -f7 | awk '/doc:/{d=1} d && !/doc:/{exit 1}'"

# --- Real-repo status phrases (hypertrophy-goals dry run) -----------------
Q="$T/phrases"; mkdir -p "$Q/docs/prd"; git -C "$Q" init -q -b main
printf '# Tour PRD\nStatus: IN PROGRESS 2026-09-07 (PRs 1-3 of 4 built)\n' >"$Q/docs/tour.md"
printf '# Imports PRD\nStatus: ON HOLD — owner deferred\n' >"$Q/docs/prd/imports.md"
printf '# Report PRD\nStatus: SHIPPING\n' >"$Q/docs/prd/report.md"
printf '# Rolling PRD\nStatus: FOLDED 2026-09-29 → home.md\n' >"$Q/docs/prd/rolling.md"
printf '# Old PRD\nStatus: SUPERSEDED by docs/prd/new.md\n' >"$Q/docs/prd/old.md"
printf '# App PRD\n\nLast updated: 2026-08-19\n' >"$Q/docs/PRD.md"
printf '# Gestures PRD\nStatus: BUILDING — landed 2026-09-07 · Owner: G\n' >"$Q/docs/prd/gestures.md"
printf '# Settings PRD\nStatus: APPROVED (owner, 2026-09-07) —\nshipped on iOS as Profile · Owner: G\n\nshipped\n' >"$Q/docs/prd/settings.md"
commit_all "$Q" init
for b in feat/tour-core:docs/tour.md feat/imports-csv:docs/prd/imports.md feat/report-ui:docs/prd/report.md feat/prd-process:docs/PRD.md; do
  on_branch "$Q" "${b%%:*}" "${b#*:}"; merge_branch "$Q" "${b%%:*}"
done
"$INV" "$Q" >"$T/outq" 2>&1
check "phrase: IN PROGRESS + merged -> partial, not shipped" \
  sh -c "grep -F '| docs/tour.md |' '$T/outq' | grep -qF '| IN PROGRESS |' && grep -F '| docs/tour.md |' '$T/outq' | grep -qF '| partial | docs/prd/tour.md |'"
check "phrase: ON HOLD + merged -> partial, stays" \
  sh -c "grep -F '| docs/prd/imports.md |' '$T/outq' | grep -qF '| ON HOLD |' && grep -F '| docs/prd/imports.md |' '$T/outq' | grep -qF '| partial | (in place) |'"
check "status text says landed, no branch evidence -> partial" \
  sh -c "grep -F '| docs/prd/gestures.md |' '$T/outq' | grep -qF '| BUILDING |' && grep -F '| docs/prd/gestures.md |' '$T/outq' | grep -qF '| status says shipped | partial | (in place) |'"
check "status continuation line says shipped -> partial" \
  sh -c "grep -F '| docs/prd/settings.md |' '$T/outq' | grep -qF '| status says shipped | partial | (in place) |'"
check "status: SHIPPING + merged -> partial" sh -c "grep -F '| docs/prd/report.md |' '$T/outq' | grep -qF '| partial | (in place) |'"
check "status: FOLDED, no evidence -> shipped, archived" sh -c "grep -F '| docs/prd/rolling.md |' '$T/outq' | grep -qF '| shipped | docs/prd/archive/'"
check "status: SUPERSEDED, no evidence -> shipped, archived" sh -c "grep -F '| docs/prd/old.md |' '$T/outq' | grep -qF '| shipped | docs/prd/archive/'"
check "bare PRD.md: no PR/branch evidence -> unknown, stays" \
  sh -c "grep -F '| docs/PRD.md |' '$T/outq' | grep -qF '| — | — |' && grep -F '| docs/PRD.md |' '$T/outq' | grep -qF '| unknown | (in place) |'"

# --- Doc rows (migrate-docs §1): one doc of each kind ----------------------
D="$T/docs"; mkdir -p "$D/docs/prd/archive" "$D/docs/plans" "$D/docs/perf/results" "$D/docs/notes" \
  "$D/docs/design/x-market" "$D/docs/guides" "$D/tools/lint" "$D/api" "$D/web" "$D/.github" "$D/.claude" "$D/node_modules/m"
git -C "$D" init -q -b main
printf '# D\n\n## Area maps\nRead a map first (see README.md); iOS notes are in docs/ios-map.md for now.\n- api: `docs/api-notes.md` — api\n- arch: `docs/architecture.md`\n' >"$D/CLAUDE.md"
printf -- '---\nname: Lint Check\ndescription: lints\n---\n# Lint\n' >"$D/tools/lint/SKILL.md"
printf '# Ref\n' >"$D/tools/lint/ref.md"
printf '# Run 1\n' >"$D/docs/perf/results/1.md"
printf '# API notes\n`api/server.py` `api/db.py` `api/x/y.py` `web/a.ts`\n' >"$D/docs/api-notes.md"
printf '# iOS\n' >"$D/docs/ios-map.md"
printf '# Feed plan\nPRD: docs/prd/feed.md\n' >"$D/docs/plans/feed-implementation.md"
printf '# Old plan\n' >"$D/docs/plans/old-implementation.md"
# Defect 16: a Status: line does not make an impl plan a PRD candidate.
printf '# Tour plan\nStatus: PROPOSED 2026-09-07\nPRD: `docs/prd/feed.md`\n' >"$D/docs/plans/tour-implementation.md"
printf '# Old PRD\nStatus: SHIPPED\n' >"$D/docs/prd/archive/2025-01-old.md"
printf '# Feed PRD\nStatus: APPROVED\n' >"$D/docs/prd/feed.md"
printf '# Launch\n- [ ] ship it\n- [x] plan it\n' >"$D/docs/launch-plan.md"
printf '# Done\n- [x] all\n' >"$D/docs/done-roadmap.md"
printf '# Ideas\n' >"$D/docs/plans/ideas.md"
printf '# API\n' >"$D/docs/api-contract.md"
printf '# Arch\n' >"$D/docs/architecture.md"
printf '# Rules\nThese rules are binding.\n' >"$D/docs/notes/rules.md"
printf '# Study\n## Sources\n- x\n' >"$D/docs/study.md"
printf '# Pricing\nResearched: 2025-02-01\n' >"$D/docs/research-2024-05-pricing.md"
printf '# A\n' >"$D/docs/design/x-market/a.md"
printf '# Shortcuts\n' >"$D/docs/shortcuts-setup.md"
printf '# Perf\n' >"$D/docs/perf/README.md"
printf '# Release\n' >"$D/docs/RELEASE.md"
printf '# Misc\n' >"$D/docs/misc.md"
{ echo "# Big"; python3 -c "print('word ' * 4100)"; } >"$D/docs/big.md"
printf '# Mixed\n## Roadmap\n## API contract\n' >"$D/docs/mixed.md"
for f in docs/README.md docs/FEATURES.md .github/x.md .claude/x.md docs/guides/g.md AGENTS.md LICENSE.md node_modules/m/y.md; do printf '# X\n' >"$D/$f"; done
printf 'see docs/api-contract.md §2\nalso api-contract.md\n' >"$D/api/server.py"
printf '// architecture.md\n' >"$D/web/a.ts"
printf 'api-contract.md in markdown is not a citation\n' >"$D/docs/notes/cite.md"
commit_all "$D" init
"$INV" "$D" >"$T/outd" 2>&1; RC=$?
check "docs: inventory exit 0" test "$RC" = 0
DO="$T/outd"
drow() { grep -F "| $1 |" "$DO" | grep -qF "$2"; }
check "doc skill: SKILL.md frontmatter -> whole dir" drow tools/lint/SKILL.md '| frontmatter name+description; 5 lines · ~12 tokens · cited 0 files/0 § | doc:skill | .claude/skills/lint-check/ |'
check "doc skill: other files in the skill dir get no row" sh -c "! grep -qF '| tools/lint/ref.md |' '$DO'"
check "doc record: under results/, stays" drow docs/perf/results/1.md '| under results/; 1 lines · ~2 tokens · cited 0 files/0 § | doc:record | (in place) |'
check "doc map: listed under Area maps -> most cited top-level dir" drow docs/api-notes.md '| listed under ## Area maps; 2 lines · ~16 tokens · cited 0 files/0 § | doc:map | api/CLAUDE.md |'
check "doc map: *-map.md with no paths -> ?/CLAUDE.md" drow docs/ios-map.md '| name *-map.md; 1 lines · ~1 tokens · cited 0 files/0 § | doc:map | ?/CLAUDE.md |'
check "doc impl-plan: PRD header -> merge" drow docs/plans/feed-implementation.md '| header PRD: docs/prd/feed.md; 2 lines · ~8 tokens · cited 0 files/0 § | doc:impl-plan | merge feed |'
check "doc impl-plan: archived PRD -> archive beside it" drow docs/plans/old-implementation.md '| doc:impl-plan | docs/prd/archive/2025-01-old-plan.md |'
check "doc impl-plan: Status: line, still a doc row -> merge" drow docs/plans/tour-implementation.md '| doc:impl-plan | merge feed |'
check "doc impl-plan: Status: line, not a PRD candidate" sh -c "! grep -qF 'docs/prd/tour-implementation.md' '$DO'"
check "doc plan: unchecked items -> split" drow docs/launch-plan.md '| name *-plan.md; 3 lines · ~9 tokens · cited 0 files/0 § | doc:plan | split |'
check "doc plan: all done -> archive by last-commit month" drow docs/done-roadmap.md '| name *-roadmap.md; 2 lines · ~4 tokens · cited 0 files/0 § | doc:plan | docs/prd/archive/2025-03-done-roadmap.md |'
check "doc plan: under plans/" drow docs/plans/ideas.md '| under plans/;'
check "doc reference: *contract* -> fold, citations counted outside markdown" drow docs/api-contract.md '| name *contract*.md; 1 lines · ~1 tokens · cited 1 files/1 § | doc:reference | fold |'
check "doc reference: architecture.md listed under Area maps stays reference" drow docs/architecture.md '| name architecture.md; 1 lines · ~1 tokens · cited 1 files/0 § | doc:reference | fold |'
check "doc reference: binding header" drow docs/notes/rules.md '| header "binding";'
check "doc research: ## Sources" drow docs/study.md '| ## Sources; 3 lines · ~5 tokens · cited 0 files/0 § | doc:research | docs/research/study.md |'
check "doc research: date line, prefix and date dropped" drow docs/research-2024-05-pricing.md '| research date line;' 
check "doc research: topic name" drow docs/research-2024-05-pricing.md '| doc:research | docs/research/pricing.md |'
check "doc research: study folder kept whole" drow docs/design/x-market/a.md '| under x-market/; 1 lines · ~1 tokens · cited 0 files/0 § | doc:research | docs/research/x-market/a.md |'
check "doc howto: *-setup.md" drow docs/shortcuts-setup.md '| doc:howto | docs/guides/shortcuts-setup.md |'
check "doc howto: README.md under docs/ named by its dir" drow docs/perf/README.md '| README.md under docs/; 1 lines · ~1 tokens · cited 0 files/0 § | doc:howto | docs/guides/perf.md |'
check "doc howto: RELEASE.md" drow docs/RELEASE.md '| name RELEASE.md; 1 lines · ~2 tokens · cited 0 files/0 § | doc:howto | docs/guides/release.md |'
check "doc unknown: stays" drow docs/misc.md '| no rule matched; 1 lines · ~1 tokens · cited 0 files/0 § | doc:unknown | (in place) |'
check "doc mixed: over 4k tokens -> fold" drow docs/big.md '; mixed: ~5126 tokens | doc:unknown | fold |'
check "doc mixed: headings of different kinds -> fold" drow docs/mixed.md '; mixed: headings plan+reference | doc:unknown | fold |'
for f in docs/README.md docs/FEATURES.md .github/x.md .claude/x.md docs/guides/g.md AGENTS.md LICENSE.md node_modules/m/y.md CLAUDE.md docs/prd/feed.md; do
  check "not a doc row: $f" sh -c "! grep -F '| $f |' '$DO' | grep -qF '| doc:'"
done
check "docs counts line" grep -qxF 'Docs: 23 · skill 1 · record 1 · map 2 · impl-plan 3 · plan 3 · reference 3 · research 3 · howto 3 · unknown 4 · mixed 2' "$DO"
"$INV" "$D/docs/plans" >"$T/outd2" 2>&1
check "docs: deterministic (byte-identical from a subdir)" cmp -s "$DO" "$T/outd2"
"$INV" --plan "$D" >"$T/pland" 2>&1
check "docs: --plan writes doc rows in ## Files" sh -c "sed -n '/^## Files/,/^## Capability/p' '$T/pland' | grep -qF '| docs/study.md | — | — | 2025-03-15 | ## Sources;'"

# Decision logs are research (docs/research/reference-docs.md, ADRs).
DL="$T/declog"; mkdir -p "$DL"; git -C "$DL" init -q -b main
mkdir -p "$DL/docs/adr" "$DL/notes"
printf '# Decision Log\n| Date | Decision |\n' >"$DL/docs/decisions.md"
printf '# 1. Use SQLite\n' >"$DL/docs/adr/0001-sqlite.md"
printf '# Decisions\n- x\n' >"$DL/notes/log.md"
commit_all "$DL" "decision logs"
"$INV" "$DL" >"$T/outdl" 2>&1
DO="$T/outdl"
check "doc decision log: name -> research" drow docs/decisions.md '| decision log: name decisions.md; 2 lines · ~8 tokens · cited 0 files/0 § | doc:research | docs/research/decisions.md |'
check "doc decision log: adr/ folder kept whole" drow docs/adr/0001-sqlite.md '| decision log: under adr/; 1 lines · ~4 tokens · cited 0 files/0 § | doc:research | docs/research/adr/0001-sqlite.md |'
check "doc decision log: title" drow notes/log.md '| decision log: title; 2 lines · ~4 tokens · cited 0 files/0 § | doc:research | docs/research/log.md |'
DO="$T/outd"

# --- Move doc rows (migrate-docs §2; continues on the doc fixture) ---------
mkdir -p "$D/docs/research"; printf '# Research\n\n## Index\n| Research | Question | Researched | Informs |\n|---|---|---|---|\n' >"$D/docs/research/README.md"
printf '[s](study.md) [r](../tools/lint/ref.md) [m](api-notes.md)\n' >"$D/docs/links.md"
commit_all "$D" "research index, links"
BEFORE_STUDY="$(git -C "$D" log --format=%s -- docs/study.md | tr '\n' ,)"
git -C "$D" switch -qc chore/migrate-prds-move
"$INV" --plan "$D" >"$D/docs/prd/migration-plan.md"; commit_all "$D" "Add PRD migration plan"
"$MOVE" "$D" >"$T/dmove0" 2>&1; RC=$?
check "move docs: ?/CLAUDE.md refused (exit 2), nothing moved" \
  sh -c "test $RC = 2 && grep -qF 'name the map directory (<dir>/CLAUDE.md) for docs/ios-map.md' '$T/dmove0' && test -f '$D/docs/study.md'"
perl -pi -e 's{\| doc:map \| \?/CLAUDE\.md \|}{| doc:map | ios/CLAUDE.md |}' "$D/docs/prd/migration-plan.md"
commit_all "$D" "Name the ios map"
"$MOVE" "$D" >"$T/dmove" 2>&1; RC=$?
check "move docs: exit 0" test "$RC" = 0
for pair in "docs/study.md docs/research/study.md" "docs/research-2024-05-pricing.md docs/research/pricing.md" \
  "docs/design/x-market/a.md docs/research/x-market/a.md" "docs/shortcuts-setup.md docs/guides/shortcuts-setup.md" \
  "docs/perf/README.md docs/guides/perf.md" "docs/RELEASE.md docs/guides/release.md" \
  "tools/lint/SKILL.md .claude/skills/lint-check/SKILL.md" "tools/lint/ref.md .claude/skills/lint-check/ref.md" \
  "docs/api-notes.md api/CLAUDE.md" "docs/ios-map.md ios/CLAUDE.md" \
  "docs/done-roadmap.md docs/prd/archive/2025-03-done-roadmap.md" \
  "docs/plans/old-implementation.md docs/prd/archive/2025-01-old-plan.md"; do
  set -- $pair
  check "move docs: $1 -> $2" sh -c "test ! -e '$D/$1' && test -f '$D/$2'"
done
for f in docs/api-contract.md docs/architecture.md docs/notes/rules.md docs/big.md docs/mixed.md docs/launch-plan.md \
  docs/plans/feed-implementation.md docs/plans/tour-implementation.md docs/perf/results/1.md docs/misc.md; do
  check "move docs: $f stays (fold/split/merge/record/unknown)" test -f "$D/$f"
done
check "move docs: unknown doc listed" grep -qxF 'unknown (not moved): docs/misc.md' "$T/dmove"
MD="$(git -C "$D" log --format=%H --grep='moves only' -1)"
check "move docs: one moves-only commit, pure renames" sh -c "
  test \"\$(git -C '$D' log -1 --format=%s $MD)\" = 'Move PRDs and docs into place (moves only)' &&
  ! git -C '$D' diff --name-status -M100% $MD^ $MD | grep -v '^R100' | grep -q ."
check "move docs: git log --follow keeps history" \
  test "$(git -C "$D" log --follow --format=%s -- docs/research/study.md | grep -v '^Move PRDs\|^Rewrite links' | tr '\n' ,)" = "$BEFORE_STUDY"
check "move docs: links rewritten" grep -qxF '[s](research/study.md) [r](../.claude/skills/lint-check/ref.md) [m](../api/CLAUDE.md)' "$D/docs/links.md"
check "move docs: research index rows (one per study folder)" sh -c "grep -qxF '| [study](study.md) | — | — | — |' '$D/docs/research/README.md' && grep -qxF '| [x-market](x-market/) | — | — | — |' '$D/docs/research/README.md'"
check "move docs: guides README added in its own commit" \
  sh -c "test -f '$D/docs/guides/README.md' && test \"\$(git -C '$D' log --format=%s -1 -- docs/guides/README.md)\" = 'Add docs/guides/README.md'"
check "move docs: map gets ## Purpose from its Area maps line" \
  sh -c "sed -n 1,6p '$D/api/CLAUDE.md' | tr '\n' '|' | grep -qxF '# API notes||## Purpose|api||\`api/server.py\` \`api/db.py\` \`api/x/y.py\` \`web/a.ts\`|'"
check "move docs: Area maps line rewritten in place" grep -qxF -- '- api: `api/CLAUDE.md` — api' "$D/CLAUDE.md"
check "move docs: unlisted map appended, placeholder purpose warned" sh -c "
  grep -qxF -- '- ios: \`ios/CLAUDE.md\` — what ios/ owns (write this)' '$D/CLAUDE.md' &&
  grep -qxF 'warning: ios/CLAUDE.md: no purpose found; placeholder written' '$T/dmove'"
check "move docs: prose Area maps line keeps its text, path rewritten" \
  grep -qxF 'Read a map first (see README.md); iOS notes are in ios/CLAUDE.md for now.' "$D/CLAUDE.md"
check "move docs: no basename warning for README.md (other READMEs share it)" sh -c "! grep -q '^warning: .*: README.md\$' '$T/dmove'"
check "move docs: stale FEATURES.md regenerated in a last commit" sh -c "
  '$HERE/../implement-prd-section/scripts/features.sh' --check '$D' >/dev/null &&
  test \"\$(git -C '$D' log -1 --format=%s)\" = 'Regenerate docs/FEATURES.md'"
check "move docs: one commit per map" \
  test "$(git -C "$D" log --format=%s --grep='area map$' | tr '\n' ,)" = "Make ios/CLAUDE.md the ios area map,Make api/CLAUDE.md the api area map,"
check "move docs: measure row printed per map" test "$(grep -c '^measure ' "$T/dmove")" = 2
check "move docs: worktree clean" test -z "$(git -C "$D" status --porcelain)"
"$MOVE" "$D" >"$T/dmove2" 2>&1; RC=$?
check "move docs: re-run is a no-op" sh -c "test $RC = 0 && test -z \"\$(git -C '$D' status --porcelain)\" && ! grep -q '^map \|^add ' '$T/dmove2'"

# --- Without gh: branch evidence, said once; read-only; deterministic ------
check "no gh: note printed once" test "$(grep -c 'gh unavailable — branch evidence only' "$O")" = 1
"$INV" "$R/docs" >"$T/out2" 2>&1
check "deterministic: second run (from a subdir) byte-identical" cmp -s "$T/out1" "$T/out2"
check "read-only: worktree clean" test -z "$(git -C "$R" status --porcelain)"

# --- With gh: PR evidence; open PR keeps the basename ----------------------
GH_MODE=json "$INV" "$R" >"$T/out3" 2>&1
check "gh: no note" sh -c "! grep -q 'gh unavailable' '$T/out3'"
check "gh: PRs listed in number order" \
  sh -c "grep -F '| docs/Billing_Flow.md |' '$T/out3' | grep -qF '| PR #2 merged; PR #4 open |'"
check "gh: DRAFT + merged PR -> partial, open PR keeps basename" \
  sh -c "grep -F '| docs/Billing_Flow.md |' '$T/out3' | grep -qF '| partial | docs/prd/Billing_Flow.md — name kept: open PR #4 |'"

# --- --plan: same rows, and the plan file is never a candidate ------------
"$INV" --plan "$R" >"$T/plan" 2>&1
check "plan: has the rows" sh -c "grep '^| [a-z]' '$T/plan' | grep -vc '| doc:' | grep -qx 10 && grep -c '| doc:' '$T/plan' | grep -qx 2"
check "plan: no Status line" sh -c "! head -5 '$T/plan' | grep -q Status"
cp "$T/plan" "$R/docs/prd/migration-plan.md"
"$INV" "$R" >"$T/out4" 2>&1
check "plan: not inventoried once written" sh -c "! grep -qF 'migration-plan.md |' '$T/out4'"
git -C "$R" checkout -q -- docs/prd/migration-plan.md

# --- Move: references to old paths, an index, the plan on its branch -------
mkdir -p "$R/src"
printf '# API\n' >"$R/src/api.md"
printf '[api](../src/api.md) and [self](#goals)\n' >>"$R/design/Onboarding PRD.md"
printf 'See docs/goals.md and [onb](design/Onboarding%%20PRD.md) and [s](/search-prd.md).\n' >"$R/CLAUDE.md"
printf '[goals](goals.md#x) [search](../search-prd.md) [web](https://example.com/o/r/blob/main/docs/goals.md)\n[ref]: ./export.md\n' >"$R/docs/index.md"
printf '# spec: docs/Billing_Flow.md\n# not: mydocs/Billing_Flow.md\n' >"$R/src/code.py"
printf '# Research\n\n## Index\n| Research | Question | Researched | Informs |\n|---|---|---|---|\n' >"$R/docs/research/README.md"
printf '# PRDs\n\n## Index (open changes only)\n| PRD | Status | Owner surfaces |\n|---|---|---|\n| (none yet) | | |\n\n## Template\n' >"$R/docs/prd/README.md"
git -C "$R" rm -q docs/prd/migration-plan.md; commit_all "$R" "refs"
git -C "$R" switch -qc chore/migrate-prds-move
"$INV" --plan "$R" >"$R/docs/prd/migration-plan.md"; commit_all "$R" "Add PRD migration plan"
BEFORE_ONB="$(git -C "$R" log --format=%s -- "design/Onboarding PRD.md" | sort | tr '\n' ,)"
cp "$R/docs/prd/migration-plan.md" "$T/plan-committed"

"$MOVE" -n "$R" >"$T/dry" 2>&1; RC=$?
check "move -n: exit 0" test "$RC" = 0
check "move -n: changes nothing" sh -c "test -z \"\$(git -C '$R' status --porcelain)\" && test \"\$(git -C '$R' log -1 --format=%s)\" = 'Add PRD migration plan'"
check "move -n: lists moves" grep -qxF 'move    docs/goals.md -> docs/prd/goals.md' "$T/dry"
echo x >>"$R/docs/notes.md"
"$MOVE" "$R" >/dev/null 2>&1; RC=$?
check "move: dirty worktree refused (exit 2)" test "$RC" = 2
git -C "$R" checkout -q -- docs/notes.md

"$MOVE" "$R" >"$T/move" 2>&1; RC=$?
check "move: exit 0" test "$RC" = 0
check "move: on chore/migrate-prds-move" test "$(git -C "$R" branch --show-current)" = chore/migrate-prds-move
check "move: four commits" test "$(git -C "$R" log --format=%s 'HEAD~4..HEAD' | tr '\n' ,)" = "Index moved research in docs/research/README.md,Index migrated PRDs in docs/prd/README.md,Rewrite links to moved PRDs,Move PRDs into docs/prd (moves only),"
MC="$(git -C "$R" log --format=%H --grep='moves only' -1)"
check "move commit: pure renames (R100 only)" sh -c "git -C '$R' diff --name-status -M100% $MC^ $MC | grep -v '^R100' | grep -q . && exit 1 || exit 0"
check "move commit: 7 renames" test "$(git -C "$R" diff --name-status -M $MC^ $MC | grep -c '^R')" = 7
check "moved: research-model -> docs/research/model.md" sh -c "test ! -e '$R/docs/prd/research-model.md' && test -f '$R/docs/research/model.md'"
check "research index: one row" grep -qxF '| [model](model.md) | — | — | — |' "$R/docs/research/README.md"
for pair in "docs/goals.md docs/prd/goals.md" "docs/export.md docs/prd/export.md" "docs/sync.md docs/prd/sync.md" \
  "search-prd.md docs/prd/search-prd.md" "docs/Billing_Flow.md docs/prd/billing-flow.md"; do
  set -- $pair
  check "moved: $1 -> $2" sh -c "test ! -e '$R/$1' && test -f '$R/$2'"
done
check "moved: onboarding (spaces in name)" sh -c "test ! -e '$R/design/Onboarding PRD.md' && test -f '$R/docs/prd/onboarding.md'"
check "history: git log --follow keeps every commit" \
  test "$(git -C "$R" log --follow --format=%s -- docs/prd/onboarding.md | grep -v '^Move PRDs\|^Rewrite links' | sort | tr '\n' ,)" = "$BEFORE_ONB"
check "unknown stays put and is listed" sh -c "test -f '$R/docs/notes.md' && grep -qxF 'unknown (not moved): docs/notes.md' '$T/move'"
check "already in docs/prd stays" test -f "$R/docs/prd/ready.md"
check "plan file untouched" cmp -s "$T/plan-committed" "$R/docs/prd/migration-plan.md"
check "links: relative from an unmoved file" grep -qF '[goals](prd/goals.md#x) [search](prd/search-prd.md)' "$R/docs/index.md"
check "links: reference definition" grep -qxF '[ref]: prd/export.md' "$R/docs/index.md"
check "links: encoded + repo-root links, plain mention" \
  grep -qxF 'See docs/prd/goals.md and [onb](docs/prd/onboarding.md) and [s](/docs/prd/search-prd.md).' "$R/CLAUDE.md"
check "links: moved file's own relative links re-resolved" grep -qF '[api](../../src/api.md) and [self](#goals)' "$R/docs/prd/onboarding.md"
check "mentions: code comment rewritten, longer path left alone" \
  sh -c "grep -qxF '# spec: docs/prd/billing-flow.md' '$R/src/code.py' && grep -qxF '# not: mydocs/Billing_Flow.md' '$R/src/code.py'"
check "mentions: rewrite report per file" grep -qxF 'rewrote CLAUDE.md (3)' "$T/move"
check "warnings: URL to an old path listed, not changed" \
  sh -c "grep -qxF 'warning: docs/index.md:1: docs/goals.md' '$T/move' && grep -qF 'blob/main/docs/goals.md' '$R/docs/index.md'"
check "warnings: only the URL and the longer-path mention" \
  test "$(grep -c '^warning: ' "$T/move")" = 2
check "no tracked file links an old path except warned lines" sh -c "
  cd '$R' && git grep -nF -e docs/goals.md -e 'design/Onboarding' -e docs/Billing_Flow.md -e docs/export.md -e docs/sync.md -- . ':!docs/prd/migration-plan.md' \
  | grep -v '^docs/index.md:1:' | grep -v '^src/code.py:2:' | grep -q . && exit 1 || exit 0"
check "index: rows for active/partial only, placeholder gone" sh -c "
  grep -qxF '| [billing-flow](billing-flow.md) | DRAFT | — |' '$R/docs/prd/README.md' &&
  grep -qxF '| [onboarding](onboarding.md) | APPROVED | — |' '$R/docs/prd/README.md' &&
  grep -qxF '| [ready](ready.md) | APPROVED | — |' '$R/docs/prd/README.md' &&
  grep -qxF '| [search-prd](search-prd.md) | — | — |' '$R/docs/prd/README.md' &&
  grep -qxF '| [sync](sync.md) | — | — |' '$R/docs/prd/README.md' &&
  ! grep -q '(none yet)\|goals.md\|export.md' '$R/docs/prd/README.md'"
check "index: separate commit touching only the index" \
  test "$(git -C "$R" show --name-only --format= HEAD~1)" = docs/prd/README.md
check "research index: own commit" test "$(git -C "$R" show --name-only --format= HEAD)" = docs/research/README.md
"$MOVE" "$R" >"$T/move2" 2>&1; RC=$?
check "move: re-run is a no-op" sh -c "test $RC = 0 && ! grep -q '^index ' '$T/move2' && test -z \"\$(git -C '$R' status --porcelain)\" && test \"\$(git -C '$R' log -1 --format=%s)\" = 'Index moved research in docs/research/README.md' && grep -q '^already moved: docs/goals.md' '$T/move2'"

# Destination already taken -> refused before anything moves.
D="$T/taken"; mkdir -p "$D/docs/prd"; git -C "$D" init -q -b main
printf '# A\nStatus: DRAFT\n' >"$D/docs/a.md"; printf '# Other\n' >"$D/docs/prd/a.md"; commit_all "$D" init
"$INV" --plan "$D" >"$D/docs/prd/migration-plan.md"; commit_all "$D" plan
"$MOVE" "$D" >"$T/taken.out" 2>&1; RC=$?
check "move: taken destination refused (exit 2), nothing moved" \
  sh -c "test $RC = 2 && test -f '$D/docs/a.md' && grep -q 'destination taken: docs/prd/a.md' '$T/taken.out'"

# FOLDED/SUPERSEDED pointers: content lives in another PRD, so move archives
# them (status unchanged, index row dropped) and fold has nothing to do.
P="$T/pointers"; mkdir -p "$P/docs/prd" "$P/docs/plans" "$P/src"; git -C "$P" init -q -b main
printf '# Home\nStatus: DRAFT\n' >"$P/docs/prd/home.md"
printf '# Rolling\nStatus: FOLDED 2026-09-29 → [home.md](home.md)\n' >"$P/docs/prd/rolling.md"
printf '# Old plan\nStatus: SUPERSEDED by docs/prd/home.md\n' >"$P/docs/plans/old.md"
printf '# see docs/prd/rolling.md §5\n' >"$P/src/w.py"
printf '# PRDs\n\n## Index\n| PRD | Status | Owner surfaces |\n|---|---|---|\n| [home](home.md) | DRAFT | — |\n| [rolling](rolling.md) | FOLDED into home.md | — |\n' >"$P/docs/prd/README.md"
commit_all "$P" init; git -C "$P" switch -qc chore/migrate-prds-move
"$INV" --plan "$P" >"$P/docs/prd/migration-plan.md"; commit_all "$P" plan
M="$(grep -F '| docs/prd/rolling.md |' "$P/docs/prd/migration-plan.md" | sed -n 's|.*docs/prd/archive/\([0-9-]*\)-rolling.md.*|\1|p')"
"$MOVE" "$P" >"$T/ptr" 2>&1; RC=$?
check "move: FOLDED/SUPERSEDED pointers archived, status unchanged" sh -c "test $RC = 0 &&
  test ! -e '$P/docs/prd/rolling.md' && sed -n 2p '$P/docs/prd/archive/$M-rolling.md' | grep -qF 'Status: FOLDED 2026-09-29' &&
  test ! -e '$P/docs/plans/old.md' && sed -n 2p '$P/docs/prd/archive/$M-old.md' | grep -qxF 'Status: SUPERSEDED by docs/prd/home.md'"
check "move: pointer's index row dropped, mentions point at the archive" sh -c "
  ! grep -q rolling '$P/docs/prd/README.md' && grep -qxF '| [home](home.md) | DRAFT | — |' '$P/docs/prd/README.md' &&
  grep -qxF '# see docs/prd/archive/$M-rolling.md §5' '$P/src/w.py'"
(cd "$P" && "$FOLD" groups) >"$T/ptrg" 2>&1
check "fold groups: archived pointers not listed" grep -qF 'Shipped PRDs to fold (oldest first): 0' "$T/ptrg"

# --- Fold: groups, claims, archive (continues on the moved fixture) ---------
fold() { (cd "$R" && "$FOLD" "$@"); }
printf '\n## Expected behavior\n1. Totals come from `goals_total`\n   every night.\n2. Exports call `missing_fn()`.\n3. Plain claim with no anchor.\n\n## Acceptance criteria\n- [ ] `goals_total` returns 0 when empty\n' >>"$R/docs/prd/goals.md"
printf 'def goals_total():\n    return 0\n' >"$R/src/goals.py"
perl -0pi -e 's/(\| \[billing-flow\][^\n]*\n)/$1| [goals](goals.md) | SHIPPED | — |\n/' "$R/docs/prd/README.md"
mkdir -p "$R/docs/specs" "$R/docs/plans"
printf '# Goals plan\nPRD: docs/prd/goals.md\n' >"$R/docs/plans/goals-implementation.md"
perl -0pi -e 's/(\| Path \|[^\n]*\n\|[-|]*\n)/$1| docs\/plans\/goals-implementation.md | — | — | 2025-03-20 | header PRD: docs\/prd\/goals.md | doc:impl-plan | merge goals |\n/' "$R/docs/prd/migration-plan.md"
printf '# Specs\n\n## Index (the feature set)\n| Spec | Capability | Owner surfaces |\n|---|---|---|\n| (none yet) | | |\n\n## Template\n' >"$R/docs/specs/README.md"
commit_all "$R" "fold fixture"
check "fold fixture: shipped PRD indexed inside ## Index" sh -c "sed -n '/^## Index/,/^## Template/p' '$R/docs/prd/README.md' | grep -qxF '| [goals](goals.md) | SHIPPED | — |'"
fold groups >"$T/groups" 2>&1; RC=$?
check "fold groups: exit 0, 2 shipped, both ungrouped" \
  sh -c "test $RC = 0 && grep -qxF 'Shipped PRDs to fold (oldest first): 2' '$T/groups' && grep -qxF 'Ungrouped: 2' '$T/groups'"
check "fold groups: row has title, created, last commit" \
  grep -qxF '| docs/prd/goals.md | Goals | 2025-03-15 | 2025-03-15 | — |' "$T/groups"
fold groups --write 'goal-tracking: docs/prd/onboarding.md' >/dev/null 2>&1; RC=$?
check "fold groups --write: non-shipped PRD refused (exit 2)" test "$RC" = 2
fold groups --write 'goal-tracking: docs/prd/goals.md, docs/prd/export.md' >"$T/gw" 2>&1; RC=$?
check "fold groups --write: recorded in the plan, placeholder gone" sh -c "test $RC = 0 &&
  grep -qxF -- '- goal-tracking: docs/prd/export.md, docs/prd/goals.md' '$R/docs/prd/migration-plan.md' &&
  ! grep -q 'fold, phase 3' '$R/docs/prd/migration-plan.md'"
fold groups --write 'other: docs/prd/goals.md' >/dev/null 2>&1; RC=$?
check "fold groups --write: PRD in two groups refused" test "$RC" = 2
commit_all "$R" "Record capability groups"
fold claims docs/prd/goals.md >"$T/claims" 2>&1; RC=$?
check "fold claims: counts" sh -c "test $RC = 0 && grep -qxF 'Claims in docs/prd/goals.md: 4 (evidence 2 · none 1 · no anchor 1)' '$T/claims'"
check "fold claims: evidence points at code, continuation joined" \
  grep -qF 'evidence  src/goals.py:1 `goals_total` — Totals come from `goals_total` every night.' "$T/claims"
check "fold claims: missing symbol -> none; no backticks -> no-anchor" \
  sh -c "grep -q '^L[0-9]* *none .*missing_fn' '$T/claims' && grep -q '^L[0-9]* *no-anchor — Plain claim' '$T/claims'"
fold archive goal-tracking >/dev/null 2>&1; RC=$?
check "fold archive: wrong branch refused (exit 2)" test "$RC" = 2
git -C "$R" switch -qc docs/migrate-prds-goal-tracking
fold archive goal-tracking >/dev/null 2>&1; RC=$?
check "fold archive: no spec refused (exit 2)" test "$RC" = 2
printf '# Goal tracking\n\n## Purpose\nx\n' >"$R/docs/specs/goal-tracking.md"
"$HERE/../implement-prd-section/scripts/features.sh" "$R" >/dev/null; commit_all "$R" "Add goal-tracking spec"
HEAD0="$(git -C "$R" rev-parse HEAD)"
fold groups >"$T/gpre" 2>&1
fold archive -n goal-tracking >"$T/adry" 2>&1; RC=$?
check "fold archive -n: lists archives, changes nothing" sh -c "test $RC = 0 &&
  grep -qxF 'archive docs/prd/goals.md -> docs/prd/archive/2025-03-goals.md (Status: SHIPPED 2025-03-15 (migrated))' '$T/adry' &&
  test \"\$(git -C '$R' rev-parse HEAD)\" = $HEAD0 && test -z \"\$(git -C '$R' status --porcelain)\""
fold archive goal-tracking >"$T/arch" 2>&1; RC=$?
check "fold archive: exit 0, moves-only commit then edits" sh -c "test $RC = 0 &&
  test \"\$(git -C '$R' log --format=%s $HEAD0..HEAD | tr '\n' ,)\" = 'Archive PRDs folded into docs/specs/goal-tracking.md,Move 3 PRDs to docs/prd/archive/ (moves only),' &&
  test -z \"\$(git -C '$R' diff --name-status -M100% HEAD~2 HEAD~1 | grep -v '^R100')\""
check "fold archive: Status replaced / inserted" sh -c "
  sed -n 2p '$R/docs/prd/archive/2025-03-goals.md' | grep -qxF 'Status: SHIPPED 2025-03-15 (migrated)' &&
  sed -n 2p '$R/docs/prd/archive/2025-03-export.md' | grep -qxF 'Status: SHIPPED 2025-03-15 (migrated)' &&
  test ! -e '$R/docs/prd/goals.md'"
check "fold groups: impl plan counted with its PRD's group" grep -qxF 'group goal-tracking: 2 PRDs (+1 impl plan), pending' "$T/gpre"
check "fold archive -n: impl plan merged beside its PRD" grep -qxF 'archive docs/plans/goals-implementation.md -> docs/prd/archive/2025-03-goals-implementation.md (Status: MERGED 2025-03-20 into docs/prd/archive/2025-03-goals.md)' "$T/adry"
check "fold archive: impl plan moved with Status MERGED" sh -c "test ! -e '$R/docs/plans/goals-implementation.md' &&
  sed -n 2p '$R/docs/prd/archive/2025-03-goals-implementation.md' | grep -qxF 'Status: MERGED 2025-03-20 into docs/prd/archive/2025-03-goals.md'"
check "fold archive: history kept (git log --follow)" \
  test "$(git -C "$R" log --follow --format=%s -- docs/prd/archive/2025-03-goals.md | grep -c 'init\|fold fixture')" = 2
check "fold archive: links rewritten to the archive" grep -qF '[goals](prd/archive/2025-03-goals.md#x)' "$R/docs/index.md"
check "fold archive: PRD index row dropped, spec row added" sh -c "
  grep -qF 'unindex docs/prd/README.md: | [goals](goals.md)' '$T/arch' && ! grep -q 'goals.md' '$R/docs/prd/README.md' &&
  grep -qxF '| [goal-tracking](goal-tracking.md) | Goal tracking | — |' '$R/docs/specs/README.md' &&
  ! grep -q '(none yet)' '$R/docs/specs/README.md'"
check "fold archive: plan kept while partial PRDs remain" \
  sh -c "grep -qxF 'plan: kept (0 shipped, 2 partial left)' '$T/arch' && test -f '$R/docs/prd/migration-plan.md'"
check "fold archive: FEATURES.md regenerated and committed" sh -c "
  '$HERE/../implement-prd-section/scripts/features.sh' --check '$R' &&
  test -z \"\$(git -C '$R' status --porcelain)\" &&
  grep -q '^| goal-tracking | SHIPPED |' '$R/docs/FEATURES.md'"
fold archive goal-tracking >"$T/arch2" 2>&1; RC=$?
check "fold archive: re-run is a no-op" sh -c "test $RC = 0 && grep -q '^already archived: docs/prd/goals.md' '$T/arch2' &&
  test \"\$(git -C '$R' log -1 --format=%s)\" = 'Archive PRDs folded into docs/specs/goal-tracking.md'"
check "fold groups: group shown done" sh -c "(cd '$R' && '$FOLD' groups) | grep -qxF 'group goal-tracking: 2 PRDs (+1 impl plan), done'"

# --- Split: partial PRDs (continues on the folded fixture) -------------------
fold splits >"$T/splits" 2>&1; RC=$?
check "fold splits: exit 0, 2 partial" sh -c "test $RC = 0 && grep -qxF 'Partial PRDs to split: 2' '$T/splits'"
fold splits --write docs/prd/goals.md x '1' >/dev/null 2>&1; RC=$?
check "fold splits --write: non-partial refused (exit 2)" test "$RC" = 2
fold splits --write docs/prd/onboarding.md onboarding '1, 2' >/dev/null 2>&1 &&
  fold splits --write docs/prd/sync.md sync-engine '1' docs/prd/sync-v2.md >/dev/null 2>&1; RC=$?
check "fold splits --write: recorded, placeholder gone" sh -c "test $RC = 0 &&
  grep -qxF -- '- docs/prd/onboarding.md: onboarding · shipped: 1, 2 · rest: docs/prd/onboarding.md' '$R/docs/prd/migration-plan.md' &&
  grep -qxF -- '- docs/prd/sync.md: sync-engine · shipped: 1 · rest: docs/prd/sync-v2.md' '$R/docs/prd/migration-plan.md' &&
  ! grep -q 'split, phase 4' '$R/docs/prd/migration-plan.md'"
printf '[s](prd/sync.md)\n' >"$R/docs/links.md"
commit_all "$R" "Record split points"
git -C "$R" switch -qc docs/migrate-prds-split-onboarding
fold split docs/prd/onboarding.md >"$T/s0" 2>&1; RC=$?
check "fold split: no spec refused (exit 2)" sh -c "test $RC = 2 && grep -q 'fold the shipped part (1, 2) into docs/specs/onboarding.md' '$T/s0'"
printf '# Onboarding\n\n## Purpose\nx\n' >"$R/docs/specs/onboarding.md"; commit_all "$R" "Add onboarding spec"
HEAD0="$(git -C "$R" rev-parse HEAD)"
fold split -n docs/prd/onboarding.md >"$T/sdry" 2>&1; RC=$?
check "fold split -n: changes nothing" sh -c "test $RC = 0 && grep -qxF 'archive docs/prd/onboarding.md -> docs/prd/archive/2025-03-onboarding.md (Status: SUPERSEDED by docs/prd/onboarding.md)' '$T/sdry' &&
  test \"\$(git -C '$R' rev-parse HEAD)\" = $HEAD0 && test -z \"\$(git -C '$R' status --porcelain)\""
fold split docs/prd/onboarding.md >"$T/s1" 2>&1; RC=$?
A="$R/docs/prd/archive/2025-03-onboarding.md"
check "fold split: moves-only commit then edits, original archived SUPERSEDED" sh -c "test $RC = 0 &&
  test \"\$(git -C '$R' log --format=%s $HEAD0..HEAD | tr '\n' ,)\" = 'Archive onboarding.md as superseded by docs/prd/onboarding.md,Move 1 PRD to docs/prd/archive/ (moves only),' &&
  sed -n 3p '$A' | grep -qxF 'Status: SUPERSEDED by docs/prd/onboarding.md' && test ! -e '$R/docs/prd/onboarding.md'"
check "fold split: archived file's own links re-resolved, others untouched" sh -c "
  grep -qF '[api](../../../src/api.md)' '$A' && grep -qF 'docs/prd/onboarding.md' '$R/CLAUDE.md'"
check "fold split: citations of the PRD path listed for repointing" sh -c "
  grep -qxF 'cite: CLAUDE.md (1)' '$T/s1' && ! grep -q '^cite: docs/prd/' '$T/s1' &&
  grep -q '^next: .*repoint' '$T/s1'"
check "fold split: history kept" test "$(git -C "$R" log --follow --format=%s -- docs/prd/archive/2025-03-onboarding.md | grep -c 'init')" = 1
check "fold split: spec indexed, next step printed" sh -c "
  grep -qxF '| [onboarding](onboarding.md) | Onboarding | — |' '$R/docs/specs/README.md' && grep -q '^next: write docs/prd/onboarding.md' '$T/s1'"
fold split --check docs/prd/onboarding.md >/dev/null 2>&1; RC=$?
check "fold split --check: missing change PRD refused" test "$RC" = 2
printf '# Onboarding v2 — PRD\nStatus: DRAFT\n\n## Spec delta\n- MODIFIED `docs/specs/onboarding.md` §Behavior 3\n\n## State\n- Sections:\n  - [x] 3. Tour\n' >"$R/docs/prd/onboarding.md"
fold split --check docs/prd/onboarding.md >"$T/c1" 2>&1; RC=$?
check "fold split --check: done items refused, nothing committed" sh -c "test $RC = 2 &&
  grep -qxF 'error: docs/prd/onboarding.md: Sections: items must all be [ ]' '$T/c1' && test \"\$(git -C '$R' log -1 --format=%s)\" = 'Archive onboarding.md as superseded by docs/prd/onboarding.md'"
printf '# Onboarding v2 — PRD\nStatus: DRAFT\n\n## Spec delta\n- MODIFIED `docs/specs/nowhere.md` §Behavior 3\n\n## State\n- Sections:\n  - [ ] 3. Tour\n' >"$R/docs/prd/onboarding.md"
fold split --check docs/prd/onboarding.md >"$T/c1b" 2>&1; RC=$?
check "fold split --check: delta naming no known spec refused" sh -c "test $RC = 2 &&
  grep -qxF 'error: docs/prd/onboarding.md: ## Spec delta names neither docs/specs/onboarding.md nor an existing or ADDED spec' '$T/c1b'"
printf '# Onboarding v2 — PRD\nStatus: DRAFT\n\n## Spec delta\n- ADDED `docs/specs/onboarding-hints.md` — whole file\n\n## State\n- Sections:\n  - [ ] 3. Tour\n  - [ ] 4. Hints\n' >"$R/docs/prd/onboarding.md"
fold split --check docs/prd/onboarding.md >"$T/c2" 2>&1; RC=$?
check "fold split --check: committed, index status updated" sh -c "test $RC = 0 &&
  test \"\$(git -C '$R' log -1 --format=%s)\" = 'Add onboarding.md change PRD for the unbuilt part' &&
  grep -qxF '| [onboarding](onboarding.md) | DRAFT | — |' '$R/docs/prd/README.md' && test -z \"\$(git -C '$R' status --porcelain)\""
check "fold split --check: plan kept while a partial is left" grep -qxF 'plan: kept (0 shipped, 1 partial left)' "$T/c2"
fold split docs/prd/onboarding.md >"$T/s2" 2>&1; RC=$?
check "fold split: re-run is a no-op" sh -c "test $RC = 0 && grep -q '^already archived: docs/prd/onboarding.md' '$T/s2' &&
  test \"\$(git -C '$R' log -1 --format=%s)\" = 'Add onboarding.md change PRD for the unbuilt part'"
# Renamed rest: references follow to the new PRD; the last split removes the plan.
git -C "$R" switch -qc docs/migrate-prds-platform  # a topic bundle branch
printf '# Sync engine\n' >"$R/docs/specs/sync-engine.md"; commit_all "$R" "Add sync-engine spec"
fold split docs/prd/sync.md >/dev/null 2>&1
printf '# Sync v2 — PRD\nStatus: APPROVED\n\n## Spec delta\n- MODIFIED `docs/specs/sync-engine.md` §Behavior 2\n\n## State\n- Sections:\n  - [ ] 2. Conflicts\n' >"$R/docs/prd/sync-v2.md"
fold split --check docs/prd/sync.md >"$T/c3" 2>&1; RC=$?
check "fold split --check (renamed): links follow, index row swapped" sh -c "test $RC = 0 &&
  grep -qxF '[s](prd/sync-v2.md)' '$R/docs/links.md' &&
  grep -qxF '| [sync-v2](sync-v2.md) | APPROVED | — |' '$R/docs/prd/README.md' && ! grep -qF '](sync.md)' '$R/docs/prd/README.md'"
check "fold split --check: last split removes the plan" sh -c "
  grep -qxF 'plan: removed (migration complete)' '$T/c3' && test ! -e '$R/docs/prd/migration-plan.md'"
"$INV" "$R" >"$T/after2" 2>&1
check "after full migration: no shipped/partial outside archive/" sh -c "
  grep '^| ' '$T/after2' | grep -v '^| Path\|^|---' | grep '| shipped |\|| partial |' | grep -v '^| docs/prd/archive/' | grep -q . && exit 1 || exit 0"

# Last fold removes the plan; a fresh inventory has no shipped/partial outside archive/.
F="$T/fold"; mkdir -p "$F/docs/specs"; git -C "$F" init -q -b main
printf '# Alpha\nStatus: SHIPPED\n' >"$F/docs/alpha.md"; printf '[a](docs/alpha.md)\n' >"$F/NOTES.md"
commit_all "$F" init
(cd "$F" && git switch -qc chore/migrate-prds-move && "$INV" --plan >docs/prd-plan.tmp && mkdir -p docs/prd && mv docs/prd-plan.tmp docs/prd/migration-plan.md && git add -A && git commit -qm plan && "$MOVE" >/dev/null &&
  "$FOLD" groups --write 'alpha: docs/prd/alpha.md' >/dev/null && git commit -qam groups && git switch -qc docs/migrate-prds-training &&
  printf '# Alpha\n' >docs/specs/alpha.md && git add -A && git commit -qm spec && "$FOLD" archive alpha) >"$T/last" 2>&1; RC=$?
check "fold archive: runs on a topic branch; last group removes the plan" sh -c "test $RC = 0 && grep -qxF 'plan: removed (migration complete)' '$T/last' && test ! -e '$F/docs/prd/migration-plan.md'"
check "fold archive: no specs README -> warning" grep -qF 'warning: no docs/specs/README.md' "$T/last"
"$INV" "$F" >"$T/after" 2>&1
check "after migration: no shipped/partial outside archive/" sh -c "
  grep '^| ' '$T/after' | grep -v '^| Path\|^|---' | grep '| shipped |\|| partial |' | grep -v '^| docs/prd/archive/' | grep -q . && exit 1 || exit 0"

# --- Reclass: partial rows found all shipped or nothing shipped ---------------
C="$T/reclass"; mkdir -p "$C/docs/prd/archive"; git -C "$C" init -q -b main
for n in built held half gone done; do printf '# %s\nStatus: BUILDING\n' "$n" >"$C/docs/prd/$n.md"; done
printf '# gone\nStatus: SUPERSEDED by docs/prd/gone.md\n' >"$C/docs/prd/archive/2025-07-gone.md"
cat >"$C/docs/prd/migration-plan.md" <<'PLAN'
# Migration plan

## Files

| Path | Status | State/Delta | Last commit | Evidence | Class | Destination |
|---|---|---|---|---|---|---|
| docs/built.md | BUILDING | — | 2025-04-02 | PR #1 merged | partial | docs/prd/built.md |
| docs/prd/held.md | ON HOLD | — | 2025-05-01 | — | partial | (in place) |
| docs/prd/half.md | APPROVED | — | 2025-06-01 | — | partial | (in place) — name kept: open branch feat/half-x |
| docs/prd/gone.md | APPROVED | — | 2025-07-01 | — | partial | (in place) |
| docs/prd/done.md | SHIPPED | — | 2025-01-01 | — | shipped | docs/prd/archive/2025-01-done.md |

## Capability groups

## Split points

- docs/prd/half.md: half · shipped: 1 · rest: docs/prd/half.md
PLAN
commit_all "$C" init
rc() { (cd "$C" && "$FOLD" reclass "$@"); }
rc docs/prd/built.md shipped >"$T/rc1" 2>&1; RC=$?
check "fold reclass shipped: row class + archive destination" sh -c "test $RC = 0 &&
  grep -qxF 'reclass docs/prd/built.md: partial -> shipped (docs/prd/archive/2025-04-built.md)' '$T/rc1' &&
  grep -qxF '| docs/built.md | BUILDING | — | 2025-04-02 | PR #1 merged | shipped | docs/prd/archive/2025-04-built.md — reclassed from partial |' '$C/docs/prd/migration-plan.md'"
check "fold reclass shipped: groups --write then takes it" sh -c "cd '$C' && '$FOLD' groups | grep -qF 'docs/prd/built.md' &&
  '$FOLD' groups --write 'built: docs/prd/built.md' >/dev/null"
rc docs/prd/held.md active >"$T/rc2" 2>&1; RC=$?
check "fold reclass active: row in place, no longer split" sh -c "test $RC = 0 &&
  grep -qxF '| docs/prd/held.md | ON HOLD | — | 2025-05-01 | — | active | docs/prd/held.md — reclassed from partial |' '$C/docs/prd/migration-plan.md' &&
  (cd '$C' && '$FOLD' splits) | grep -qxF 'Partial PRDs to split: 1'"
rc docs/prd/half.md shipped >/dev/null 2>&1; RC=$?
check "fold reclass: recorded split point dropped" sh -c "test $RC = 0 && ! grep -q '^- docs/prd/half.md:' '$C/docs/prd/migration-plan.md' &&
  grep -qF '| shipped | docs/prd/archive/2025-06-half.md — reclassed from partial |' '$C/docs/prd/migration-plan.md'"
P0="$(cat "$C/docs/prd/migration-plan.md")"
for bad in "docs/prd/done.md active" "docs/prd/gone.md shipped" "docs/prd/held.md research" "docs/prd/nope.md shipped"; do
  rc $bad >/dev/null 2>&1; RC=$?
  check "fold reclass refused (exit 2): $bad" sh -c "test $RC = 2"
done
check "fold reclass: refusals leave the plan unchanged" test "$(cat "$C/docs/prd/migration-plan.md")" = "$P0"

# --- Research: dated names, owner naming, reclassed rows, links ------------
Q="$T/research"; mkdir -p "$Q/docs/prd" "$Q/docs/plans" "$Q/docs/research"; git -C "$Q" init -q -b main
printf '# Cardio\n[a](../analysis.md) [p](plan.md)\n```\n[f](plan.md)\n```\n' >"$Q/docs/prd/research-2026-09-cardio.md"
printf '# Sept\nbody\n' >"$Q/docs/prd/research-2026-09.md"
printf '# Plan\nStatus: DRAFT\nsee [c](research-2026-09-cardio.md)\n' >"$Q/docs/prd/plan.md"
{ echo "# Legal memo"; heads; } >"$Q/docs/plans/legal.md"
mkdir -p "$Q/docs/design/rounds"; printf '# R1\n' >"$Q/docs/design/rounds/r1.md"; printf '# R2\n' >"$Q/docs/design/rounds/r2.md"
printf '# Research\n\n## Index\n| Research | Question | Researched | Informs |\n|---|---|---|---|\n' >"$Q/docs/research/README.md"
commit_all "$Q" init
"$INV" "$Q" >"$T/r1" 2>&1
check "research: YYYY-MM- dropped from the topic" \
  sh -c "grep -F '| docs/prd/research-2026-09-cardio.md |' '$T/r1' | grep -qF '| research | docs/research/cardio.md |'"
check "research: no topic left -> ?.md" \
  sh -c "grep -F '| docs/prd/research-2026-09.md |' '$T/r1' | grep -qF '| research | docs/research/?.md |'"
check "research: files in docs/research/ ignored" sh -c "! grep -q '^| docs/research/' '$T/r1'"
git -C "$Q" switch -qc chore/migrate-prds-move
"$INV" --plan "$Q" >"$Q/docs/prd/migration-plan.md"; commit_all "$Q" plan
"$MOVE" "$Q" >"$T/r2" 2>&1; RC=$?
check "research: move refuses a ?.md destination (exit 2), nothing moved" \
  sh -c "test $RC = 2 && grep -qF 'name docs/research/?.md for docs/prd/research-2026-09.md' '$T/r2' && test -f '$Q/docs/prd/research-2026-09-cardio.md'"
sed -i.bak -e 's#docs/research/?\.md#docs/research/sept.md#' \
  -e '/| docs\/plans\/legal.md |/s#| unknown | (in place) |#| research | docs/research/legal.md |#' "$Q/docs/prd/migration-plan.md"
rm "$Q/docs/prd/migration-plan.md.bak"
# A multi-file study the inventory does not list: the owner adds its rows.
awk '{ print } /^\| docs\/plans\/legal.md \|/ { for (i = 1; i <= 2; i++)
  printf "| docs/design/rounds/r%d.md | — | — | 2026-09-01 | — | research | docs/research/rounds/r%d.md |\n", i, i }' \
  "$Q/docs/prd/migration-plan.md" >"$T/plan" && mv "$T/plan" "$Q/docs/prd/migration-plan.md"
commit_all "$Q" "owner edits"
"$MOVE" "$Q" >"$T/r3" 2>&1; RC=$?
check "research: move exit 0" test "$RC" = 0
for pair in "docs/prd/research-2026-09-cardio.md docs/research/cardio.md" "docs/prd/research-2026-09.md docs/research/sept.md" "docs/plans/legal.md docs/research/legal.md"; do
  set -- $pair
  check "research moved: $1 -> $2" sh -c "test ! -e '$Q/$1' && test -f '$Q/$2'"
done
check "research: moved file's links re-resolved, broken one left" grep -qxF '[a](../analysis.md) [p](../prd/plan.md)' "$Q/docs/research/cardio.md"
check "research: fenced link untouched" grep -qxF '[f](plan.md)' "$Q/docs/research/cardio.md"
check "research: link to the moved file rewritten" grep -qxF 'see [c](../research/cardio.md)' "$Q/docs/prd/plan.md"
check "research: broken link reported with file:line" grep -qxF 'broken: docs/research/cardio.md:2: ../analysis.md' "$T/r3"
check "research: one broken line" test "$(grep -c '^broken: ' "$T/r3")" = 1
check "research: index rows for all three" sh -c "
  grep -qxF '| [cardio](cardio.md) | — | — | — |' '$Q/docs/research/README.md' &&
  grep -qxF '| [legal](legal.md) | — | — | — |' '$Q/docs/research/README.md' &&
  grep -qxF '| [sept](sept.md) | — | — | — |' '$Q/docs/research/README.md'"
check "research: study folder moved whole" sh -c "test -f '$Q/docs/research/rounds/r1.md' && test -f '$Q/docs/research/rounds/r2.md' && test ! -e '$Q/docs/design/rounds'"
check "research: one index row per study folder" sh -c "
  grep -qxF '| [rounds](rounds/) | — | — | — |' '$Q/docs/research/README.md' && ! grep -q 'rounds/r[12]' '$Q/docs/research/README.md'"
check "research: git log --follow keeps history" \
  sh -c "git -C '$Q' log --follow --format=%s -- docs/research/cardio.md | grep -qx init"
check "research: no PRD index commit without a PRD README" \
  test "$(git -C "$Q" log -1 --format=%s)" = "Index moved research in docs/research/README.md"
G="$T/badres"; mkdir -p "$G/docs/prd"; git -C "$G" init -q -b main
printf '# X\n' >"$G/docs/prd/research-x.md"; commit_all "$G" init
"$INV" --plan "$G" | sed 's#docs/research/x.md#docs/prd/x.md#' >"$G/docs/prd/migration-plan.md"; commit_all "$G" plan
"$MOVE" "$G" >"$T/r4" 2>&1; RC=$?
check "research: destination outside docs/research/ refused" \
  sh -c "test $RC = 2 && grep -qF 'research destination must be under docs/research/' '$T/r4'"

# --- Section fold for reference docs (migrate-docs §3) ----------------------
F="$T/secfold"; mkdir -p "$F/docs/prd/archive" "$F/api"; git -C "$F" init -q -b main
printf '# Contracts\nThese are binding.\n\n## Sessions (plan 1 §5)\nTokens last a day.\n\n### Tokens\nOpaque.\n\n## API (all under `/v1`)\n```\nGET /v1/x\n```\n| a | b |\n|---|---|\n\n## History\nOld.\n' >"$F/docs/contracts.md"
printf '# Contract: docs/contracts.md §Sessions\n# see contracts.md §API.\n# docs/contracts.md §"Tokens" too\n# docs/contracts.md §History\n# docs/contracts.md §Nope\n' >"$F/api/server.py"
printf '[c](contracts.md) and [c2](contracts.md) §API\n' >"$F/docs/notes.md"
printf 'See docs/contracts.md for contracts.\nQuoted from docs/contracts.md:4 once.\n' >"$F/README.md"
printf '# Old\nStatus: SHIPPED\nUses docs/contracts.md §API.\n' >"$F/docs/prd/archive/2024-01-old.md"
commit_all "$F" init
git -C "$F" switch -qc docs/migrate-prds-api
"$INV" --plan "$F" >"$F/docs/prd/migration-plan.md"; commit_all "$F" "Add PRD migration plan"
sf() { (cd "$F" && "$FOLD" "$@"); }
check "sections fixture: contracts.md is a fold row" grep -qF '| docs/contracts.md |' "$F/docs/prd/migration-plan.md"
sf sections docs/contracts.md >"$T/sec" 2>&1; RC=$?
check "sections: exit 0, counts" sh -c "test $RC = 0 && grep -qF 'Sections in docs/contracts.md: 3 (' '$T/sec' && grep -qF '; 9 citations: 5 anchored, 2 bare, 2 unresolved)' '$T/sec'"
check "sections: ### citation counts under its ## parent, proposal from heading" \
  sh -c "grep -q '^| L4-[0-9]* | ~[0-9]* | 2 | Sessions (plan 1 §5) | sessions (proposed) |\$' '$T/sec'"
check "sections: history proposed drop" sh -c "grep -q '| 1 | History | drop (proposed) |\$' '$T/sec'"
check "sections: unresolved citation listed" grep -qxF 'unresolved: api/server.py:5: docs/contracts.md §Nope' "$T/sec"
check "sections: read-only" test -z "$(git -C "$F" status --porcelain)"
sf sections --write docs/contracts.md 'Sessions: sessions' >"$T/secw0" 2>&1; RC=$?
check "sections --write: unmapped heading refused (exit 2)" sh -c "test $RC = 2 && grep -qF 'unmapped: API (all under' '$T/secw0'"
sf sections --write docs/contracts.md 'Sessions: sessions' 'API: api' 'History: drop' >/dev/null 2>&1; RC=$?
check "sections --write: ## Sections rows recorded" sh -c "test $RC = 0 &&
  grep -qxF '| docs/contracts.md | Sessions (plan 1 §5) | sessions |' '$F/docs/prd/migration-plan.md' &&
  grep -qxF '| docs/contracts.md | History | drop |' '$F/docs/prd/migration-plan.md'"
commit_all "$F" "Record sections"
sf extract docs/contracts.md API >"$T/ext" 2>&1
sed -n '10,16p' "$F/docs/contracts.md" >"$T/ext.want"
check "extract: section verbatim (code block and table)" cmp -s "$T/ext.want" "$T/ext"
cmp -s "$T/ext.want" "$T/ext" || diff "$T/ext.want" "$T/ext" | sed 's/^/  extract diff: /'
sf archive-doc docs/contracts.md >"$T/ad0" 2>&1; RC=$?
check "archive-doc: refused before specs exist and citations move" \
  sh -c "test $RC = 2 && grep -qF 'docs/specs/sessions.md (for Sessions (plan 1 §5)) does not exist' '$T/ad0' && grep -qF 'run relink.sh --sections docs/contracts.md' '$T/ad0'"
(cd "$F" && "$RELINK" --sections docs/contracts.md) >"$T/rs" 2>&1; RC=$?
check "relink --sections: exit 1 with unresolved and dropped citations listed" sh -c "test $RC = 1 &&
  grep -qxF 'unresolved: api/server.py:4: docs/contracts.md §History (dropped)' '$T/rs' &&
  grep -qxF 'unresolved: api/server.py:5: docs/contracts.md §Nope' '$T/rs' &&
  grep -qxF 'unresolved: README.md:2: docs/contracts.md:4' '$T/rs' && grep -qxF 'Quoted from docs/contracts.md:4 once.' '$F/README.md'"
check "relink --sections: anchored citations retargeted" sh -c "
  sed -n 1,3p '$F/api/server.py' | tr '\n' '|' | grep -qxF '# Contract: docs/specs/sessions.md|# see docs/specs/api.md.|# docs/specs/sessions.md too|'"
check "relink --sections: links relative, bare mentions -> the doc's main spec (tie: first)" sh -c "
  grep -qxF '[c](specs/sessions.md) and [c2](specs/api.md)' '$F/docs/notes.md' &&
  grep -qxF 'See docs/specs/sessions.md for contracts.' '$F/README.md'"
check "relink --sections: archive untouched" grep -qxF 'Uses docs/contracts.md §API.' "$F/docs/prd/archive/2024-01-old.md"
mkdir -p "$F/docs/specs"; printf '# Sessions\n\n## Purpose\nx\n' >"$F/docs/specs/sessions.md"; printf '# API\n\n## Purpose\nx\n' >"$F/docs/specs/api.md"
commit_all "$F" "Fold contracts sections into specs"
sf archive-doc -n docs/contracts.md >"$T/adn" 2>&1; RC=$?
check "archive-doc -n: prints, changes nothing" sh -c "test $RC = 0 && grep -qF 'archive docs/contracts.md -> docs/prd/archive/2025-03-contracts.md' '$T/adn' && test -f '$F/docs/contracts.md'"
sf archive-doc docs/contracts.md >"$T/ad" 2>&1; RC=$?
check "archive-doc: exit 0, Status FOLDED into the specs" sh -c "test $RC = 0 &&
  sed -n 2p '$F/docs/prd/archive/2025-03-contracts.md' | grep -qxF \"Status: FOLDED \$(date +%F) into docs/specs/sessions.md, docs/specs/api.md\""
check "archive-doc: moves-only commit keeps history" \
  test "$(git -C "$F" log --follow --format=%s -- docs/prd/archive/2025-03-contracts.md | tail -1)" = init
check "archive-doc: leftover citations point at the archive" sh -c "grep -qxF '# docs/prd/archive/2025-03-contracts.md §Nope' '$F/api/server.py' &&
  grep -qxF 'Quoted from docs/prd/archive/2025-03-contracts.md:4 once.' '$F/README.md'"
check "archive-doc: last fold row removes the plan" sh -c "test ! -e '$F/docs/prd/migration-plan.md' && grep -qxF 'plan: removed (migration complete)' '$T/ad'"

# Numbered headings: numeric refs and `plan N` qualifiers (defect 19)
N="$T/numsec"; mkdir -p "$N/docs/prd"; git -C "$N" init -q -b main
printf '# Plan\n\n## 1. Auth\na\n\n## 2. Injection\nb\n\n## 3. Tokens\nc\n' >"$N/docs/plan.md"
printf '# Migration plan\n\n## Sections\n| Doc | Section | Target |\n|---|---|---|\n| docs/plan.md | 1. Auth | security |\n| docs/plan.md | 2. Injection | security |\n| docs/plan.md | 3. Tokens | llm |\n' >"$N/docs/prd/migration-plan.md"
printf '# Notes\n\n## Tokens (docs/plan.md §3)\nx\n' >"$N/docs/notes.md"
printf '# a (docs/plan.md §1.3): x\n# b (docs/plan.md plan 3 §4-6).\n# c docs/plan.md §1.3, §2.6 here\n# d docs/plan.md §3\n# e docs/plan.md plan 9 y\n' >"$N/app.py"
commit_all "$N" init
(cd "$N" && "$RELINK" --sections docs/plan.md) >"$T/rn" 2>&1; RC=$?
check "relink --sections: numbered refs consumed whole, plan N picks its section" sh -c "test $RC = 1 &&
  sed -n 1,2p '$N/app.py' | tr '\n' '|' | grep -qxF '# a (docs/specs/security.md): x|# b (docs/specs/llm.md).|' &&
  sed -n 4,5p '$N/app.py' | tr '\n' '|' | grep -qxF '# d docs/specs/llm.md|# e docs/specs/security.md plan 9 y|'"
check "relink --sections: a chain over two sections is unresolved, left as is" sh -c "
  grep -qxF 'unresolved: app.py:3: docs/plan.md §1.3, §2.6' '$T/rn' && grep -qxF '# c docs/plan.md §1.3, §2.6 here' '$N/app.py'"
check "relink --sections: a citation in a markdown heading is listed, never rewritten" sh -c "
  grep -qxF 'unresolved: docs/notes.md:3: docs/plan.md §3 (heading)' '$T/rn' && grep -qxF '## Tokens (docs/plan.md §3)' '$N/docs/notes.md'"

# --- relink.sh: standalone, after a manual git mv --------------------------
L="$T/relink"; mkdir -p "$L/docs/prd"; git -C "$L" init -q -b main
printf '# A\n[b](b.md) [gone](nope.md) [web](https://x.y/a.md) [top](#a)\n' >"$L/docs/a.md"
printf '# B\n[a](a.md)\n' >"$L/docs/b.md"; commit_all "$L" init
mkdir -p "$L/docs/research"; git -C "$L" mv docs/a.md docs/research/a.md
START=$(python3 -c 'import time; print(time.time())')
(cd "$L" && "$RELINK" docs/a.md docs/research/a.md) >"$T/rl" 2>&1; RC=$?
SECS=$(python3 -c "import time; print(round(time.time() - $START, 2))")
check "relink: exit 1 when a broken link is reported" test "$RC" = 1
check "relink: links in and to the moved file" sh -c "
  grep -qxF '[b](../b.md) [gone](nope.md) [web](https://x.y/a.md) [top](#a)' '$L/docs/research/a.md' &&
  grep -qxF '[a](research/a.md)' '$L/docs/b.md'"
check "relink: reports rewrites and the broken link" sh -c "
  grep -qxF 'rewrote docs/b.md (1)' '$T/rl' && grep -qxF 'broken: docs/research/a.md:2: nope.md' '$T/rl'"
check "relink: < 1 s per move (took ${SECS}s)" python3 -c "import sys; sys.exit(0 if $SECS < 1 else 1)"
(cd "$L" && "$RELINK" docs/a.md) >/dev/null 2>&1; RC=$?
check "relink: odd argument count is a usage error (exit 2)" test "$RC" = 2

# --- Errors -----------------------------------------------------------------
mkdir -p "$T/nogit"
"$INV" "$T/nogit" >/dev/null 2>&1; RC=$?
check "not a git repo: exit 2" test "$RC" = 2

# --- Performance: 100 PRDs < 2 s (gh stub fails fast) ----------------------
P="$T/perf"; mkdir -p "$P/docs"; git -C "$P" init -q -b main
for i in $(seq 1 100); do { echo "# Feature $i"; echo "Status: APPROVED"; heads; } >"$P/docs/feature-$i.md"; done
commit_all "$P" init
for i in $(seq 1 20); do git -C "$P" branch "feat/feature-$i-x" 2>/dev/null; done
START=$(python3 -c 'import time; print(time.time())')
"$INV" "$P" >"$T/out5" 2>&1
SECS=$(python3 -c "import time; print(round(time.time() - $START, 2))")
check "perf: 100 candidates" grep -qF 'PRD inventory: 100 candidates' "$T/out5"
check "perf: inventory of 100 PRDs < 2 s (took ${SECS}s)" python3 -c "import sys; sys.exit(0 if $SECS < 2 else 1)"

# Every heredoc in the template's scripts is closed: bash 5 (CI) warns on
# stderr when one runs to end of file, bash 3.2 (macOS) does not.
TOP="$(cd "$HERE/../../.." && pwd)"
(cd "$TOP" && git ls-files '*.sh' | xargs awk '
  FNR == 1 { if (want != "") print prev ":" at ": <<" want " never closed"; want = ""; prev = FILENAME }
  want != "" { if ($0 == want) want = ""; next }
  match($0, /<<-?\x27?[A-Za-z_]+\x27?[ \t]*($|[;|&)>])/) {
    s = substr($0, RSTART, RLENGTH); gsub(/<<-?|\x27|[ \t;|&)>]/, "", s); want = s; at = FNR }
  END { if (want != "") print prev ":" at ": <<" want " never closed" }') >"$T/heredocs"
check "scripts: every heredoc has its terminator line" test ! -s "$T/heredocs"
sed 's/^/  /' "$T/heredocs"

echo "$PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
