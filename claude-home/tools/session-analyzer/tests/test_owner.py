"""Step-4 acceptance tests (PRD §5 Owner action, §6.6, §9): cue extraction,
pure classification, labeled-fixture agreement, text-free index, incremental
== full, report OWNER line + compare rows."""
import json
import os
import sqlite3
import sys
import unittest
from pathlib import Path

TOOL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOL))
from sa import PARSER_VERSION, analyze as A, ingest, owner as O, parse, report, store  # noqa: E402
from test_analyzer import Base, TB, sid  # noqa: E402

FIXTURE = TOOL / "tests" / "fixtures" / "owner_labeled.jsonl"
SECRET = "zebra-quokka-4471"


def score(rows):
    ok = sum(1 for r in rows if O.classify(r["f"])[0] == r["label"])
    per = {}
    for c in O.CLASSES:
        tp = sum(1 for r in rows if r["label"] == c and O.classify(r["f"])[0] == c)
        pp = sum(1 for r in rows if O.classify(r["f"])[0] == c)
        n = sum(1 for r in rows if r["label"] == c)
        per[c] = (tp / pp if pp else None, tp / n if n else None, n)
    return ok / len(rows), per


class CueTests(unittest.TestCase):
    def test_assistant_question_offer_handoff(self):
        self.assertEqual(O.assistant_labels("Done. Want me to open the PR?"), {"q": 1, "offer": 1, "alen": 5})
        h = O.assistant_labels("Next:\n1. Run `launchctl kickstart -k gui/502/x` then tell me when it is up.")
        self.assertEqual(h["handoff"], 1)
        self.assertEqual(h["pats"][0], "service-restart")
        self.assertEqual(O.assistant_labels("Shipped, 40 passed."), {"alen": 5})
        self.assertIsNone(O.assistant_labels("  "))

    def test_user_cues(self):
        self.assertEqual(O.user_labels("[Request interrupted by user]"), {"int": 1})
        self.assertIn("neg", O.user_labels("No, that’s not what I meant"))
        self.assertIn("neg", O.user_labels("N3d isn’t showing"))
        self.assertIn("res", O.user_labels("continue"))
        self.assertIn("done", O.user_labels("done"))
        self.assertIn("yes", O.user_labels("yes go ahead"))
        self.assertIn("merged", O.user_labels("PR #12 merged"))
        self.assertIn("ask", O.user_labels("what does EOU mean"))
        b = O.user_labels("<bash-input>sudo pmset -a sleep 0</bash-input>")
        self.assertEqual((b["bash"], b["pats"][0]), (1, "sudo"))

    def test_option_features(self):
        a = O.assistant_labels("Two ways:\n1. Ship now\n2. Wait for review\nWhich?")
        self.assertEqual((a["opts"], a["q"]), (1, 1))
        self.assertEqual(a["alen"], len("Two ways:\n1. Ship now\n2. Wait for review\nWhich?").bit_length())
        for t in ("1", "b) then ship", "2 and 3", "both", "go with A"):
            self.assertIn("opt", O.user_labels(t), t)
        for t in ("1000 users is the target", "a few things to change", "build it"):
            self.assertNotIn("opt", O.user_labels(t), t)
        self.assertEqual([O.ratio_bucket(c, 11) for c in (10, 300, 900)], [0, 1, 2])

    def test_option_rules(self):
        f = {"first": 0, "slash": 0, "after_err": 0, "after_int": 0}
        self.assertEqual(O.classify({**f, "chars": 150, "a": {"opts": 1}, "u": {}})[0], "decision")
        self.assertEqual(O.classify({**f, "chars": 150, "a": {"opts": 1, "handoff": 1}, "u": {}})[0], "new_request")
        self.assertEqual(O.classify({**f, "chars": 300, "ratio": 0, "a": {}, "u": {"opt": 1}})[0], "decision")
        self.assertEqual(O.classify({**f, "chars": 300, "ratio": 1, "a": {}, "u": {"opt": 1}})[0], "new_request")

    def test_labels_are_text_free(self):
        for d in (O.assistant_labels(f"Paste {SECRET} here?"), O.user_labels(f"no {SECRET}")):
            self.assertNotIn(SECRET, json.dumps(d))


class ClassifyTests(unittest.TestCase):
    def f(self, **kw):
        base = {"first": 0, "chars": 10, "slash": 0, "after_err": 0, "after_int": 0, "a": {}, "u": {}}
        base.update(kw)
        return base

    def test_rule_order(self):
        c = lambda **kw: O.classify(self.f(**kw))[0]  # noqa: E731
        self.assertEqual(c(first=1, u={"neg": 1}), "new_request")
        self.assertEqual(c(after_err=1), "resume")
        self.assertEqual(c(u={"res": 1}), "resume")
        self.assertEqual(c(u={"neg": 1}, a={"q": 1}), "redirect")
        self.assertEqual(c(after_int=1), "redirect")
        self.assertEqual(c(u={"done": 1}, a={"handoff": 1, "pats": ["git-sync"]}), "manual_step")
        self.assertEqual(c(a={"q": 1}, chars=30), "decision")
        self.assertEqual(c(a={"q": 1}, chars=900), "new_request")
        self.assertEqual(c(a={"q": 1}, chars=30, u={"ask": 1}), "new_request")
        self.assertEqual(c(a={"ask": 1}, chars=3000), "decision")
        self.assertEqual(c(chars=300), "new_request")

    def test_infeasible_manual_and_decision_never_penalized(self):
        cls, pat, inf = O.classify(self.f(u={"bash": 1, "pats": ["sudo"]}))
        self.assertEqual((cls, pat, inf), ("manual_step", "sudo", True))
        self.assertFalse(O.penalized(cls, inf))
        self.assertTrue(O.penalized(*O.classify(self.f(u={"bash": 1}))[::2]))
        self.assertFalse(O.penalized("decision", False))
        self.assertFalse(O.penalized("new_request", False))

    def test_rule_table_shape(self):
        self.assertEqual(O.MINUTES, {"manual_step": 2, "approval": 1})
        self.assertTrue({"device", "credential", "testflight", "sudo"} <= O.INFEASIBLE)
        self.assertNotIn("git-sync", O.INFEASIBLE)


class FixtureTests(unittest.TestCase):
    """Labels assigned by reading live prompts locally; the committed rows are
    features + label only. Rules were tuned on `dev`; `holdout` is scored here."""

    @classmethod
    def setUpClass(cls):
        cls.rows = [json.loads(ln) for ln in FIXTURE.read_text().splitlines()]

    def test_fixture_is_text_free_and_sized(self):
        self.assertLessEqual(FIXTURE.stat().st_size, 100_000)
        total = sum(p.stat().st_size for p in FIXTURE.parent.rglob("*") if p.is_file())
        self.assertLessEqual(total, 1 << 20)  # brief: fixtures total ≤1 MB
        self.assertGreaterEqual(len(self.rows), 60)
        self.assertGreaterEqual(len({r["s"] for r in self.rows}), 5)
        for r in self.rows:
            self.assertEqual(set(r), {"s", "split", "label", "f"})
            self.assertIn(r["label"], O.CLASSES)
            for v in json.dumps(r["f"]).split('"')[1::2]:  # every string is a known key/id
                self.assertRegex(v, r"^[a-z_-]+$")

    # Achieved on all 238 labels after the hand-off feature (PARSER_VERSION 5): 0.765.
    ACHIEVED = 0.765

    def test_regression_floor_all_labels_not_s9_gate(self):
        """Regression floor only (achieved - 0.02); NOT the §9 ≥0.90 gate. The
        labels were all used for tuning, so this guards against backsliding and
        says nothing about generalization: the per-class split stays experimental
        until ≥0.90 on ≥100 fresh turns after owner.FRESH_EVAL_SINCE."""
        acc, _ = score(self.rows)
        self.assertGreaterEqual(len(self.rows), 238)
        self.assertGreaterEqual(acc, self.ACHIEVED - 0.02)

    def test_fresh_eval_constants(self):
        self.assertEqual(O.FRESH_EVAL_SINCE, "2026-10-01")
        self.assertLess(O.HELDOUT_ACC, 0.90)  # still experimental; flip only with a fresh eval


class HandoffTests(unittest.TestCase):
    def test_next_handoff_state(self):
        nx = O.next_handoff_state
        self.assertEqual(nx({"ho": 0, "u": {}}), 0)
        self.assertEqual(nx({"ho": 1, "u": {}, "chars": 10}), 2)
        self.assertEqual(nx({"ho": 3, "u": {}, "chars": 10}), 3)  # capped
        for u in ({"bash": 1}, {"done": 1}, {"merged": 1}):
            self.assertEqual(nx({"ho": 1, "u": u, "chars": 10}), 0, u)
        self.assertEqual(nx({"ho": 1, "u": {"imp": 1}, "chars": 500}), 0)  # new long instruction closes it
        self.assertEqual(nx({"ho": 1, "u": {"imp": 1}, "chars": 50}), 2)

    def test_open_handoff_short_report_is_manual(self):
        base = {"a": {}, "u": {}, "chars": 20, "hpats": ["xcode-run"]}
        self.assertEqual(O.classify(dict(base))[0], "new_request")
        self.assertEqual(O.classify(dict(base, ho=2))[:2], ("manual_step", "xcode-run"))
        self.assertEqual(O.classify(dict(base, ho=2, chars=O.HANDOFF_MAX + 1))[0], "new_request")
        self.assertEqual(O.classify(dict(base, ho=2, u={"imp": 1}))[0], "new_request")


class IngestOwnerTests(Base):
    def convo(self, s):
        b = TB(s)
        b.human(f"build the thing {SECRET}")
        b.req()
        b.rec({"type": "assistant", "requestId": "req_q" + s[:6], "message": {
            "model": b.model, "id": "msg_q" + s[:6], "role": "assistant", "type": "message",
            "content": [{"type": "text", "text": "Draft ready. Want me to open the PR?"}], "stop_reason": "end_turn",
            "usage": {"input_tokens": 3, "cache_read_input_tokens": 20_000, "cache_creation_input_tokens": 10,
                      "output_tokens": 9}}})
        b.human("yes")
        b.req()
        b.rec({"type": "assistant", "requestId": "req_h" + s[:6], "message": {
            "model": b.model, "id": "msg_h" + s[:6], "role": "assistant", "type": "message",
            "content": [{"type": "text", "text": "Now run:\n```bash\ngit pull && xcodegen generate\n```\n"
                                                 "then tell me when it builds."}], "stop_reason": "end_turn",
            "usage": {"input_tokens": 3, "cache_read_input_tokens": 20_000, "cache_creation_input_tokens": 10,
                      "output_tokens": 9}}})
        b.human("done")
        b.req()
        b.human("No, that's wrong, the header is still showing")
        b.req()
        b.rate_limit()
        b.human("continue")
        b.req()
        b.bash("git pull")
        return b

    def classes(self, con, s):
        return [r[0] for r in con.execute("SELECT class FROM turns WHERE session_id=? AND origin='human' ORDER BY ts",
                                          (s,))]

    def test_classes_patterns_and_text_free_index(self):
        b = self.convo(sid(41))
        con = self.load(b)
        self.assertEqual(self.classes(con, b.sid),
                         ["new_request", "decision", "manual_step", "redirect", "resume"])
        row = con.execute("SELECT pattern, infeasible FROM turns WHERE class='manual_step'").fetchone()
        self.assertEqual(tuple(row), ("git-sync", 0))
        self.assertEqual(con.execute("SELECT owner_pattern FROM tool_calls WHERE name='Bash'").fetchone()[0],
                         "git-sync")
        con.close()
        home = Path(os.environ["SESSION_ANALYZER_HOME"])
        self.assertNotIn(SECRET.encode(), (home / "index.db").read_bytes())
        skels = list(home.rglob("*.xz"))
        self.assertTrue(skels)
        for p in skels:
            import lzma
            self.assertNotIn(SECRET.encode(), lzma.decompress(p.read_bytes()))

    def test_ask_tool_answer_is_decision(self):
        b = TB(sid(42))
        b.human("plan it")
        b.req(tool=("AskUserQuestion", {"questions": [{"question": "A or B?"}]}), result="User answered: A")
        b.human("go on, ship")
        con = self.load(b)
        rows = con.execute("SELECT origin, class FROM turns WHERE session_id=? ORDER BY ts", (b.sid,)).fetchall()
        self.assertIn(("ask", "decision"), [tuple(r) for r in rows])

    def test_incremental_equals_full(self):
        b = self.convo(sid(43))
        full = b.main[:]
        # first half, ingest, then the rest (appended), ingest again
        cut = next(i for i, r in enumerate(full) if r.get("message", {}).get("content") == "done")
        b.main = full[:cut]
        con = self.load(b)
        con.close()
        b.main = full
        con = self.load(b)
        inc = self.classes(con, b.sid)
        con.close()
        rw = store.connect()
        ingest.ingest_session(rw, parse.find_session(self.projects, b.sid), True)
        rw.close()
        con = store.connect_ro()
        self.assertEqual(inc, self.classes(con, b.sid))
        self.assertEqual(inc, ["new_request", "decision", "manual_step", "redirect", "resume"])

    def test_report_owner_line_deterministic_and_compare(self):
        b1, b2 = self.convo(sid(44)), self.convo(sid(45))
        con = self.load(b1, b2)
        res = self.analyze(con, [b1.sid, b2.sid])
        o = res["owner"]
        self.assertEqual(o["counts"], {"decision": 2, "redirect": 2, "manual_step": 2, "resume": 2,
                                       "new_request": 2})
        self.assertEqual(o["minutes"], 2 * 2 + 1 * 2)
        self.assertEqual(o["manual"][0]["pattern"], "git-sync")
        self.assertIsNotNone(o["manual"][0]["auto_cre"])  # the agent ran `git pull` itself
        ln = report.owner_lines(o, 2.0)
        self.assertEqual(o["total"], 8)
        self.assertEqual(ln[0], "OWNER    actions/EOU 4.0 · experimental: decisions 1.0 · manual 1.0 · redirects 1.0"
                                " · resumes 1.0 (held-out acc 0.65)")
        self.assertIn("git-sync ×2 4 min (auto", ln[2])
        self.assertTrue(report.owner_lines(o, 0)[0].startswith("OWNER    actions (no EOU) 8 "))
        txt = report.render(res)
        self.assertEqual(txt, report.render(self.analyze(con, [b1.sid, b2.sid])))
        self.assertLessEqual(len(txt.splitlines()), 60)
        res["eou"] = 2.0
        cmp = report.compare(res, res)
        self.assertIn("OWNER actions/EOU", cmp)
        self.assertIn("exp. decisions/EOU", cmp)
        self.assertIn("exp. owner min/EOU", cmp)

    def test_total_is_plain_count_not_classifier(self):
        """Binding total = owner turns minus opening prompts and slash commands,
        exact and independent of class."""
        b1, b2 = self.convo(sid(46)), self.convo(sid(47))
        con = self.load(b1, b2)
        self.assertEqual(self.analyze(con, [b1.sid, b2.sid])["owner"]["total"], 8)
        rw = store.connect()
        rw.execute("UPDATE turns SET class='new_request'")
        rw.commit()
        o = self.analyze(con, [b1.sid, b2.sid])["owner"]
        self.assertEqual(o["total"], 8)
        self.assertEqual(o["counts"]["decision"], 0)


class MigrationTests(Base):
    def test_v3_columns_and_parser_version(self):
        self.assertGreaterEqual(PARSER_VERSION, 3)
        con = store.connect()
        cols = {r[1] for r in con.execute("PRAGMA table_info(turns)")}
        self.assertTrue({"class", "pattern", "infeasible", "feat"} <= cols)
        self.assertIn("owner_pattern", {r[1] for r in con.execute("PRAGMA table_info(tool_calls)")})
        con.close()


if __name__ == "__main__":
    unittest.main()
