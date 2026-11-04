#!/usr/bin/env bash
# Fold shipped PRDs into docs/specs/, one capability group per PR.
#   fold.sh groups                       shipped PRDs (oldest first) + groups
#   fold.sh groups --write 'cap: a.md, b.md' ...   record groups in the plan
#   fold.sh claims <prd>                 behavior/invariant items + evidence
#   fold.sh archive [-n] <cap>           archive the group's PRDs (2 commits)
#   fold.sh splits [--write <prd> <cap> <shipped items> [<new prd>]]
#   fold.sh split [-n|--check] <prd>     archive a partial PRD / add its rest
#   fold.sh reclass <prd> shipped|active a partial row found all/none built
#   fold.sh sections <doc>               a reference doc's ## sections + citations
#   fold.sh sections --write <doc> '<heading>: <target>' ...   record ## Sections
#   fold.sh extract <doc> <heading>      print one section verbatim
#   fold.sh archive-doc [-n] <doc>       archive a fully folded doc (2 commits)
# Reads docs/prd/migration-plan.md (## Files, ## Capability groups). The
# model writes docs/specs/<cap>.md and commits it on docs/migrate-prds-<cap>
# (or a docs/migrate-prds-<topic> branch bundling several groups and splits)
# before `archive`; archive sets each PRD's Status to
# "SHIPPED <last commit> (migrated)", git-mvs it to its archive destination,
# rewrites links to it, drops its docs/prd/README.md index row, adds the
# spec's docs/specs/README.md row, and deletes the plan once no shipped or
# partial PRD is left outside the archive. Impl plans whose row reads
# `merge <stem>` move beside their PRD as "Status: MERGED <date> into ...".
# Split (partial PRDs, one PR each on docs/migrate-prds-split-<name>): the
# owner's split point is recorded under ## Split points; the model folds the
# built part into docs/specs/<cap>.md and commits it; `split` archives the
# original as "SUPERSEDED by <new prd>" (moves-only commit, then edits); the model writes the
# change PRD for the rest at <new prd> (default: the same path); `split
# --check` validates it (Spec delta naming the spec, State with a
# Sections: list of [ ] items), sets its index row and commits it.
# Reference docs (doc rows with destination `fold`): `sections --write` maps
# every ## heading to a target (a capability stem, drop, claude-md,
# map:<dir> or prd:<name>) under ## Sections; the model folds each section
# into its target in that capability's fold PR; `relink.sh --sections <doc>`
# rewrites `<doc> §<heading>` citations; `archive-doc` then moves the doc to
# docs/prd/archive/<YYYY-MM>-<name>.md with "Status: FOLDED <date> into ...".
set -euo pipefail
export LC_ALL=C
CMD="${1:-}"; shift || true
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" \
  || { echo "fold.sh: not a git repository" >&2; exit 2; }
cd "$ROOT"
PLAN=docs/prd/migration-plan.md
[ -f "$PLAN" ] || { echo "fold.sh: no $PLAN (run /migrate-prds inventory first)" >&2; exit 2; }
case "$CMD" in
  groups|claims|splits|split|reclass|sections|extract) ;;
  archive-doc)
    if [ "${1:-}" != -n ]; then
      [ -z "$(git status --porcelain)" ] || { echo "fold.sh: worktree not clean" >&2; exit 2; }
      case "$(git branch --show-current)" in docs/migrate-prds-*) ;;
        *) echo "fold.sh: run archive-doc on a docs/migrate-prds-<cap> branch" >&2; exit 2 ;; esac
    fi ;;
  archive)
    if [ "${1:-}" != -n ]; then
      [ -z "$(git status --porcelain)" ] || { echo "fold.sh: worktree not clean" >&2; exit 2; }
      case "$(git branch --show-current)" in docs/migrate-prds-*) ;;
        *) echo "fold.sh: run archive on docs/migrate-prds-${1:-} or a docs/migrate-prds-<topic> bundle" >&2; exit 2 ;; esac
    fi ;;
  *) echo "usage: fold.sh groups [--write 'cap: path, ...' ...] | claims <prd> | archive [-n] <cap>" \
          "| splits [--write <prd> <cap> <shipped> [<new prd>]] | split [-n|--check] <prd> | reclass <prd> shipped|active" \
          "| sections [--write] <doc> ['<heading>: <target>' ...] | extract <doc> <heading> | archive-doc [-n] <doc>" >&2; exit 2 ;;
esac

PYTHONDONTWRITEBYTECODE=1 PLAN="$PLAN" HERE="$(cd "$(dirname "$0")" && pwd)" \
  python3 - "$CMD" "$@" <<'PY'
import os, posixpath, re, subprocess, sys
sys.path.insert(0, os.environ["HERE"])
from relink import relink
import sections as secs

PLAN = os.environ["PLAN"]
CMD, ARGS = sys.argv[1], sys.argv[2:]
ARCH = "docs/prd/archive"
KEBAB = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")

def git(*args):
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout

def die(msg):
    print("fold.sh: " + msg, file=sys.stderr); sys.exit(2)

# --- Plan --------------------------------------------------------------------
plan = open(PLAN, encoding="utf-8").read().split("\n")
def section(name):
    start = next((i for i, l in enumerate(plan) if l.strip() == name), None)
    if start is None:
        return None, None
    end = start + 1
    while end < len(plan) and not plan[end].startswith("## "):
        end += 1
    return start, end

rows = []
s, e = section("## Files")
for line in plan[s + 1:e] if s is not None else []:
    if line.startswith("| ") and not line.startswith("| Path |"):
        cells = [c.strip().replace("\\|", "|") for c in re.split(r"(?<!\\)\|", line)[1:-1]]
        if len(cells) == 7:
            rows.append(cells)
if not rows:
    die("no rows under ## Files in " + PLAN)

def locate(path, dest):
    """(current path, archive path) of a shipped row after the move phase."""
    dest = dest.split(" — ", 1)[0]
    if dest in ("(in place)", path):
        return path, path
    if posixpath.dirname(path) in ("docs/prd", ARCH):
        return path, dest
    return "docs/prd/" + re.sub(r"^\d{4}-\d{2}-", "", posixpath.basename(dest)), dest

shipped = {}  # current path -> (archive path, last commit date)
partial = {}  # current path -> (archive path, last commit date)
for path, _st, _f, date, _ev, cls, dest in rows:
    if cls == "shipped":
        cur, arch = locate(path, dest)
        shipped[cur] = (arch, date)
    elif cls == "partial":
        cur = dest.split(" — ", 1)[0].replace("(in place)", path)
        month = date[:7] if re.match(r"^\d{4}-\d{2}", date) else "0000-00"
        arch = cur if cur.startswith(ARCH + "/") else "%s/%s-%s" % (ARCH, month, posixpath.basename(cur))
        partial[cur] = (arch, date)
def pending(cur):
    return cur != shipped[cur][0] and os.path.exists(cur)
def split_pending(cur):  # the original is archived once split
    return cur != partial[cur][0] and not os.path.exists(partial[cur][0])

fold_docs = [path for path, _st, _f, _d, _ev, cls, dest in rows
             if cls.startswith("doc:") and dest.split(" — ", 1)[0] == "fold"]

def stem(p):  # docs/prd/archive/2026-09-feed.md, docs/prd/feed.md, feed -> feed
    return re.sub(r"^\d{4}-\d{2}-", "", posixpath.splitext(posixpath.basename(p))[0])

# Impl plans whose destination is `merge <prd>` leave with that PRD's group:
# archive moves them beside it as "Status: MERGED <date> into <archived prd>".
merges = {}  # PRD stem -> [(impl plan path, archive path, last commit date)]
for path, _st, _f, date, _ev, cls, dest in rows:
    m = re.match(r"^merge (\S+)$", dest.split(" — ", 1)[0])
    if cls == "doc:impl-plan" and m:
        month = date[:7] if re.match(r"^\d{4}-\d{2}", date) else "0000-00"
        merges.setdefault(stem(m.group(1)), []).append(
            (path, "%s/%s-%s" % (ARCH, month, posixpath.basename(path)), date))

groups = {}  # cap -> [current paths], plan order
gs, ge = section("## Capability groups")
for line in plan[gs + 1:ge] if gs is not None else []:
    m = re.match(r"^- ([a-z0-9-]+): (.+)$", line)
    if m:
        groups[m.group(1)] = [p.strip() for p in m.group(2).split(",") if p.strip()]
owner = {p: c for c, ps in groups.items() for p in ps}

def created(p):
    out = git("log", "--follow", "--diff-filter=A", "--format=%as", "--", p).split()
    return out[-1] if out else "—"

def title(p):
    for l in open(p, encoding="utf-8", errors="replace"):
        if l.startswith("# "):
            return l[2:].strip()
    return "—"

def oldest_first(paths):
    return sorted(paths, key=lambda p: (created(p), p))

# --- groups ------------------------------------------------------------------
if CMD == "groups":
    if ARGS and ARGS[0] == "--write":
        if gs is None:
            die("%s has no ## Capability groups" % PLAN)
        new = dict(groups)
        for spec in ARGS[1:]:
            cap, _, rest = spec.partition(":")
            cap, paths = cap.strip(), [p.strip() for p in rest.split(",") if p.strip()]
            if not KEBAB.match(cap) or not paths:
                die("bad group %r (want 'kebab-name: path, path')" % spec)
            for p in paths:
                if p not in shipped:
                    die("%s is not a shipped PRD in the plan" % p)
                other = next((c for c, ps in new.items() if c != cap and p in ps), None)
                if other:
                    die("%s is already in group %s" % (p, other))
            new[cap] = oldest_first(paths)
        lines = ["- %s: %s" % (c, ", ".join(ps)) for c, ps in new.items()]
        plan[gs + 1:ge] = [""] + lines + [""]
        open(PLAN, "w", encoding="utf-8").write("\n".join(plan))
        for l in lines:
            print("group   " + l[2:])
        sys.exit(0)
    todo = oldest_first([p for p in shipped if pending(p)])
    print("Shipped PRDs to fold (oldest first): %d" % len(todo))
    if todo:
        print("\n| PRD | Title | Created | Last commit | Group |\n|---|---|---|---|---|")
        for p in todo:
            print("| %s | %s | %s | %s | %s |" % (p, title(p).replace("|", "\\|"), created(p),
                                                shipped[p][1], owner.get(p, "—")))
    if groups:
        print()
        for c, ps in groups.items():
            left = [p for p in ps if p in shipped and pending(p)]
            plans = sum(len(merges.get(stem(p), [])) for p in ps)
            print("group %s: %d PRDs%s, %s" % (c, len(ps), " (+%d impl plan%s)" % (plans, "s" * (plans != 1))
                                                if plans else "", "pending" if left else "done"))
    loose = [p for p in todo if p not in owner]
    if loose:
        print("\nUngrouped: %d" % len(loose))
    sys.exit(0)

# --- claims ------------------------------------------------------------------
if CMD == "claims":
    if len(ARGS) != 1 or not os.path.isfile(ARGS[0]):
        die("claims needs one PRD file")
    text = open(ARGS[0], encoding="utf-8", errors="replace").read().split("\n")
    WANT = re.compile(r"^## +(expected behavior|behavior|requirements|acceptance criteria|invariants)", re.I)
    ITEM = re.compile(r"^\s*(?:\d+[.)]|[-*+])(?:\s+\[[ xX]\])?\s+(.*)$")
    claims, on, cur = [], False, None
    for n, line in enumerate(text, 1):
        if line.startswith("## "):
            on, cur = bool(WANT.match(line)), None
            continue
        if not on or line.startswith("#"):
            cur = None if line.startswith("#") else cur
            continue
        m = ITEM.match(line)
        if m:
            cur = [n, m.group(1).strip()]; claims.append(cur)
        elif cur and line.strip() and line[:1].isspace():
            cur[1] += " " + line.strip()
        elif not line.strip():
            cur = None
    def tokens(c):
        out = []
        for span in re.findall(r"`([^`]+)`", c):
            for t in [span] + re.split(r"[\s=(),\[\]{}<>|]+", span):
                t = t.strip(".,:;'\"")
                if len(t) >= 3 and re.search(r"[A-Za-z0-9]", t) and t not in out:
                    out.append(t)
        return out
    toks = sorted({t for _, c in claims for t in tokens(c)})
    hits = []
    if toks:
        args = ["grep", "-nIF"] + [x for t in toks for x in ("-e", t)] + ["--", ".", ":!*.md"]
        r = subprocess.run(["git", *args], capture_output=True, text=True)
        hits = r.stdout.split("\n")
    first = {}
    for h in hits:
        for t in toks:
            if t not in first and t in h.split(":", 2)[-1]:
                first[t] = ":".join(h.split(":", 2)[:2])
    tally = {"evidence": 0, "none": 0, "no-anchor": 0}
    out = []
    for n, c in claims:
        ts = tokens(c)
        found = next((t for t in ts if t in first), None)
        kind = "evidence" if found else ("none" if ts else "no-anchor")
        tally[kind] += 1
        where = "%s `%s`" % (first[found], found) if found else ""
        short = c if len(c) <= 90 else c[:87] + "..."
        out.append("L%-4d %-9s %s— %s" % (n, kind, where + " " if where else "", short))
    print("Claims in %s: %d (evidence %d · none %d · no anchor %d)" %
          (ARGS[0], len(claims), tally["evidence"], tally["none"], tally["no-anchor"]))
    for l in out:
        print(l)
    sys.exit(0)

# --- shared by archive and split ---------------------------------------------
DRY = bool(ARGS) and ARGS[0] in ("-n",)
if DRY:
    ARGS = ARGS[1:]

def on_branch(want):  # want, or any docs/migrate-prds-<topic> bundle
    if not git("branch", "--show-current").strip().startswith("docs/migrate-prds-"):
        die("run on branch %s or a docs/migrate-prds-<topic> bundle" % want)

def status_word(path):
    for l in open(path, encoding="utf-8", errors="replace").read().split("\n")[:5]:
        m = re.match(r"[ >]*Status:\s*([A-Za-z]+)", l.replace("*", ""))
        if m:
            return m.group(1).upper()
    return "—"

def set_status(path, value):
    lines = open(path, encoding="utf-8").read().split("\n")
    new = "Status: " + value
    for i, l in enumerate(lines[:5]):
        if re.match(r"[ >]*Status:", l.replace("*", "")):
            lines[i] = new; break
    else:
        at = next((i + 1 for i, l in enumerate(lines[:5]) if l.startswith("# ")), 0)
        lines[at:at] = [new]
    open(path, "w", encoding="utf-8").write("\n".join(lines))

def edit_index(readme, drop=(), add=None, header="| Spec | Capability | Owner surfaces |"):
    """Drop rows linking any of `drop`; add row `add` (name, link, cell) or,
    if a row already links it, set that row's second cell."""
    if not os.path.exists(readme):
        if add:
            print("warning: no %s; row not added" % readme)
        return
    lines = open(readme, encoding="utf-8").read().split("\n")
    start = next((i for i, l in enumerate(lines) if l.startswith("## Index")), None)
    if start is None:
        print("warning: %s has no ## Index" % readme); return
    end = start + 1
    while end < len(lines) and not lines[end].startswith("## "):
        end += 1
    kept, changed = [], False
    for i in range(start + 1, end):
        l = lines[i]
        if l.startswith("|") and any("](%s)" % d in l or "](%s#" % d in l for d in drop):
            print("unindex %s: %s" % (readme, l)); changed = True
        else:
            kept.append(l)
    if add:
        row = "| [%s](%s) | %s | — |" % add
        at = next((j for j, l in enumerate(kept) if "](%s)" % add[1] in l), None)
        if at is not None:
            cells = kept[at].split(" | ")
            if len(cells) >= 3 and cells[1] != add[2] and header.startswith("| PRD"):
                cells[1] = add[2]; kept[at] = " | ".join(cells)
                print("index   %s: %s" % (readme, kept[at])); changed = True
        else:
            rows_at = [j for j, l in enumerate(kept) if l.startswith("|")]
            if rows_at and "(none" in kept[rows_at[-1]]:
                kept[rows_at[-1]] = row
            elif rows_at:
                kept.insert(rows_at[-1] + 1, row)
            else:
                kept[0:0] = [header, "|---|---|---|", row]
            print("index   %s: %s" % (readme, row)); changed = True
    if changed and not DRY:
        lines[start + 1:end] = kept
        open(readme, "w", encoding="utf-8").write("\n".join(lines))

def spec_row(cap):
    spec = "docs/specs/%s.md" % cap
    edit_index("docs/specs/README.md", add=(cap, cap + ".md", title(spec).replace("|", "\\|")))

def plan_done(skip_shipped=(), skip_partial=(), skip_docs=()):
    """Print the plan line; True when nothing shipped/partial/fold is left."""
    ls = [p for p in shipped if p not in skip_shipped and pending(p)]
    lp = [p for p in partial if p not in skip_partial and split_pending(p)]
    ld = [p for p in fold_docs + [ip for ps in merges.values() for ip, _a, _d in ps]
          if p not in skip_docs and os.path.exists(p)]
    print("plan: %s" % ("removed (migration complete)" if not (ls or lp or ld) else
          "kept (%d shipped, %d partial%s left)" % (len(ls), len(lp), ", %d docs" % len(ld) if ld else "")))
    return not (ls or lp or ld)

FEATURES = os.path.join(os.environ["HERE"], "..", "..", "implement-prd-section", "scripts", "features.sh")

def commit(msg, body, done):
    if done:
        git("rm", "-q", PLAN)
    if os.path.exists("docs/FEATURES.md"):  # feature-list §3: keep it current
        subprocess.run([FEATURES, "."], check=True, stdout=subprocess.DEVNULL)
    git("add", "-A")
    if subprocess.run(["git", "diff", "--cached", "--quiet"]).returncode == 0:
        sys.exit(0)  # re-run: nothing left to do
    git("commit", "-qm", msg, "-m", body)

def mv_commit(n):
    # Renames get their own commit so a small PRD's later edits can't push it
    # under git's rename similarity and break `git log --follow`.
    git("commit", "-qm", "Move %d PRD%s to %s/ (moves only)" % (n, "s" * (n != 1), ARCH))

def report(changed, warnings):
    for f, n in changed:
        print("rewrote %s (%d)" % (f, n))
    for w in warnings:
        print("warning: " + w)

# --- reference docs: sections, extract, archive-doc --------------------------
TARGET = re.compile(r"^([a-z0-9]+(-[a-z0-9]+)*|drop|claude-md|map:[\w./-]+|prd:[a-z0-9]+(-[a-z0-9]+)*)$")
DROP_WORDS = ("history", "changelog", "superseded", "deprecated", "legacy", "roadmap", "plan")
RULE_WORDS = ("ownership", "conventions", "rules")

def sec_map(doc):
    """{heading: target} recorded under ## Sections for doc."""
    out, (a, b) = {}, section("## Sections")
    for line in plan[a + 1:b] if a is not None else []:
        cells = [c.strip().replace("\\|", "|") for c in re.split(r"(?<!\\)\|", line)[1:-1]]
        if len(cells) == 3 and cells[0] == doc:
            out[cells[1]] = cells[2]
    return out

def need_doc(doc):
    if doc not in fold_docs:
        die("%s is not a doc row with destination fold in %s" % (doc, PLAN))
    if not os.path.isfile(doc):
        die("missing: " + doc)

def heading_arg(doc, text):
    h = secs.match_heading(doc, text)
    if not h:
        die("%r names no single ## heading of %s" % (text, doc))
    return h

def propose(h):
    words = set(re.findall(r"[a-z0-9]+", re.split(r"[(:]", h)[0].lower()))
    if words & set(DROP_WORDS):
        return "drop"
    if words & set(RULE_WORDS):
        return "claude-md"
    for cap in groups:
        if {w for w in cap.split("-") if len(w) > 3} & words:
            return cap
    stem = re.split(r"[(:]", h)[0].replace("`", "").lower()
    return "-".join(re.findall(r"[a-z0-9]+", stem)[:3]) or "?"

if CMD in ("sections", "extract", "archive-doc"):
    write = CMD == "sections" and ARGS[:1] == ["--write"]
    ARGS = ARGS[1:] if write else ARGS
    if not ARGS:
        die("%s needs a doc path" % CMD)
    doc = ARGS[0]
    need_doc(doc)
    hs = secs.headings(doc)
    cur = sec_map(doc)

if CMD == "sections" and write:
    if len(ARGS) < 2:
        die("sections --write needs '<heading>: <target>' pairs")
    new = dict(cur)
    for pair in ARGS[1:]:
        head, sep, tgt = pair.rpartition(": ")
        if not sep or not TARGET.match(tgt.strip()):
            die("bad pair %r (want '<heading>: <cap>|drop|claude-md|map:<dir>|prd:<name>')" % pair)
        new[heading_arg(doc, head.strip())] = tgt.strip()
    missing = [h for h, _a, _b in hs if h not in new]
    if missing:
        die("every ## heading needs a target; unmapped: " + "; ".join(missing))
    a, b = section("## Sections")
    table = ["| Doc | Heading | Target |", "|---|---|---|"]
    if a is not None:
        table = [l for l in plan[a + 1:b] if l.startswith("|") and not l.startswith("| %s |" % doc)] or table
    table += ["| %s | %s | %s |" % (doc, h.replace("|", "\\|"), new[h]) for h, _a, _b in hs]
    if a is None:
        plan += ["", "## Sections"]
        a = b = len(plan) - 1; b += 1
    plan[a + 1:b] = [""] + table + [""]
    open(PLAN, "w", encoding="utf-8").write("\n".join(plan).rstrip("\n") + "\n")
    for h, _a, _b in hs:
        print("section %s -> %s" % (h, new[h]))
    sys.exit(0)

if CMD == "sections":
    found = secs.cites(doc, skip={PLAN})
    count = {}
    for f, n, _a, _b, sec, _t in found:
        count[sec] = count.get(sec, 0) + 1
    lines = open(doc, encoding="utf-8", errors="replace").read().split("\n")
    total = sum(len(l) + 1 for l in lines) // 4
    print("Sections in %s: %d (~%d tokens; %d citations: %d anchored, %d bare, %d unresolved)" % (
        doc, len(hs), total, len(found), sum(v for k, v in count.items() if k),
        count.get("", 0), count.get(None, 0)))
    print("\n| Lines | ~Tokens | Cited | Heading | Target |\n|---|---|---|---|---|")
    for h, a, b in hs:
        tok = sum(len(l) + 1 for l in lines[a - 1:b]) // 4
        tgt = cur.get(h) or propose(h) + " (proposed)"
        print("| L%d-%d | ~%d | %d | %s | %s |" % (a, b, tok, count.get(h, 0), h.replace("|", "\\|"), tgt))
    for f, n, _a, _b, sec, t in found:
        if sec is None:
            print("unresolved: %s:%d: %s" % (f, n, t))
    sys.exit(0)

if CMD == "extract":
    if len(ARGS) != 2:
        die("extract needs <doc> <heading>")
    print(secs.section_text(doc, heading_arg(doc, ARGS[1])))
    sys.exit(0)

if CMD == "archive-doc":
    missing = [h for h, _a, _b in hs if h not in cur]
    if missing:
        die("map every section first (sections --write); unmapped: " + "; ".join(missing))
    into, errs = [], []
    for h, _a, _b in hs:
        t = secs.target_of(cur[h])
        if t is None:
            continue
        path = t[0]
        if cur[h].startswith("prd:") and not os.path.exists(path):
            arch = [p for p in os.listdir(ARCH) if p.endswith("-" + posixpath.basename(path))] if os.path.isdir(ARCH) else []
            path = "%s/%s" % (ARCH, arch[0]) if arch else path
        if not os.path.exists(path):
            errs.append("%s (for %s) does not exist; fold that section first" % (path, h))
        elif path not in into:
            into.append(path)
    left = [c for c in secs.cites(doc, skip={PLAN}) if c[4] is not None and (c[4] == "" or cur.get(c[4]) != "drop")]
    if left:
        errs.append("%d citations still point at %s; run relink.sh --sections %s" % (len(left), doc, doc))
    if errs:
        for e in errs:
            print("error: " + e)
        sys.exit(2)
    date = git("log", "-1", "--format=%as", "--", doc).strip() or "0000-00-00"
    stem = re.sub(r"^\d{4}-\d{2}-", "", posixpath.basename(doc))
    arch = "%s/%s-%s" % (ARCH, date[:7], stem)
    if os.path.exists(arch):
        die("destination taken: " + arch)
    today = subprocess.run(["date", "+%Y-%m-%d"], capture_output=True, text=True).stdout.strip()
    status = "FOLDED %s into %s" % (today, ", ".join(into)) if into else "FOLDED %s (all sections dropped)" % today
    print("archive %s -> %s (Status: %s)" % (doc, arch, status))
    if not DRY:
        os.makedirs(ARCH, exist_ok=True)
        git("mv", "--", doc, arch)
        git("commit", "-qm", "Move %s to %s/ (moves only)" % (posixpath.basename(doc), ARCH))
        set_status(arch, status)
    changed, warnings = relink({doc: arch}, DRY, skip={PLAN})
    report(changed, warnings)
    done = plan_done(skip_docs={doc})
    if not DRY:
        commit("Archive %s folded into specs" % doc,
               "Every section is folded or dropped (## Sections in the plan); %d references rewritten."
               % sum(n for _, n in changed), done)
    sys.exit(0)

# --- archive -----------------------------------------------------------------
if CMD == "archive":
    if len(ARGS) != 1:
        die("archive needs one capability name")
    cap = ARGS[0]
    if cap not in groups:
        die("no group %r under ## Capability groups (record it with groups --write)" % cap)
    spec = "docs/specs/%s.md" % cap
    if not os.path.isfile(spec):
        die("write and commit %s first" % spec)
    moves, dates = {}, {}
    for p in groups[cap]:
        if p not in shipped:
            die("%s is not a shipped PRD in the plan" % p)
        arch, date = shipped[p]
        if not pending(p):
            print("already archived: " + p); continue
        if os.path.exists(arch):
            die("destination taken: %s (for %s)" % (arch, p))
        if date in ("", "—"):
            date = git("log", "-1", "--format=%as", "--", p).strip() or "—"
        moves[p], dates[p] = arch, date
    plans = {}  # impl plan -> (archive path, Status value)
    for p in groups[cap]:
        for ip, arch, date in merges.get(stem(p), []):
            if not os.path.exists(ip):
                continue
            if os.path.exists(arch):
                die("destination taken: %s (for %s)" % (arch, ip))
            if date in ("", "—"):
                date = git("log", "-1", "--format=%as", "--", ip).strip() or "—"
            plans[ip] = (arch, "MERGED %s into %s" % (date, shipped[p][0]))
    for p in moves:
        print("archive %s -> %s (Status: SHIPPED %s (migrated))" % (p, moves[p], dates[p]))
    for ip, (arch, st) in plans.items():
        print("archive %s -> %s (Status: %s)" % (ip, arch, st))
    if not DRY and (moves or plans):
        for p, arch in sorted(list(moves.items()) + [(ip, a) for ip, (a, _s) in plans.items()]):
            os.makedirs(posixpath.dirname(arch), exist_ok=True)
            git("mv", "--", p, arch)
        mv_commit(len(moves) + len(plans))
        for p in sorted(moves):
            set_status(moves[p], "SHIPPED %s (migrated)" % dates[p])
        for arch, st in plans.values():
            set_status(arch, st)
    edit_index("docs/prd/README.md", drop=[posixpath.relpath(p, "docs/prd") for p in moves])
    changed, warnings = relink(dict(moves, **{ip: a for ip, (a, _s) in plans.items()}), DRY, skip={PLAN})
    report(changed, warnings)
    spec_row(cap)
    done = plan_done(skip_shipped=moves, skip_docs=plans)
    if not DRY:
        commit("Archive PRDs folded into %s" % spec,
               "%d PRDs -> %s/ with Status SHIPPED (migrated)%s; %d references rewritten."
               % (len(moves), ARCH, ", %d impl plan%s MERGED beside them" % (len(plans), "s" * (len(plans) != 1))
                  if plans else "", sum(n for _, n in changed)), done)
    sys.exit(0)

# --- split points --------------------------------------------------------------
splits = {}  # partial path -> (cap, shipped items, new prd)
ss, se = section("## Split points")
for line in plan[ss + 1:se] if ss is not None else []:
    m = re.match(r"^- (\S.*?): (\S+) · shipped: (.*?) · rest: (\S.*)$", line)
    if m:
        splits[m.group(1)] = (m.group(2), m.group(3), m.group(4))

# --- reclass -------------------------------------------------------------------
if CMD == "reclass":
    if len(ARGS) != 2 or ARGS[1] not in ("shipped", "active"):
        die("reclass <prd> shipped|active")
    prd, cls = ARGS
    if prd not in partial:
        die("%s is not a partial PRD in the plan" % prd)
    if not split_pending(prd):
        die("%s is already split" % prd)
    dest = partial[prd][0] if cls == "shipped" else prd
    for i in range(s + 1, e):
        cells = [c.strip() for c in re.split(r"(?<!\\)\|", plan[i])[1:-1]]
        if not plan[i].startswith("| ") or len(cells) != 7 or cells[5] != "partial":
            continue
        path = cells[0].replace("\\|", "|")
        if cells[6].replace("\\|", "|").split(" — ", 1)[0].replace("(in place)", path) == prd:
            cells[5:7] = [cls, dest + " — reclassed from partial"]
            plan[i] = "| " + " | ".join(cells) + " |"
            break
    if ss is not None:  # a split point no longer applies
        plan[ss + 1:se] = [l for l in plan[ss + 1:se] if not l.startswith("- %s: " % prd)]
    open(PLAN, "w", encoding="utf-8").write("\n".join(plan))
    print("reclass %s: partial -> %s (%s)" % (prd, cls, dest))
    sys.exit(0)

if CMD == "splits":
    if ARGS and ARGS[0] == "--write":
        if ss is None:
            die("%s has no ## Split points" % PLAN)
        if len(ARGS) not in (4, 5):
            die("splits --write <prd> <cap> <shipped items> [<new prd>]")
        prd, cap, items = ARGS[1], ARGS[2], ARGS[3].strip()
        new = ARGS[4] if len(ARGS) == 5 else prd
        if prd not in partial:
            die("%s is not a partial PRD in the plan" % prd)
        if not KEBAB.match(cap) or not items:
            die("need a kebab capability name and the shipped items")
        if not new.startswith("docs/prd/") or new.startswith(ARCH + "/") or not new.endswith(".md"):
            die("new PRD must be docs/prd/<name>.md")
        if new != prd and (os.path.exists(new) or new in shipped or new in partial):
            die("new PRD path taken: " + new)
        splits[prd] = (cap, items, new)
        lines = ["- %s: %s · shipped: %s · rest: %s" % ((k,) + v) for k, v in sorted(splits.items())]
        plan[ss + 1:se] = [""] + lines + [""]
        open(PLAN, "w", encoding="utf-8").write("\n".join(plan))
        print("split   " + "%s: %s · shipped: %s · rest: %s" % ((prd,) + splits[prd]))
        sys.exit(0)
    todo = sorted(p for p in partial if split_pending(p))
    print("Partial PRDs to split: %d" % len(todo))
    if todo:
        print("\n| PRD | Title | Last commit | Split point |\n|---|---|---|---|")
        for p in todo:
            sp = splits.get(p)
            print("| %s | %s | %s | %s |" % (p, title(p).replace("|", "\\|") if os.path.exists(p) else "—",
                  partial[p][1], "%s · shipped: %s · rest: %s" % sp if sp else "—"))
    done = sorted(p for p in partial if not split_pending(p))
    for p in done:
        print("split done: " + p)
    sys.exit(0)

# --- split -----------------------------------------------------------------------
CHECK = bool(ARGS) and ARGS[0] == "--check"
if CHECK:
    ARGS = ARGS[1:]
if len(ARGS) != 1:
    die("split needs one partial PRD path")
prd = ARGS[0]
if prd not in partial:
    die("%s is not a partial PRD in the plan" % prd)
if prd not in splits:
    die("no split point for %s (record it with splits --write)" % prd)
cap, items, new = splits[prd]
spec = "docs/specs/%s.md" % cap
arch, date = partial[prd]
branch = "docs/migrate-prds-split-" + posixpath.splitext(posixpath.basename(prd))[0]

if not CHECK:
    if not os.path.isfile(spec):
        die("fold the shipped part (%s) into %s and commit it first" % (items, spec))
    if not DRY:
        on_branch(branch)
        if git("status", "--porcelain").strip():
            die("worktree not clean")
    if not split_pending(prd):
        print("already archived: %s -> %s" % (prd, arch)); sys.exit(0)
    if not os.path.exists(prd):
        die("missing: " + prd)
    print("archive %s -> %s (Status: SUPERSEDED by %s)" % (prd, arch, new))
    if not DRY:
        os.makedirs(ARCH, exist_ok=True)
        git("mv", "--", prd, arch)
        mv_commit(1)
    # Only the archived file's own links are re-resolved: references to the
    # PRD's path keep pointing there, where the change PRD for the rest goes.
    changed, warnings = relink({prd: arch}, DRY, skip={PLAN}, only={arch})
    report(changed, [])
    if new != prd:
        edit_index("docs/prd/README.md", drop=[posixpath.relpath(prd, "docs/prd")])
    if not DRY:
        set_status(arch, "SUPERSEDED by " + new)
    spec_row(cap)
    # The path now holds only the rest: list who cites it, so citations of
    # shipped behavior get repointed to the spec (a dry relink counts them).
    cites, _w = relink({prd: spec}, True, skip={PLAN, prd, arch, spec, "docs/prd/README.md", "docs/FEATURES.md"})
    for f, n in cites:
        print("cite: %s (%d)" % (f, n))
    print("next: write %s (Spec delta against %s, State with a Sections: list)%s, then fold.sh split --check %s"
          % (new, spec, ", repoint the cite: lines about shipped behavior to " + spec if cites else "", prd))
    if not DRY:
        commit("Archive %s as superseded by %s" % (posixpath.basename(prd), new),
               "Split point: shipped %s -> %s; the rest becomes a change PRD." % (items, spec), False)
    sys.exit(0)

# --check: validate the change PRD, index it, commit it.
on_branch(branch)
if split_pending(prd):
    die("run fold.sh split %s first" % prd)
if not os.path.isfile(new):
    die("missing change PRD " + new)
dirty = [l[3:] for l in git("status", "--porcelain", "-uall").split("\n") if l]
other = [d for d in dirty if d != new]
if other:
    die("uncommitted changes besides %s: %s" % (new, ", ".join(other)))
text = open(new, encoding="utf-8").read()
def block(name):
    m = re.search(r"^## %s[^\n]*\n(.*?)(?=^## |\Z)" % re.escape(name), text, re.M | re.S)
    return m.group(1) if m else None
errs = []
delta = block("Spec delta")
if delta is None:
    errs.append("no ## Spec delta")
elif "%s.md" % cap not in delta and not any(
        os.path.isfile(m.group(2)) or m.group(1) == "ADDED"
        for m in re.finditer(r"^- (ADDED|MODIFIED|REMOVED) `(docs/specs/[^`]+\.md)`", delta, re.M)):
    # A capability split by size folds into whichever spec owns the rest.
    errs.append("## Spec delta names neither %s nor an existing or ADDED spec" % spec)
state = block("State")
items_ = re.findall(r"^\s+- \[(.)\] ", state or "", re.M)
if state is None or "Sections:" not in state:
    errs.append("no ## State with a Sections: list")
elif not items_:
    errs.append("Sections: has no items")
elif any(c != " " for c in items_):
    errs.append("Sections: items must all be [ ]")
if status_word(new) == "—":
    errs.append("no Status: line in the first 5 lines")
if errs:
    for e in errs:
        print("error: %s: %s" % (new, e))
    sys.exit(2)
if new != prd:  # renamed: references to the original now mean the change PRD
    git("add", "--", new)
    report(*relink({prd: new}, False, skip={PLAN, arch}))
edit_index("docs/prd/README.md", add=(posixpath.splitext(posixpath.basename(new))[0],
           posixpath.relpath(new, "docs/prd"), status_word(new)), header="| PRD | Status | Owner surfaces |")
done = plan_done(skip_partial={prd})
commit("Add %s change PRD for the unbuilt part" % posixpath.basename(new),
       "Rest of %s after the split (%d sections, all todo)." % (prd, len(items_)), done)
PY
