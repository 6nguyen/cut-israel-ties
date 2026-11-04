"""token-tooling Phase 1 acceptance tests (docs/prd/token-tooling.md).
rtk-dependent tests skip when rtk/jq are absent; rtk runs under a temp HOME so
its history/recall stores never touch the owner's."""
import json
import os
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
HOOK, INSTALL = HERE / "rtk-hook.sh", HERE / "install-rtk.sh"
SA = HERE.parent / "tools" / "session-analyzer" / "session-analyzer"
RTK = shutil.which("rtk")
HAVE = bool(RTK and shutil.which("jq"))
NO_RTK_PATH = "/usr/bin:/bin"  # jq lives in /usr/bin on macOS; rtk does not
needs_rtk = unittest.skipUnless(HAVE, "rtk and jq required")


def payload(cmd):
    return json.dumps({"hook_event_name": "PreToolUse", "tool_name": "Bash",
                       "tool_input": {"command": cmd, "description": "d"}})


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="tt-"))
        self.env = dict(os.environ, HOME=str(self.tmp), CLAUDE_HOME=str(self.tmp / ".claude"))
        (self.tmp / ".claude").mkdir()

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def hook(self, cmd, **env):
        r = subprocess.run(["bash", str(HOOK)], input=payload(cmd), capture_output=True, text=True,
                           env=dict(self.env, **env))
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads(r.stdout)["hookSpecificOutput"]["updatedInput"]["command"] if r.stdout.strip() else None


class HookTests(Base):
    @needs_rtk
    def test_rewrites_filtered_commands(self):
        for c in ("git status", "git log", "ls -R", "gh pr list"):
            self.assertEqual(self.hook(c), "rtk " + c)

    @needs_rtk
    def test_pass_through(self):
        for c in ("scripts/quiet-check.sh session-analyzer", "git log | head -5", "RTK_RAW=1 git status",
                  "  RTK_RAW=1 git status", "git log > /tmp/x", "sed -n 1,5p f", "git status | tail -3",
                  "echo hi"):
            self.assertIsNone(self.hook(c), c)
        # `||` and stderr merges are not output shaping
        self.assertEqual(self.hook("git status 2>&1"), "rtk git status 2>&1")
        self.assertTrue((self.hook("git status || true") or "").startswith("rtk git status"))

    @needs_rtk
    def test_kill_switch_without_reinstall(self):
        off = self.tmp / ".claude" / "token-tooling.off"
        off.touch()
        self.assertIsNone(self.hook("git status"))
        off.unlink()
        self.assertEqual(self.hook("git status"), "rtk git status")

    def test_never_fails_session(self):
        self.assertIsNone(self.hook("git status", PATH=NO_RTK_PATH))  # rtk uninstalled
        r = subprocess.run(["bash", str(HOOK)], input="not json", capture_output=True, text=True, env=self.env)
        self.assertEqual((r.returncode, r.stdout), (0, ""))

    @needs_rtk
    def test_failure_keeps_exit_code_and_stderr(self):
        repo = self.tmp / "r"
        subprocess.run(["git", "init", "-q", str(repo)], check=True)
        r = subprocess.run([RTK, "git", "checkout", "no-such-branch"], cwd=repo, capture_output=True,
                           text=True, env=self.env)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("pathspec 'no-such-branch' did not match", r.stdout + r.stderr)

    @needs_rtk
    def test_truncation_names_recall_hash(self):
        d = self.tmp / "many"
        for i in range(60):
            (d / f"d{i:02d}").mkdir(parents=True)
            for j in range(40):
                (d / f"d{i:02d}" / f"f{j:02d}.txt").touch()
        out = subprocess.run([RTK, "ls", "-R", str(d)], capture_output=True, text=True, env=self.env).stdout
        hint = [ln for ln in out.splitlines() if "rtk recall " in ln]
        self.assertTrue(hint, out[-500:])
        h = hint[-1].split("rtk recall ")[1].strip(" ]")
        full = subprocess.run([RTK, "recall", "--full", h], capture_output=True, text=True, env=self.env).stdout
        self.assertIn("f39.txt", full)
        self.assertGreater(len(full.splitlines()), len(out.splitlines()))

    @unittest.skipUnless(HAVE and os.environ.get("RTK_BENCH"), "set RTK_BENCH=1 to measure the budget")
    def test_p95_overhead_budget(self):
        def p95(cmd):
            ts = []
            for _ in range(100):
                t = time.perf_counter()
                self.hook(cmd)
                ts.append((time.perf_counter() - t) * 1000)
            return statistics.quantiles(ts, n=20)[18]
        rw, pt = p95("git status"), p95("git log | head -5")
        print(f"\nBENCH rtk-hook p95: rewrite {rw:.1f} ms · pass-through {pt:.1f} ms (100 calls each)")
        self.assertLessEqual(rw, 50)


class InstallTests(Base):
    def install(self, path=None):
        env = dict(self.env, PATH=path) if path else self.env
        r = subprocess.run(["bash", str(INSTALL), str(self.s), sys.executable, str(SA)], capture_output=True,
                           text=True, env=env)
        self.assertEqual(r.returncode, 0, r.stderr)
        return r.stdout.splitlines()

    def setUp(self):
        super().setUp()
        self.s = self.tmp / ".claude" / "settings.json"
        self.s.write_text('{"model": "x"}\n')

    @needs_rtk
    def test_idempotent_and_prints_mark_command_once(self):
        first = self.install()
        after = self.s.read_bytes()
        self.assertIn("session-analyzer mark rtk --expect CRE/EOU:down", first[-1])
        second = self.install()
        self.assertEqual(self.s.read_bytes(), after)
        self.assertEqual(second, ["PreToolUse hook: present"])
        h = json.loads(after)["hooks"]["PreToolUse"]
        self.assertEqual(h, [{"matcher": "Bash", "hooks": [{"type": "command", "command": f'"{HOOK}"'}]}])

    def test_missing_rtk_one_warn_exit_0(self):
        before = self.s.read_bytes()
        out = self.install(path=NO_RTK_PATH)
        self.assertEqual(len(out), 1)
        self.assertTrue(out[0].startswith("WARN: rtk >= "), out)
        self.assertEqual(self.s.read_bytes(), before)

    @needs_rtk
    def test_second_rewriter_warns_and_writes_nothing(self):
        self.s.write_text(json.dumps({"hooks": {"PreToolUse": [
            {"matcher": "Bash", "hooks": [{"type": "command", "command": "rtk hook claude"}]}]}}))
        before = self.s.read_bytes()
        out = self.install()
        self.assertTrue(out[0].startswith("WARN: PreToolUse hook not added"), out)
        self.assertEqual(self.s.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
