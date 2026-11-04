# Shared by move.sh and fold.sh: rewrite references to moved files across
# tracked text files. relink(moves, dry, skip) -> (changed, warnings)
#   moves: {old path: new path}, repo-relative; when not dry the files are
#   already at their new paths (read and written there); when dry they are
#   still at the old ones (read there, nothing written).
# Relative and repo-root markdown links (and reference definitions) are
# resolved from each file's old location and recomputed when the target or
# the linking file moved; plain repo-relative mentions are replaced. Old
# paths still present afterwards (URLs, longer or computed paths) and
# renamed basenames no other tracked file shares are returned as
# "<file>:<line>: <ref>" warnings. Links
# inside fenced code are left alone. With a `broken` list, links in a moved
# file that did not resolve before the move are appended to it as
# "<file>:<line>: <link>" (unchanged either way).
import posixpath, re, subprocess
from urllib.parse import quote, unquote

LINK = re.compile(r"(\]\()(<[^>]+>|[^)\s]+)((?:\s+\"[^\"]*\")?\))|^(\s*\[[^\]]+\]:\s*)(\S+)", re.M)
SKIP = re.compile(r"^([a-z][a-z0-9+.-]*:|#|//)", re.I)
FENCE = re.compile(r"^ {0,3}(```|~~~)")


def _by_line(text, fn):
    """fn(line, lineno) on each line outside fenced code; fences pass through."""
    out, fence = [], None
    for n, line in enumerate(text.split("\n"), 1):
        m = FENCE.match(line)
        if fence is not None:
            if m and m.group(1) == fence:
                fence = None
            out.append(line)
        elif m:
            fence = m.group(1); out.append(line)
        else:
            out.append(fn(line, n))
    return "\n".join(out)


def _git(*args):
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def _is_text(p):
    try:
        with open(p, "rb") as f:
            return b"\0" not in f.read(8000)
    except OSError:
        return False


def relink(moves, dry=False, skip=(), only=None, broken=None):
    inverse = {v: k for k, v in moves.items()}
    tracked = [t for t in _git("ls-files", "-z").split("\0") if t]
    if dry:
        tracked = [moves.get(p, p) for p in tracked]
    old_tree = {inverse.get(t, t) for t in tracked}
    old_dirs = {posixpath.dirname(t) for t in old_tree}
    for t in list(old_dirs):
        while t:
            t = posixpath.dirname(t); old_dirs.add(t)

    def rewrite_target(target, src_old, src_new, where=None):
        angle = target.startswith("<")
        raw = target[1:-1] if angle else target
        if SKIP.match(raw):
            return target
        path = raw.split("#", 1)[0]
        frag = "#" + raw.split("#", 1)[1] if "#" in raw else ""
        plain = unquote(path)
        if not plain:
            return target
        rooted = plain.startswith("/")
        old_t = posixpath.normpath(plain[1:] if rooted else posixpath.join(posixpath.dirname(src_old), plain))
        if old_t not in old_tree and old_t not in old_dirs:
            if broken is not None and where and src_new != src_old:
                broken.append("%s:%d: %s" % (src_new, where, raw))
            return target  # broken already or not a repo path: leave it
        new_t = moves.get(old_t, old_t)
        if new_t == old_t and src_new == src_old:
            return target
        out = "/" + new_t if rooted else posixpath.relpath(new_t, posixpath.dirname(src_new) or ".")
        if plain.endswith("/") and not out.endswith("/"):
            out += "/"
        if out == plain:
            return target
        if angle:
            return "<" + out + frag + ">"
        return quote(out, safe="/._-~") + frag

    changed, warnings = [], []
    mention = {old: re.compile(r"(?<![\w./-])" + re.escape(old) + r"(?![\w/-])") for old in moves}
    # A basename other tracked files also carry (README.md) is not a
    # reference to the moved file; warning on it is noise.
    shared = {posixpath.basename(o) for o in moves
              if any(posixpath.basename(t) == posixpath.basename(o) and t not in (o, moves[o]) for t in tracked)}
    for new_f in sorted(tracked):
        src_old = inverse.get(new_f, new_f)
        read_at = src_old if dry else new_f
        if new_f in skip or (only is not None and new_f not in only) or not _is_text(read_at):
            continue
        text = open(read_at, encoding="utf-8", errors="surrogateescape").read()
        count = [0]

        def link(m, n):
            if m.group(1):
                t = rewrite_target(m.group(2), src_old, new_f, n)
                if t != m.group(2):
                    count[0] += 1
                return m.group(1) + t + m.group(3)
            t = rewrite_target(m.group(5), src_old, new_f, n)
            if t != m.group(5):
                count[0] += 1
            return m.group(4) + t
        out = _by_line(text, lambda line, n: LINK.sub(lambda m: link(m, n), line))
        for old, rx in mention.items():
            out, n = rx.subn(moves[old], out)
            count[0] += n
        # Warnings: mask repo-path link targets (handled above) and new paths,
        # then any old path left is a URL or computed path; a renamed basename
        # is a reference the rewrite couldn't resolve.
        def mask(m):
            if m.group(1) is not None:
                return m.group(0) if SKIP.match(m.group(2).strip("<>")) else m.group(1) + "<>" + m.group(3)
            return m.group(0) if SKIP.match(m.group(5)) else m.group(4) + "<>"
        masked = LINK.sub(mask, out)
        for new in moves.values():
            masked = masked.replace(new, "")
        for old in sorted(moves):
            base_old, base_new = posixpath.basename(old), posixpath.basename(moves[old])
            for i, line in enumerate(masked.split("\n"), 1):
                if old in line:
                    warnings.append("%s:%d: %s" % (new_f, i, old))
                elif base_old != base_new and base_old not in shared and base_old in line:
                    warnings.append("%s:%d: %s" % (new_f, i, base_old))
        if count[0]:
            changed.append((new_f, count[0]))
            if not dry:
                with open(new_f, "w", encoding="utf-8", errors="surrogateescape") as f:
                    f.write(out)
    return changed, warnings
