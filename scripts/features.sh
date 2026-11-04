#!/usr/bin/env bash
# managed by llm-repo-template adopt; edit it there
# features.sh — generate docs/FEATURES.md, the repo's feature list
# (docs/specs/feature-list.md).
#   features.sh [--check|--json] [repo]   repo: default the git top level
# Write mode renders the file. --check writes nothing and exits 1 when the
# file is missing or stale, or when the list is over 60 rows. --json prints
# the rows. Exit 2 when the repo has neither docs/specs/ nor docs/prd/.
# Sources, never edited: docs/specs/*.md and its README index, open PRDs in
# docs/prd/ (Status, Last updated, Sections, Spec delta), the ## Next table
# in docs/prd/README.md, and SHIPPED PRDs in docs/prd/archive/.
# States are derived (precedence per spec DEPRECATED > BUILDING > PINNED >
# SHIPPED); same tree and history give byte-identical output.
set -euo pipefail
export LC_ALL=C
MODE=write
case "${1:-}" in --check) MODE=check; shift ;; --json) MODE=json; shift ;; esac
DIR="${1:-.}"
ROOT="$(git -C "$DIR" rev-parse --show-toplevel 2>/dev/null || (cd "$DIR" && pwd))"
cd "$ROOT"
[ -d docs/specs ] || [ -d docs/prd ] \
  || { echo "features.sh: no docs/specs/ and no docs/prd/ in $ROOT" >&2; exit 2; }

PYTHONDONTWRITEBYTECODE=1 MODE="$MODE" python3 - <<'PY'
import datetime, glob, json, os, re, subprocess, sys

MODE = os.environ["MODE"]
OUT = "docs/FEATURES.md"
SKIP = {"README.md", "migration-plan.md", "repo-setup.md"}
ORDER = ["BUILDING", "PINNED", "DEPRECATED", "PLANNED", "SHIPPED", "REMOVED"]
SPEC_RE = re.compile(r"`docs/specs/([^`/]+)\.md`")

def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()

def section(text, title):
    """Lines of the `## <title>...` section, fenced code dropped."""
    out, on, fence = [], False, False
    for line in text.split("\n"):
        if line.startswith("```") or line.startswith("~~~"):
            fence = not fence
            continue
        if fence:
            continue
        if line.startswith("## "):
            on = line[3:].startswith(title)
            continue
        if on:
            out.append(line)
    return out

def cut(s, n=60):
    s = " ".join(s.split()).replace("|", "\\|")
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"

def table_rows(lines):
    rows = []
    for l in lines:
        if not l.startswith("|") or re.match(r"^\|[-\s|:]+\|$", l):
            continue
        rows.append([c.strip() for c in re.split(r"(?<!\\)\|", l)[1:-1]])
    return rows[1:]  # drop the header

def slug(s):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")[:40] or "idea"

def delta(text):
    """[(verb, spec stem, whole_file)] from top-level ## Spec delta bullets."""
    out = []
    for l in section(text, "Spec delta"):
        m = re.match(r"^- (ADDED|MODIFIED|REMOVED)\s+`docs/specs/([^`/]+)\.md`(.*)", l)
        if m:
            out.append((m.group(1), m.group(2), "§" not in m.group(3).split(":", 1)[0]))
    return out

def status_line(text):
    lines = text.split("\n")
    return lines[1] if len(lines) > 1 and lines[1].startswith("Status:") else ""

# --- Specs and their capability cells ---------------------------------------
specs = sorted(os.path.basename(p)[:-3] for p in glob.glob("docs/specs/*.md")
               if os.path.basename(p) != "README.md")
capability = {}
if os.path.exists("docs/specs/README.md"):
    for cells in table_rows(section(read("docs/specs/README.md"), "Index")):
        m = re.match(r"\[[^\]]*\]\(([^)]+)\.md\)", cells[0]) if cells else None
        if m and len(cells) > 1:
            capability[os.path.basename(m.group(1))] = cells[1]

spec_date = {}
if specs:
    # A shallow clone (CI's default checkout) dates every spec by its one
    # commit, so the Updated column would be wrong rather than stale.
    shallow = subprocess.run(["git", "rev-parse", "--is-shallow-repository"],
                             capture_output=True, text=True).stdout.strip() == "true"
    if shallow:
        msg = "shallow clone; spec dates need full history (actions/checkout fetch-depth: 0)"
        if MODE == "check":
            print("%s: %s" % (OUT, msg)); sys.exit(1)
        print("features.sh: " + msg, file=sys.stderr); sys.exit(2)
    try:
        log = subprocess.run(["git", "log", "--format=%x00%cs", "--name-only", "--", "docs/specs"],
                             capture_output=True, text=True, check=True).stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        log = ""
    date = None
    for l in log.split("\n"):
        if l.startswith("\0"):
            date = l[1:]
        elif l.startswith("docs/specs/") and l.endswith(".md"):
            spec_date.setdefault(os.path.basename(l)[:-3], date)
    # Specs the next commit will carry are dated today, the committer date
    # (%cs, local) that commit gets, so a pre-commit run stays current.
    dirty = ""
    for cmd in (["git", "diff", "--name-only", "HEAD", "--", "docs/specs"],
                ["git", "ls-files", "--others", "--exclude-standard", "--", "docs/specs"]):
        dirty += subprocess.run(cmd, capture_output=True, text=True).stdout
    for l in dirty.split("\n"):
        if l.startswith("docs/specs/") and l.endswith(".md"):
            spec_date[os.path.basename(l)[:-3]] = datetime.date.today().isoformat()

# --- Open PRDs -----------------------------------------------------------------
prds = []
for p in sorted(glob.glob("docs/prd/*.md")):
    name = os.path.basename(p)
    if name in SKIP or name.startswith("research-"):
        continue
    text = read(p)
    st = status_line(text)
    word = (st[len("Status:"):].split() or ["-"])[0]
    if word in ("SUPERSEDED", "DROPPED"):
        continue
    state = section(text, "State")
    items = [l for l in state if re.match(r"^\s+- \[[ x~!]\] ", l)]
    done = sum(1 for l in items if re.match(r"^\s+- \[x\] ", l))
    building = word == "BUILDING" or any(re.match(r"^\s+- \[[x~]\] ", l) for l in items)
    upd = re.search(r"Last updated:\s*(\d{4}-\d{2}-\d{2})", st)
    h1 = next((l[2:] for l in text.split("\n") if l.startswith("# ")), name[:-3])
    prds.append({
        "stem": name[:-3], "path": "prd/" + name, "word": word, "building": building,
        "progress": "%d/%d" % (done, len(items)) if items else word,
        "updated": upd.group(1) if upd else "-",
        "title": re.sub(r"\s+[—-]+\s*PRD\s*$", "", h1).strip(),
        "delta": delta(text),
    })

# --- ## Next ideas -------------------------------------------------------------
nexts = []
if os.path.exists("docs/prd/README.md"):
    for cells in table_rows(section(read("docs/prd/README.md"), "Next")):
        if len(cells) >= 3 and cells[1]:
            nexts.append({"n": cells[0], "idea": cells[1], "target": cells[2].strip("` ")})

# --- Rows ------------------------------------------------------------------------
rows = []
def row(feature, state, what, spec, change, updated):
    rows.append({"feature": feature, "state": state, "what": cut(what), "spec": spec,
                 "change": change, "updated": updated})

def link(p):
    return "[%s](%s)" % (p["stem"], p["path"])

def change_cell(deciders, extra):
    first = deciders[0]
    cell = "%s %s" % (link(first), first["progress"])
    more = len(deciders) - 1 + extra
    return cell + (" +%d" % more if more else "")

for s in specs:
    dep = [p for p in prds if any(v == "REMOVED" and x == s and w for v, x, w in p["delta"])]
    named = [p for p in prds if any(x == s for _, x, _ in p["delta"])]
    bld = [p for p in named if p["building"]]
    pin = [p for p in named if not p["building"]]
    nx = [n for n in nexts if n["target"] == s]
    if dep:
        state, decided = "DEPRECATED", dep
    elif bld:
        state, decided = "BUILDING", bld
    elif pin:
        state, decided = "PINNED", pin
    elif nx:
        state, decided = "PINNED", []
    else:
        state, decided = "SHIPPED", []
    others = len(named) - len(decided)
    if decided:
        change = change_cell(decided, others)
        updated = max(p["updated"] for p in decided)
    elif nx:
        change, updated = "Next #%s" % nx[0]["n"], spec_date.get(s, "-")
    else:
        change, updated = "-", spec_date.get(s, "-")
    row(s, state, capability.get(s, "") or "-", "[spec](specs/%s.md)" % s, change, updated)

for p in prds:
    adds_new = any(v == "ADDED" and x not in specs for v, x, _ in p["delta"])
    names_existing = any(x in specs for _, x, _ in p["delta"])
    if adds_new or not names_existing:
        row(p["stem"], "BUILDING" if p["building"] else "PLANNED", p["title"], "-",
            "%s %s" % (link(p), p["progress"]), p["updated"])

for n in nexts:
    if n["target"] == "new" or n["target"] not in specs:
        row(slug(n["idea"]), "PLANNED", n["idea"], "-", "Next #%s" % n["n"], "-")

removed = []
for p in sorted(glob.glob("docs/prd/archive/*.md"), reverse=True):
    text = read(p)
    st = status_line(text)
    if not re.match(r"Status:\s*SHIPPED", st):
        continue
    for v, x, whole in delta(text):
        if v == "REMOVED" and whole and x not in specs and x not in [r[0] for r in removed]:
            d = re.search(r"SHIPPED\s+(\d{4}-\d{2}-\d{2})", st)
            removed.append((x, p, d.group(1) if d else "-"))
for x, p, d in removed[:10]:
    stem = os.path.basename(p)[:-3]
    row(x, "REMOVED", "-", "-", "[%s](%s)" % (stem, p[len("docs/"):]), d)

# --- Order ----------------------------------------------------------------------
next_pos = {slug(n["idea"]): i for i, n in enumerate(nexts)}
def key(r):
    st = ORDER.index(r["state"])
    if r["state"] == "PLANNED":
        return (st, 0, next_pos[r["feature"]], "") if r["change"].startswith("Next #") \
            else (st, 1, 0, r["feature"])
    if r["state"] == "REMOVED":
        return (st, 0, 0, "")  # already newest first; sort is stable
    return (st, 0, 0, r["feature"])
rows.sort(key=key)

if MODE == "json":
    print(json.dumps(rows, indent=2, ensure_ascii=False))
    sys.exit(0)

counts = " · ".join("%d %s" % (sum(1 for r in rows if r["state"] == s), s.lower()) for s in ORDER)
lines = ["# Features",
         "<!-- generated by features.sh from docs/specs, docs/prd, docs/prd/archive; do not edit -->",
         "", counts, "",
         "| Feature | State | What it does | Spec | Change | Updated |",
         "|---|---|---|---|---|---|"]
lines += ["| %s |" % " | ".join([r["feature"], r["state"], r["what"], r["spec"], r["change"], r["updated"]])
          for r in rows]
body = "\n".join(lines) + "\n"
over = len(rows) > 60

if MODE == "check":
    bad = 0
    if not os.path.exists(OUT) or read(OUT) != body:
        print("%s: stale, run features.sh" % OUT); bad = 1
    if over:
        print("%s: over 60 rows; group specs or trim" % OUT); bad = 1
    sys.exit(bad)

old = read(OUT) if os.path.exists(OUT) else None
if old != body:
    os.makedirs("docs", exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(body)
print("features.sh: %s %s (%d rows; %s)" % (OUT, "unchanged" if old == body else "written", len(rows), counts))
if over:
    print("%s: over 60 rows; group specs or trim" % OUT)
PY
