#!/usr/bin/env bash
# Apply docs/prd/migration-plan.md's moves on branch chore/migrate-prds-move.
#   move.sh [-n] [path]     -n: print what would happen, change nothing
# Moves active, partial and (until their fold) shipped rows into docs/prd/,
# and research rows into docs/research/; unknown rows and "(in place)" rows
# never move. A docs/research/?.md destination must be named first. Shipped rows go to
# docs/prd/<name>.md (their archive name without the YYYY-MM- prefix), except
# FOLDED/SUPERSEDED pointers, whose content lives in another PRD: they go
# straight to their docs/prd/archive/ destination, status unchanged.
# Three commits, each skipped when empty:
#   1. git mv only (no content change, so git records renames);
#   2. every reference to an old path rewritten across tracked text files:
#      relative and repo-root markdown links (resolved from each file's old
#      location) and plain repo-relative mentions; the plan file is skipped;
#   3. docs/prd/README.md index rows for active/partial PRDs added, and
#      rows of archived pointers dropped;
#   4. docs/research/README.md index rows for research rows (one row per
#      docs/research/<topic>/ study folder).
# Doc rows (migrate-docs §2): doc:research like research; doc:howto,
# archive-bound doc:plan / doc:impl-plan and doc:map move; doc:skill with a
# `.claude/skills/<name>/` destination moves its whole directory. fold,
# split, merge <x>, doc:record, doc:reference and a map whose
# <dir>/CLAUDE.md exists never move. After the index commits:
#   5. docs/guides/README.md on the first docs/guides/ move;
#   6. one commit per moved map: `## Purpose` when missing, the root
#      `## Area maps` line rewritten to `- <dir>: `<dir>/CLAUDE.md` — <purpose>`,
#      and measure.sh's row for <dir> printed (map-over-cap is a warning).
#      Only a `- ` line naming the map is replaced; a prose line keeps its
#      rewritten path and the entry is appended.
#   7. docs/FEATURES.md regenerated when it exists and the moves left it stale.
# Old paths still present after the rewrite (URLs, computed paths) and
# renamed basenames (unless another tracked file shares the basename) are
# printed as warnings, not changed. Links in a moved
# file that were already broken are printed as `broken: <file>:<line>: <link>`.
set -euo pipefail
export LC_ALL=C
DRY=0
[ "${1:-}" = -n ] && { DRY=1; shift; }
DIR="${1:-.}"
ROOT="$(git -C "$DIR" rev-parse --show-toplevel 2>/dev/null)" \
  || { echo "move.sh: not a git repository: $DIR" >&2; exit 2; }
cd "$ROOT"
PLAN=docs/prd/migration-plan.md
[ -f "$PLAN" ] || { echo "move.sh: no $PLAN (run /migrate-prds inventory first)" >&2; exit 2; }
[ -z "$(git status --porcelain)" ] || { echo "move.sh: worktree not clean" >&2; exit 2; }
BRANCH=chore/migrate-prds-move
if [ "$DRY" = 0 ] && [ "$(git branch --show-current)" != "$BRANCH" ]; then
  git rev-parse --verify -q "refs/heads/$BRANCH" >/dev/null \
    && { echo "move.sh: $BRANCH exists; switch to it first" >&2; exit 2; }
  git switch -q -c "$BRANCH"
fi

PYTHONDONTWRITEBYTECODE=1 DRY="$DRY" PLAN="$PLAN" HERE="$(cd "$(dirname "$0")" && pwd)" python3 - <<'PY'
import os, posixpath, re, subprocess, sys
from urllib.parse import quote
sys.path.insert(0, os.environ["HERE"])
from relink import relink

DRY, PLAN = os.environ["DRY"] == "1", os.environ["PLAN"]

def git(*args):
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout

def die(msg):
    print("move.sh: " + msg, file=sys.stderr); sys.exit(2)

# --- Plan rows (## Files table) ----------------------------------------------
rows, in_files = [], False
for line in open(PLAN, encoding="utf-8").read().split("\n"):
    if line.startswith("## "):
        in_files = line.strip() == "## Files"
    elif in_files and line.startswith("| ") and not line.startswith("| Path |"):
        cells = [c.strip().replace("\\|", "|") for c in re.split(r"(?<!\\)\|", line)[1:-1]]
        if len(cells) == 7:
            rows.append(cells)
if not rows:
    die("no rows under ## Files in " + PLAN)

moves, done, unknown, index, rindex = {}, {}, [], [], []
maps, guides, archived = [], False, []
POINTERS = ("FOLDED", "SUPERSEDED")
DOC_MOVES = ("doc:research", "doc:howto", "doc:skill", "doc:plan", "doc:impl-plan", "doc:map")

def take(path, dest):
    """Record one file move; False when it was already applied."""
    if not os.path.exists(path):
        if os.path.exists(dest):
            print("already moved: %s -> %s" % (path, dest)); done[path] = dest; return False
        die("missing: " + path)
    if dest in moves.values() or (os.path.exists(dest) and dest != path):
        die("destination taken: %s (for %s)" % (dest, path))
    moves[path] = dest
    return True

for path, status, _flags, _date, _ev, cls, dest in rows:
    dest = dest.split(" — ", 1)[0]
    if cls in ("unknown", "doc:unknown"):
        unknown.append(path); continue
    if dest in ("(in place)", path, "fold", "split") or dest.startswith("merge "):
        continue
    if cls.startswith("doc:") and cls not in DOC_MOVES:
        continue  # records and references never move; references fold
    if cls in ("doc:plan", "doc:impl-plan") and not dest.startswith("docs/prd/archive/"):
        die("plan destination must be split, merge <x> or docs/prd/archive/: %s (for %s)" % (dest, path))
    if cls == "doc:map":
        if not dest.endswith("/CLAUDE.md") or dest.startswith("?/"):
            die("name the map directory (<dir>/CLAUDE.md) for %s in %s before move" % (path, PLAN))
        if os.path.exists(dest) and os.path.exists(path):
            print("map target exists, not moved: %s -> %s" % (path, dest)); continue
        if take(path, dest):
            maps.append((path, dest))
        continue
    if cls == "doc:skill" and dest.endswith("/"):
        src = posixpath.dirname(path)
        if not os.path.exists(path) and os.path.exists(dest + posixpath.basename(path)):
            print("already moved: %s/ -> %s" % (src, dest)); continue
        for f in sorted(x for x in git("ls-files", "-z", "--", src).split("\0") if x):
            take(f, dest + f[len(src) + 1:])
        continue
    if cls == "doc:howto" and dest.startswith("docs/guides/"):
        guides = True
    if cls == "shipped" and status.split(" ")[0] in POINTERS and dest.startswith("docs/prd/archive/"):
        if take(path, dest):
            archived.append(dest)
        continue
    if cls == "shipped":
        name = re.sub(r"^\d{4}-\d{2}-", "", posixpath.basename(dest))
        dest = "docs/prd/" + name
        if posixpath.dirname(path) in ("docs/prd", "docs/prd/archive"):
            continue
    elif cls in ("research", "doc:research"):
        if not dest.startswith("docs/research/"):
            die("research destination must be under docs/research/: %s (for %s)" % (dest, path))
        if posixpath.basename(dest) == "?.md":
            die("name docs/research/?.md for %s in %s before move" % (path, PLAN))
        # A file in docs/research/<topic>/ belongs to a multi-file study:
        # the index gets one row for the folder.
        sub = posixpath.dirname(dest)
        entry = sub + "/" if sub != "docs/research" else dest
        if entry not in rindex:
            rindex.append(entry)
    elif cls not in ("active", "partial") and not cls.startswith("doc:"):
        die("unknown class %r for %s" % (cls, path))
    take(path, dest)
for path, status, _f, _d, _e, cls, dest in rows:
    if cls in ("active", "partial"):
        index.append((moves.get(path, done.get(path, path)), status))

for old in sorted(moves):
    print("move    %s -> %s" % (old, moves[old]))
for p in sorted(unknown):
    print("unknown (not moved): " + p)

# --- 1. Moves only -----------------------------------------------------------
if moves and not DRY:
    for old in sorted(moves):
        os.makedirs(posixpath.dirname(moves[old]), exist_ok=True)
        git("mv", "--", old, moves[old])
        try:  # git leaves an emptied source folder on disk; drop it
            os.removedirs(posixpath.dirname(old) or ".")
        except OSError:
            pass
    docs_moved = any(cls.startswith("doc:") and path in moves for path, *_x, cls, _d in rows)
    git("commit", "-qm", "Move PRDs and docs into place (moves only)" if docs_moved
        else "Move PRDs into docs/prd (moves only)",
        "-m", "Applies %s; no content changes so git records renames." % PLAN)

# --- 2. Rewrite references ---------------------------------------------------
broken = []
changed, warnings = relink(moves, DRY, skip={PLAN}, broken=broken)
for f, n in changed:
    print("rewrote %s (%d)" % (f, n))
for w in warnings:
    print("warning: " + w)
for b in broken:
    print("broken: " + b)
if changed and not DRY:
    git("add", "-A")
    git("commit", "-qm", "Rewrite links to moved PRDs",
        "-m", "%d references in %d files." % (sum(n for _, n in changed), len(changed)))

# --- 3. Index rows (PRDs), 4. index rows (research) --------------------------
def add_rows(readme, entries, header, message, drop=()):
    """entries: [(path, status)]; rows go at the end of readme's ## Index table.
    drop: paths whose rows leave the table."""
    if not entries and not drop:
        return
    if not os.path.exists(readme):
        print("warning: no %s; index rows not added" % readme); return
    base = posixpath.dirname(readme)
    lines = open(readme, encoding="utf-8").read().split("\n")
    try:
        start = next(i for i, l in enumerate(lines) if l.startswith("## Index"))
    except StopIteration:
        print("warning: %s has no ## Index; rows not added" % readme); return
    end = start + 1
    while end < len(lines) and not lines[end].startswith("## "):
        end += 1
    gone = ["(%s)" % posixpath.relpath(p, base) for p in drop]
    dropped = [i for i in range(start + 1, end) if lines[i].startswith("|") and any(g in lines[i] for g in gone)]
    for i in reversed(dropped):
        print("unindex " + lines[i]); del lines[i]; end -= 1
    table = [i for i in range(start + 1, end) if lines[i].startswith("|")]
    body = "\n".join(lines[start:end])
    added = []
    for path, status in sorted(entries):
        rel = posixpath.relpath(path, base) + ("/" if path.endswith("/") else "")
        if "(%s)" % rel in body:
            continue
        name = posixpath.splitext(posixpath.basename(path.rstrip("/")))[0]
        cells = " | ".join(["[%s](%s)" % (name, quote(rel, safe="/._-~"))] + status)
        added.append("| %s |" % cells)
    if not added and not dropped:
        return
    if added and table:
        at = table[-1] + 1
        if "(none" in lines[table[-1]]:
            del lines[table[-1]]; at -= 1
        lines[at:at] = added
    elif added:
        lines[start + 1:start + 1] = header + added
    for r in added:
        print("index   " + r)
    if not DRY:
        open(readme, "w", encoding="utf-8").write("\n".join(lines))
        git("add", readme)
        git("commit", "-qm", message)

add_rows("docs/prd/README.md", [(p, [s, "—"]) for p, s in index],
         ["| PRD | Status | Owner surfaces |", "|---|---|---|"],
         "Index migrated PRDs in docs/prd/README.md", drop=archived)
add_rows("docs/research/README.md", [(p, ["—", "—", "—"]) for p in rindex],
         ["| Research | Question | Researched | Informs |", "|---|---|---|---|"],
         "Index moved research in docs/research/README.md")

# --- 5. docs/guides/README.md on the first guides move -----------------------
GUIDES = """# Guides

How-tos for people, for tasks no single directory owns. One task per file,
`<task>.md`, written as numbered steps. A how-to for one directory's tool is
that directory's `README.md`; a procedure an agent runs is a skill in
`.claude/skills/`. Builds never read this folder.
"""
if guides and not os.path.exists("docs/guides/README.md"):
    print("add     docs/guides/README.md")
    if not DRY:
        os.makedirs("docs/guides", exist_ok=True)
        open("docs/guides/README.md", "w", encoding="utf-8").write(GUIDES)
        git("add", "docs/guides/README.md")
        git("commit", "-qm", "Add docs/guides/README.md")

# --- 6. One commit per moved map ---------------------------------------------
def purpose_of(text, line):
    m = re.search(r"`[^`]*`\s*(?:—|–|-|:)\s*(\S.*)$", line or "")
    if m:
        return m.group(1).strip()
    fence = False
    for l in text.split("\n"):
        if l.startswith("```"):
            fence = not fence
        elif not fence and l.strip() and not re.match(r"\s*(#|>|\||-|\*|<!--)", l):
            return re.split(r"(?<=\.)\s", l.strip(), maxsplit=1)[0]
    return None

MEASURE = os.path.join(os.environ["HERE"], "..", "..", "area-maps", "scripts", "measure.sh")
for old, new in sorted(maps):
    d = posixpath.dirname(new)
    text = open(new if not DRY else old, encoding="utf-8").read()
    root = open("CLAUDE.md", encoding="utf-8").read().split("\n") if os.path.exists("CLAUDE.md") else []
    start = next((i for i, l in enumerate(root) if l.strip() == "## Area maps"), None)
    end = next((i for i in range(start + 1, len(root)) if root[i].startswith("## ")), len(root)) if start is not None else None
    at = next((i for i in range(start + 1, end) if root[i].lstrip().startswith("- ") and (old in root[i] or new in root[i])), None) if start is not None else None
    purpose = purpose_of(text, root[at] if at is not None else None)
    if not purpose:
        purpose = "what %s/ owns (write this)" % d
        print("warning: %s: no purpose found; placeholder written" % new)
    entry = "- %s: `%s` — %s" % (d, new, purpose)
    add_purpose = not re.search(r"^## Purpose\b", text, re.M)
    print("map     %s: %s%s" % (new, "## Purpose added; " if add_purpose else "", entry))
    if DRY:
        continue
    if add_purpose:
        lines = text.split("\n")
        t = next((i for i, l in enumerate(lines) if l.startswith("# ")), -1)
        gap = [""] if t + 1 < len(lines) and lines[t + 1].strip() else []
        lines[t + 1:t + 1] = ([""] if t >= 0 else []) + ["## Purpose", purpose] + gap
        open(new, "w", encoding="utf-8").write("\n".join(lines))
    if start is None:
        root += ["", "## Area maps", entry]
    elif at is not None:
        root[at] = entry
    else:
        none = next((i for i in range(start + 1, end) if root[i].strip() == "- (none yet)"), None)
        if none is not None:
            root[none] = entry
        else:
            last = max([i for i in range(start + 1, end) if root[i].startswith("- ")] or [start])
            root.insert(last + 1, entry)
    if root:
        open("CLAUDE.md", "w", encoding="utf-8").write("\n".join(root))
    git("add", "-A")
    git("commit", "-qm", "Make %s the %s area map" % (new, d),
        "-m", "Moved from %s; ## Area maps now points here." % old)
    out = subprocess.run([MEASURE, "."], capture_output=True, text=True).stdout
    row = next((l for l in out.split("\n") if l.split(" ")[0] in ("./" + d, d)), "")
    print("measure " + (row or "%s not listed (under 20k tokens)" % d))
    tokens = os.path.getsize(new) // 4
    if "map-over-cap" in row or tokens > 4000:
        print("warning: map-over-cap: %s is ~%d tokens (cap 4k); trim it (/area-maps)" % (new, tokens))

# --- 7. docs/FEATURES.md, when moved PRDs left it stale --------------------
FEATURES = os.path.join(os.environ["HERE"], "..", "..", "implement-prd-section", "scripts", "features.sh")
if not DRY and os.path.exists("docs/FEATURES.md") and os.path.exists(FEATURES):
    subprocess.run([FEATURES, "."], check=True, stdout=subprocess.DEVNULL)
    if git("status", "--porcelain", "--", "docs/FEATURES.md").strip():
        print("regen   docs/FEATURES.md")
        git("add", "docs/FEATURES.md")
        git("commit", "-qm", "Regenerate docs/FEATURES.md")
PY
