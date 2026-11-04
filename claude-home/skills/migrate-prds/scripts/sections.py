# Shared by fold.sh (sections, extract, archive-doc) and relink.sh --sections:
# a reference doc's `##` sections and the citations of it across the repo.
#   headings(doc) -> [(heading, first line, last line)]  (`##` only, 1-based)
#   sub_parent(doc) -> {`###` heading: parent `##` heading}
#   cites(doc, skip) -> [(file, lineno, start, end, section, ref)] where
#     section is the `##` heading a `<doc> §<ref>` citation resolves to,
#     "" for a bare mention of the doc, None when it does not resolve or
#     quotes a line (`<doc>:<n>`, left for archive-doc to point at the archive).
#   retarget(doc, plan_map, skip, dry) -> (changed, unresolved)
# A citation is the doc's repo path, a path suffix of it, or its basename when
# no other tracked file shares it, optionally closed by ` or ), then
# `§<ref>` or `§"<ref>"`. <ref> matches a heading by its longest word prefix
# that names exactly one `##` (or `###`, counted under its parent) heading,
# case-insensitively and ignoring backticks. In a doc with numbered `##`
# headings (`## 3. Tokens`), a numeric ref (`§1.3`, `§4-6`, `§1.3, §2.6`) or a
# `plan|part|phase|section N [§…]` qualifier after the path resolves by its
# leading number and is consumed whole; a chain over two sections does not
# resolve. Fenced code in markdown is left alone; docs/prd/archive/ files are
# never edited; retarget lists a citation in a markdown heading, never rewrites it.
import posixpath, re, subprocess

FENCE = re.compile(r"^ {0,3}(```|~~~)")
_NUM = r"\d+(?:\.\d+)*"
NUM_CHAIN = re.compile(r"%s(?:\s*(?:[-–,/]|and)\s*§?\s*%s)*" % (_NUM, _NUM))
PLAN_REF = re.compile(r"\s+(?:plan|part|phase|section)\s+(\d+)\b(?:\s*§\s*%s)?" % NUM_CHAIN.pattern, re.I)


def _git(*args):
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def _norm(s):
    return re.sub(r"\s+", " ", s.replace("`", "")).strip().lower()


def _lines(doc):
    return open(doc, encoding="utf-8", errors="replace").read().split("\n")


def _walk(doc):
    """[(level, heading, line)] for ##/### outside fenced code."""
    out, fence = [], None
    for n, l in enumerate(_lines(doc), 1):
        m = FENCE.match(l)
        if fence:
            fence = None if m and m.group(1) == fence else fence
        elif m:
            fence = m.group(1)
        else:
            h = re.match(r"^(##|###) +(\S.*?)\s*#*\s*$", l)
            if h:
                out.append((len(h.group(1)), h.group(2), n))
    return out


def headings(doc):
    total = len(_lines(doc))
    h2 = [(t, n) for lv, t, n in _walk(doc) if lv == 2]
    return [(t, n, (h2[i + 1][1] - 1) if i + 1 < len(h2) else total) for i, (t, n) in enumerate(h2)]


def sub_parent(doc):
    parent, out = None, {}
    for lv, t, _n in _walk(doc):
        if lv == 2:
            parent = t
        elif parent:
            out.setdefault(t, parent)
    return out


def numbered(doc, _cache={}):
    """{N: `##` heading} for headings that start with a number (`## 3. Tokens`)."""
    if doc not in _cache:
        _cache[doc] = {}
        for t, _a, _b in headings(doc):
            m = re.match(r"(\d+)[.):]?\s", t)
            if m:
                _cache[doc].setdefault(int(m.group(1)), t)
    return _cache[doc]


def _numeric(doc, ref):
    """(## heading or None, chars consumed) for a numeric ref, or None when
    the doc has no numbered headings or ref is not numeric."""
    nums = numbered(doc)
    m = NUM_CHAIN.match(ref) if nums else None
    if not m:
        return None
    tops = {int(x.split(".")[0]) for x in re.findall(_NUM, m.group(0))}
    return (nums.get(tops.pop()) if len(tops) == 1 else None), m.end()


def section_text(doc, heading):
    lines = _lines(doc)
    for t, a, b in headings(doc):
        if t == heading:
            return "\n".join(lines[a - 1:b])
    return None


def match_heading(doc, text):
    """The one `##` heading whose text starts with `text` (word boundary)."""
    want = _norm(text)
    names = [t for t, _a, _b in headings(doc)]
    hits = [t for t in names if _norm(t) == want] or \
        [t for t in names if _norm(t).startswith(want) and not _norm(t)[len(want):len(want) + 1].isalnum()]
    return hits[0] if len(hits) == 1 else None


def resolve(doc, ref, _cache={}):
    """(## heading or None, chars of ref consumed)."""
    if doc not in _cache:
        h2 = [t for t, _a, _b in headings(doc)]
        _cache[doc] = [(_norm(t), t) for t in h2] + [(_norm(s), p) for s, p in sub_parent(doc).items()]
    names = _cache[doc]
    if ref.startswith('"'):
        end = ref.find('"', 1)
        body, base = ref[1:end], 1
    else:
        body, base, end = re.match(r'[^.,;:)`"(\n]*', ref).group(0), 0, None
    words = list(re.finditer(r"\S+", body))
    for k in range(len(words), 0, -1):
        want = _norm(body[:words[k - 1].end()])
        exact = {p for n, p in names if n == want}
        hits = exact or {p for n, p in names if n.startswith(want) and not n[len(want):len(want) + 1].isalnum()}
        if len(hits) == 1:
            used = end + 1 if end is not None else base + words[k - 1].end()
            return hits.pop(), used
    return None, 0


def _keys(doc):
    base = posixpath.basename(doc)
    tracked = [p for p in _git("ls-files", "-z").split("\0") if p]
    unique = sum(1 for p in tracked if posixpath.basename(p) == base) == 1
    return base, unique


def _pattern(base):
    return re.compile(r"(?<![\w/.-])(?P<path>(?:[\w.-]+/)*%s)(?![\w/-])(?P<close>`|\))?"
                      r"(?P<sect>\s*§\s*(?P<ref>\"[^\"\n]+\"|[^\n]*))?" % re.escape(base))


def _ours(doc, path, unique):
    if path == posixpath.basename(path):
        return unique
    p = re.sub(r"^(\.{1,2}/)+", "", path)
    return doc == p or doc.endswith("/" + p)


def _files(base, skip):
    try:
        out = _git("grep", "-l", "-I", "-F", "-e", base, "--", ".", ":(exclude)docs/prd/archive/**")
    except subprocess.CalledProcessError:
        return []
    return sorted(f for f in out.split("\n") if f and f not in skip)


def _scan(doc, f, unique, pat, fn):
    """fn(lineno, match, section, used) -> replacement or None, per citation."""
    lines, fence, md = open(f, encoding="utf-8", errors="replace").read().split("\n"), None, f.endswith(".md")
    for i, l in enumerate(lines):
        m = FENCE.match(l) if md else None
        if fence:
            fence = None if m and m.group(1) == fence else fence; continue
        if m:
            fence = m.group(1); continue
        out, last = [], 0
        for c in pat.finditer(l):
            if not _ours(doc, c.group("path"), unique):
                continue
            num = _numeric(doc, c.group("ref")) if c.group("ref") is not None else None
            if num:
                sec, end = num[0], c.start("ref") + num[1]
            elif c.group("sect") is not None and c.group("ref") is not None:
                sec, used = resolve(doc, c.group("ref"))
                end = c.start("ref") + (used if sec else
                                        len(re.match(r'"[^"]*"?|[^.,;:)`(\n]*', c.group("ref")).group(0).rstrip()))
            else:
                sec, end = "", c.end("close") if c.group("close") else c.end("path")
                ln = re.match(r":\d+", l[end:])  # `<doc>:<line>` quotes a line: never retargeted
                pm = PLAN_REF.match(l, end) if not ln and numbered(doc) else None
                if ln:
                    sec, end = None, end + ln.end()
                elif pm and int(pm.group(1)) in numbered(doc):
                    sec, end = numbered(doc)[int(pm.group(1))], pm.end()
            rep = fn(i + 1, c, sec, end, l)
            if rep is not None:
                out.append(l[last:c.start()] + rep); last = end
        if out:
            lines[i] = "".join(out) + l[last:]
    return lines


def cites(doc, skip=()):
    base, unique = _keys(doc)
    pat, found = _pattern(base), []
    for f in _files(base, set(skip) | {doc}):
        _scan(doc, f, unique, pat,
              lambda n, c, sec, end, l, f=f: found.append((f, n, c.start(), end, sec, l[c.start():end].strip())))
    return found


def target_of(t):
    """(file, § label or None) a plan target points at; None for drop."""
    if t == "drop":
        return None
    if t == "claude-md":
        return "CLAUDE.md", "Hard gotchas"
    if t.startswith("map:"):
        return t[4:].rstrip("/") + "/CLAUDE.md", None
    if t.startswith("prd:"):
        return "docs/prd/%s.md" % t[4:], None
    return "docs/specs/%s.md" % t, None


def main_target(plan_map):
    """Where a bare mention of the doc goes: the spec that received most of
    its sections (ties: first in doc order), else the specs index."""
    count = {}
    for t in plan_map.values():
        path = (target_of(t) or ("",))[0]
        if path.startswith("docs/specs/"):
            count[path] = count.get(path, 0) + 1
    best = max(count.values(), default=0)
    return next((p for p, n in count.items() if n == best), "docs/specs/README.md"), None


def retarget(doc, plan_map, skip=(), dry=False):
    """Rewrite citations of doc from plan_map {heading: target}.
    Returns ([(file, n)], ["<file>:<line>: <citation>[ (dropped)]"])."""
    base, unique = _keys(doc)
    pat, changed, unresolved = _pattern(base), [], []
    bare = main_target(plan_map)
    for f in _files(base, set(skip) | {doc}):
        n = [0]

        def fn(lineno, c, sec, end, l, f=f):
            text = l[c.start():end].strip()
            if f.endswith(".md") and l.startswith("#"):  # a heading is a Sections key and an anchor
                unresolved.append("%s:%d: %s (heading)" % (f, lineno, text)); return None
            if sec is None or (sec and sec not in plan_map):
                unresolved.append("%s:%d: %s" % (f, lineno, text)); return None
            tgt = target_of(plan_map[sec]) if sec else bare
            if tgt is None:
                unresolved.append("%s:%d: %s (dropped)" % (f, lineno, text)); return None
            path, label = tgt
            close = c.group("close") or ""
            if l[:c.start()].endswith("]("):  # link target: relative to the linking file
                path = posixpath.relpath(path, posixpath.dirname(f) or ".")
            n[0] += 1
            return path + close + (" §" + label if label and sec else "")
        lines = _scan(doc, f, unique, pat, fn)
        if n[0]:
            changed.append((f, n[0]))
            if not dry:
                open(f, "w", encoding="utf-8").write("\n".join(lines))
    return changed, unresolved
