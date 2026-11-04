"""Pins: rare, self-expiring raw copies (PRD §6.2). Layout mirrors
~/.claude/projects so `parse.discover()` reads it:
  pinned/<label>/<project>/<session>.jsonl.xz
  pinned/<label>/<project>/<session>/subagents/agent-<id>.jsonl.xz (+ .meta.json.xz)
tool-results/ is never copied. Dirs 0700, files 0600. Every pin expires.
"""
import lzma
import os
import re
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import disk, paths, store
from .ingest import ingest_session
from .parse import discover, find_session

LABEL_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
DEFAULT_DAYS = 14
MAX_DAYS = 30
NOTIFY_DAYS = 30
DELETE_DAYS = 37
CHUNK = 1 << 20


class PinError(Exception):
    pass


def _iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse(ts):
    return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def _now():
    return datetime.now(timezone.utc)


def _xz_copy(src: Path, dst: Path, budget: int) -> int:
    """Stream-compress src -> dst (preset 6). Returns bytes written; raises
    PinError when the pinned budget would be exceeded."""
    paths.ensure_dir(dst.parent)
    fd = os.open(dst, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)  # 0600 from birth
    with open(src, "rb") as fi, os.fdopen(fd, "wb") as raw, lzma.open(raw, "wb", preset=6) as fo:
        for chunk in iter(lambda: fi.read(CHUNK), b""):
            fo.write(chunk)
    n = dst.stat().st_size
    if n > budget:
        raise PinError("pinned total would exceed 500 MB; refused")
    return n


def _select(con, session_ids, since, until):
    root = paths.projects_root()
    if session_ids:
        out = []
        for sid in session_ids:
            s = find_session(root, sid)
            if not s:
                raise PinError(f"session {sid} not found under {root} (raw already gone?)")
            out.append(s)
        return out
    out = []
    for s in discover(root):
        r = con.execute("SELECT started_at FROM sessions WHERE id=?", (s.session_id,)).fetchone()
        day = (r[0] if r and r[0] else datetime.fromtimestamp(s.main.stat().st_mtime, timezone.utc).isoformat())[:10]
        if (not since or day >= since) and (not until or day <= until):
            out.append(s)
    return out


def pin(con, label, session_ids=None, since=None, until=None, days=None, until_decision=False):
    if not LABEL_RE.match(label or ""):
        raise PinError("label must match [A-Za-z0-9._-]{1,64}")
    if until_decision and days is not None:
        raise PinError("use --days or --until-decision, not both")
    if not until_decision:
        days = DEFAULT_DAYS if days is None else days
        if days < 1 or days > MAX_DAYS:
            raise PinError(f"--days must be 1..{MAX_DAYS}; refused")
    if not session_ids and not (since or until):
        raise PinError("give --session ID… or --since/--until")
    if con.execute("SELECT 1 FROM pins WHERE label=? AND deleted_at IS NULL", (label,)).fetchone():
        raise PinError(f"pin {label} already exists")
    disk.require_space()
    used = disk.pinned_bytes()
    if used >= disk.PINNED_CAP:
        raise PinError("pinned total is at the 500 MB cap; refused")
    sources = _select(con, session_ids, since, until)
    if not sources:
        raise PinError("no sessions matched")
    dest = paths.ensure_dir(paths.pinned_dir()) / label
    paths.ensure_dir(dest)
    total = 0
    try:
        for s in sources:
            ingest_session(con, s)  # skeleton + rows exist before the raw copy
            base = dest / s.project
            total += _xz_copy(s.main, base / (s.main.name + ".xz"), disk.PINNED_CAP - used - total)
            for a in s.agents:
                sub = base / s.session_id / "subagents"
                total += _xz_copy(a.path, sub / (a.path.name + ".xz"), disk.PINNED_CAP - used - total)
                if a.meta_path and a.meta_path.suffix != ".xz":
                    total += _xz_copy(a.meta_path, sub / (a.meta_path.name + ".xz"), disk.PINNED_CAP - used - total)
    except BaseException:
        shutil.rmtree(dest, ignore_errors=True)
        raise
    now = _now()
    expires = None if until_decision else _iso(now + timedelta(days=days))
    ids = ",".join(s.session_id for s in sources)
    con.execute("INSERT OR REPLACE INTO pins(label,created_at,expires_at,until_decision,bytes,sessions) VALUES(?,?,?,?,?,?)",
                (label, _iso(now), expires, int(bool(until_decision)), total, ids))
    for s in sources:
        con.execute("UPDATE sessions SET pinned_label=? WHERE id=?", (label, s.session_id))
    return {"label": label, "sessions": len(sources), "bytes": total, "expires_at": expires}


def _reingest_and_delete(con, label):
    """Re-ingest with the current parser (raw if still present, else the pin),
    then delete the pinned text. Nothing measurable is lost."""
    d = paths.pinned_dir() / label
    for s in discover(d, pinned_label=label):
        raw = find_session(paths.projects_root(), s.session_id)
        ingest_session(con, raw or s, force=True)
    shutil.rmtree(d, ignore_errors=True)
    con.execute("DELETE FROM files WHERE path LIKE ?", (str(d) + "/%",))
    con.execute("UPDATE sessions SET pinned_label=NULL WHERE pinned_label=?", (label,))
    con.execute("UPDATE pins SET deleted_at=? WHERE label=?", (_iso(_now()), label))


def _live(con, label):
    r = con.execute("SELECT * FROM pins WHERE label=? AND deleted_at IS NULL", (label,)).fetchone()
    if not r:
        raise PinError(f"no live pin {label}")
    return r


def unpin(con, label):
    _live(con, label)
    _reingest_and_delete(con, label)


def decide(con, label, outcome):
    r = _live(con, label)
    if not r["until_decision"]:
        raise PinError(f"{label} is a --days pin; use unpin")
    now = _iso(_now())
    con.execute("UPDATE pins SET decision=?, decided_at=? WHERE label=?", (outcome, now, label))
    rd = paths.ensure_dir(paths.reports_dir())
    with open(rd / "decisions.log", "a") as f:  # report history (§6.2)
        f.write(f"{now}\t{label}\t{outcome}\n")
    _reingest_and_delete(con, label)


def expire(con, now=None, notify=None) -> list:
    """Nightly: delete expired pins; notify undecided pins at 30 d, delete at 37 d."""
    now = now or _now()
    done = []
    for r in con.execute("SELECT * FROM pins WHERE deleted_at IS NULL ORDER BY created_at").fetchall():
        age = now - _parse(r["created_at"])
        if not r["until_decision"]:
            if r["expires_at"] and _parse(r["expires_at"]) <= now:
                _reingest_and_delete(con, r["label"])
                done.append((r["label"], "expired"))
        elif age >= timedelta(days=DELETE_DAYS):
            _reingest_and_delete(con, r["label"])
            done.append((r["label"], "deleted-undecided"))
        elif age >= timedelta(days=NOTIFY_DAYS) and not r["notified_at"]:
            if notify:
                notify("session-analyzer", f"Pin '{r['label']}' undecided for 30 days; deleted at 37 unless you run decide.")
            con.execute("UPDATE pins SET notified_at=? WHERE label=?", (_iso(now), r["label"]))
            done.append((r["label"], "notified"))
    return done


def enforce_cap(con) -> list:
    """Over the 1 GB archive cap: expire the oldest live pin early (after its
    re-ingest) until under. Index rows and skeletons are still written."""
    out = []
    while disk.archive_bytes() > disk.ARCHIVE_CAP:
        r = con.execute("SELECT label FROM pins WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1").fetchone()
        if not r:
            break
        _reingest_and_delete(con, r[0])
        out.append(r[0])
    return out


def list_pins(con):
    return [dict(r) for r in con.execute("SELECT * FROM pins ORDER BY created_at")]
