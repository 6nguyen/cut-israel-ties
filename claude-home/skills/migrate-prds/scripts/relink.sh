#!/usr/bin/env bash
# Rewrite links after moving markdown files by hand (git mv first).
#   relink.sh <old> <new> [<old> <new>…]   repo-relative paths, from the repo
# Same rewrite as move.sh commit 2 (relink.py): links in and to each moved
# file, plain repo-relative mentions; fenced code untouched. Prints
# `rewrote <file> (<n>)`, `warning: <file>:<line>: <ref>` and
# `broken: <file>:<line>: <link>` for links in a moved file that were already
# broken (left unchanged). Writes files; commits nothing.
#   relink.sh --sections <doc>   rewrite citations of a reference doc
# --sections (migrate-docs §3, sections.py): `<doc> §<heading>` becomes the
# target recorded under ## Sections in docs/prd/migration-plan.md
# (`docs/specs/<cap>.md`, `CLAUDE.md §Hard gotchas`, `<dir>/CLAUDE.md`,
# `docs/prd/<name>.md`); a bare `<doc>` mention becomes the spec that got
# most of its sections (`docs/specs/README.md` when none did). Citations it
# cannot resolve, of an unmapped or a
# dropped section, are printed `unresolved: <file>:<line>: <citation>`.
# Exit: 0 clean, 1 a broken link or unresolved citation was reported, 2 usage error.
set -euo pipefail
if [ "${1:-}" = --sections ]; then
  [ $# = 2 ] || { echo "usage: relink.sh --sections <doc>" >&2; exit 2; }
  ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" \
    || { echo "relink.sh: not a git repository" >&2; exit 2; }
  cd "$ROOT"
  PYTHONDONTWRITEBYTECODE=1 HERE="$(cd "$(dirname "$0")" && pwd)" python3 - "$2" <<'PY'
import os, re, sys
sys.path.insert(0, os.environ["HERE"])
from sections import retarget
doc, plan = sys.argv[1], "docs/prd/migration-plan.md"
if not os.path.isfile(doc) or not os.path.isfile(plan):
    print("relink.sh: needs %s and %s" % (doc, plan), file=sys.stderr); sys.exit(2)
smap, on = {}, False
for line in open(plan, encoding="utf-8").read().split("\n"):
    if line.startswith("## "):
        on = line.strip() == "## Sections"
    elif on and line.startswith("| %s |" % doc):
        cells = [c.strip().replace("\\|", "|") for c in re.split(r"(?<!\\)\|", line)[1:-1]]
        if len(cells) == 3:
            smap[cells[1]] = cells[2]
if not smap:
    print("relink.sh: no ## Sections rows for %s (fold.sh sections --write first)" % doc, file=sys.stderr); sys.exit(2)
changed, unresolved = retarget(doc, smap, skip={plan})
for f, n in changed:
    print("rewrote %s (%d)" % (f, n))
for u in unresolved:
    print("unresolved: " + u)
sys.exit(1 if unresolved else 0)
PY
  exit $?
fi
if [ $# = 0 ] || [ $(($# % 2)) = 1 ]; then
  echo "usage: relink.sh <old> <new> [<old> <new>…]" >&2; exit 2
fi
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" \
  || { echo "relink.sh: not a git repository" >&2; exit 2; }
cd "$ROOT"
PYTHONDONTWRITEBYTECODE=1 HERE="$(cd "$(dirname "$0")" && pwd)" python3 - "$@" <<'PY'
import os, sys
sys.path.insert(0, os.environ["HERE"])
from relink import relink
args = sys.argv[1:]
moves = dict(zip(args[0::2], args[1::2]))
for old, new in moves.items():
    if not os.path.exists(new):
        print("relink.sh: %s not found (git mv %s %s first)" % (new, old, new), file=sys.stderr); sys.exit(2)
broken = []
changed, warnings = relink(moves, broken=broken)
for f, n in changed:
    print("rewrote %s (%d)" % (f, n))
for w in warnings:
    print("warning: " + w)
for b in broken:
    print("broken: " + b)
sys.exit(1 if broken else 0)
PY
