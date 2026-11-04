#!/usr/bin/env bash
# Inventory a repo's PRDs and propose a class + destination for each.
# Read-only; same repo state => byte-identical output. No State needed.
#   inventory.sh [path]          table + counts (path: anywhere in the repo)
#   inventory.sh --plan [path]   the same rows as docs/prd/migration-plan.md
# Destinations: active/partial -> docs/prd/<kebab-name>.md (files already
# there stay; an open branch/PR keeps the basename); shipped ->
# docs/prd/archive/YYYY-MM-<kebab-name>.md (last-commit month); unknown stays.
# Evidence per candidate (detect.sh): status line, State / Sections / Spec
# delta, last commit date, and branches + PRs whose name contains the file's
# kebab basename. PRs come from one `gh pr list`; without a working gh,
# branch evidence only (said once).
# Status: first word of the Status: line, or the phrase IN PROGRESS / ON HOLD.
# Class: status SHIPPED/DONE/FOLDED/SUPERSEDED -> shipped. Status DRAFT/
# APPROVED/BUILDING/IN PROGRESS/ON HOLD/PROPOSED/SHIPPING -> partial if
# anything merged (or the status text says shipped/landed) and no Sections:
# list, else active. No such status -> shipped if
# merged and nothing open, partial if both, active if only open, else unknown.
# docs/prd/research-*.md -> research, docs/research/<topic>.md: the topic drops
# `research-` and a leading YYYY-MM-; nothing left -> docs/research/?.md, which
# the owner names before move.
# A file named only `prd` (e.g. docs/PRD.md) gathers no PR/branch evidence.
# Doc rows (class doc:<kind>, after the PRD rows): every other tracked *.md
# outside docs/prd|specs|research|guides/, .claude/, .github/, vendor dirs and
# the known names (README/CLAUDE/AGENTS/CHANGELOG/CONTRIBUTING.md, LICENSE*,
# docs/README.md, docs/FEATURES.md); a README.md elsewhere under docs/ is
# listed. Kind, first rule wins (the rule is the evidence): skill, record, map,
# impl-plan, plan, reference, research (incl. decision logs), howto, unknown. Evidence also holds
# lines, ~tokens (bytes/4) and code citations (files/§-anchored, one git grep
# over non-markdown files). Over 4k tokens or ## headings of different kinds
# -> `mixed`; reference and mixed unknown rows propose `fold`. A reference
# name (architecture.md, methodology.md, *contract*) listed under Area maps is
# a reference, not a map.
set -euo pipefail
export LC_ALL=C
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/detect.sh"

MODE=table
[ "${1:-}" = --plan ] && { MODE=plan; shift; }
DIR="${1:-.}"
[ -d "$DIR" ] || { echo "inventory.sh: not a directory: $DIR" >&2; exit 2; }
ROOT="$(git -C "$DIR" rev-parse --show-toplevel 2>/dev/null)" \
  || { echo "inventory.sh: not a git repository: $DIR" >&2; exit 2; }
cd "$ROOT"

GH_JSON=""
if command -v gh >/dev/null 2>&1; then
  GH_JSON="$(gh pr list --state all --limit 1000 \
    --json number,state,headRefName,title 2>/dev/null)" || GH_JSON=""
fi

CANDS="$(prd_candidates .)" GH_JSON="$GH_JSON" MODE="$MODE" python3 - <<'PY'
import itertools, json, os, re, subprocess

def git(*args):
    r = subprocess.run(["git", *args], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else ""

def kebab(s):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")

def cell(s):
    return s.replace("|", "\\|")

cands = [c for c in os.environ["CANDS"].split("\n") if c]
gh = None
if os.environ["GH_JSON"]:
    try:
        gh = json.loads(os.environ["GH_JSON"])
    except ValueError:
        gh = None

# Default branch: origin/HEAD, else main, else master.
default = git("symbolic-ref", "--short", "refs/remotes/origin/HEAD").split("/", 1)[-1]
if not default:
    default = next((b for b in ("main", "master")
                    if git("rev-parse", "--verify", "-q", "refs/heads/" + b)), "")

# Branch tips on the default branch's first-parent chain never had commits of
# their own (cut and left, or fast-forwarded): not evidence.
mainline = set(git("rev-list", "--first-parent", default).split()) if default else set()

def branch_names(*extra):
    out = {}
    for line in git("for-each-ref", "--format=%(objectname) %(refname)", *extra,
                    "refs/heads", "refs/remotes").splitlines():
        sha, ref = line.split(" ", 1)
        if sha in mainline:
            continue
        if ref.startswith("refs/heads/"):
            name = ref[len("refs/heads/"):]
        else:
            name = ref.split("/", 3)[3] if ref.count("/") >= 3 else ""
        if name and name != "HEAD" and name != default:
            out[name] = True
    return out

branches = branch_names()
merged = branch_names("--merged", default) if default else {}
pr_heads = {p["headRefName"] for p in gh} if gh else set()
head_date = git("log", "-1", "--format=%cd", "--date=short")
# Last commit date per path, from one log pass (no per-file processes).
last_date, cur = {}, ""
for l in git("-c", "core.quotepath=off", "log", "--format=@%cd", "--date=short", "--name-only").split("\n"):
    if l.startswith("@"):
        cur = l[1:]
    elif l and l not in last_date:
        last_date[l] = cur

ACTIVE = {"DRAFT", "APPROVED", "BUILDING", "IN PROGRESS", "ON HOLD", "PROPOSED", "SHIPPING"}
DONE = {"SHIPPED", "DONE", "FOLDED", "SUPERSEDED"}
rows, counts, dests = [], {"shipped": 0, "active": 0, "partial": 0, "unknown": 0, "research": 0}, {}
for path in cands:
    with open(path, encoding="utf-8", errors="replace") as f:
        lines = f.read().split("\n")
    status, said = "—", False
    for i, l in enumerate(lines[:5]):
        m = re.match(r"[ >]*Status:\s*(.*)", l.replace("*", ""))
        if m:
            word = re.match(r"in\s+progress\b|on\s+hold\b|[A-Za-z]+", m.group(1).strip(), re.I)
            status = " ".join(word.group(0).upper().split()) if word else "—"
            text = [m.group(1)] + [x for x in itertools.takewhile(str.strip, lines[i + 1:])]
            said = bool(re.search(r"\b(shipped|landed)\b", " ".join(text), re.I))
            break
    flags = [n for n, rx in (("State", r"## State\b"), ("Sections", r"\s*- Sections:"),
                             ("Delta", r"## Spec delta\b")) if any(re.match(rx, l) for l in lines)]
    date = last_date.get(path, "") or "uncommitted"

    stem = os.path.basename(path)[:-3]
    name = kebab(re.sub(r"(^|[-_. ])prd([-_. ]|$)", r"\1\2", stem, flags=re.I))
    key = kebab(stem) if name else ""  # a bare `prd` name matches every PRD PR
    ev, n_merged, n_open, kept = [], 0, 0, ""
    if gh is not None:
        for p in sorted(gh, key=lambda p: p["number"]):
            if key and (key in p["headRefName"].lower() or key in kebab(p["title"])):
                state = p["state"].lower()
                ev.append("PR #%d %s" % (p["number"], state))
                n_merged += state == "merged"
                if state == "open":
                    n_open += 1
                    kept = kept or "name kept: open PR #%d" % p["number"]
    for b in sorted(branches):
        if key and key in b.lower() and b not in pr_heads:
            if b in merged:
                ev.append("branch %s merged" % b); n_merged += 1
            else:
                ev.append("branch %s unmerged" % b); n_open += 1
                kept = kept or "name kept: open branch %s" % b

    if said and status in ACTIVE:
        ev.insert(0, "status says shipped")
    research = re.match(r"docs/prd/research-(.*)\.md$", path)
    if research:
        cls = "research"
    elif status in DONE:
        cls = "shipped"
    elif status in ACTIVE:  # a Sections: list already tracks its own progress
        cls = "partial" if (n_merged or said) and "Sections" not in flags else "active"
    elif n_merged and n_open:
        cls = "partial"
    elif n_merged:
        cls = "shipped"
    elif n_open:
        cls = "active"
    else:
        cls = "unknown"
    counts[cls] += 1

    name = name or kebab(stem)
    in_prd = os.path.dirname(path) == "docs/prd"
    if research:
        topic = re.sub(r"^\d{4}-\d{2}(-|$)", "", research.group(1))
        dest = "docs/research/%s.md" % (topic or "?")
    elif cls in ("active", "partial"):
        dest = path if in_prd else "docs/prd/" + (os.path.basename(path) if kept else name + ".md")
    elif cls == "shipped" and not path.startswith("docs/prd/archive/"):
        month = (date if date != "uncommitted" else head_date)[:7]
        dest = "docs/prd/archive/%s-%s.md" % (month, name)
    else:
        dest = path
    note = [kept] if kept and cls in ("active", "partial") else []
    if dest != path and dest in dests:
        note.append("collides with " + dests[dest])
    dests.setdefault(dest, path)
    shown = "(in place)" if dest == path else dest
    if note:
        shown += " — " + "; ".join(note)
    rows.append((path, status, "+".join(flags) or "—", date,
                 "; ".join(ev) or "—", cls, shown))

# --- Doc rows (migrate-docs §1) -------------------------------------------
candset = set(cands)
SKIP_DIRS = ("docs/prd/", "docs/specs/", "docs/research/", "docs/guides/", ".claude/", ".github/")
KNOWN = {"readme.md", "claude.md", "agents.md", "changelog.md", "contributing.md"}
VENDOR = {"node_modules", "vendor", "build", "dist"}

def is_doc(p):
    low = p.lower()
    if p in candset or p.startswith(SKIP_DIRS) or low in ("docs/readme.md", "docs/features.md"):
        return False
    parts = low.split("/")
    if VENDOR & set(parts[:-1]):
        return False
    if parts[-1] == "readme.md":
        return low.startswith("docs/")
    return parts[-1] not in KNOWN and not parts[-1].startswith("license")

docs = sorted(p for p in git("ls-files", "-z", "--", "*.md").split("\0") if p and is_doc(p))

def section_lines(path, heading):
    try:
        lines = open(path, encoding="utf-8", errors="replace").read().split("\n")
    except OSError:
        return []
    out, on = [], False
    for l in lines:
        if l.startswith("## "):
            on = l.strip() == heading
        elif on:
            out.append(l)
    return out

area_paths = {t for l in section_lines("CLAUDE.md", "## Area maps") for t in re.findall(r"`([^`]+)`", l)}

# Code citations: one git grep over non-markdown files for every doc basename.
# A basename shared by two docs is matched with its parent dir (`x/SKILL.md`).
bases = [os.path.basename(p) for p in docs]
cite_key = {p: os.path.basename(p) if bases.count(os.path.basename(p)) == 1
            else "/".join(p.split("/")[-2:]) for p in docs}
cites = {k: [set(), 0] for k in cite_key.values()}
if docs:
    args = ["grep", "-I", "-F", "--no-color"]
    for b in sorted(cites):
        args += ["-e", b]
    for line in git(*args, "--", ".", ":(exclude)*.md").splitlines():
        f, _, text = line.partition(":")
        for b, c in cites.items():
            if b in text:
                c[0].add(f)
                c[1] += bool(re.search(re.escape(b) + r"\s*§", text))

HEADING_KINDS = (
    ("plan", r"roadmap|\bplan\b|milestone|\bphase|next steps|\btodo|rollout|build order"),
    ("reference", r"contract|schema|\bapi\b|invariant|data model|architecture|interface"),
    ("research", r"\bsources\b|findings|competitor|market|survey|evidence|\bstudy"),
    ("howto", r"\bsetup\b|install|how to|troubleshoot"),
)

def frontmatter(lines):
    if not lines or lines[0].strip() != "---":
        return ""
    for i, l in enumerate(lines[1:40], 1):
        if l.strip() == "---":
            return "\n".join(lines[1:i])
    return ""

texts = {}
for p in docs:
    with open(p, encoding="utf-8", errors="replace") as f:
        texts[p] = f.read()
# A SKILL.md with name + description makes its directory one skill row (the
# whole directory moves); other files in it get no row. Any other file with
# that frontmatter is a single-file skill.
skills, skill_dirs = {}, set()
for p in docs:
    fm = frontmatter(texts[p].split("\n"))
    name = re.search(r"^name:\s*(\S.*)$", fm, re.M)
    if name and re.search(r"^description:", fm, re.M):
        skills[p] = kebab(name.group(1).strip("'\""))
        if os.path.basename(p).lower() == "skill.md" and os.path.dirname(p):
            skill_dirs.add(os.path.dirname(p) + "/")
docs = [p for p in docs if p in skills or not p.startswith(tuple(skill_dirs))]

def archived(x):
    for f in sorted(os.listdir("docs/prd/archive")) if os.path.isdir("docs/prd/archive") else []:
        if re.match(r"\d{4}-\d{2}-%s\.md$" % re.escape(x), f):
            return f[:7]
    return ""

def kind_of(p, text):
    lines = text.split("\n")
    head = "\n".join(lines[:15])
    base, low = os.path.basename(p), os.path.basename(p).lower()
    dirs = p.split("/")[:-1]
    stem = kebab(base[:-3])
    if p in skills:
        whole = low == "skill.md" and "/" in p
        return "skill", "frontmatter name+description", \
            ".claude/skills/%s/%s" % (skills[p], "" if whole else "SKILL.md")
    if "results" in dirs:
        return "record", "under results/", None
    ref_name = "contract" in low or low in ("architecture.md", "methodology.md")
    if (p in area_paths and not ref_name) or low.endswith(("-map.md", "-primer.md")):
        ev = "listed under ## Area maps" if p in area_paths else "name *-%s.md" % low.rsplit("-", 1)[1][:-3]
        count = {}
        for t in re.findall(r"`([^`\s]+/[^`\s]*)`", text):
            top = t.strip("./").split("/")[0]
            if top and top != "docs" and os.path.isdir(top):
                count[top] = count.get(top, 0) + 1
        top = sorted(count.items(), key=lambda kv: (-kv[1], kv[0]))
        return "map", ev, "%s/CLAUDE.md" % (top[0][0] if top else "?")
    m = re.search(r"^\W*PRD:\W*(?:\[[^\]]*\]\()?\S*?docs/prd/(?:archive/)?(?:\d{4}-\d{2}-)?([\w.-]+?)\.md", head, re.M)
    if m or low.endswith("-implementation.md"):
        x = m.group(1) if m else stem[:-len("-implementation")]
        ev = "header PRD: docs/prd/%s.md" % x if m else "name *-implementation.md"
        month = archived(x)
        return "impl-plan", ev, "docs/prd/archive/%s-%s-plan.md" % (month, x) if month else "merge " + x
    st = re.search(r"Status:\W*(PLANNED|DRAFT|IN PROGRESS|PROPOSED)\b", head.replace("*", ""), re.I)
    if low.endswith(("-plan.md", "-roadmap.md")) or "plans" in dirs or st:
        ev = ("name *-%s.md" % low.rsplit("-", 1)[1][:-3]) if low.endswith(("-plan.md", "-roadmap.md")) \
            else "under plans/" if "plans" in dirs else "status " + " ".join(st.group(1).upper().split())
        if re.search(r"^\s*[-*] \[ \]", text, re.M):
            return "plan", ev, "split"
        date = last_date.get(p, "") or head_date
        return "plan", ev, "docs/prd/archive/%s-%s.md" % (date[:7], stem)
    hit = re.search(r"binding|design of record|do not deviate", head, re.I)
    if "contract" in low or low in ("architecture.md", "methodology.md") or hit:
        ev = "name *contract*.md" if "contract" in low else "name " + low if not hit else 'header "%s"' % hit.group(0).lower()
        return "reference", ev, "fold"
    # A decision log (decisions made outside a PRD) is research with a
    # "Decided in" line (docs/research/reference-docs.md, ADRs); an adr/ or
    # decisions/ folder moves whole.
    ddir = next((d for d in dirs if d.lower() in ("adr", "adrs", "decisions")), "")
    title = re.search(r"^# +(decision log|decisions|adr\b|architecture decision)", head, re.I | re.M)
    if ddir or low in ("decisions.md", "decision-log.md") or low.endswith("-decisions.md") or title:
        ev = "decision log: " + ("under %s/" % ddir if ddir else "title" if title and low not in ("decisions.md", "decision-log.md") and not low.endswith("-decisions.md") else "name " + low)
        if ddir:
            return "research", ev, "docs/research/" + "/".join(p.split("/")[p.split("/").index(ddir):])
        return "research", ev, "docs/research/%s.md" % stem
    study = next((d for d in dirs if d.endswith(("-market", "-rounds"))), "")
    if re.search(r"^## Sources\b", text, re.M) or re.search(r"^Researched:\s*\d{4}-\d{2}", head, re.M) or study:
        ev = "under %s/" % study if study else "## Sources" if re.search(r"^## Sources\b", text, re.M) else "research date line"
        if study:
            return "research", ev, "docs/research/" + "/".join(p.split("/")[p.split("/").index(study):])
        topic = re.sub(r"^\d{4}-\d{2}(-\d{2})?(-|$)", "", re.sub(r"^research-", "", stem))
        return "research", ev, "docs/research/%s.md" % (topic or "?")
    if low.endswith("-setup.md") or base == "RELEASE.md" or (low == "readme.md" and p.startswith("docs/")):
        ev = "name *-setup.md" if low.endswith("-setup.md") else "name RELEASE.md" if base == "RELEASE.md" else "README.md under docs/"
        name = kebab(dirs[-1]) if low == "readme.md" else stem
        return "howto", ev, "docs/guides/%s.md" % name
    return "unknown", "no rule matched", None

KINDS = ("skill", "record", "map", "impl-plan", "plan", "reference", "research", "howto", "unknown")
dcounts, mixed_n = {k: 0 for k in KINDS}, 0
for p in docs:
    text = texts[p]
    kind, ev, dest = kind_of(p, text)
    dcounts[kind] += 1
    n_lines = text.count("\n") + (0 if text.endswith("\n") or not text else 1)
    tokens = len(text.encode("utf-8")) // 4
    files, anchored = cites[cite_key[p]]
    hk = sorted({k for h in re.findall(r"^## (.*)", text, re.M) for k, rx in HEADING_KINDS if re.search(rx, h, re.I)})
    mixed = []
    if tokens > 4000:
        mixed.append("~%d tokens" % tokens)
    if len(hk) > 1:
        mixed.append("headings " + "+".join(hk))
    mixed_n += bool(mixed)
    if mixed and kind == "unknown":
        dest = "fold"
    status = "—"
    for l in text.split("\n")[:15]:
        m = re.match(r"[ >]*Status:\s*(.*)", l.replace("*", ""))
        if m:
            word = re.match(r"in\s+progress\b|on\s+hold\b|[A-Za-z]+", m.group(1).strip(), re.I)
            status = " ".join(word.group(0).upper().split()) if word else "—"
            break
    evidence = "%s; %d lines · ~%d tokens · cited %d files/%d §" % (ev, n_lines, tokens, len(files), anchored)
    if mixed:
        evidence += "; mixed: " + ", ".join(mixed)
    date = last_date.get(p, "") or "uncommitted"
    note = []
    if dest and dest not in ("fold", "split") and not dest.startswith("merge ") and dest in dests:
        note.append("collides with " + dests[dest])
    if dest and not dest.endswith("/"):
        dests.setdefault(dest, p)
    shown = dest or "(in place)"
    if note:
        shown += " — " + "; ".join(note)
    rows.append((p, status, "—", date, evidence, "doc:" + kind, shown))
dtotal = "Docs: %d · " % len(docs) + " · ".join("%s %d" % (k, dcounts[k]) for k in KINDS) + " · mixed %d" % mixed_n

head = "| Path | Status | State/Delta | Last commit | Evidence | Class | Destination |\n" \
       "|---|---|---|---|---|---|---|"
body = "\n".join("| " + " | ".join(cell(c) for c in r) + " |" for r in rows)
total = " · ".join("%s %d" % (k, counts[k]) for k in ("shipped", "active", "partial", "unknown", "research"))
if os.environ["MODE"] == "plan":
    print("# Migration plan\n")
    print("Confirmed `/migrate-prds inventory` table. Later phases read it; the")
    print("last migration PR deletes this file.\n")
    print("## Files\n")
    print(head); print(body) if body else None
    print("\n## Capability groups\n(fold, phase 3)\n\n## Split points\n(split, phase 4)")
else:
    print("PRD inventory: %d candidates (default branch: %s)" % (len(cands), default or "none"))
    if gh is None:
        print("note: gh unavailable — branch evidence only")
    print()
    print(head)
    if body:
        print(body)
    print("\nCounts: " + total)
    print(dtotal)
PY
