#!/usr/bin/env bash
# Tests for claude-home/adopt.sh and the shared claude-home/lib/gh-settings.sh
# (docs/specs/adopt.md invariants). Run: scripts/quiet-check.sh adopt
# Throwaway repos under a temp dir; `gh` is a stub on PATH that logs its calls.
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TPL="$(dirname "$HERE")"
ADOPT="$HERE/adopt.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.com GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.com

# gh stub: `repo view` prints o/r, `api` logs and exits $GH_API_RC, `pr view`
# fails (no open PR), `pr list --head $GH_PR_HEAD` prints $GH_PR_STATES (one
# per line; --state open keeps OPEN only), rest ok.
mkdir -p "$T/bin"
cat >"$T/bin/gh" <<'SH'
#!/usr/bin/env bash
echo "gh $*" >>"$GH_LOG"
case "$1 $2" in
  "repo view") echo "o/r" ;;
  "pr view") exit 1 ;;
  "pr list")
    if [ -n "${GH_PR_HEAD:-}" ] && [[ " $* " == *" --head $GH_PR_HEAD "* ]]; then
      for st in ${GH_PR_STATES:-}; do
        if [[ " $* " != *" --state open "* ]] || [ "$st" = OPEN ]; then echo "$st"; fi
      done
    fi ;;
  "api "*) case "$*" in *"--input -"*) cat >/dev/null ;; esac; exit "${GH_API_RC:-0}" ;;
esac
exit 0
SH
chmod +x "$T/bin/gh"
export PATH="$T/bin:$PATH" GH_LOG="$T/gh.log"

PASS=0 FAIL=0
ok() { PASS=$((PASS + 1)); echo "PASS: $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }
check() { local name="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$name"; else bad "$name"; fi; }
new_repo() {  # new_repo <dir> [branch]
  mkdir -p "$1"; git -C "$1" init -q -b "${2:-main}"; echo "# x" >"$1/README.md"
  git -C "$1" add -A; git -C "$1" commit -qm init
}
commit_all() { git -C "$1" add -A; git -C "$1" commit -qm "$2"; }
table() { grep -E '^  (created|merged|updated|skipped|warned|unchanged) ' "$1"; }
README_LINE='- `docs/README.md` — where each kind of doc goes; doc-lint enforces it in CI.'
export README_LINE
MANAGED='# managed by llm-repo-template adopt; edit it there'

# --- 1. Empty repo: everything created, no template-only lines ------------
R="$T/my-app"; new_repo "$R"
START=$(python3 -c 'import time; print(time.time())')
"$ADOPT" "$R" --no-github --no-pr >"$T/out1" 2>&1; RC=$?
SECS=$(python3 -c "import time; print(round(time.time() - $START, 2))")
check "empty: exit 0" test "$RC" = 0
for f in scripts/quiet-check.sh docs/README.md docs/prd/README.md docs/prd/archive/.gitkeep docs/specs/README.md docs/research/README.md \
  .github/pull_request_template.md .github/workflows/ci.yml .claude/settings.json .gitignore CLAUDE.md \
  docs/prd/repo-setup.md docs/FEATURES.md scripts/prd-lint.sh scripts/features.sh scripts/doc-lint.sh; do
  check "empty: created $f" grep -qxE "  created +$f" "$T/out1"
done
check "empty: on $(basename "$R") branch chore/adopt-llm-template" test "$(git -C "$R" branch --show-current)" = chore/adopt-llm-template
check "empty: one commit 'Adopt llm-repo-template'" test "$(git -C "$R" log -1 --format=%s)" = "Adopt llm-repo-template"
check "empty: commit body lists actions" sh -c "git -C '$R' log -1 --format=%b | grep -q 'created   CLAUDE.md'"
check "empty: tree clean after commit" test -z "$(git -C "$R" status --porcelain)"
check "empty: main untouched" test "$(git -C "$R" rev-list --count main)" = 1
check "empty: repo map points at docs/specs" grep -q '^- `docs/specs/`' "$R/CLAUDE.md"
check "empty: repo map points at docs/research" grep -q '^- `docs/research/`' "$R/CLAUDE.md"
check "empty: repo map points at docs/FEATURES.md" grep -q '^- `docs/FEATURES.md` — generated feature list' "$R/CLAUDE.md"
check "empty: FEATURES.md current and committed" sh -c "'$TPL/claude-home/skills/implement-prd-section/scripts/features.sh' --check '$R' && git -C '$R' ls-files --error-unmatch docs/FEATURES.md"
check "empty: repo map names docs/README.md once" sh -c "test \$(grep -c 'docs/README.md' '$R/CLAUDE.md') = 1 && grep -qxF -- \"\$README_LINE\" '$R/CLAUDE.md'"
check "empty: no repo map note for the skeleton" sh -c "! grep -q 'Add to the CLAUDE.md repo map' '$T/out1'"
check "empty: setup §1 names docs/specs" grep -q 'naming `docs/prd/` and `docs/specs/`' "$R/docs/prd/repo-setup.md"
check "empty: setup §3 maps what the owner picks" grep -q 'each one the owner picks' "$R/docs/prd/repo-setup.md"
check "empty: setup acceptance does not map every candidate" sh -c "! grep -q 'recommends has a map' '$R/docs/prd/repo-setup.md'"
check "empty: no {{PROJECT}}" sh -c "! grep -rq '{{PROJECT}}' '$R/CLAUDE.md'"
check "empty: project name filled" grep -q '^# CLAUDE.md — my-app' "$R/CLAUDE.md"
check "empty: no template-only lines" sh -c "! grep -q 'session-analyzer\|claude-home/\|adopt|' '$R/scripts/quiet-check.sh' '$R/CLAUDE.md' '$R/.github/workflows/ci.yml'"
check "empty: no template-only CI step" sh -c "! grep -q 'template-only' '$R/.github/workflows/ci.yml'"
check "empty: CI keeps upload step" grep -q 'upload-artifact' "$R/.github/workflows/ci.yml"
check "empty: PRD index emptied but for setup" sh -c "! grep '^| \[' '$R/docs/prd/README.md' '$R/docs/specs/README.md' '$R/docs/research/README.md' | grep -vq 'repo-setup.md'"
check "empty: deny uses default branch" grep -q '"Bash(git push origin main:\*)"' "$R/.claude/settings.json"
check "empty: quiet-check executable" test -x "$R/scripts/quiet-check.sh"
"$R/scripts/quiet-check.sh" list >"$T/list" 2>&1
check "empty: quiet-check.sh list runs" grep -q '^targets:' "$T/list"
check "empty: doc-lint 0 violations" "$TPL/claude-home/skills/implement-prd-section/scripts/doc-lint.sh" "$R"
check "empty: no warnings" sh -c "! grep -q WARN '$T/out1'"
check "empty: next steps are one line" test "$(grep -c '' <(sed -n '/^next:/,$p' "$T/out1"))" = 1
check "empty: next step points at setup PRD" grep -q '^next: after merging, run /implement-prd-section docs/prd/repo-setup.md' "$T/out1"
check "empty: no PRD hint" sh -c "! grep -q 'without State' '$T/out1'"
SP="$R/docs/prd/repo-setup.md"
check "setup: Status APPROVED (adopt)" grep -qE '^Status: APPROVED [0-9-]+ \(adopt\)' "$SP"
check "setup: 3 todo items" test "$(grep -c '^  - \[ \] ' "$SP")" = 3
check "setup: no migrate section" sh -c "! grep -q 'Migrate PRDs' '$SP'"
check "setup: no placeholders" sh -c "! grep -q '{{' '$SP'"
check "setup: spec delta none" grep -q '^none — setup only' "$SP"
check "setup: index row" grep -q '^| \[repo-setup\](repo-setup.md) | APPROVED' "$R/docs/prd/README.md"
check "setup: CLAUDE.md ends with the pointer" sh -c "tail -1 '$R/CLAUDE.md' | grep -q '<!-- prd-pointer: docs/prd/repo-setup.md -->\$'"
check "setup: exactly one pointer" test "$(grep -c 'prd-pointer:' "$R/CLAUDE.md")" = 1
# CI linters (docs/prd/repo-guards.md §1)
for f in prd-lint.sh features.sh doc-lint.sh; do
  check "linters: $f executable, managed line 2" sh -c "test -x '$R/scripts/$f' && sed -n 2p '$R/scripts/$f' | grep -qxF '$MANAGED'"
done
check "linters: targets in the TARGETS block" sh -c "grep -qxF 'prd-lint|.|bash scripts/prd-lint.sh|generic' '$R/scripts/quiet-check.sh' && grep -qxF 'doc-lint|.|bash scripts/doc-lint.sh|generic' '$R/scripts/quiet-check.sh' && '$R/scripts/quiet-check.sh' list | grep -q '^  doc-lint  (.)'"
check "linters: CI_TARGETS runs both" grep -q '^      CI_TARGETS: "prd-lint doc-lint"' "$R/.github/workflows/ci.yml"
check "linters: prd-lint target passes" "$R/scripts/quiet-check.sh" prd-lint
check "linters: doc-lint target passes" "$R/scripts/quiet-check.sh" doc-lint
check "perf: full run <5s (took ${SECS}s)" python3 -c "import sys; sys.exit(0 if $SECS < 5 else 1)"

# --- 2. Second run: nothing to adopt, no commit ----------------------------
HEAD1="$(git -C "$R" rev-parse HEAD)"
"$ADOPT" "$R" --no-github --no-pr >"$T/out2" 2>&1; RC=$?
check "rerun: exit 0" test "$RC" = 0
check "rerun: says nothing to adopt" grep -q 'nothing to adopt' "$T/out2"
check "rerun: all unchanged" sh -c "! table '$T/out2' | grep -vq ' unchanged '"
check "rerun: no commit" test "$(git -C "$R" rev-parse HEAD)" = "$HEAD1"
check "rerun: no diff" test -z "$(git -C "$R" status --porcelain)"
git -C "$R" switch -q main
check "rerun on main after merge: nothing to adopt" sh -c "git -C '$R' merge -q chore/adopt-llm-template && '$ADOPT' '$R' --no-github --no-pr | grep -q 'nothing to adopt' && test \$(git -C '$R' branch --show-current) = main"

# --- 2b. Linters on re-run: managed copy updated, fork warned, target merged
echo "# local edit" >>"$R/scripts/doc-lint.sh"
sed -i.bak 2d "$R/scripts/features.sh"; rm "$R/scripts/features.sh.bak"; cp "$R/scripts/features.sh" "$T/fork"
grep -v '^doc-lint|' "$R/scripts/quiet-check.sh" >"$T/qc"; cat "$T/qc" >"$R/scripts/quiet-check.sh"
commit_all "$R" "drift"
"$ADOPT" "$R" --no-github --no-pr >"$T/out2b" 2>&1
check "rerun: managed copy updated" sh -c "grep -qE '^  updated +scripts/doc-lint.sh' '$T/out2b' && ! grep -q 'local edit' '$R/scripts/doc-lint.sh'"
check "rerun: fork warned, kept" sh -c "grep -qE '^  warned +scripts/features.sh' '$T/out2b' && grep -q 'WARN: scripts/features.sh has no managed line' '$T/out2b' && cmp -s '$T/fork' '$R/scripts/features.sh'"
check "rerun: missing target merged back once" sh -c "grep -qE '^  merged +scripts/quiet-check.sh' '$T/out2b' && test \$(grep -c '^doc-lint|' '$R/scripts/quiet-check.sh') = 1 && test \$(grep -c '^prd-lint|' '$R/scripts/quiet-check.sh') = 1"
mkdir -p "$R/notes"; echo "# design" >"$R/notes/design.md"
(cd "$R" && scripts/quiet-check.sh doc-lint) >"$T/dl" 2>&1; RC=$?
check "misplaced doc: doc-lint target exits 1, names the file" sh -c "test $RC = 1 && grep -q 'notes/design.md:1: misplaced doc' '$T/dl'"
rm -r "$R/notes"

# --- 3. Dry run: same table, writes nothing --------------------------------
D="$T/dry"; new_repo "$D"
"$ADOPT" "$D" --dry-run >"$T/dry.out" 2>&1; RC=$?
check "dry: exit 0" test "$RC" = 0
check "dry: nothing written" test -z "$(git -C "$D" status --porcelain --untracked-files=all)"
check "dry: no branch" sh -c "! git -C '$D' show-ref -q --verify refs/heads/chore/adopt-llm-template"
check "dry: no gh calls" test ! -s "$GH_LOG"
"$ADOPT" "$D" --no-github --no-pr >"$T/real.out" 2>&1
table "$T/dry.out" >"$T/t-dry"; table "$T/real.out" >"$T/t-real"
check "dry: same table as real run" sh -c "test -s '$T/t-dry' && cmp -s '$T/t-dry' '$T/t-real'"

# --- 4. Existing repo: only appends and merges ----------------------------
E="$T/existing"; new_repo "$E" master
{ echo "# CLAUDE.md"; echo "## Repo map (top)"; echo "- app/"; echo "## Git"; echo "rules";
  echo "## Agents: when"; for i in $(seq 1 150); do echo "line $i"; done; } >"$E/CLAUDE.md"
printf 'node_modules/\n.env' >"$E/.gitignore"   # no trailing newline
mkdir -p "$E/.claude" "$E/.github/workflows"
cat >"$E/.claude/settings.json" <<'JSON'
{
  "model": "opus",
  "permissions": {
    "allow": ["Bash(npm test:*)", "Bash(git status:*)"],
    "ask": ["Bash(rm:*)"]
  },
  "env": {"A": "1"}
}
JSON
echo "name: test" >"$E/.github/workflows/test.yml"
commit_all "$E" existing
for f in CLAUDE.md .gitignore .claude/settings.json .github/workflows/test.yml; do cp "$E/$f" "$T/orig-$(basename "$f")"; done
"$ADOPT" "$E" --no-github --no-pr >"$T/out4" 2>&1; RC=$?
check "existing: exit 0" test "$RC" = 0
grep -vxF -- "$README_LINE" "$E/CLAUDE.md" >"$T/c4"
check "existing: CLAUDE.md original bytes kept as prefix, bar the README line" sh -c "head -c \$(wc -c <'$T/orig-CLAUDE.md') '$T/c4' | cmp -s - '$T/orig-CLAUDE.md'"
check "existing: README line ends the existing repo map" sh -c "sed -n 4p '$E/CLAUDE.md' | grep -qxF -- \"\$README_LINE\" && test \$(grep -c 'docs/README.md' '$E/CLAUDE.md') = 1"
check "existing: Repo map not re-added (prefix match)" test "$(grep -c '^## Repo map' "$E/CLAUDE.md")" = 1
for h in "## Area maps" "## Commands" "## Performance budgets" "## Hard gotchas" "## Don'ts"; do
  check "existing: appended $h" grep -qxF "$h" "$E/CLAUDE.md"
done
check "existing: CLAUDE.md merged" grep -qE '^  merged +CLAUDE.md' "$T/out4"
check "existing: repo map note, CLAUDE.md not edited for it" sh -c "grep -qxF -- '  - \`docs/FEATURES.md\` — generated feature list and lifecycle state; read it before proposing a PRD or answering what exists.' '$T/out4' && ! grep -q FEATURES '$E/CLAUDE.md'"
check "existing: FEATURES.md created" grep -qE '^  created +docs/FEATURES.md' "$T/out4"
check "existing: warns oversized CLAUDE.md" grep -q 'WARN: CLAUDE.md is 156 lines' "$T/out4"
check "existing: warns global headings by name" grep -q 'WARN: CLAUDE.md has global-rule headings (## Git, ## Agents: when)' "$T/out4"
check "existing: .gitignore appended" sh -c "printf '%s\n' 'node_modules/' '.env' 'ops/logs/' | cmp -s - '$E/.gitignore'"
check "existing: workflow untouched" cmp -s "$T/orig-test.yml" "$E/.github/workflows/test.yml"
check "existing: no ci.yml added" test ! -e "$E/.github/workflows/ci.yml"
check "existing: CI snippet printed" grep -q 'scripts/quiet-check.sh "\$t"' "$T/out4"
check "existing: CI snippet sets both lint targets" grep -qF 'env: { CI_TARGETS: "prd-lint doc-lint" }' "$T/out4"
check "existing: settings merged" grep -qE '^  merged +.claude/settings.json' "$T/out4"
python3 - "$E/.claude/settings.json" "$TPL/.claude/settings.json" >"$T/py4" 2>&1 <<'PY'
import json, sys
s = json.load(open(sys.argv[1])); t = json.load(open(sys.argv[2]))
p = s["permissions"]
assert list(s) == ["model", "permissions", "env"], list(s)
assert s["model"] == "opus" and s["env"] == {"A": "1"} and p["ask"] == ["Bash(rm:*)"]
assert p["allow"][:2] == ["Bash(npm test:*)", "Bash(git status:*)"]
assert len(p["allow"]) == len(set(p["allow"])), "duplicate allow"
assert set(t["permissions"]["allow"]) <= set(p["allow"])
assert "Bash(git push origin master:*)" in p["deny"], p["deny"]
assert "Bash(git push origin main:*)" not in p["deny"]
print("ok")
PY
check "existing: settings union, no dups, keys kept, deny uses master" grep -qx ok "$T/py4"
"$ADOPT" "$E" --no-github --no-pr >"$T/out4b" 2>&1
check "existing: rerun nothing to adopt" grep -q 'nothing to adopt' "$T/out4b"
check "existing: setup PRD created" grep -qE '^  created +docs/prd/repo-setup.md' "$T/out4"
check "existing: pointer is the last line" sh -c "tail -1 '$E/CLAUDE.md' | grep -q 'prd-pointer: docs/prd/repo-setup.md'"

# --- 4b. Setup PRD archived / already adopted: nothing written for it -------
A="$T/archived"; new_repo "$A"
"$ADOPT" "$A" --no-github --no-pr >/dev/null 2>&1
git -C "$A" switch -q main; git -C "$A" merge -q chore/adopt-llm-template
mkdir -p "$A/docs/prd/archive"; git -C "$A" mv docs/prd/repo-setup.md docs/prd/archive/2026-10-repo-setup.md
grep -v 'prd-pointer:' "$A/CLAUDE.md" >"$T/c"; cp "$T/c" "$A/CLAUDE.md"; commit_all "$A" "ship setup"
"$ADOPT" "$A" --no-github --no-pr >"$T/out4c" 2>&1
check "archived: nothing to adopt" grep -q 'nothing to adopt' "$T/out4c"
check "archived: no setup PRD, no pointer" sh -c "test ! -e '$A/docs/prd/repo-setup.md' && ! grep -q prd-pointer '$A/CLAUDE.md' && test -z \"\$(git -C '$A' status --porcelain)\""
rm "$A/.gitignore"; commit_all "$A" "drop gitignore"
"$ADOPT" "$A" --no-github --no-pr >"$T/out4d" 2>&1
check "archived: other changes still skip setup" sh -c "grep -qE '^  created +.gitignore' '$T/out4d' && test ! -e '$A/docs/prd/repo-setup.md' && ! grep -q prd-pointer '$A/CLAUDE.md'"
P="$T/pre"; new_repo "$P"; "$ADOPT" "$P" --no-github --no-pr >/dev/null 2>&1
git -C "$P" rm -q docs/prd/repo-setup.md; grep -v 'prd-pointer:' "$P/CLAUDE.md" >"$T/c"; cp "$T/c" "$P/CLAUDE.md"
grep -v 'repo-setup' "$P/docs/prd/README.md" >"$T/c"; cp "$T/c" "$P/docs/prd/README.md"
commit_all "$P" "adopted before setup PRD"
"$ADOPT" "$P" --no-github --no-pr >"$T/out4e" 2>&1
check "pre-feature adopt: rerun nothing to adopt, no setup PRD" sh -c "grep -q 'nothing to adopt' '$T/out4e' && test ! -e '$P/docs/prd/repo-setup.md' && test -z \"\$(git -C '$P' status --porcelain)\""

# --- 4c. Repo map line: added under an appended heading, never twice ------
N="$T/nomap"; new_repo "$N"; printf '# N\n\n## Commands\n- make\n' >"$N/CLAUDE.md"; commit_all "$N" nomap
"$ADOPT" "$N" --no-github --no-pr >/dev/null 2>&1
check "no repo map: README line right under the appended heading" sh -c "grep -A1 -xF '## Repo map' '$N/CLAUDE.md' | tail -1 | grep -qxF -- \"\$README_LINE\" && test \$(grep -c 'docs/README.md' '$N/CLAUDE.md') = 1"
M="$T/hasline"; new_repo "$M"
printf '# M\n\n## Repo map\n- See docs/README.md for doc placement.\n' >"$M/CLAUDE.md"; commit_all "$M" hasline
"$ADOPT" "$M" --no-github --no-pr >/dev/null 2>&1
check "own mention: no README line added" test "$(grep -c 'docs/README.md' "$M/CLAUDE.md")" = 1

# --- 5. Older quiet-check.sh: warned, untouched; GitHub settings via stub --
Q="$T/oldqc"; new_repo "$Q"; mkdir -p "$Q/scripts"
mkdir -p "$Q/docs"; printf '# Our docs\n' >"$Q/docs/README.md"
printf '#!/bin/sh\nexec "$@"\n' >"$Q/scripts/quiet-check.sh"; commit_all "$Q" old
cp "$Q/scripts/quiet-check.sh" "$T/orig-qc"
: >"$GH_LOG"
GH_API_RC=1 "$ADOPT" "$Q" --no-pr >"$T/out5" 2>&1; RC=$?
check "oldqc: exit 0 despite gh api 403" test "$RC" = 0
check "oldqc: quiet-check warned" grep -qE '^  warned +scripts/quiet-check.sh' "$T/out5"
check "oldqc: warning names it" grep -q 'WARN: scripts/quiet-check.sh is an older version' "$T/out5"
check "oldqc: bytes unchanged" cmp -s "$T/orig-qc" "$Q/scripts/quiet-check.sh"
check "oldqc: own docs/README.md warned, untouched" sh -c "grep -qE '^  warned +docs/README.md' '$T/out5' && grep -q 'WARN: docs/README.md exists, left as is' '$T/out5' && test \"\$(cat '$Q/docs/README.md')\" = '# Our docs'"
check "github: delete-branch-on-merge call" grep -q 'gh api -X PATCH repos/o/r --silent -F delete_branch_on_merge=true' "$GH_LOG"
check "github: protects the default branch" grep -q 'gh api -X PUT repos/o/r/branches/main/protection' "$GH_LOG"
check "github: protection failure is a warning" grep -q 'WARN: branch protection not applied' "$T/out5"
check "no-pr: no push or pr create" sh -c "! grep -q 'pr create' '$GH_LOG'"

# --- 5b. --no-github with a PR: the body says which settings were skipped --
G="$T/nogh"; new_repo "$G"; git init -q --bare "$T/nogh.git"
git -C "$G" remote add origin "$T/nogh.git"; git -C "$G" push -qu origin main
: >"$GH_LOG"
"$ADOPT" "$G" --no-github >"$T/out5b" 2>&1; RC=$?
check "no-github pr: exit 0" test "$RC" = 0
check "no-github pr: branch pushed" git -C "$T/nogh.git" rev-parse -q --verify chore/adopt-llm-template
check "no-github pr: body names skipped settings" sh -c "grep -q 'pr create' '$GH_LOG' && grep -qF 'GitHub settings skipped (--no-github): delete branch on merge and protection of \`main\`' '$GH_LOG'"
check "no-github pr: no api calls" sh -c "! grep -q 'gh api' '$GH_LOG'"

# --- 5c. Stale adopt branch: closed/merged PR → suffixed branch; open → continue
B0=chore/adopt-llm-template
stale_repo() {  # stale_repo <dir>: adopted once and pushed; main has moved on
  new_repo "$1"; git init -q --bare "$1.git"
  git -C "$1" remote add origin "$1.git"; git -C "$1" push -qu origin main
  "$ADOPT" "$1" --no-github >/dev/null 2>&1; git -C "$1" switch -q main
  echo more >>"$1/README.md"; git -C "$1" commit -qam "main moves"; git -C "$1" push -q origin main
}
SC="$T/stale-closed"; stale_repo "$SC"; git -C "$SC" branch -qD "$B0"
OLD="$(git -C "$SC.git" rev-parse "$B0")"; : >"$GH_LOG"
GH_PR_HEAD=$B0 GH_PR_STATES=CLOSED "$ADOPT" "$SC" --no-github >"$T/out5c" 2>&1; RC=$?
check "stale closed: exit 0" test "$RC" = 0
check "stale closed: note names the new branch" grep -qxF "note: $B0 has only closed or merged PRs; using $B0-2" "$T/out5c"
check "stale closed: suffixed branch pushed" git -C "$SC.git" rev-parse -q --verify "$B0-2"
check "stale closed: old branch head unchanged" test "$(git -C "$SC.git" rev-parse "$B0")" = "$OLD"
check "stale closed: PR opened for the new branch" grep -q "pr create.*--head $B0-2" "$GH_LOG"
SM="$T/stale-merged"; stale_repo "$SM"
GH_PR_HEAD=$B0 GH_PR_STATES="CLOSED MERGED" "$ADOPT" "$SM" --no-github >"$T/out5d" 2>&1; RC=$?
check "stale merged, local kept: exit 0" test "$RC" = 0
check "stale merged, local kept: on $B0-2" test "$(git -C "$SM" branch --show-current)" = "$B0-2"
check "stale merged, local kept: fresh output" grep -qE '^  created +CLAUDE.md' "$T/out5d"
SO="$T/stale-open"; stale_repo "$SO"; git -C "$SO" switch -q "$B0"
git -C "$SO" rm -q docs/research/README.md; git -C "$SO" commit -qm "drop one"; git -C "$SO" push -q origin "$B0"
git -C "$SO" switch -q main; git -C "$SO" branch -qD "$B0"
OLD="$(git -C "$SO.git" rev-parse "$B0")"; : >"$GH_LOG"
GH_PR_HEAD=$B0 GH_PR_STATES=OPEN "$ADOPT" "$SO" --no-github >"$T/out5e" 2>&1; RC=$?
check "stale open: exit 0, no note" sh -c "test $RC = 0 && ! grep -q '^note:' '$T/out5e'"
check "stale open: continued from origin, fast-forward push" sh -c "test \"\$(git -C '$SO.git' rev-parse $B0)\" != '$OLD' && git -C '$SO.git' merge-base --is-ancestor '$OLD' $B0"
check "stale open: only the missing file created" sh -c "grep -qE '^  created +docs/research/README.md' '$T/out5e' && ! grep -qE '^  created +CLAUDE.md' '$T/out5e'"
check "stale open: no second PR" sh -c "! grep -q 'pr create' '$GH_LOG' && grep -q 'PR already open' '$T/out5e'"

# --- 6. Dirty tree / bad target: non-zero before writing --------------------
X="$T/dirty"; new_repo "$X"; echo tmp >"$X/scratch.txt"
"$ADOPT" "$X" --no-github --no-pr >"$T/out6" 2>&1; RC=$?
check "dirty: non-zero exit" test "$RC" -ne 0
check "dirty: says why" grep -q 'not clean' "$T/out6"
check "dirty: nothing written" test "$(git -C "$X" status --porcelain)" = "?? scratch.txt"
check "dirty: no branch" sh -c "! git -C '$X' show-ref -q --verify refs/heads/chore/adopt-llm-template"
mkdir -p "$T/notgit"
check "not a repo: non-zero" sh -c "! '$ADOPT' '$T/notgit' --no-github --no-pr"

# --- 6b. PRD hint: counts PRDs not in template shape outside the archive --
H="$T/hint-app"; new_repo "$H"; mkdir -p "$H/docs/prd/archive" "$H/design"
printf '# Login\nStatus: DRAFT\n' >"$H/docs/login.md"
printf '# Search PRD\n\n## Problem\n' >"$H/design/search.md"
printf '# Feed\nStatus: APPROVED\n\n## State\n- x\n' >"$H/feed.md"
printf '# Old\nStatus: SHIPPED 2025-01-01\n' >"$H/docs/prd/archive/2025-01-old.md"
printf '# Notes\nnothing here\n' >"$H/notes.md"
# Research in docs/prd/ is a candidate for inventory, but not a PRD: not counted.
printf '# Model study\nbody\n' >"$H/docs/prd/research-2026-09-model.md"
# Prose status on line 3 and a State with no Status line 2: still counted.
printf '# Pilot: Requirements\n\nOwner: J. Status: pilot.\n\n## State\n- x\n' >"$H/docs/prd/pilot.md"
commit_all "$H" prds
"$ADOPT" "$H" --no-github --no-pr >"$T/out6b" 2>&1; RC=$?
check "hint: exit 0" test "$RC" = 0
check "hint: migrate item sends research to docs/research/" grep -q 'moves to `docs/research/`' "$H/docs/prd/repo-setup.md"
check "hint: setup PRD has migrate item naming 3 PRDs" sh -c "grep -qx '  - \[ \] 4. Migrate PRDs' '$H/docs/prd/repo-setup.md' && grep -q '^3 PRDs without State or a line-2' '$H/docs/prd/repo-setup.md'"
check "hint: not printed" sh -c "! grep -q 'without State' '$T/out6b'"
table "$T/out1" | sed 's/  */ /g' >"$T/t-empty"; table "$T/out6b" | sed 's/  */ /g' >"$T/t-hint"
check "hint: action table unchanged" cmp -s "$T/t-empty" "$T/t-hint"

# --- 7. bootstrap.sh: shared libs, clean docs, setup PRD + pointer ---------
B="$T/new-app"; mkdir -p "$B"
(cd "$TPL" && git ls-files -co --exclude-standard | grep -v '^ops/logs/.\+' | tar -cf - -T -) | tar -xf - -C "$B"
git -C "$B" init -q -b main; commit_all "$B" "from template"
git init -q --bare "$T/origin.git"; git -C "$B" remote add origin "$T/origin.git"
: >"$GH_LOG"
(cd "$B" && scripts/bootstrap.sh) >"$T/out7" 2>&1; RC=$?
check "bootstrap: exit 0" test "$RC" = 0
check "bootstrap: no inline gh api settings" sh -c "! grep -q 'gh api' '$TPL/scripts/bootstrap.sh'"
check "bootstrap: sources the lib" grep -q 'claude-home/lib/gh-settings.sh' "$TPL/scripts/bootstrap.sh"
check "bootstrap: lib applied settings" grep -q 'gh api -X PUT repos/o/r/branches/main/protection' "$GH_LOG"
check "bootstrap: claude-home removed" test ! -e "$B/claude-home"
check "bootstrap: template-only targets stripped" sh -c "! grep -q '|claude-home' '$B/scripts/quiet-check.sh'"
check "bootstrap: linters kept, managed" sh -c "for f in prd-lint.sh features.sh doc-lint.sh; do test -x '$B/scripts/'\$f && sed -n 2p '$B/scripts/'\$f | grep -qxF '$MANAGED' || exit 1; done"
check "bootstrap: lint targets and CI_TARGETS" sh -c "grep -q '^prd-lint|.|' '$B/scripts/quiet-check.sh' && grep -q '^doc-lint|.|' '$B/scripts/quiet-check.sh' && grep -q 'CI_TARGETS: \"prd-lint doc-lint\"' '$B/.github/workflows/ci.yml'"
check "bootstrap: lint targets pass" sh -c "cd '$B' && scripts/quiet-check.sh prd-lint && scripts/quiet-check.sh doc-lint"
check "bootstrap: name filled" grep -q '^# CLAUDE.md — r' "$B/CLAUDE.md"
check "bootstrap: pushed branch" git -C "$T/origin.git" show-ref -q --verify refs/heads/chore/bootstrap
check "bootstrap: setup PRD approved with 3 items, no migrate" sh -c "grep -q '^Status: APPROVED .* (bootstrap)' '$B/docs/prd/repo-setup.md' && test \$(grep -c '^  - \[ \] ' '$B/docs/prd/repo-setup.md') = 3 && ! grep -q 'Migrate PRDs\|{{' '$B/docs/prd/repo-setup.md'"
check "bootstrap: only template docs left are READMEs, setup PRD, FEATURES.md" sh -c "cd '$B' && test \"\$(find docs -type f | sort | tr '\n' ' ')\" = 'docs/FEATURES.md docs/README.md docs/prd/README.md docs/prd/archive/.gitkeep docs/prd/repo-setup.md docs/research/README.md docs/specs/README.md '"
check "bootstrap: empty-state FEATURES.md" sh -c "sed -n 4p '$B/docs/FEATURES.md' | grep -qx '0 building · 0 pinned · 0 deprecated · 0 planned · 0 shipped · 0 removed' && test \$(wc -l <'$B/docs/FEATURES.md') = 7"
check "bootstrap: index rows = setup row only" sh -c "test \$(grep -c '^| \[' '$B/docs/prd/README.md') = 1 && grep -q '^| \[repo-setup\](repo-setup.md)' '$B/docs/prd/README.md' && ! grep -q '^| \[' '$B/docs/specs/README.md'"
check "bootstrap: CLAUDE.md ends with the one pointer" sh -c "test \$(grep -c 'prd-pointer: docs/prd/repo-setup.md' '$B/CLAUDE.md') = 1 && tail -n1 '$B/CLAUDE.md' | grep -q 'prd-pointer: docs/prd/repo-setup.md'"
check "bootstrap: doc-lint 0 violations" "$TPL/claude-home/skills/implement-prd-section/scripts/doc-lint.sh" "$B"
check "bootstrap: setup PRD committed" sh -c "git -C '$B' ls-files --error-unmatch docs/prd/repo-setup.md && test -z \"\$(git -C '$B' status --porcelain)\""
check "bootstrap: next is the setup one-liner" sh -c "tail -n1 '$T/out7' | grep -qx \"next: after merging, run /implement-prd-section docs/prd/repo-setup.md (or start a Claude session and say 'continue setup')\""

echo "$PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
