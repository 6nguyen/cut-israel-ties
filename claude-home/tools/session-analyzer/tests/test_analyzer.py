"""Step-3 acceptance tests (PRD §9: compliance, ledger, EOU, windows, static
overhead, golden totals, deterministic report). Transcripts are generated
here (no committed fixtures beyond the 38 KB golden numbers file)."""
import json
import lzma
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

TOOL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOL))
from sa import CRE_WEIGHTS, analyze as A, cre, gh, ingest, parse, static, store  # noqa: E402

EXE = TOOL / "session-analyzer"
GOLDEN = TOOL / "tests" / "fixtures" / "golden-2026-09-26.tsv.xz"
PROJ = "-t-proj"
RECIPE = "Scope caps (binding): <=100 tool calls and <=200k context."
T0 = datetime(2026, 10, 1, 8, 0, tzinfo=timezone.utc).timestamp()


def iso(t):
    return datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


class TB:
    """Tiny transcript builder: main thread + subagent files, real record shapes."""

    def __init__(self, sid, cwd="/nonexistent/repo", branch="feat/x", t0=T0, model="claude-opus-5"):
        self.sid, self.cwd, self.branch, self.t, self.model = sid, cwd, branch, t0, model
        self.main, self.agents, self.n, self.parent = [], {}, 0, {}

    def _id(self, p):
        self.n += 1
        return f"{p}{self.sid[:8]}_{self.n:06d}"

    def at(self, dt):
        self.t += dt
        return self

    def rec(self, r, aid=None):
        u = "%08x-0000-4000-8000-%012x" % (int(self.sid[:8], 16), self.n + 1)
        self.n += 1
        base = {"userType": "external", "cwd": self.cwd, "sessionId": self.sid, "version": "2.1.260",
                "isSidechain": bool(aid), "uuid": u, "timestamp": iso(self.t), "gitBranch": self.branch,
                "parentUuid": self.parent.get(aid)}
        if aid:
            base["agentId"] = aid
        r = {**base, **r}
        self.parent[aid] = u
        (self.agents[aid]["recs"] if aid else self.main).append(r)
        return r

    def human(self, text="go", dt=5):
        self.at(dt)
        return self.rec({"type": "user", "origin": {"kind": "human"}, "message": {"role": "user", "content": text}})

    def slash(self, cmd, dt=5):
        return self.human(f"<command-name>{cmd}</command-name>", dt)

    def req(self, ctx=30_000, cw=500, out=100, dt=10, aid=None, model=None, tool=None, result="ok",
            result_dt=2, is_error=False, image=False):
        self.at(dt)
        rid = self._id("req_")
        u = {"input_tokens": 3, "cache_read_input_tokens": max(0, ctx - cw - 3), "cache_creation_input_tokens": cw,
             "output_tokens": out}
        content = [{"type": "text", "text": "x"}]
        tid = None
        if tool:
            tid = self._id("toolu_")
            content = [{"type": "tool_use", "id": tid, "name": tool[0], "input": tool[1]}]
        self.rec({"type": "assistant", "requestId": rid, "message": {
            "model": model or self.model, "id": "msg_" + rid, "role": "assistant", "type": "message",
            "content": content, "stop_reason": "tool_use" if tool else "end_turn", "usage": u}}, aid)
        if tool:
            self.at(result_dt)
            body = [{"type": "image", "source": {"type": "base64", "data": "AAAA"}}] if image else result
            self.rec({"type": "user", "toolUseResult": {"stdout": "", "isImage": image},
                      "message": {"role": "user", "content": [
                          {"type": "tool_result", "tool_use_id": tid, "content": body, "is_error": is_error}]}}, aid)
        return tid

    def bash(self, cmd, **kw):
        return self.req(tool=("Bash", {"command": cmd}), **kw)

    def compact(self, pre=180_000, post=20_000, ms=130_303, dt=200):
        self.at(dt)
        self.rec({"type": "system", "subtype": "compact_boundary", "content": "Conversation compacted",
                  "compactMetadata": {"trigger": "auto", "preTokens": pre, "postTokens": post, "durationMs": ms}})

    def agent(self, n=5, ctx=30_000, recipe=True, atype="general-purpose", background=False, lines=10,
              cw=500, dt=10):
        aid = self._id("a") + "f" * 10
        inp = {"description": "d", "subagent_type": atype, "prompt": ("do it. " + RECIPE) if recipe else "do it."}
        if background:
            inp["run_in_background"] = True
        self.at(dt)
        rid = self._id("req_")
        tid = self._id("toolu_")
        self.rec({"type": "assistant", "requestId": rid, "message": {
            "model": self.model, "id": "msg_" + rid, "role": "assistant", "type": "message",
            "content": [{"type": "tool_use", "id": tid, "name": "Agent", "input": inp}], "stop_reason": "tool_use",
            "usage": {"input_tokens": 3, "cache_read_input_tokens": 29_000, "cache_creation_input_tokens": 500,
                      "output_tokens": 50}}})
        self.agents[aid] = {"recs": [], "meta": {"agentType": atype, "description": "d", "toolUseId": tid}}
        self.at(1)
        self.rec({"type": "user", "message": {"role": "user", "content": inp["prompt"]}}, aid)
        for i in range(n):
            self.req(ctx=ctx, cw=cw, dt=5, aid=aid,
                     tool=("Edit", {"file_path": f"/r/f{i}.py"}) if i == n - 1 else None)
        self.at(2)
        self.rec({"type": "user", "message": {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": tid, "content": "\n".join(["line"] * lines)}]}})
        return aid

    def rate_limit(self, aid=None, dt=5):
        self.at(dt)
        self.rec({"type": "assistant", "isApiErrorMessage": True, "error": "rate_limit", "message": {
            "model": "<synthetic>", "role": "assistant", "type": "message",
            "content": [{"type": "text", "text": "API Error: 429 rate limit reached"}]}}, aid)

    def write(self, projects):
        d = Path(projects) / PROJ
        d.mkdir(parents=True, exist_ok=True)
        (d / f"{self.sid}.jsonl").write_text("".join(json.dumps(r) + "\n" for r in self.main))
        for aid, a in self.agents.items():
            sub = d / self.sid / "subagents"
            sub.mkdir(parents=True, exist_ok=True)
            (sub / f"agent-{aid}.jsonl").write_text("".join(json.dumps(r) + "\n" for r in a["recs"]))
            (sub / f"agent-{aid}.meta.json").write_text(json.dumps(a["meta"]))


def sid(n):
    return f"{n:08x}-aaaa-4bbb-8ccc-dddddddddddd"


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="sa-an-"))
        self.projects = self.tmp / "projects"
        self.chome = self.tmp / "claude-home"
        self.chome.mkdir()
        self.env_backup = dict(os.environ)
        os.environ.update(SESSION_ANALYZER_HOME=str(self.tmp / "archive"), CLAUDE_PROJECTS_DIR=str(self.projects),
                          SESSION_ANALYZER_MIN_FREE_GB="0", SESSION_ANALYZER_NOTIFY_CMD="0",
                          SESSION_ANALYZER_GH="0", CLAUDE_HOME=str(self.chome))
        A._SESS.clear()
        A._WIN.clear()
        A._COLS.clear()

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self.env_backup)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def load(self, *builders):
        con = store.connect()
        for b in builders:
            b.write(self.projects)
        for b in builders:
            ingest.ingest_session(con, parse.find_session(self.projects, b.sid), False)
        con.close()
        A._SESS.clear()
        A._WIN.clear()
        A._COLS.clear()
        return store.connect_ro()

    def analyze(self, con, sids, prs=None):
        prs = A.load_prs(con, prs or [])
        return A.analyze(con, A.resolve(con, {"session": sids}, prs), prs)


def compliant(n=1):
    b = TB(sid(n))
    b.human()
    b.req(ctx=30_000)
    b.bash("scripts/quiet-check.sh pytest")
    b.agent(n=5)
    b.req(ctx=40_000, tool=("Edit", {"file_path": "/r/a.py"}))
    b.human(dt=60)
    b.agent(n=5, dt=900)  # not back-to-back (>5 min after the previous returned)
    b.req(ctx=50_000)
    return b


class ComplianceTests(Base):
    def test_compliant_fixture_flags_nothing(self):
        con = self.load(compliant())
        r = self.analyze(con, [sid(1)])["rules"]
        for k, v in r.items():
            self.assertIn(v["ok"], (True, None), (k, v))
            self.assertEqual(v["cre"], 0, k)
        self.assertIsNone(r["5.15"]["ok"])

    def test_each_rule_violated_is_flagged(self):
        b = TB(sid(2))
        b.human()
        b.req(ctx=60_000)                                                   # 5.7 baseline > 45k
        b.bash("npm run build", result="\n".join(["e"] * 500))             # 5.13 raw build
        b.req(ctx=70_000, tool=("Read", {"file_path": "/r/s.png"}), image=True)   # 5.6 image
        b.req(ctx=80_000, tool=("Write", {"file_path": "/r/big.md", "content": "y" * 20_000}))  # 5.6 write
        b.req(ctx=90_000, model="claude-sonnet-5")                          # 5.2 switch
        b.req(ctx=250_000)                                                  # 5.1 > 200k
        b.agent(n=55, recipe=False)                                         # 5.4 heavy, 5.5 no recipe
        b.agent(n=55, dt=30, lines=100)                                     # 5.9 chain, 5.10 >40 lines
        b.agent(n=105, dt=30)                                               # 5.4 3rd heavy, 5.5 >100
        b.req(ctx=255_000)
        b.branch = "feat/y"
        b.req(ctx=260_000)                                                  # 5.3 second branch
        b.req(ctx=260_000)
        con = self.load(b)
        r = self.analyze(con, [sid(2)])["rules"]
        for k in ("5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.9", "5.10", "5.13"):
            self.assertIs(r[k]["ok"], False, (k, r[k]))
            if k != "5.4":  # fan-out's counterfactual CRE is 429-killed agents + relaunch; none here
                self.assertGreater(r[k]["cre"], 0, (k, r[k]))
        self.assertIn("2 switches", r["5.2"]["detail"])
        self.assertIn("1 raw", r["5.13"]["detail"])
        self.assertIn("1 images · 1 Write", r["5.6"]["detail"])
        self.assertIn("1 windows >2 heavy", r["5.4"]["detail"])
        self.assertIn("1 results >40", r["5.10"]["detail"])

    def test_rule_text_cre_line_for_every_rule_with_text(self):
        (self.chome / "CLAUDE.md").write_text(
            "- Batch: independent tool calls in one message\n"
            "- One session = one workstream = one model. Never switch model mid-session.\n")
        con = self.load(compliant())
        res = self.analyze(con, [sid(1)])
        rt = res["static"]["rule_text_tokens"]
        self.assertGreater(rt.get("5.2", 0), 0)
        self.assertEqual(res["rules"]["5.2"]["text_cre"], rt["5.2"] * res["main_requests"])


class WasteTests(Base):
    def test_bash_rerun_window_and_edit_reset(self):
        b = TB(sid(4))
        b.human()
        b.bash("git status")
        b.bash("git status")                                     # re-run (1 call back)
        b.req(tool=("Edit", {"file_path": "/r/a.py"}))
        b.bash("git status")                                     # after an edit: legit
        for c in ("ls", "pwd", "date"):
            b.bash(c)
        b.bash("git status")                                     # 4 calls back: outside window
        con = self.load(b)
        w = self.analyze(con, [sid(4)])["waste"]
        self.assertEqual((w["bash_calls"], w["bash_reruns"]), (7, 1))
        self.assertNotIn(b"git status", (self.tmp / "archive" / "index.db").read_bytes())

    def test_repeat_read_failing_cmd_post_compaction_and_ttl(self):
        b = TB(sid(3))
        b.human()
        for _ in range(4):
            b.req(tool=("Read", {"file_path": "/r/same.py"}), result="z" * 3600)
        for _ in range(3):
            b.bash("make   test-x", is_error=True)
        b.req(tool=("Read", {"file_path": "/r/kept.py"}))
        b.compact()
        b.req(ctx=25_000, tool=("Read", {"file_path": "/r/kept.py"}), dt=5)
        b.req(ctx=40_000, cw=39_000, dt=600)  # >5 min gap, cache mostly rewritten
        con = self.load(b)
        w = self.analyze(con, [sid(3)])["waste"]
        self.assertTrue(w["v2"])
        self.assertEqual((w["repeat_read_files"], w["repeat_read_excess"]), (1, 2))
        self.assertEqual(w["repeat_read_tokens"], 2 * static.tokens(3600))
        self.assertEqual(w["failing_cmd_groups"], 1)
        self.assertEqual(w["post_compact_rereads"], 1)
        self.assertEqual(w["ttl_rewrites"], 1)
        rt = w["result_tokens"]
        self.assertEqual(rt["Read"], 4 * static.tokens(3600) + 2 * static.tokens(2))
        self.assertEqual(rt["Bash"], 3 * static.tokens(2))
        self.assertEqual((rt["Grep"], rt["Glob"]), (0, 0))
        self.assertEqual((w["bash_calls"], w["bash_reruns"]), (3, 2))
        db = (self.tmp / "archive" / "index.db").read_bytes()
        self.assertNotIn(b"/r/same.py", db)
        self.assertNotIn(b"test-x", db)


class LedgerTests(Base):
    def two_sessions(self):
        a = TB(sid(10), branch="feat/lead")
        a.human()
        a.req()
        a.req(tool=("Edit", {"file_path": "/r/a.py"}))
        a.bash("scripts/quiet-check.sh pytest", result_dt=120)
        a.req()
        a.compact(ms=130_303, dt=300)
        a.req(dt=3)
        a.at(2 * 3600)  # owner away: idle
        a.human()
        a.req()
        b = TB(sid(11), branch="feat/lead", t0=a.t + 600)
        b.human()
        b.req()
        b.req(dt=40)
        b.req(dt=50, tool=("Edit", {"file_path": "/r/b.py"}))   # first edit: reorientation ends
        b.bash("git push -u origin feat/lead")
        b.req()
        return a, b

    def test_buckets_sum_to_lead_time_compaction_and_reorientation(self):
        a, b = self.two_sessions()
        con = self.load(a, b)
        push = b.t
        pr = {"number": 7, "repo": "o/r", "head_branch": "feat/lead", "merged_at": iso(push + 3600)[:19] + "Z",
              "additions": 10, "deletions": 0, "changed_lines": 100, "docs_only": 0, "file_hashes": ""}
        first, ready, merged, bk = A.ledger(con, gh.score([pr])[0])
        self.assertAlmostEqual(sum(bk.values()), ready - first, places=3)
        self.assertAlmostEqual(first, T0 + 5 + 10, delta=1)
        self.assertLess(ready, push)       # last push, not the last request
        self.assertAlmostEqual(bk["compaction"], 130.303, places=3)
        self.assertGreater(bk["idle"], 2 * 3600 - 60)
        self.assertGreater(bk["build_test"], 100)
        # reorientation: 2nd session from its first request to its first edit; never the 1st session
        self.assertAlmostEqual(bk["reorientation:session"], 40 + 50, delta=1)
        self.assertNotIn("reorientation:compact", bk)  # compaction in the 1st session books no reorientation

    def test_first_session_alone_books_no_reorientation(self):
        a, _ = self.two_sessions()
        con = self.load(a)
        pr = {"number": 7, "repo": "o/r", "head_branch": "feat/lead", "merged_at": iso(a.t + 60)[:19] + "Z",
              "changed_lines": 100, "docs_only": 0, "file_hashes": ""}
        first, ready, _, bk = A.ledger(con, gh.score([pr])[0])
        self.assertFalse([k for k in bk if k.startswith("reorientation")])
        self.assertAlmostEqual(sum(bk.values()), ready - first, places=3)

    def test_sweep_partitions(self):
        bk = A.sweep([(0, 100, "model"), (50, 70, "compaction"), (200, 300, "tool_other")], 0, 2000)
        self.assertEqual(bk["model"], 80)
        self.assertEqual(bk["compaction"], 20)
        self.assertEqual(bk["owner_wait"], 100)
        self.assertEqual(bk["idle"], 1700)
        self.assertEqual(sum(bk.values()), 2000)


def fake_gh(prs):
    def run(args):
        repo = args[args.index("-R") + 1]
        return json.dumps([p for p in prs if p.get("_repo", "o/r") == repo])
    return run


class EOUTests(Base):
    def test_size_buckets_exclusions_docs_only(self):
        f = lambda *ps: [{"path": p, "additions": a, "deletions": d} for p, a, d in ps]  # noqa: E731
        self.assertEqual(gh.size_of(f(("app.py", 40, 9), ("package-lock.json", 5000, 0)))[0], 49)
        self.assertEqual(gh.base_eou(49, 0), 0.5)
        self.assertEqual(gh.base_eou(50, 0), 1.0)
        self.assertEqual(gh.base_eou(400, 0), 1.0)
        self.assertEqual(gh.base_eou(401, 0), 2.0)
        lines, docs, _ = gh.size_of(f(("docs/prd/x.md", 900, 0), ("README.md", 10, 0)))
        self.assertTrue(docs)
        self.assertEqual(gh.base_eou(lines, docs), 0.5)

    def test_revert_and_fix_forward_penalty(self):
        prs = [
            {"number": 1, "repo": "o/r", "head_branch": "feat/a", "merged_at": "2026-10-01T10:00:00Z",
             "changed_lines": 100, "docs_only": 0, "file_hashes": "h1,h2"},
            {"number": 2, "repo": "o/r", "head_branch": "fix/a", "merged_at": "2026-10-03T10:00:00Z",
             "changed_lines": 10, "docs_only": 0, "file_hashes": "h1"},
            {"number": 3, "repo": "o/r", "head_branch": "feat/b", "merged_at": "2026-10-01T11:00:00Z",
             "changed_lines": 500, "docs_only": 0, "file_hashes": "h9"},
            {"number": 4, "repo": "o/r", "head_branch": "revert-3-feat/b", "merged_at": "2026-10-02T11:00:00Z",
             "changed_lines": 500, "docs_only": 0, "file_hashes": "h9"},
            {"number": 5, "repo": "o/r", "head_branch": "feat/c", "merged_at": "2026-10-01T12:00:00Z",
             "changed_lines": 100, "docs_only": 0, "file_hashes": "h7"},
        ]
        s = {p["number"]: p for p in gh.score(prs)}
        self.assertEqual((s[1]["penalized"], s[1]["eou"]), (1, 0.5))
        self.assertEqual((s[3]["penalized"], s[3]["eou"]), (1, 1.0))
        self.assertEqual((s[5]["penalized"], s[5]["eou"]), (0, 1.0))

    def test_gh_refresh_cache_and_branch_attribution_split(self):
        a = TB(sid(20), branch="feat/z")
        a.human()
        for _ in range(3):
            a.req(ctx=30_000)
        b = TB(sid(21), branch="feat/z", t0=a.t + 100)
        b.human()
        b.req(ctx=30_000)
        con = self.load(a, b)
        files = [{"path": "app.py", "additions": 100, "deletions": 0}]
        gh.runner = fake_gh([{"number": 9, "headRefName": "feat/z", "mergedAt": iso(b.t + 60)[:19] + "Z",
                              "additions": 100, "deletions": 0, "files": files}])
        try:
            rw = store.connect()
            gh.refresh(rw, ["o/r"])
            rw.close()
        finally:
            gh.runner = gh._subprocess_runner
        con = store.connect_ro()
        prs = A.load_prs(con)
        p = [x for x in prs if x["number"] == 9][0]
        shares = dict(p["_owners"])
        self.assertAlmostEqual(sum(shares.values()), 1.0)
        self.assertGreater(shares[sid(20)], shares[sid(21)])
        ra = A.analyze(con, A.resolve(con, {"session": [sid(20)]}, prs), prs)
        rb = A.analyze(con, A.resolve(con, {"session": [sid(21)]}, prs), prs)
        self.assertAlmostEqual(ra["eou"] + rb["eou"], 1.0)
        self.assertEqual((ra["prs"], rb["prs"]), (1, 0))
        self.assertEqual(con.execute("SELECT changed_lines FROM prs WHERE number=9").fetchone()[0], 100)


class WindowTests(Base):
    def window(self, b, cre_target, minutes=61, limit=False):
        per = cre_target / minutes
        cw = int(per / CRE_WEIGHTS["cache_write"])
        for _ in range(minutes):
            b.req(ctx=cw + 1000, cw=cw, out=0, dt=60)
        if limit:
            b.rate_limit()
        b.at(6 * 3600)

    def test_classes_and_estimated_ceiling(self):
        b = TB(sid(30))
        self.window(b, 0.2 * A.CEILING_EST)                # headroom
        self.window(b, 0.6 * A.CEILING_EST)                # normal
        self.window(b, 0.3 * A.CEILING_EST, limit=True)    # limited (429; evidence < 50M ignored)
        self.window(b, 0.2 * A.CEILING_EST, minutes=10)    # inactive
        con = self.load(b)
        w = A.windows(con)
        self.assertTrue(w["estimated"])
        self.assertEqual(w["ceiling"], A.CEILING_EST)
        self.assertEqual([x["class"] for x in w["windows"]], ["headroom", "normal", "limited", "inactive"])

    def test_ceiling_calibrates_from_two_limit_windows(self):
        b = TB(sid(31))
        self.window(b, 100e6, limit=True)
        self.window(b, 120e6, limit=True)
        con = self.load(b)
        w = A.windows(con)
        self.assertFalse(w["estimated"])
        self.assertAlmostEqual(w["ceiling"], 110e6, delta=2e6)

    def test_usage_snapshot_overrides_ceiling(self):
        b = TB(sid(32))
        self.window(b, 50e6)
        b.at(-6 * 3600 + 10)
        b.rec({"type": "system", "subtype": "local_command",
               "content": "<local-command-stdout>Current session 50% used</local-command-stdout>"})
        con = self.load(b)
        w = A.windows(con)["windows"][0]
        self.assertAlmostEqual(w["ceiling"], 100e6, delta=3e6)
        self.assertEqual(w["class"], "normal")


class StaticTests(Base):
    def test_static_split_within_10pct_of_first_request(self):
        repo = self.tmp / "repo"
        (repo / ".git").mkdir(parents=True)
        (repo / ".git" / "config").write_text('[remote "origin"]\n\turl = git@github.com:o/r.git\n')
        (repo / "CLAUDE.md").write_text("p" * 36_000)
        (self.chome / "CLAUDE.md").write_text("g" * 72_000)
        (self.chome / "projects" / PROJ / "memory").mkdir(parents=True)
        (self.chome / "projects" / PROJ / "memory" / "MEMORY.md").write_text("m" * 3600)
        sk = self.chome / "skills" / "s1"
        sk.mkdir(parents=True)
        (sk / "SKILL.md").write_text("---\nname: s1\ndescription: " + "d" * 340 + "\n---\n" + "body " * 5000)
        system = 18_000  # system prompt + tools for this fixture
        files_tok = static.tokens(36_000) + static.tokens(72_000) + static.tokens(3600) + static.tokens(360)
        b = TB(sid(40), cwd=str(repo))
        b.human()
        b.req(ctx=files_tok + system)
        con = self.load(b)
        row = con.execute("SELECT repo, static_json FROM sessions WHERE id=?", (sid(40),)).fetchone()
        self.assertEqual(row[0], "o/r")
        sb = json.loads(row[1])
        self.assertTrue(static.within(sb, files_tok + system, system))
        st = self.analyze(con, [sid(40)])["static"]
        est = st["file_tokens"] + system
        self.assertLessEqual(abs(est - (files_tok + system)), 0.10 * (files_tok + system))
        self.assertAlmostEqual(st["avg_tokens"]["system"], system, delta=0.10 * system)
        self.assertNotIn(b"ggggg", (self.tmp / "archive" / "index.db").read_bytes())


class GoldenTests(unittest.TestCase):
    """Audited 2026-09-26→28 sessions (numbers-only fixture derived from the
    live index): v2 report totals 1.42B CRE, 775 main / 4,152 agent requests,
    12 main cache rebuilds. Must match within 2%."""

    def test_golden_totals_within_2pct(self):
        rows = [ln.split("\t") for ln in lzma.decompress(GOLDEN.read_bytes()).decode().splitlines()]
        total = main = agent = reb = 0
        seen = set()
        for s, th, _dt, i, cr, cw, o in rows:
            i, cr, cw, o = int(i), int(cr), int(cw), int(o)
            total += cre(i, cr, cw, o)
            key = (s, th)
            if th == "0":
                main += 1
                if key in seen and ingest.is_cache_rebuild(cr, cw):
                    reb += 1
            else:
                agent += 1
            seen.add(key)
        self.assertLessEqual(abs(total - 1.42e9) / 1.42e9, 0.02, total)
        self.assertLessEqual(abs(main - 775) / 775, 0.02, main)
        self.assertLessEqual(abs(agent - 4152) / 4152, 0.02, agent)
        self.assertEqual(reb, 12)


class ReportTests(Base):
    def test_report_deterministic_bytes_and_line_cap(self):
        self.load(compliant(1), compliant(2))
        outs = [subprocess.run([sys.executable, str(EXE), "report", "--since", "2026-10-01"], capture_output=True,
                               text=True, env=dict(os.environ), timeout=60) for _ in range(2)]
        self.assertEqual(outs[0].returncode, 0, outs[0].stderr)
        self.assertEqual(outs[0].stdout, outs[1].stdout)
        lines = outs[0].stdout.splitlines()
        self.assertLessEqual(len(lines), 60)
        for tag in ("Scope:", "COST", "SPEED", "regime:", "OWNER", "RULES", "TOP 3"):
            self.assertIn(tag, outs[0].stdout)
        self.assertIn("2 sessions", lines[0])

    def test_compare_side_by_side(self):
        self.load(compliant(1), compliant(2))
        r = subprocess.run([sys.executable, str(EXE), "compare", sid(1)[:8], sid(2)[:8]], capture_output=True,
                           text=True, env=dict(os.environ), timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("lead time/EOU", r.stdout)
        self.assertIn("5.13 quiet-check", r.stdout)

    def test_report_never_writes_without_gh(self):
        self.load(compliant(1))
        db = self.tmp / "archive" / "index.db"
        before = db.read_bytes()
        subprocess.run([sys.executable, str(EXE), "report", "--session", sid(1)[:8]], capture_output=True,
                       env=dict(os.environ), timeout=60)
        self.assertEqual(db.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
