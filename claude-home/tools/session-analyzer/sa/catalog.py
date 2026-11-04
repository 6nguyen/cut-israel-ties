"""§6.7a patch catalog: every recommendation the engine emits is one of these
templates, each a deterministic patch plus its inverse. Patches work on file
text (config only, never transcript text); `undo` holds just enough to invert.

Targets are roots, not files:
- `template` — this clone of llm-repo-template (git → branch + commit + push
  + `gh pr create`). `claude-home/CLAUDE.md` is what ~/.claude/CLAUDE.md links to.
- `home` — ~/.claude (not a repo → timestamped backup, then write).

Everything external is injectable for tests: roots via env
(SESSION_ANALYZER_TEMPLATE_REPO, CLAUDE_HOME), `git`/`gh` via `run` and
SESSION_ANALYZER_GH (same var as the PR fetch; "0" = no PR is opened).
"""
import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

from . import paths, static

HOOKS_SRC = Path(__file__).with_name("hooks")
ABSENT = {"__sa_absent__": True}


class PatchError(Exception):
    pass


# ---- catalog data (text is stored here, never generated) -------------------
SHORT = {  # shorten-rule: rule -> replacement for its first global anchor block
    "5.3": ["- One workstream per session; keep follow-ups on the same feature in the same",
            "  session instead of a fresh one. Never switch model mid-session."],
    "5.4": ["- Fan-out guard: while windows run in headroom (<60% used), up to three heavy",
            "  agents per 5-hour window."],
    "5.5": ["- Hard caps: ≤150 tool calls and ≤250k context per agent. Split work into",
            "  steps that fit."],
}
HOOKS = {  # enforce-rule: rule -> catalog hook file (copied to claude-home/hooks/)
    "5.13": "sa-quiet-check-guard.py",
}
SETTINGS = "settings.json"  # relative to `home`
GLOBAL_MD = "claude-home/CLAUDE.md"  # relative to `template`


def template_root() -> Path:
    env = os.environ.get("SESSION_ANALYZER_TEMPLATE_REPO")
    return Path(env).expanduser() if env else Path(__file__).resolve().parents[4]


def root_for(target: str) -> Path:
    if target == "home":
        return paths.claude_home()
    if target == "template":
        return template_root()
    return Path(target).expanduser()  # explicit repo path


# ---- text helpers -----------------------------------------------------------
def _indent(text):
    m = re.search(r"\n( +)\S", text or "")
    return len(m.group(1)) if m else 2


def _load_json(text):
    if text is None:
        return {}
    d = json.loads(text or "{}")
    if not isinstance(d, dict):
        raise PatchError("JSON target is not an object")
    return d


def _dump_json(d, like):
    out = json.dumps(d, indent=_indent(like), ensure_ascii=False)
    return out + ("\n" if like is None or like.endswith("\n") else "")


def _walk(d, keys, create):
    created = None
    for i, k in enumerate(keys[:-1]):
        if k not in d:
            if not create:
                return None, None
            d[k] = {}
            created = created or ".".join(keys[:i + 1])
        d = d[k]
        if not isinstance(d, dict):
            raise PatchError(f"{'.'.join(keys[:i + 1])} is not an object")
    return d, created


def _prune(d, keys, created):
    """Remove the empty parent dicts apply created, innermost first."""
    if not created:
        return
    depth = len(created.split("."))
    for n in range(len(keys) - 1, depth - 1, -1):
        node = d
        for k in keys[:n - 1]:
            node = node[k]
        if node.get(keys[n - 1]) == {}:
            del node[keys[n - 1]]


def rule_blocks(lines, rule, file_kind="global"):
    """[(start, end)] line ranges a rule owns in a CLAUDE.md (same anchors and
    continuation rule as static.rule_text_bytes; a fence anchor owns through
    the closing ```)."""
    out = []
    for a in static.rules_map()["rules"].get(rule, []):
        if a["file"] != file_kind:
            continue
        for i, line in enumerate(lines):
            if a["match"] in line:
                j = i + 1
                while j < len(lines) and lines[j].strip() and not lines[j].lstrip().startswith(("- ", "#", "```")):
                    j += 1
                if a.get("fence"):
                    while j < len(lines) and not lines[j].startswith("```"):
                        j += 1
                    j += 1
                    while j < len(lines) and not lines[j].startswith("```"):
                        j += 1
                    j += 1
                out.append((i, min(j, len(lines))))
                break
    return sorted(set(out))


def _rk(k):
    return tuple(int(x) if x.isdigit() else 0 for x in k.split("."))


def editable(template, rule, file_kind="global"):
    """Static pre-check for recommendations: drop-rule needs ≥1 anchor no
    other rule shares; shorten-rule needs its first anchor unshared."""
    if template not in ("drop-rule", "shorten-rule", "enforce-rule"):
        return True
    m = static.rules_map()["rules"]
    others = {(a["file"], a["match"]) for k, v in m.items() if k != rule for a in v}
    mine = [(a["file"], a["match"]) for a in m.get(rule, []) if a["file"] == file_kind]
    if template == "shorten-rule":
        return bool(mine) and mine[0] not in others
    return any(a not in others for a in mine)


def shared_with(rule, file_kind="global"):
    """Rules whose map anchors coincide with one of `rule`'s (static check)."""
    m = static.rules_map()["rules"]
    mine = {(a["file"], a["match"]) for a in m.get(rule, []) if a["file"] == file_kind}
    return sorted((k for k, v in m.items() if k != rule and mine & {(a["file"], a["match"]) for a in v}), key=_rk)


def exclusive_blocks(lines, rule, file_kind="global"):
    """(own, shared): the rule's blocks that overlap no other rule's block,
    and the other rules it shares lines with. Shared lines are never
    removed or altered (owner decision, PR #4)."""
    others = {}
    for k in static.rules_map()["rules"]:
        if k != rule:
            for b in rule_blocks(lines, k, file_kind):
                others.setdefault(b, set()).add(k)
    own, shared = [], set()
    for s, e in rule_blocks(lines, rule, file_kind):
        hit = {k for (s2, e2), ks in others.items() if s2 < e and s < e2 for k in ks}
        if hit:
            shared |= hit
        else:
            own.append((s, e))
    return own, sorted(shared, key=_rk)


def _split(text):
    if text is None:
        raise PatchError("file missing")
    nl = text.endswith("\n")
    return text.split("\n")[:-1] if nl else text.split("\n"), nl


def _join(lines, nl):
    return "\n".join(lines) + ("\n" if nl else "")


# ---- templates: patch(files, p) -> (files, undo); inverse(files, p, undo) -> files
# `files` maps root-relative path -> text (None = absent).
def _set_key_patch(files, p):
    f = p["file"]
    old = files.get(f)
    d = _load_json(old)
    keys = p["key"].split(".")
    parent, created = _walk(d, keys, True)
    prev = parent.get(keys[-1], ABSENT)
    parent[keys[-1]] = p["value"]
    return {f: _dump_json(d, old)}, {"prev": prev, "created": created, "file_created": old is None}


def _set_key_inverse(files, p, u):
    f = p["file"]
    cur = files.get(f)
    if cur is None:
        raise PatchError(f"{f} missing; nothing to revert")
    d = _load_json(cur)
    keys = p["key"].split(".")
    parent, _ = _walk(d, keys, False)
    if parent is None or parent.get(keys[-1], ABSENT) != p["value"]:
        raise PatchError(f"{p['key']} is no longer {p['value']!r}; nothing to revert")
    if u["prev"] == ABSENT:
        del parent[keys[-1]]
        _prune(d, keys, u.get("created"))
    else:
        parent[keys[-1]] = u["prev"]
    if u.get("file_created") and not d:
        return {f: None}
    return {f: _dump_json(d, cur)}


def _deny_read_patch(files, p):
    f = p["file"]
    old = files.get(f)
    d = _load_json(old)
    had_perms = "permissions" in d
    perms = d.setdefault("permissions", {})
    had_deny = "deny" in perms
    deny = perms.setdefault("deny", [])
    if not isinstance(deny, list):
        raise PatchError("permissions.deny is not a list")
    entry = f"Read({p['glob']})"
    if entry in deny:
        raise PatchError(f"{entry} already denied")
    deny.append(entry)
    created = None if had_deny else ("permissions.deny" if had_perms else "permissions")
    return {f: _dump_json(d, old)}, {"created": created, "file_created": old is None}


def _deny_read_inverse(files, p, u):
    f = p["file"]
    cur = files.get(f)
    if cur is None:
        raise PatchError(f"{f} missing; nothing to revert")
    d = _load_json(cur)
    deny = (d.get("permissions") or {}).get("deny") or []
    entry = f"Read({p['glob']})"
    if entry not in deny:
        raise PatchError(f"{entry} not present; nothing to revert")
    deny.remove(entry)
    c = u.get("created")
    if c == "permissions" and d["permissions"] == {"deny": []}:
        del d["permissions"]
    elif c == "permissions.deny" and deny == []:
        del d["permissions"]["deny"]
    if u.get("file_created") and not d:
        return {f: None}
    return {f: _dump_json(d, cur)}


def _drop_rule_patch(files, p):
    f = p["file"]
    lines, nl = _split(files.get(f))
    if not rule_blocks(lines, p["rule"], p.get("kind", "global")):
        raise PatchError(f"rule {p['rule']} text not found in {f}")
    blocks, shared = exclusive_blocks(lines, p["rule"], p.get("kind", "global"))
    if not blocks:
        raise PatchError(f"rule {p['rule']} text is shared with {', '.join(shared)}; nothing exclusive to drop")
    removed = []
    for s, e in reversed(blocks):
        removed.append({"at": s, "before": lines[s - 1] if s else None, "lines": lines[s:e]})
        del lines[s:e]
    return {f: _join(lines, nl)}, {"removed": removed}


def _drop_rule_inverse(files, p, u):
    f = p["file"]
    lines, nl = _split(files.get(f))
    for r in reversed(u["removed"]):
        at = r["at"]
        if r["before"] is not None and (at > len(lines) or lines[at - 1] != r["before"]):
            hits = [i + 1 for i, x in enumerate(lines) if x == r["before"]]
            if not hits:
                raise PatchError(f"anchor line for rule {p['rule']} not found in {f}")
            at = hits[0]
        if r["lines"] and at < len(lines) and lines[at:at + len(r["lines"])] == r["lines"]:
            raise PatchError(f"rule {p['rule']} text already present in {f}")
        lines[at:at] = r["lines"]
    return {f: _join(lines, nl)}


def _shorten_patch(files, p):
    f = p["file"]
    lines, nl = _split(files.get(f))
    blocks = rule_blocks(lines, p["rule"], p.get("kind", "global"))
    if not blocks:
        raise PatchError(f"rule {p['rule']} text not found in {f}")
    own, shared = exclusive_blocks(lines, p["rule"], p.get("kind", "global"))
    if blocks[0] not in own:
        raise PatchError(f"rule {p['rule']} text is shared with {', '.join(shared)}; not shortened")
    s, e = blocks[0]
    orig = lines[s:e]
    lines[s:e] = SHORT[p["rule"]]
    return {f: _join(lines, nl)}, {"orig": orig}


def _shorten_inverse(files, p, u):
    f = p["file"]
    lines, nl = _split(files.get(f))
    rep = SHORT[p["rule"]]
    for i in range(len(lines) - len(rep) + 1):
        if lines[i:i + len(rep)] == rep:
            lines[i:i + len(rep)] = u["orig"]
            return {f: _join(lines, nl)}
    raise PatchError(f"shortened rule {p['rule']} text not found in {f}")


def _enforce_patch(files, p):
    hook = p["hook"]
    if files.get(hook) is not None:
        raise PatchError(f"{hook} already exists")
    out, undo = _drop_rule_patch(files, p)
    out[hook] = (HOOKS_SRC / Path(hook).name).read_text()
    return out, undo


def _enforce_inverse(files, p, u):
    hook = p["hook"]
    if files.get(hook) != (HOOKS_SRC / Path(hook).name).read_text():
        raise PatchError(f"{hook} missing or edited; revert by hand")
    out = _drop_rule_inverse(files, p, u)
    out[hook] = None
    return out


_FM = re.compile(r"^model:.*$")


def _fm_bounds(lines):
    if not lines or lines[0] != "---":
        raise PatchError("no frontmatter")
    for i in range(1, len(lines)):
        if lines[i] == "---":
            return 1, i
    raise PatchError("unterminated frontmatter")


def _agent_model_patch(files, p):
    f = p["file"]
    lines, nl = _split(files.get(f))
    a, b = _fm_bounds(lines)
    for i in range(a, b):
        if _FM.match(lines[i]):
            prev = lines[i]
            lines[i] = f"model: {p['model']}"
            return {f: _join(lines, nl)}, {"prev": prev, "at": i}
    lines.insert(b, f"model: {p['model']}")
    return {f: _join(lines, nl)}, {"prev": None, "at": b}


def _agent_model_inverse(files, p, u):
    f = p["file"]
    lines, nl = _split(files.get(f))
    a, b = _fm_bounds(lines)
    want = f"model: {p['model']}"
    for i in range(a, b):
        if lines[i] == want:
            if u["prev"] is None:
                del lines[i]
            else:
                lines[i] = u["prev"]
            return {f: _join(lines, nl)}
    raise PatchError(f"{f}: '{want}' not found")


TEMPLATES = {
    # name: (patch, inverse, default target, files(params))
    "set-key": (_set_key_patch, _set_key_inverse, "home", lambda p: [p["file"]]),
    "deny-read": (_deny_read_patch, _deny_read_inverse, None, lambda p: [p["file"]]),
    "drop-rule": (_drop_rule_patch, _drop_rule_inverse, "template", lambda p: [p["file"]]),
    "shorten-rule": (_shorten_patch, _shorten_inverse, "template", lambda p: [p["file"]]),
    "enforce-rule": (_enforce_patch, _enforce_inverse, "template", lambda p: [p["file"], p["hook"]]),
    "agent-model": (_agent_model_patch, _agent_model_inverse, "template", lambda p: [p["file"]]),
    "connector-off": (None, None, "app", lambda p: []),
}


def params_for(template, **kw):
    """Fill a template's default file paths."""
    p = dict(kw)
    if template == "set-key":
        p.setdefault("file", SETTINGS)
    elif template == "deny-read":
        p.setdefault("file", ".claude/settings.json")
    elif template in ("drop-rule", "shorten-rule", "enforce-rule"):
        p.setdefault("file", GLOBAL_MD)
        p.setdefault("kind", "global")
        if template == "enforce-rule":
            p.setdefault("hook", "claude-home/hooks/" + HOOKS[p["rule"]])
    return p


# ---- pure application on a dict of texts ------------------------------------
def patch(template, files, params):
    fn = TEMPLATES[template][0]
    if fn is None:
        raise PatchError(f"{template} is not file-applicable")
    return fn(files, params)


def inverse(template, files, params, undo):
    fn = TEMPLATES[template][1]
    if fn is None:
        raise PatchError(f"{template} is not file-applicable")
    return fn(files, params, undo)


def read_files(root, rels):
    out = {}
    for r in rels:
        p = Path(root) / r
        out[r] = p.read_text() if p.exists() else None
    return out


def write_files(root, files, backup_ts=None):
    """Write texts (None = delete). With backup_ts, existing files are copied
    to <file>.bak-sa-<ts> first. Returns the backup paths."""
    backups = []
    for rel, text in sorted(files.items()):
        p = Path(root) / rel
        if backup_ts and p.exists():
            b = p.with_name(f"{p.name}.bak-sa-{backup_ts}")
            shutil.copy2(p, b)
            backups.append(str(b))
        if text is None:
            if p.exists():
                p.unlink()
            continue
        p.parent.mkdir(parents=True, exist_ok=True)
        mode = (p.stat().st_mode & 0o777) if p.exists() else (0o755 if rel.endswith(".py") and "/hooks/" in rel
                                                                 else 0o600 if backup_ts else 0o644)
        tmp = p.with_name(p.name + ".sa-new")
        tmp.write_text(text)
        os.chmod(tmp, mode)
        tmp.replace(p)
    return backups


# ---- git / gh (injectable) ---------------------------------------------------
def _run(args, cwd=None):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=120, check=True).stdout


run = _run


def _git(root, *args):
    return run(["git", "-C", str(root), *args]).strip()


def is_git(root) -> bool:
    try:
        return _git(root, "rev-parse", "--show-toplevel") != ""
    except (subprocess.CalledProcessError, OSError):
        return False


def gh_exe():
    return os.environ.get("SESSION_ANALYZER_GH", "gh")


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40] or "change"


def via_pr(root, branch, title, body, change):
    """Fresh worktree off origin/main (or main) → change(dir) → commit → push →
    gh pr create. Never touches the owner's checkout. Returns (sha, pr_url)."""
    root = Path(_git(root, "rev-parse", "--show-toplevel"))
    try:
        _git(root, "fetch", "-q", "origin", "main")
    except subprocess.CalledProcessError:
        pass
    base = "origin/main"
    try:
        _git(root, "rev-parse", "--verify", "-q", base)
    except subprocess.CalledProcessError:
        base = "main"
    wt = paths.ensure_dir(paths.archive_root() / "work") / slug(branch)
    if wt.exists():
        shutil.rmtree(wt)
    _git(root, "worktree", "add", "-q", "-B", branch, str(wt), base)
    ok = True
    try:
        rels = change(wt)
        _git(wt, "add", "-A", "--", *rels)
        _git(wt, "commit", "-q", "-m", title, "-m", body)
        sha = _git(wt, "rev-parse", "HEAD")
        _git(wt, "-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential",
             "push", "-q", "-u", "origin", branch)
        url = ""
        if gh_exe() != "0":
            url = run([gh_exe(), "pr", "create", "--base", "main", "--head", branch, "--title", title,
                       "--body", body], cwd=str(wt)).strip().splitlines()[-1]
        return sha, url
    except BaseException:
        ok = False
        raise
    finally:
        try:
            _git(root, "worktree", "remove", "--force", str(wt))
        except subprocess.CalledProcessError:
            shutil.rmtree(wt, ignore_errors=True)
        if not ok:  # a refused patch leaves no stray local branch behind
            try:
                _git(root, "branch", "-D", branch)
            except subprocess.CalledProcessError:
                pass


def execute(template, target, params, undo=None, *, branch, title, body):
    """Apply (undo None) or invert a patch at its target. Returns a dict with
    undo, sha, pr_url, backups, files."""
    tpl = TEMPLATES[template]
    rels = tpl[3](params)
    root = root_for(target)
    res = {"undo": undo, "sha": None, "pr_url": None, "backups": [], "files": rels}

    def compute(base):
        cur = read_files(base, rels)
        if undo is None:
            new, u = patch(template, cur, params)
            res["undo"] = u
        else:
            new = inverse(template, cur, params, undo)
        return new

    if target != "home" and is_git(root):
        def change(wt):
            write_files(wt, compute(wt))
            return rels
        res["sha"], res["pr_url"] = via_pr(root, branch, title, body, change)
    else:
        new = compute(root)
        res["backups"] = write_files(root, new, backup_ts=time.strftime("%Y%m%d-%H%M%S"))
    return res
