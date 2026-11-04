"""Step-5 acceptance tests (PRD §9: recommendations incl. loosen, catalog
apply/revert round-trip via a temp git repo + fake gh, deterministic
verdicts, weekly report file). No network: gh is a fake script; git remotes
are local bare repos; ~/.claude is a temp dir."""
import json
import os
import random
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock
from pathlib import Path

TOOL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOL))
sys.path.insert(0, str(TOOL / "tests"))
from sa import analyze as A, catalog, recommend, report, settings_merge, static, store, verdict  # noqa: E402
from test_analyzer import T0, TB, Base, compliant, sid  # noqa: E402

EXE = TOOL / "session-analyzer"
REAL_MD = (TOOL.parents[1] / "CLAUDE.md").read_text()
FAKE_GH = """#!/bin/sh
echo "$@" >> "$FAKE_GH_LOG"
echo "https://github.com/o/r/pull/7"
"""


def git(cwd, *args):
    return subprocess.run(["git", "-C", str(cwd), *args], capture_output=True, text=True, check=True).stdout.strip()


class CatalogRoundTrip(unittest.TestCase):
    """apply then revert → byte-identical, for every file template."""

    def rt(self, template, files, params):
        new, undo = catalog.patch(template, dict(files), params)
        self.assertNotEqual({k: new.get(k, files.get(k)) for k in new}, {k: files.get(k) for k in new})
        merged = dict(files, **new)
        undo = json.loads(json.dumps(undo))  # as stored in experiments.undo
        back = catalog.inverse(template, merged, params, undo)
        self.assertEqual(dict(merged, **back), files)
        return new

    def test_set_key(self):
        base = {"settings.json": json.dumps({"model": "x", "env": {"A": "1"}}, indent=2) + "\n"}
        self.rt("set-key", base, catalog.params_for("set-key", key="autoCompactWindow", value=300000))
        self.rt("set-key", base, catalog.params_for("set-key", key="env.A", value="2"))
        self.rt("set-key", base, catalog.params_for("set-key", key="env.BASH_MAX_OUTPUT_LENGTH", value="30000"))
        self.rt("set-key", base, catalog.params_for("set-key", key="a.b.c", value=1))
        self.rt("set-key", {"settings.json": None}, catalog.params_for("set-key", key="cleanupPeriodDays", value=14))
        four = {"settings.json": json.dumps({"k": [1, 2]}, indent=4)}
        self.rt("set-key", four, catalog.params_for("set-key", key="k", value=[3]))

    def test_deny_read(self):
        p = catalog.params_for("deny-read", glob="**/.next/**")
        self.rt("deny-read", {".claude/settings.json": None}, p)
        self.rt("deny-read", {".claude/settings.json": '{\n  "x": 1\n}\n'}, p)
        self.rt("deny-read", {".claude/settings.json": '{\n  "permissions": {\n    "allow": []\n  }\n}\n'}, p)
        self.rt("deny-read", {".claude/settings.json": '{\n  "permissions": {\n    "deny": [\n      "Read(a)"\n    ]\n  }\n}\n'}, p)

    def test_drop_and_shorten_rules_on_the_real_claude_md(self):
        f = {catalog.GLOBAL_MD: REAL_MD}
        for rule in ("5.4", "5.5", "5.10", "5.13", "5.15"):
            new = self.rt("drop-rule", f, catalog.params_for("drop-rule", rule=rule))
            if rule == "5.5":
                self.assertNotIn("Scope caps (binding)", new[catalog.GLOBAL_MD])
        for rule in sorted(set(catalog.SHORT) - {"5.3"}):
            new = self.rt("shorten-rule", f, catalog.params_for("shorten-rule", rule=rule))
            self.assertIn(catalog.SHORT[rule][0], new[catalog.GLOBAL_MD])

    def test_shared_line_is_never_dropped_or_shortened(self):
        f = {catalog.GLOBAL_MD: REAL_MD}
        shared = "One session = one workstream = one model"
        for t, r in (("drop-rule", "5.2"), ("drop-rule", "5.3"), ("shorten-rule", "5.3")):
            with self.assertRaisesRegex(catalog.PatchError, "shared with"):
                catalog.patch(t, f, catalog.params_for(t, rule=r))
            self.assertFalse(catalog.editable(t, r))
        self.assertTrue(catalog.editable("drop-rule", "5.4"))
        # 5.2 with one shared + one exclusive anchor: only the exclusive line goes
        m = static.rules_map()
        m["rules"]["5.2"] = m["rules"]["5.2"] + [{"file": "global", "match": "Never force-push"}]
        with mock.patch.object(static, "rules_map", lambda: m):
            new = self.rt("drop-rule", f, catalog.params_for("drop-rule", rule="5.2"))
            self.assertIn(shared, new[catalog.GLOBAL_MD])
            self.assertNotIn("Never force-push", new[catalog.GLOBAL_MD])
            self.assertEqual(catalog.shared_with("5.2"), ["5.3"])
        # once 5.3 is no longer mapped, the line is 5.2's alone and may go
        del m["rules"]["5.3"]
        with mock.patch.object(static, "rules_map", lambda: m):
            new = self.rt("drop-rule", f, catalog.params_for("drop-rule", rule="5.2"))
            self.assertNotIn(shared, new[catalog.GLOBAL_MD])

    def test_enforce_rule_installs_hook_and_drops_prose(self):
        p = catalog.params_for("enforce-rule", rule="5.13")
        new = self.rt("enforce-rule", {catalog.GLOBAL_MD: REAL_MD, p["hook"]: None}, p)
        self.assertIn("quiet-check", new[p["hook"]])
        self.assertNotIn("Build/test through", new[catalog.GLOBAL_MD])

    def test_agent_model(self):
        p = {"file": "claude-home/agents/x.md", "model": "sonnet"}
        self.rt("agent-model", {p["file"]: "---\nname: x\nmodel: opus\n---\nbody\n"}, p)
        self.rt("agent-model", {p["file"]: "---\nname: x\n---\nbody\n"}, p)

    def test_connector_off_is_not_file_applicable(self):
        with self.assertRaises(catalog.PatchError):
            catalog.patch("connector-off", {}, {})

    def test_inverse_refuses_when_patch_absent(self):
        p = catalog.params_for("shorten-rule", rule="5.4")
        with self.assertRaises(catalog.PatchError):
            catalog.inverse("shorten-rule", {catalog.GLOBAL_MD: REAL_MD}, p, {"orig": []})


class HookAndMergeTests(unittest.TestCase):
    def test_quiet_check_guard(self):
        d = Path(tempfile.mkdtemp(prefix="sa-hook-"))
        try:
            hook = TOOL / "sa" / "hooks" / "sa-quiet-check-guard.py"

            def run(cmd, cwd):
                return subprocess.run([sys.executable, str(hook)], input=json.dumps(
                    {"tool_input": {"command": cmd}, "cwd": str(cwd)}), capture_output=True, text=True).returncode
            self.assertEqual(run("cd backend && .venv/bin/python -m pytest -q", d), 0)  # no wrapper → allow
            (d / "scripts").mkdir()
            (d / "scripts" / "quiet-check.sh").write_text("")
            self.assertEqual(run("cd backend && .venv/bin/python -m pytest -q", d), 2)
            self.assertEqual(run("scripts/quiet-check.sh pytest", d), 0)
            self.assertEqual(run("git status", d), 0)
        finally:
            shutil.rmtree(d)

    def test_pretooluse_merge_idempotent(self):
        d = Path(tempfile.mkdtemp(prefix="sa-merge-"))
        try:
            s = d / "settings.json"
            s.write_text('{"model": "x"}\n')
            self.assertEqual(settings_merge.merge(s, "run h", "PreToolUse", "Bash"), "added")
            self.assertEqual(settings_merge.merge(s, "run h", "PreToolUse", "Bash"), "present")
            data = json.loads(s.read_text())
            self.assertEqual(data["hooks"]["PreToolUse"], [{"matcher": "Bash", "hooks": [{"type": "command",
                                                                                           "command": "run h"}]}])
        finally:
            shutil.rmtree(d)


    def test_pretooluse_merge_conflict_writes_nothing(self):
        d = Path(tempfile.mkdtemp(prefix="sa-merge-"))
        try:
            s = d / "settings.json"
            pat = ("rtk hook", "rtk-rewrite")
            settings_merge.merge(s, "rtk hook claude", "PreToolUse", "Bash")
            before = s.read_bytes()
            self.assertEqual(settings_merge.merge(s, "/c/rtk-hook.sh", "PreToolUse", "Bash", "rtk-hook.sh", pat),
                             "conflict:rtk hook")
            self.assertEqual(s.read_bytes(), before)
            # our own hook (by mark) is 'present', never a conflict with itself
            s.write_text("{}")
            self.assertEqual(settings_merge.merge(s, "/c/rtk-hook.sh", "PreToolUse", "Bash", "rtk-hook.sh", pat), "added")
            once = s.read_bytes()
            self.assertEqual(settings_merge.merge(s, "/d/rtk-hook.sh", "PreToolUse", "Bash", "rtk-hook.sh", pat), "present")
            self.assertEqual(s.read_bytes(), once)
            out = subprocess.run([sys.executable, str(TOOL / "session-analyzer"), "install-hook", str(s),
                                  "--event", "PreToolUse", "--matcher", "Bash", "--command", "x",
                                  "--conflict", "rtk-hook"], capture_output=True, text=True).stdout
            self.assertTrue(out.startswith("WARN: PreToolUse hook not added"), out)
            self.assertEqual(s.read_bytes(), once)
        finally:
            shutil.rmtree(d)


def rows(n, cre, lead=3600.0, owner=2.0, eou=1.0, noise=0.05, seed=1):
    r = random.Random(seed)
    return [{"eou": eou, "cre": cre * (1 + r.uniform(-noise, noise)), "lead_s": lead * (1 + r.uniform(-noise, noise)),
             "owner": owner * (1 + r.uniform(-noise, noise))} for _ in range(n)]


class VerdictTests(unittest.TestCase):
    def test_keep_on_real_20pct_drop(self):
        r = verdict.evaluate(rows(20, 10e6), rows(20, 8e6, seed=2), "cre")
        self.assertEqual(r["verdict"], "KEEP")
        p, lo, hi = r["effects"]["cre"]
        self.assertAlmostEqual(p, -0.2, delta=0.03)
        self.assertLess(hi, 0)

    def test_no_change_inconclusive_then_revert_for_simplicity(self):
        b, a = rows(20, 10e6, noise=0.5), rows(10, 10e6, noise=0.5, seed=2)
        r = verdict.evaluate(b, a, "cre")
        self.assertEqual(r["verdict"], "INCONCLUSIVE")
        self.assertEqual(r["first_n"], 10)
        r2 = verdict.evaluate(b, rows(20, 10e6, noise=0.5, seed=3), "cre", first_n=10)
        self.assertEqual(r2["verdict"], "REVERT-for-simplicity")

    def test_cre_drop_with_30pct_lead_regression_reverts(self):
        r = verdict.evaluate(rows(20, 10e6), rows(20, 8e6, lead=4680.0, seed=2), "cre")
        self.assertEqual(r["verdict"], "REVERT")
        self.assertEqual(r["worse"], ["lead"])

    def test_owner_total_regression_reverts(self):
        r = verdict.evaluate(rows(20, 10e6), rows(20, 8e6, owner=3.0, seed=2), "cre")
        self.assertEqual(r["verdict"], "REVERT")

    def test_insufficient_data(self):
        self.assertEqual(verdict.evaluate(rows(9, 1e7), rows(20, 1e7), "cre")["verdict"], "INSUFFICIENT")
        self.assertEqual(verdict.evaluate(rows(20, 1e7), rows(12, 1e7, eou=0.4), "cre")["verdict"], "INSUFFICIENT")

    def test_same_seed_identical_output(self):
        e = {"id": 1, "label": "x", "metric": "cre", "direction": "down", "started_at": "2026-10-01T00:00:00Z",
             "template": "set-key"}
        b, a = rows(25, 10e6, noise=0.3), rows(25, 9e6, noise=0.3, seed=9)
        l1 = verdict.line(e, verdict.evaluate(b, a, "cre"))
        l2 = verdict.line(e, verdict.evaluate(b, a, "cre"))
        self.assertEqual(l1, l2)
        self.assertIn("CRE/EOU", l1)

    def test_parse_expect(self):
        self.assertEqual(verdict.parse_expect("CRE/EOU"), ("cre", "down"))
        self.assertEqual(verdict.parse_expect("lead time/EOU down"), ("lead", "down"))
        self.assertEqual(verdict.parse_expect("owner:up"), ("owner", "up"))
        with self.assertRaises(verdict.MarkError):
            verdict.parse_expect("vibes")


def res_fixture(**kw):
    rules = {k: {"ok": True, "cre": 0.0, "detail": "ok", "minutes": 0.0, "saved": 0.0, "text_cre": 0.0}
             for k in A.RULE_NAMES}
    res = {"cre": 300e6, "eou": 20.0, "lead_s": 20 * 3600.0, "ledger_eou": 20.0, "ceiling": 130e6,
           "regime": "headroom", "active_windows": 7, "win_classes": {"limited": 0, "normal": 2, "headroom": 5},
           "buckets": {"serialization": 3 * 3600.0, "compaction": 2 * 3600.0, "reorientation": 1 * 3600.0},
           "rules": rules, "over_tight": [], "waste": {"ttl_cre": 0.0, "ttl_rewrites": 0}}
    res.update(kw)
    return res


class RecommendTests(Base):
    def test_loosen_on_headroom_and_ranking_determinism(self):
        res = res_fixture()
        res["rules"]["5.13"].update(ok=False, cre=40e6, detail="60 raw vs 100 quiet-check")
        res["rules"]["5.7"].update(ok=False, cre=1e6, detail="baseline med 60k")  # <5%: no candidate
        r1 = recommend.rank(res)
        r2 = recommend.rank(json.loads(json.dumps(res)))
        self.assertEqual(r1, r2)
        self.assertLessEqual(len(r1), 3)
        self.assertEqual([r["id"] for r in r1], ["R1", "R2", "R3"][:len(r1)])
        kinds = {(r["kind"], r["rule"], r["template"]) for r in r1}
        self.assertIn(("loosen", "5.4", "shorten-rule"), kinds)
        self.assertIn(("loosen", "5.1", "set-key"), kinds)
        self.assertIn(("tighten", "5.13", "enforce-rule"), kinds)
        self.assertEqual([r["score"] for r in r1], sorted((r["score"] for r in r1), reverse=True))
        for r in r1:
            self.assertTrue(r["evidence"] and any(ch.isdigit() for ch in r["evidence"]))
        text = "\n".join(recommend.lines(r1))
        self.assertIn("apply R1", text)

    def test_live_metric_holds_back_and_no_finding(self):
        res = res_fixture(win_classes={"limited": 0, "normal": 7, "headroom": 0})
        self.assertEqual(recommend.rank(res), [])
        self.assertIn("none", recommend.lines([])[0])
        res["rules"]["5.13"].update(ok=False, cre=40e6)
        self.assertEqual(recommend.rank(res, live=[{"metric": "cre", "template": None, "params": None}]), [])

    def test_shared_rule_never_recommended_for_drop(self):
        res = res_fixture(win_classes={"limited": 0, "normal": 7, "headroom": 0})
        for k in ("5.2", "5.3", "5.4"):
            res["rules"][k]["text_cre"] = 50e3
        recs = recommend.rank(res, standing=["5.2", "5.3", "5.4"])
        self.assertEqual([(r["template"], r["rule"]) for r in recs], [("drop-rule", "5.4")])

    def test_no_effect_line_agrees_with_top3_drops(self):
        res = res_fixture(win_classes={"limited": 0, "normal": 7, "headroom": 0})
        for k in ("5.2", "5.4", "5.10"):
            res["rules"][k]["text_cre"] = 50e3
        sdd = {"flag": ["5.1", "5.2", "5.4", "5.10"], "insufficient": ["5.13"], "why": "x"}
        el = recommend.drop_eligibility(sdd, res)
        text = "\n".join(report.standing_lines(el))
        shown = {k for k in A.RULE_NAMES if f"{k} {A.RULE_NAMES[k]} → candidate to drop" in text}
        dropped = {c["rule"] for c in recommend.candidates(res, sdd) if c["kind"] == "drop"}
        self.assertEqual(shown, dropped)
        self.assertEqual(dropped, {"5.4", "5.10"})  # 5.2 shared line, 5.1 no prose
        self.assertIn("insufficient data (x): 5.13", text)
        self.assertNotIn("5.13", {c["rule"] for c in recommend.candidates(res, sdd)})

    def test_report_with_extras_stays_under_60_and_deterministic(self):
        self.load(compliant(1), compliant(2))
        env = dict(os.environ)
        outs = [subprocess.run([sys.executable, str(EXE), "report", "--since", "2026-10-01"], capture_output=True,
                               text=True, env=env, timeout=60).stdout for _ in range(2)]
        self.assertEqual(outs[0], outs[1])
        self.assertLessEqual(len(outs[0].splitlines()), 60)
        for tag in ("TOP 3", "AUDIT", "no measured effect", "insufficient data (effective 2026-09-29"):
            self.assertIn(tag, outs[0])


def eff_map(date):
    m = static.rules_map()
    m["effective_since"] = {"default": date}
    return lambda: m


class EffectiveWindowTests(Base):
    """Compliance, standing checks and drop eligibility only count sessions
    on/after each rule's effective_since date."""

    def test_compliance_ignores_sessions_before_effective_date(self):
        con = self.load(compliant(1))
        with mock.patch.object(static, "rules_map", eff_map("2026-10-02")):
            r = self.analyze(con, [sid(1)])["rules"]
        self.assertIsNone(r["5.13"]["ok"])
        self.assertIn("n/a before 2026-10-02", r["5.13"]["detail"])
        A._SESS.clear()
        with mock.patch.object(static, "rules_map", eff_map("2026-09-29")):
            r = self.analyze(con, [sid(1)])["rules"]
        self.assertIs(r["5.13"]["ok"], True)

    def test_pre_rule_sessions_in_scope_do_not_count(self):
        old = TB(sid(9), t0=T0 - 3 * 86400)  # 2026-09-28: before the rule
        old.human()
        old.req(ctx=30_000)
        for _ in range(4):
            old.bash("npm run build", result="\n".join(["e"] * 500))
            old.req(ctx=40_000)
        con = self.load(compliant(1), old)
        with mock.patch.object(static, "rules_map", eff_map("2026-09-20")):
            both = self.analyze(con, [sid(1), sid(9)])["rules"]["5.13"]
        self.assertIs(both["ok"], False)
        self.assertGreater(both["cre"], 0)
        A._SESS.clear()
        with mock.patch.object(static, "rules_map", eff_map("2026-09-29")):
            res = self.analyze(con, [sid(1), sid(9)])
        r = res["rules"]["5.13"]
        self.assertEqual((r["ok"], r["cre"]), (True, 0.0))
        self.assertFalse([c for c in recommend.rank(res) if c["rule"] == "5.13"])

    def prs(self, n, eou=1.0):
        return [{"merged_at": "2026-10-01T12:00:00Z", "eou": eou, "_owners": [(sid(1), 1.0)], "number": i, "head_branch": f"feat/x{i}"}
                for i in range(n)]

    def test_standing_insufficient_until_4_weeks_post_effective(self):
        con = self.load(compliant(1))
        with mock.patch.object(static, "rules_map", eff_map("2026-09-29")):
            d = verdict.standing_detail(con, self.prs(12), "2026-10-02T00:00:00Z")
        self.assertEqual(d["flag"], [])
        self.assertEqual(d["insufficient"], sorted(A.RULE_NAMES, key=A._rk))
        self.assertIn("effective 2026-09-29, 3 of 28 d", d["why"])

    def test_standing_insufficient_below_pr_and_eou_minimum(self):
        con = self.load(compliant(1))
        with mock.patch.object(static, "rules_map", eff_map("2026-09-01")):
            d = verdict.standing_detail(con, self.prs(9), "2026-10-02T00:00:00Z")
            self.assertIn("9 PRs/9.0 EOU < 10/5", d["why"])
            self.assertEqual(len(d["insufficient"]), len(A.RULE_NAMES))
            d = verdict.standing_detail(con, self.prs(12, eou=0.3), "2026-10-02T00:00:00Z")
            self.assertEqual(len(d["insufficient"]), len(A.RULE_NAMES))

    def test_standing_eligible_with_full_span_and_minimum(self):
        con = self.load(compliant(1))
        with mock.patch.object(static, "rules_map", eff_map("2026-09-01")):
            d = verdict.standing_detail(con, self.prs(12), "2026-10-02T00:00:00Z")
        self.assertEqual((d["insufficient"], d["why"]), ([], ""))
        self.assertEqual(d["flag"], [])  # one session: no followed-vs-violated groups

    def test_per_rule_override(self):
        con = self.load(compliant(1))
        m = static.rules_map()
        m["effective_since"] = {"default": "2026-09-01", "5.4": "2026-09-30"}
        with mock.patch.object(static, "rules_map", lambda: m):
            d = verdict.standing_detail(con, self.prs(12), "2026-10-02T00:00:00Z")
        self.assertEqual(d["insufficient"], ["5.4"])


class ApplyRevertTests(Base):
    """apply/revert through the CLI on a temp git repo (bare origin) and a
    temp ~/.claude; gh is a fake that logs its argv."""

    def setUp(self):
        super().setUp()
        t = self.tmp
        self.origin = t / "origin.git"
        subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(self.origin)], check=True)
        self.repo = t / "template"
        subprocess.run(["git", "init", "-q", "-b", "main", str(self.repo)], check=True)
        for k, v in (("user.name", "t"), ("user.email", "t@t"), ("commit.gpgsign", "false")):
            git(self.repo, "config", k, v)
        (self.repo / "claude-home").mkdir()
        (self.repo / "claude-home" / "CLAUDE.md").write_text(REAL_MD)
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-q", "-m", "init")
        git(self.repo, "remote", "add", "origin", str(self.origin))
        git(self.repo, "push", "-q", "-u", "origin", "main")
        gh = t / "fake-gh"
        gh.write_text(FAKE_GH)
        gh.chmod(0o755)
        self.ghlog = t / "gh.log"
        (self.chome / "settings.json").write_text('{\n  "model": "opus"\n}\n')
        os.environ.update(SESSION_ANALYZER_TEMPLATE_REPO=str(self.repo), SESSION_ANALYZER_GH=str(gh),
                          FAKE_GH_LOG=str(self.ghlog), GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t",
                          GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@t",
                          SESSION_ANALYZER_NOW="2026-10-05T08:00:00Z")
        store.connect().close()
        recs = [dict(c, id=f"R{i}", slug=catalog.slug(c["kind"] + "-" + c["rule"])) for i, c in enumerate([
            {"kind": "loosen", "rule": "5.4", "template": "shorten-rule", "expect": "lead:down", "evidence": "e1 3",
             "change": "shorten 5.4", "params": catalog.params_for("shorten-rule", rule="5.4")},
            {"kind": "loosen", "rule": "5.1", "template": "set-key", "expect": "cre:down", "evidence": "e2 4",
             "change": "set autoCompactWindow", "params": catalog.params_for("set-key", key="autoCompactWindow",
                                                                             value=300000)},
            {"kind": "tighten", "rule": "5.7", "template": "connector-off", "expect": "owner:down",
             "evidence": "e3 5", "change": "turn off connectors", "params": {}},
            {"kind": "drop", "rule": "5.10", "template": "drop-rule", "expect": "cre:down", "evidence": "e4 6",
             "change": "drop 5.10", "params": catalog.params_for("drop-rule", rule="5.10")},
        ], 1)]
        d = self.tmp / "archive" / "reports"
        d.mkdir(parents=True, exist_ok=True)
        (d / "2026-W41.json").write_text(json.dumps({"scope": "x", "recs": recs}))

    def cli(self, *args):
        r = subprocess.run([sys.executable, str(EXE), *args], capture_output=True, text=True,
                           env=dict(os.environ), timeout=120)
        return r

    def exp(self, eid):
        con = store.connect()
        return dict(con.execute("SELECT * FROM experiments WHERE id=?", (eid,)).fetchone())

    def test_apply_opens_pr_writes_mark_then_revert_restores_bytes(self):
        r = self.cli("apply", "R1")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("PR https://github.com/o/r/pull/7", r.stdout)
        branch = "chore/sa-R1-loosen-5-4"
        self.assertIn(branch, git(self.origin, "branch", "--list"))
        log = self.ghlog.read_text()
        self.assertIn("pr create --base main --head " + branch, log)
        self.assertIn("e1 3", log)  # evidence in the PR body
        # owner's checkout untouched
        self.assertEqual(git(self.repo, "rev-parse", "--abbrev-ref", "HEAD"), "main")
        self.assertEqual(git(self.repo, "status", "--porcelain"), "")
        self.assertEqual((self.repo / "claude-home" / "CLAUDE.md").read_text(), REAL_MD)
        e = self.exp(1)
        self.assertEqual((e["status"], e["metric"], e["rec_id"], e["source"]), ("live", "lead", "R1", "catalog"))
        self.assertEqual(e["pr_url"], "https://github.com/o/r/pull/7")
        patched = git(self.origin, "show", f"{branch}:claude-home/CLAUDE.md")
        self.assertIn(catalog.SHORT["5.4"][0], patched)
        # a second experiment on the same metric is refused
        r = self.cli("mark", "other", "--expect", "lead")
        self.assertEqual(r.returncode, 2)
        self.assertIn("refused", r.stderr)
        # revert before merge: patch not on main → refused with the close-PR hint
        r = self.cli("revert", "R1")
        self.assertEqual(r.returncode, 2)
        self.assertIn("close it instead", r.stderr)
        # owner merges, then revert opens the inverse PR
        git(self.origin, "update-ref", "refs/heads/main", f"refs/heads/{branch}")
        r = self.cli("revert", "R1")
        self.assertEqual(r.returncode, 0, r.stderr)
        rb = [b.strip(" *") for b in git(self.origin, "branch", "--list").splitlines() if "revert" in b][0]
        self.assertEqual(git(self.origin, "show", f"{rb}:claude-home/CLAUDE.md") + "\n", REAL_MD)
        self.assertEqual(self.exp(1)["status"], "reverted")
        self.assertIn("reverted", (self.tmp / "archive" / "reports" / "verdicts.md").read_text())

    def test_home_target_backup_and_byte_identical_revert(self):
        s = self.chome / "settings.json"
        before = s.read_bytes()
        r = self.cli("apply", "R2")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(json.loads(s.read_text())["autoCompactWindow"], 300000)
        baks = list(self.chome.glob("settings.json.bak-sa-*"))
        self.assertEqual([b.read_bytes() for b in baks], [before])
        self.assertFalse(self.ghlog.exists())  # no PR for ~/.claude
        self.assertEqual(self.exp(1)["metric"], "cre")
        time.sleep(1.1)  # distinct backup timestamp
        r = self.cli("revert", "E1")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(s.read_bytes(), before)

    def test_connector_off_prints_owner_step_and_marks(self):
        r = self.cli("apply", "R3")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("owner step", r.stdout)
        self.assertEqual(self.exp(1)["template"], "connector-off")

    def test_dry_run_writes_nothing(self):
        r = self.cli("apply", "R4", "--dry-run")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("-- Research returns", r.stdout)  # unified diff of the dropped 5.10 line
        self.assertEqual(store.connect().execute("SELECT COUNT(*) FROM experiments").fetchone()[0], 0)
        self.assertNotIn("chore/", git(self.origin, "branch", "--list"))


class WeeklyTests(Base):
    def test_weekly_writes_0600_report_and_sidecar(self):
        self.load(compliant(1), compliant(2))
        env = dict(os.environ, SESSION_ANALYZER_NOW="2026-10-05T08:00:00Z")
        t = time.monotonic()
        r = subprocess.run([sys.executable, str(EXE), "weekly"], capture_output=True, text=True, env=env, timeout=120)
        self.weekly_s = time.monotonic() - t
        self.assertEqual(r.returncode, 0, r.stderr)
        d = self.tmp / "archive" / "reports"
        md, js = d / "2026-W41.md", d / "2026-W41.json"
        for p in (md, js):
            self.assertEqual(stat.S_IMODE(p.stat().st_mode), 0o600)
        self.assertIn("TOP 3", md.read_text())
        self.assertIn("recs", json.loads(js.read_text()))
        self.assertLessEqual(len(md.read_text().splitlines()), 60)


if __name__ == "__main__":
    unittest.main()
