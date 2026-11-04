"""Step-2 acceptance tests (PRD §9: ingest, skeletons, pins, disk, hook, reindex).
stdlib unittest; run: python3 -m unittest discover -s tests -t ."""
import json
import lzma
import os
import shutil
import sqlite3
import stat
import subprocess
import sys
import tempfile
import time
import unittest
from datetime import timedelta
from pathlib import Path

TOOL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOL))
FIX = TOOL / "tests" / "fixtures"
sys.path.insert(0, str(FIX))
import make_fixtures as F  # noqa: E402

from sa import capture, disk, ingest, parse, pins, reindex, skeleton, store  # noqa: E402

EXE = TOOL / "session-analyzer"
NONTEXT = {  # table -> (order by, columns excluded as text labels / wall clock)
    "sessions": ("id", {"ingested_at", "title", "pinned_label"}),
    "requests": ("request_id", set()),
    "agents": ("agent_id", {"description"}),
    "tool_calls": ("tool_use_id", set()),
    "events": ("key", set()),
    "turns": ("uuid", set()),
    "pr_links": ("pr_number", set()),
}


def dump(db):
    con = sqlite3.connect(db)
    con.row_factory = sqlite3.Row
    out = {}
    for t, (order, skip) in NONTEXT.items():
        out[t] = [{k: r[k] for k in r.keys() if k not in skip} for r in con.execute(f"SELECT * FROM {t} ORDER BY {order}")]
    con.close()
    return out


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="sa-test-"))
        self.home = self.tmp / "archive"
        self.projects = self.tmp / "projects"
        shutil.copytree(FIX / "projects", self.projects)
        self.env_backup = dict(os.environ)
        os.environ.update(SESSION_ANALYZER_HOME=str(self.home), CLAUDE_PROJECTS_DIR=str(self.projects),
                          SESSION_ANALYZER_MIN_FREE_GB="0", SESSION_ANALYZER_NOTIFY_CMD="0",
                          SESSION_ANALYZER_GH="0", CLAUDE_HOME=str(self.tmp / "claude-home"))
        self.main = self.projects / F.PROJ / f"{F.SID}.jsonl"
        self.agent = self.projects / F.PROJ / F.SID / "subagents" / f"agent-{F.AID}.jsonl"

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self.env_backup)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def src(self):
        return parse.find_session(self.projects, F.SID)

    def ingest(self, force=False):
        con = store.connect()
        r = ingest.ingest_session(con, self.src(), force)
        con.close()
        return r

    def cli(self, *args, env=None, stdin=None):
        e = dict(os.environ, **(env or {}))
        return subprocess.run([sys.executable, str(EXE), *args], capture_output=True, text=True, env=e,
                              input=stdin, timeout=120)

    def skel_bytes(self):
        with lzma.open(self.home / "skeletons" / f"{F.SID}.jsonl.xz") as f:
            return f.read()


class SkeletonTests(Base):
    def test_no_secret_prompt_or_file_body_in_skeleton_or_index(self):
        self.ingest()
        raw = self.skel_bytes()
        db = (self.home / "index.db").read_bytes()
        for needle in (F.FAKE_KEY, "sk-ant-", F.PROMPT, "PROMPT-SENTINEL", F.BODY, "Scope caps", "backend/.env"):
            self.assertNotIn(needle.encode(), raw, needle)
            self.assertNotIn(needle.encode(), db, needle)

    def test_skeleton_at_most_2pct_of_raw(self):
        self.ingest()
        raw = sum(p.stat().st_size for p in (self.main, self.agent))
        sk = (self.home / "skeletons" / f"{F.SID}.jsonl.xz").stat().st_size
        self.assertLessEqual(sk / raw, 0.02, f"{sk}/{raw}")

    def test_cmd_class(self):
        c = skeleton.cmd_class
        self.assertEqual(c("Bash", {"command": "scripts/quiet-check.sh pytest"}), "quiet-check")
        self.assertEqual(c("Bash", {"command": "cd backend && .venv/bin/python -m pytest -q"}), "raw-test")
        self.assertEqual(c("Bash", {"command": "xcodebuild -scheme App build"}), "raw-build")
        self.assertEqual(c("Bash", {"command": "xcodebuild test -scheme App"}), "raw-test")
        self.assertEqual(c("Bash", {"command": "cd x && git status"}), "git")
        self.assertEqual(c("Bash", {"command": "gh pr create --fill"}), "gh")
        self.assertEqual(c("Bash", {"command": "grep -rn foo ."}), "grep")
        self.assertEqual(c("Bash", {"command": "sed -n 1,20p f.py"}), "read")
        self.assertEqual(c("Bash", {"command": "launchctl list"}), "other")
        self.assertEqual(c("Grep", {}), "grep")
        self.assertEqual(c("Read", {}), "read")
        self.assertIsNone(c("Edit", {}))


class IngestTests(Base):
    def test_rows_and_request_dedupe(self):
        self.assertEqual(self.ingest(), "full")
        con = store.connect()
        n = con.execute("SELECT COUNT(*) FROM requests").fetchone()[0]
        self.assertEqual(n, 40 + 12)  # 3 records per requestId -> 1 row; synthetic error not a request
        r = con.execute("SELECT * FROM requests WHERE request_id='req_main_000'").fetchone()
        self.assertEqual((r["input"], r["cache_read"], r["cache_write"], r["output"], r["thinking"]), (3, 40000, 500, 200, 50))
        self.assertEqual(r["cre"], 3 * 10 + 40000 + 500 * 12.5 + 200 * 50)
        self.assertEqual(r["context_total"], 40503)
        s = con.execute("SELECT * FROM sessions").fetchone()
        self.assertEqual((s["n_requests"], s["first_branch"], s["title"], s["unknown_records"]), (40, "feat/fixture", "Fixture session title", 1))
        self.assertEqual(s["models"], "claude-opus-5,claude-sonnet-5")
        kinds = sorted(r[0] for r in con.execute("SELECT kind FROM events"))
        self.assertEqual(kinds, ["compact", "model_switch", "rate_limit", "slash_command"])
        a = con.execute("SELECT * FROM agents").fetchone()
        self.assertEqual((a["agent_type"], a["prompt_has_recipe"], a["n_requests"], a["killed_by_429"], a["description"]),
                         ("general-purpose", 1, 12, 1, "Fixture agent"))
        self.assertIsNotNone(a["spawn_ts"])
        tc = dict(con.execute("SELECT cmd_class, COUNT(*) FROM tool_calls GROUP BY 1").fetchall())
        self.assertGreater(tc["quiet-check"], 0)
        self.assertGreater(tc["read"], 0)
        self.assertEqual(con.execute("SELECT COUNT(*) FROM tool_calls WHERE result_bytes IS NULL").fetchone()[0], 0)
        self.assertEqual(con.execute("SELECT pr_number, repo FROM pr_links").fetchone()[:], (75, "o/r"))
        self.assertEqual(con.execute("SELECT COUNT(*) FROM turns").fetchone()[0], 2)
        self.assertEqual(con.execute("SELECT MAX(version) FROM schema_version").fetchone()[0], store.SCHEMA_VERSION)

    def test_idempotent_and_incremental(self):
        self.ingest()
        db = str(self.home / "index.db")
        first = dump(db)
        self.assertEqual(self.ingest(), "unchanged")
        self.assertEqual(dump(db), first)
        # Grow the transcript: one new request + a partial trailing line (still being written).
        new = {"type": "assistant", "requestId": "req_new", "uuid": "new-uuid", "timestamp": "2026-09-21T00:00:00.000Z",
               "sessionId": F.SID, "message": {"model": "claude-opus-5", "content": [], "usage": F.usage(1, 2, 3, 4)}}
        with open(self.main, "a") as f:
            f.write(json.dumps(new) + "\n" + '{"type":"assistant","requestId":"req_part')
        self.assertEqual(self.ingest(), "incremental")
        con = store.connect()
        self.assertEqual(con.execute("SELECT COUNT(*) FROM requests").fetchone()[0], 53)
        self.assertEqual(con.execute("SELECT ended_at FROM sessions").fetchone()[0], "2026-09-21T00:00:00.000Z")
        con.close()
        grown = dump(db)
        # Finish the partial line: it is picked up exactly once.
        with open(self.main, "a") as f:
            f.write('2","uuid":"p2","timestamp":"2026-09-21T00:01:00.000Z","message":{"model":"claude-opus-5","usage":{"output_tokens":1}}}\n')
        self.assertEqual(self.ingest(), "incremental")
        con = store.connect()
        self.assertEqual(con.execute("SELECT COUNT(*) FROM requests").fetchone()[0], 54)
        con.close()
        # The appended skeleton streams reindex to the same rows.
        after = dump(db)
        os.remove(db)
        con = store.connect()
        reindex.reindex(con)
        con.close()
        self.assertEqual(dump(db), after)
        self.assertNotEqual(grown, after)

    def test_no_temp_files_and_cli_quiet(self):
        watch = self.tmp / "tmpdir-watch"
        watch.mkdir()
        r = self.cli("ingest", "--quiet", env={"TMPDIR": str(watch)})
        self.assertEqual((r.returncode, r.stdout), (0, ""))
        self.assertEqual(os.listdir(watch), [])
        files = {p.relative_to(self.home).as_posix() for p in self.home.rglob("*") if p.is_file()}
        self.assertEqual(files, {"index.db", f"skeletons/{F.SID}.jsonl.xz", "logs/session-analyzer.log"})
        self.assertEqual(stat.S_IMODE(self.home.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE((self.home / "index.db").stat().st_mode), 0o600)


class ReindexTests(Base):
    def test_reindex_reproduces_nontext_rows_and_text_from_raw(self):
        self.ingest()
        db = str(self.home / "index.db")
        before = dump(db)
        os.remove(db)
        r = self.cli("reindex")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(dump(db), before)
        con = store.connect()
        self.assertEqual(con.execute("SELECT title FROM sessions").fetchone()[0], "Fixture session title")
        self.assertEqual(con.execute("SELECT description FROM agents").fetchone()[0], "Fixture agent")
        con.close()
        # Raw gone (past 14 days, unpinned): non-text rows identical, text labels absent.
        shutil.rmtree(self.projects)
        os.remove(db)
        self.assertEqual(self.cli("reindex").returncode, 0)
        self.assertEqual(dump(db), before)
        con = store.connect()
        self.assertIsNone(con.execute("SELECT title FROM sessions").fetchone()[0])


class DiskTests(Base):
    def test_below_floor_writes_zero_bytes_and_exits_0(self):
        env = {"SESSION_ANALYZER_MIN_FREE_GB": "100000000"}
        for args in (["ingest"], ["pin", "x", "--session", F.SID], ["reindex"], ["nightly"], ["report"]):
            r = self.cli(*args, env=env)
            self.assertEqual(r.returncode, 0, (args, r.stderr))
        self.assertFalse(self.home.exists())

    def test_floor_only_overridable_by_env(self):
        os.environ.pop("SESSION_ANALYZER_MIN_FREE_GB")
        self.assertEqual(disk.min_free_bytes(), 10 * disk.GB)

    def test_over_cap_expires_oldest_pin_keeps_index(self):
        self.ingest()
        con = store.connect()
        pins.pin(con, "old", [F.SID], days=10)
        self.assertTrue((self.home / "pinned" / "old").exists())
        orig = disk.ARCHIVE_CAP
        disk.ARCHIVE_CAP = 1
        try:
            self.assertEqual(pins.enforce_cap(con), ["old"])
        finally:
            disk.ARCHIVE_CAP = orig
        self.assertFalse((self.home / "pinned" / "old").exists())
        self.assertEqual(con.execute("SELECT COUNT(*) FROM requests").fetchone()[0], 52)

    def test_log_rotation(self):
        orig = disk.LOG_MAX
        disk.LOG_MAX = 200
        try:
            for i in range(30):
                disk.log(f"line {i} " + "x" * 20)
        finally:
            disk.LOG_MAX = orig
        logs = sorted(p.name for p in (self.home / "logs").iterdir())
        self.assertEqual(logs, ["session-analyzer.log", "session-analyzer.log.1"])


class PinTests(Base):
    def setUp(self):
        super().setUp()
        self.con = store.connect()

    def tearDown(self):
        self.con.close()
        super().tearDown()

    def test_days_over_30_refused(self):
        r = self.cli("pin", "x", "--session", F.SID, "--days", "31")
        self.assertEqual(r.returncode, 2)
        self.assertIn("refused", r.stderr)
        self.assertFalse((self.home / "pinned").exists())

    def test_pinned_cap_refused_and_cleaned(self):
        orig = disk.PINNED_CAP
        disk.PINNED_CAP = 1000
        try:
            with self.assertRaises(pins.PinError):
                pins.pin(self.con, "big", [F.SID])
        finally:
            disk.PINNED_CAP = orig
        self.assertFalse((self.home / "pinned" / "big").exists())
        self.assertIsNone(self.con.execute("SELECT 1 FROM pins").fetchone())

    def test_pin_layout_modes_and_days_expiry(self):
        r = pins.pin(self.con, "exp1", [F.SID], days=14)
        self.assertIsNotNone(r["expires_at"])
        d = self.home / "pinned" / "exp1"
        files = [p for p in d.rglob("*") if p.is_file()]
        self.assertEqual(len(files), 3)  # main + agent + meta, all .xz; no tool-results
        for p in files:
            self.assertTrue(p.name.endswith(".xz"))
            self.assertEqual(stat.S_IMODE(p.stat().st_mode), 0o600)
        for p in [d, *[p for p in d.rglob("*") if p.is_dir()]]:
            self.assertEqual(stat.S_IMODE(p.stat().st_mode), 0o700)
        self.assertEqual(self.con.execute("SELECT pinned_label FROM sessions").fetchone()[0], "exp1")
        self.assertEqual(pins.expire(self.con, now=pins._now() + timedelta(days=13)), [])
        self.assertEqual(pins.expire(self.con, now=pins._now() + timedelta(days=15)), [("exp1", "expired")])
        self.assertFalse(d.exists())
        self.assertIsNone(self.con.execute("SELECT pinned_label FROM sessions").fetchone()[0])

    def test_until_decision_notify_30_delete_37_after_reingest(self):
        pins.pin(self.con, "base", [F.SID], until_decision=True)
        shutil.rmtree(self.projects)  # raw aged out: the re-ingest must come from the pin
        skel = self.home / "skeletons" / f"{F.SID}.jsonl.xz"
        skel.unlink()  # prove the pre-delete re-ingest rebuilds it from the pin
        calls = []
        notify = lambda *a: calls.append(a)  # noqa: E731
        self.assertEqual(pins.expire(self.con, now=pins._now() + timedelta(days=29), notify=notify), [])
        self.assertEqual(pins.expire(self.con, now=pins._now() + timedelta(days=31), notify=notify), [("base", "notified")])
        self.assertEqual(pins.expire(self.con, now=pins._now() + timedelta(days=32), notify=notify), [])
        self.assertEqual(len(calls), 1)
        self.assertEqual(pins.expire(self.con, now=pins._now() + timedelta(days=38), notify=notify),
                         [("base", "deleted-undecided")])
        self.assertFalse((self.home / "pinned" / "base").exists())
        self.assertTrue(skel.exists())
        self.assertEqual(self.con.execute("SELECT COUNT(*) FROM requests").fetchone()[0], 52)

    def test_decide_logs_outcome_and_deletes(self):
        pins.pin(self.con, "base", [F.SID], until_decision=True)
        pins.decide(self.con, "base", "KEEP v2")
        self.assertFalse((self.home / "pinned" / "base").exists())
        r = self.con.execute("SELECT decision, deleted_at FROM pins").fetchone()
        self.assertEqual(r[0], "KEEP v2")
        self.assertIsNotNone(r[1])
        self.assertIn("KEEP v2", (self.home / "reports" / "decisions.log").read_text())
        with self.assertRaises(pins.PinError):
            pins.unpin(self.con, "base")

    def test_every_pin_has_expiry(self):
        pins.pin(self.con, "a", [F.SID], days=3)
        for r in pins.list_pins(self.con):
            self.assertTrue(r["expires_at"] or r["until_decision"])
        with self.assertRaises(pins.PinError):
            pins.pin(self.con, "b", [F.SID], days=0)


class CaptureTests(Base):
    def test_hook_returns_fast_silently_and_ingests_detached(self):
        t = time.monotonic()
        r = self.cli("hook", stdin=json.dumps({"session_id": F.SID, "hook_event_name": "SessionEnd"}))
        dt = time.monotonic() - t
        self.assertEqual((r.returncode, r.stdout, r.stderr), (0, "", ""))
        self.assertLess(dt, 1.0)
        db = self.home / "index.db"
        for _ in range(100):
            if db.exists():
                con = sqlite3.connect(db)
                try:
                    if con.execute("SELECT COUNT(*) FROM sessions WHERE n_requests>0").fetchone()[0]:
                        break
                except sqlite3.OperationalError:
                    pass
                finally:
                    con.close()
            time.sleep(0.1)
        self.assertTrue(store.connect().execute("SELECT 1 FROM sessions WHERE id=?", (F.SID,)).fetchone())

    def test_hook_garbage_input_exit_0(self):
        r = self.cli("hook", stdin="not json")
        self.assertEqual((r.returncode, r.stdout, r.stderr), (0, "", ""))
        r = self.cli("hook", env={"SESSION_ANALYZER_MIN_FREE_GB": "x"})
        self.assertEqual(r.returncode, 0)

    def test_day12_notification_once(self):
        old = time.time() - 13 * 86400
        for p in (self.main, self.agent):
            os.utime(p, (old, old))
        con = store.connect()
        log = self.tmp / "notified"
        script = self.tmp / "notify.sh"
        script.write_text(f'#!/bin/sh\necho "$1|$2" >> {log}\n')
        script.chmod(0o700)
        os.environ["SESSION_ANALYZER_NOTIFY_CMD"] = str(script)
        self.assertEqual(capture.alert_day12(con), [F.SID])
        self.assertEqual(capture.alert_day12(con), [])  # once
        self.assertEqual(len(log.read_text().splitlines()), 1)
        os.environ["SESSION_ANALYZER_NOTIFY_CMD"] = "0"
        ingest.ingest_session(con, self.src())
        self.assertEqual(capture.uningested_day12(con), [])

    def test_nightly_skips_while_xcodebuild(self):
        orig = capture.xcodebuild_running
        capture.xcodebuild_running = lambda: True
        try:
            self.assertEqual(capture.nightly(), 0)
        finally:
            capture.xcodebuild_running = orig
        self.assertFalse((self.home / "index.db").exists())

    def test_nightly_ingests_and_vacuums(self):
        os.environ["SESSION_ANALYZER_SKIP_XCODE_GATE"] = "1"
        self.assertEqual(capture.nightly(), 0)
        con = store.connect()
        self.assertEqual(con.execute("SELECT COUNT(*) FROM sessions").fetchone()[0], 1)
        self.assertIsNotNone(store.get_meta(con, "last_vacuum"))
        self.assertFalse(capture.maybe_vacuum(con))

    def test_settings_merge_idempotent_with_backup(self):
        from sa.settings_merge import merge
        cfg = self.tmp / "settings.json"
        orig = {"model": "opus", "env": {"K": "v"}, "hooks": {"Stop": [{"hooks": [{"type": "command", "command": "x"}]}]}}
        cfg.write_text(json.dumps(orig))
        self.assertEqual(merge(cfg, "/b/session-analyzer hook"), "added")
        new = json.loads(cfg.read_text())
        self.assertEqual({k: v for k, v in new.items() if k != "hooks"}, {"model": "opus", "env": {"K": "v"}})
        self.assertEqual(new["hooks"]["Stop"], orig["hooks"]["Stop"])
        self.assertEqual(new["hooks"]["SessionEnd"], [{"hooks": [{"type": "command", "command": "/b/session-analyzer hook"}]}])
        baks = list(self.tmp.glob("settings.json.bak-*"))
        self.assertEqual(len(baks), 1)
        self.assertEqual(json.loads(baks[0].read_text()), orig)
        snapshot = cfg.read_bytes()
        self.assertEqual(merge(cfg, "/b/session-analyzer hook"), "present")
        self.assertEqual(cfg.read_bytes(), snapshot)
        self.assertEqual(len(list(self.tmp.glob("settings.json.bak-*"))), 1)
        cfg.write_text("{not json")
        with self.assertRaises(ValueError):
            merge(cfg, "/b/session-analyzer hook")
        self.assertEqual(cfg.read_text(), "{not json")

    def test_report_without_index_exits_0(self):
        r = self.cli("report")
        self.assertEqual(r.returncode, 0)
        self.assertIn("run ingest first", r.stdout)


if __name__ == "__main__":
    unittest.main()
