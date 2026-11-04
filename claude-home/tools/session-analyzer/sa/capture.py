"""Capture (zero model tokens): SessionEnd hook + nightly launchd job."""
import json
import os
import select
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone

from . import disk, paths, store

DAY12 = 12
VACUUM_DAYS = 30


def notify(title, msg):
    """macOS notification. SESSION_ANALYZER_NOTIFY_CMD overrides (tests):
    the command gets title and message as argv; '0' disables."""
    cmd = os.environ.get("SESSION_ANALYZER_NOTIFY_CMD")
    try:
        if cmd == "0":
            return
        if cmd:
            subprocess.run([cmd, title, msg], timeout=10, check=False)
            return
        script = f"display notification {json.dumps(msg)} with title {json.dumps(title)}"
        subprocess.run(["osascript", "-e", script], timeout=10, check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass


def hook(argv_session=None) -> int:
    """SessionEnd hook: read the hook JSON from stdin (if any), spawn a
    detached `ingest --session ID`, return at once. Prints nothing, exit 0."""
    try:
        sid = argv_session
        if not sid and not sys.stdin.isatty():
            r, _, _ = select.select([sys.stdin], [], [], 0.2)
            if r:
                data = sys.stdin.read(1 << 20)
                try:
                    sid = (json.loads(data) or {}).get("session_id")
                except ValueError:
                    sid = None
        sid = sid or os.environ.get("CLAUDE_SESSION_ID") or os.environ.get("SESSION_ID")
        if not sid:
            return 0
        exe = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "session-analyzer")
        subprocess.Popen([sys.executable, exe, "ingest", "--session", sid],
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         start_new_session=True, close_fds=True)
    except Exception:
        pass
    return 0


def xcodebuild_running() -> bool:
    if os.environ.get("SESSION_ANALYZER_SKIP_XCODE_GATE") == "1":
        return False
    try:
        return subprocess.run(["pgrep", "-x", "xcodebuild"], stdout=subprocess.DEVNULL,
                              stderr=subprocess.DEVNULL).returncode == 0
    except OSError:
        return False


def uningested_day12(con, now=None):
    """Transcripts whose first write is >= 12 days old and whose current
    size/mtime is not in the index (ingest silently failing would lose them
    at Claude Code's 14-day cleanup)."""
    from .parse import discover
    now = now or time.time()
    out = []
    for s in discover(paths.projects_root()):
        for _aid, p in s.files():
            try:
                st = p.stat()
            except OSError:
                continue
            born = getattr(st, "st_birthtime", st.st_mtime)
            if now - min(born, st.st_mtime) < DAY12 * 86400:
                continue
            r = con.execute("SELECT size, mtime FROM files WHERE path=?", (str(p),)).fetchone()
            if not r or r["size"] != st.st_size or r["mtime"] != st.st_mtime:
                out.append(s.session_id)
                break
    return out


def alert_day12(con, now=None) -> list:
    sids = uningested_day12(con, now)
    fresh = [s for s in sids if not con.execute(
        "SELECT 1 FROM alerts WHERE subject=? AND kind='day12'", (s,)).fetchone()]
    if fresh:
        notify("session-analyzer", f"{len(fresh)} session(s) not ingested by day 12 — run `session-analyzer ingest` "
                                   f"before Claude Code deletes them. Log: {paths.log_path()}")
        for s in fresh:
            con.execute("INSERT OR IGNORE INTO alerts VALUES(?,?,?)", (s, "day12", store.now()))
    return fresh


def maybe_vacuum(con, now=None) -> bool:
    now = now or datetime.now(timezone.utc)
    last = store.get_meta(con, "last_vacuum")
    if last and now - datetime.fromisoformat(last) < timedelta(days=VACUUM_DAYS):
        return False
    con.execute("VACUUM")  # temp_store=MEMORY: no $TMPDIR files
    store.set_meta(con, "last_vacuum", now.isoformat())
    return True


def nightly() -> int:
    """launchd 02:30: skip while xcodebuild runs; ingest changed sessions;
    expire pins; enforce the 1 GB cap; day-12 alert; monthly VACUUM."""
    from .ingest import ingest_all
    from .parse import discover
    from . import pins
    if xcodebuild_running():
        disk.log("nightly: xcodebuild running; skipped")
        return 0
    if disk.below_floor():
        disk.log("nightly: below free-space floor; wrote nothing")
        return 0
    con = store.connect()
    counts = ingest_all(con, discover(paths.projects_root()),
                        on_error=lambda s, e: disk.log(f"ingest error {s.session_id}: {type(e).__name__}: {e}"))
    expired = pins.expire(con, notify=notify)
    capped = pins.enforce_cap(con)
    alerted = alert_day12(con)
    vac = maybe_vacuum(con)
    over = disk.archive_bytes() > disk.ARCHIVE_CAP
    disk.log(f"nightly: {counts} pins={expired} cap_expired={capped} day12={len(alerted)} vacuum={vac}"
             f"{' OVER-CAP' if over else ''}")
    return 0
