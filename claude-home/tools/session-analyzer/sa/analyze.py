"""Analyzer core (PRD items 3-5): CRE, compliance, waste, static overhead,
EOU attribution, windows, lead time, time ledger, latency dividend.

Pure reads: every function takes a read-only connection and returns plain
data. Nothing here writes the archive (the `prs` cache refresh lives in
sa.gh). Deterministic: no wall clock (the 30-day calibration window is
anchored on the newest request in the index), sorted iteration everywhere.
"""
import json
import statistics
from bisect import bisect_left, bisect_right
from datetime import datetime, timezone

from . import CRE_WEIGHTS, gh, static

# ---- constants (one place; PRD §5 / §6.3 / §6.5) -------------------------
WINDOW_S = 5 * 3600
CEILING_EST = 130e6          # §5: until ≥2 limit events are archived
CEILING_MIN_EVIDENCE = 50e6  # a "limit" below this is a per-minute 429, not the window
IDLE_S = 15 * 60
CACHE_TTL_S = 300
AUTOCOMPACT = 200_000
AGENT_CTX_CAP = 200_000
AGENT_REQ_CAP = 100
HEAVY_AGENT = 50
MCP_BASELINE = 45_000
FRESH_MAX = 100_000       # first-request context above this = resumed session
RESULT_LINES = 40
WRITE_PAYLOAD = 10_000
IMAGE_TOKENS = 1_600
BACK_TO_BACK_S = 300
RELAUNCH_S = 600
NO_EDIT_ORIENT_REQS = 10
V2_DATE = "2026-09-29"       # token-workflow v2 went live; pre-v2 = baseline
MAIN_BRANCHES = {None, "", "HEAD", "main", "master"}
EDIT_TOOLS = ("Edit", "Write", "MultiEdit", "NotebookEdit")
RESULT_TOOLS = ("Bash", "Read", "Grep", "Glob")  # tool-result tokens split (token-tooling PRD); rest → "other"
RERUN_WINDOW = 3  # same Bash command again within this many calls, no edit between = over-filtering signal
BUILD_CLASSES = ("quiet-check", "raw-build", "raw-test")
OVERHEAD = ("compaction", "reorientation", "cap_relaunch", "handoff", "serialization")
# Ledger priority (high wins). Idle outranks the overhead buckets so a night
# between "session start" and "first edit" is never booked as reorientation.
PRIO = ["rate_limited", "disk_full", "compaction", "idle", "cap_relaunch", "reorientation:session",
        "reorientation:compact", "reorientation:agent", "handoff", "serialization", "build_test",
        "model", "tool_other", "owner_wait", "other"]
RANK = {b: len(PRIO) - i for i, b in enumerate(PRIO)}

_EPOCH = {}


def ep(ts):
    """ISO-8601 (Z) -> epoch seconds (memoized)."""
    if ts is None:
        return None
    v = _EPOCH.get(ts)
    if v is None:
        v = datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
        if len(_EPOCH) < 2_000_000:
            _EPOCH[ts] = v
    return v


def iso(t):
    return datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _q(con, sql, args=()):
    return con.execute(sql, args).fetchall()


def _in(ids):
    return "(" + ",".join("?" * len(ids)) + ")"


def _median(xs):
    return statistics.median(xs) if xs else 0


# ---- scope ---------------------------------------------------------------
class Scope:
    def __init__(self, label, sessions, t0=None, t1=None, pr=None, branch=None):
        self.label, self.sessions, self.t0, self.t1 = label, sorted(sessions), t0, t1
        self.pr, self.branch = pr, branch

    def req_filter(self):
        sql, args = f"session_id IN {_in(self.sessions)}", list(self.sessions)
        if self.t0:
            sql += " AND ts>=?"
            args.append(self.t0)
        if self.t1:
            sql += " AND ts<?"
            args.append(self.t1)
        if self.branch:
            sql += " AND git_branch=?"
            args.append(self.branch)
        return sql, args

    def in_range(self, ts):
        return ts is not None and (not self.t0 or ts >= self.t0) and (not self.t1 or ts < self.t1)


def _date_arg(s, today=None):
    s = s.strip()
    if s.startswith("-") and s.endswith("d"):
        from datetime import date, timedelta
        d = (today or date.today()) - timedelta(days=int(s[1:-1]))
        return d.strftime("%Y-%m-%dT00:00:00Z")
    if len(s) == 10:
        return s + "T00:00:00Z"
    return s


def resolve(con, spec, prs=None):
    """spec: {'session': [ids]} | {'since': D, 'until': D} | {'window': TS} | {'pr': N, 'repo': R}
    or a compare string: '<id>[,<id>]', 'pr:N', 'D..D', 'D', '-7d', 'window:TS'."""
    if isinstance(spec, str):
        s = spec
        if s.startswith("pr:") or s.startswith("#"):
            spec = {"pr": int(s.split(":")[-1].lstrip("#"))}
        elif s.startswith("window:"):
            spec = {"window": s[7:]}
        elif ".." in s:
            a, b = s.split("..", 1)
            spec = {"since": a, "until": b}
        elif s.startswith("-") or (len(s) == 10 and s[4] == "-" and s.count("-") == 2):
            spec = {"since": s}
        else:
            spec = {"session": s.split(",")}
    if spec.get("session"):
        ids = []
        for p in spec["session"]:
            ids += [r[0] for r in _q(con, "SELECT id FROM sessions WHERE id LIKE ? ORDER BY id", (p + "%",))]
        ids = sorted(set(ids))
        return Scope("session " + ",".join(i[:8] for i in ids), ids)
    if spec.get("pr") is not None:
        n = int(spec["pr"])
        cands = [p for p in (prs or []) if p["number"] == n and (not spec.get("repo") or p["repo"] == spec["repo"])]
        if not cands:
            return Scope(f"PR #{n} (not in cache)", [], pr=None)
        p = sorted(cands, key=lambda p: p["repo"])[0]
        ids = sorted({sid for sid, _ in p.get("_owners", [])})
        return Scope(f"PR {p['repo']}#{n}", ids, pr=p, branch=p["head_branch"])
    if spec.get("window"):
        t = ep(_date_arg(spec["window"]))
        for w in windows(con):
            if w["start"] <= t < w["end"]:
                t0, t1 = iso(w["start"]), iso(w["end"])
                break
        else:
            t0, t1 = _date_arg(spec["window"]), iso(t + WINDOW_S)
        ids = [r[0] for r in _q(con, "SELECT DISTINCT session_id FROM requests WHERE ts>=? AND ts<? ORDER BY 1", (t0, t1))]
        return Scope(f"window {t0[:16]}Z", ids, t0, t1)
    t0 = _date_arg(spec["since"])
    t1 = None
    if spec.get("until"):
        u = _date_arg(spec["until"])
        t1 = u if "T00:00:00Z" not in u else iso(ep(u) + 86400)  # inclusive date
    if t1:
        ids = [r[0] for r in _q(con, "SELECT DISTINCT session_id FROM requests WHERE ts>=? AND ts<? ORDER BY 1", (t0, t1))]
    else:
        ids = [r[0] for r in _q(con, "SELECT DISTINCT session_id FROM requests WHERE ts>=? ORDER BY 1", (t0,))]
    lab = f"{t0[:10]} → {iso(ep(t1) - 1)[:10] if t1 else 'now'}"
    return Scope(lab, ids, t0, t1)


# ---- PRs + attribution (§5 EOU) -------------------------------------------
def repos_seen(con):
    rs = {r[0] for r in _q(con, "SELECT DISTINCT repo FROM pr_links WHERE repo IS NOT NULL")}
    if _has(con, "sessions", "repo"):
        rs |= {r[0] for r in _q(con, "SELECT DISTINCT repo FROM sessions WHERE repo IS NOT NULL")}
    return sorted(rs)


_COLS = {}


def _has(con, table, col):
    k = (id(con), table, col)
    if k not in _COLS:
        _COLS[k] = any(r[1] == col for r in con.execute(f"PRAGMA table_info({table})"))
    return _COLS[k]


def load_prs(con, fetched=None):
    """Cached PR rows (+ rows fetched this run but not written), scored, with
    owners = [(session_id, cre_share)] per §5 attribution."""
    cols = "number,repo,head_branch,merged_at,additions,deletions"
    extra = ",changed_lines,docs_only,file_hashes" if _has(con, "prs", "changed_lines") else ""
    rows = {(r["repo"], r["number"]): dict(r) for r in _q(con, f"SELECT {cols}{extra} FROM prs")}
    for r in fetched or []:
        rows[(r["repo"], r["number"])] = dict(r)
    prs = gh.score(sorted(rows.values(), key=lambda p: (p["repo"], p["number"])))
    # session -> repo (v2) ; branch CRE per session
    srepo = {}
    if _has(con, "sessions", "repo"):
        srepo = {r[0]: r[1] for r in _q(con, "SELECT id, repo FROM sessions")}
    for r in _q(con, "SELECT DISTINCT session_id, repo FROM pr_links"):
        srepo.setdefault(r[0], r[1])
    heads = {p["head_branch"] for p in prs if p["head_branch"] not in MAIN_BRANCHES}
    bcre = {}
    for r in _q(con, "SELECT session_id, git_branch, SUM(cre) FROM requests WHERE git_branch IS NOT NULL "
                     "GROUP BY 1,2"):
        if r[1] in heads:
            bcre.setdefault(r[1], {})[r[0]] = r[2] or 0.0
    links = {}
    for r in _q(con, "SELECT session_id, pr_number, repo FROM pr_links"):
        links.setdefault((r[2], r[1]), set()).add(r[0])
    creates = {}
    if _has(con, "tool_calls", "git_op"):
        for r in _q(con, "SELECT DISTINCT session_id, branch FROM tool_calls WHERE git_op='pr_create'"):
            creates.setdefault(r[1], set()).add(r[0])
    for p in prs:
        b = p["head_branch"]
        owners = set(links.get((p["repo"], p["number"]), set()))
        if b not in MAIN_BRANCHES:
            for sid in set(bcre.get(b, {})) | creates.get(b, set()):
                if srepo.get(sid) in (None, p["repo"]):
                    owners.add(sid)
        w = {sid: bcre.get(b, {}).get(sid, 0.0) for sid in owners}
        tot = sum(w.values())
        p["_owners"] = sorted((sid, (w[sid] / tot) if tot else 1.0 / len(owners)) for sid in owners)
    return prs


def scope_prs(scope, prs):
    """[(pr, eou_share)] for the scope."""
    out = []
    sset = set(scope.sessions)
    for p in prs:
        if not p["_owners"]:
            continue
        if scope.pr is not None:
            if p is scope.pr:
                out.append((p, p["eou"]))
        elif scope.t0:
            if scope.in_range(p["merged_at"]) and any(s in sset for s, _ in p["_owners"]):
                out.append((p, p["eou"]))
        else:
            share = sum(sh for s, sh in p["_owners"] if s in sset)
            if share > 0:
                out.append((p, p["eou"] * share))
    return out


# ---- windows (§5 / §6.5) ---------------------------------------------------
_WIN = {}


def windows(con, prs=None):
    key = (id(con), id(prs))
    if key in _WIN:
        return _WIN[key]
    reqs = [(ep(r[0]), r[1] or 0.0, r[2], r[3]) for r in
            _q(con, "SELECT ts, cre, session_id, git_branch FROM requests WHERE ts IS NOT NULL ORDER BY ts")]
    open_until = {}
    for p in prs or []:
        if p["head_branch"] not in MAIN_BRANCHES and p["merged_at"]:
            open_until[p["head_branch"]] = max(open_until.get(p["head_branch"], 0), ep(p["merged_at"]))
    ws, cur = [], None
    for t, c, sid, br in reqs:
        if cur is None or t >= cur["end"]:
            cur = {"start": t, "end": t + WINDOW_S, "cre": 0.0, "minutes": set(), "limit_hit": 0,
                   "open_pr": 0, "_cum": [], "snap": None}
            ws.append(cur)
        cur["cre"] += c
        cur["minutes"].add(int(t // 60))
        cur["_cum"].append((t, cur["cre"]))
        if br in open_until and t < open_until[br]:
            cur["open_pr"] = 1
    starts = [w["start"] for w in ws]

    def win_at(t):
        i = bisect_right(starts, t) - 1
        return ws[i] if i >= 0 and t < ws[i]["end"] else None

    def cum_at(w, t):
        ts = [x[0] for x in w["_cum"]]
        i = bisect_right(ts, t) - 1
        return w["_cum"][i][1] if i >= 0 else 0.0

    newest = reqs[-1][0] if reqs else 0
    evidence = []
    seen = set()
    for r in _q(con, "SELECT ts FROM events WHERE kind='rate_limit' AND ts IS NOT NULL ORDER BY ts"):
        t = ep(r[0])
        w = win_at(t)
        if not w:
            continue
        w["limit_hit"] = 1
        if id(w) in seen:
            continue
        seen.add(id(w))
        c = cum_at(w, t)
        if t >= newest - 30 * 86400 and c >= CEILING_MIN_EVIDENCE:
            evidence.append(c)
    for r in _q(con, "SELECT ts, detail FROM events WHERE kind='usage_snapshot' AND ts IS NOT NULL ORDER BY ts"):
        t = ep(r[0])
        w = win_at(t)
        try:
            pct = float(r[1])
        except (TypeError, ValueError):
            continue
        if w and pct > 0:
            w["snap"] = cum_at(w, t) / (pct / 100.0)
    estimated = len(evidence) < 2
    ceiling = CEILING_EST if estimated else statistics.median(evidence)
    for w in ws:
        ceil = w["snap"] or ceiling
        w["ceiling"] = ceil
        w["estimated"] = int(estimated and not w["snap"])
        w["utilization"] = w["cre"] / ceil if ceil else 0.0
        w["active_minutes"] = len(w["minutes"])
        w["active"] = int(w["active_minutes"] >= 60 or w["open_pr"])
        if w["limit_hit"] or w["utilization"] >= 0.95:
            w["class"] = "limited"
        elif not w["active"]:
            w["class"] = "inactive"
        elif w["utilization"] >= 0.40:
            w["class"] = "normal"
        else:
            w["class"] = "headroom"
    out = {"windows": ws, "ceiling": ceiling, "estimated": estimated, "evidence": len(evidence),
           "win_at": win_at, "cum_at": cum_at}
    _WIN[key] = out
    return out


# ---- per-session timeline loader ------------------------------------------
class Sess:
    """All rows of one session, sorted; threads keyed by agent id ('' = main)."""

    def __init__(self, con, sid):
        self.sid = sid
        q = "SELECT request_id, agent_id, ts, model, input, cache_read, cache_write, output, context_total, cre, " \
            "git_branch FROM requests WHERE session_id=? AND ts IS NOT NULL ORDER BY ts, request_id"
        self.reqs = [dict(r, agent_id=r["agent_id"] or "") for r in _q(con, q, (sid,))]
        cols = "agent_id, ts, name, input_bytes, result_bytes, is_image, cmd_class, tool_use_id, is_error, result_ts"
        v2 = _has(con, "tool_calls", "arg_hash")
        if v2:
            cols += ", arg_hash, git_op, branch, skill, background, result_lines, enospc"
        self.v2 = v2
        self.tools = [dict(r, agent_id=r["agent_id"] or "") for r in
                      _q(con, f"SELECT {cols} FROM tool_calls WHERE session_id=? AND ts IS NOT NULL ORDER BY ts, tool_use_id",
                         (sid,))]
        self.events = [dict(r, agent_id=r["agent_id"] or "") for r in
                       _q(con, "SELECT ts, kind, detail, agent_id FROM events WHERE session_id=? AND ts IS NOT NULL "
                               "ORDER BY ts, key", (sid,))]
        self.turns = [dict(r) for r in _q(con, "SELECT ts, origin, chars FROM turns WHERE session_id=? AND ts IS NOT NULL "
                                               "ORDER BY ts, uuid", (sid,))]
        self.agents = [dict(r) for r in _q(con, "SELECT agent_id, agent_type, spawn_ts, prompt_has_recipe, n_requests, "
                                                "max_context, cre, killed_by_429, tool_use_id FROM agents "
                                                "WHERE session_id=? ORDER BY spawn_ts, agent_id", (sid,))]
        srow = _q(con, "SELECT * FROM sessions WHERE id=?", (sid,))
        self.row = dict(srow[0]) if srow else {}
        self.by_thread = {}
        for r in self.reqs:
            self.by_thread.setdefault(r["agent_id"], []).append(r)
        self.tools_by_thread = {}
        for t in self.tools:
            self.tools_by_thread.setdefault(t["agent_id"], []).append(t)
        self.compacts = [e for e in self.events if e["kind"] == "compact" and not e["agent_id"]]

    def main(self):
        return self.by_thread.get("", [])

    def first_edit(self, aid, after_ts):
        for t in self.tools_by_thread.get(aid, []):
            if t["ts"] >= after_ts and (t["name"] in EDIT_TOOLS or t.get("git_op") == "commit"):
                return t["ts"]
        return None

    def orientation_cre(self, aid):
        reqs = self.by_thread.get(aid, [])
        fe = self.first_edit(aid, "")
        if fe is None:
            return sum(r["cre"] for r in reqs[:NO_EDIT_ORIENT_REQS])
        return sum(r["cre"] for r in reqs if r["ts"] < fe)


_SESS = {}


def sess(con, sid):
    k = (id(con), sid)
    if k not in _SESS:
        _SESS[k] = Sess(con, sid)
    return _SESS[k]


def _remaining(reqs_ts, i_ts, compact_ts):
    """Requests in the thread after ts, until the next compaction."""
    j = bisect_right(reqs_ts, i_ts)
    k = bisect_right(compact_ts, i_ts)
    end = bisect_left(reqs_ts, compact_ts[k]) if k < len(compact_ts) else len(reqs_ts)
    return max(0, end - j)


# ---- agent groups (5.9 / serialization) -----------------------------------
def agent_groups(s):
    """Back-to-back foreground Agent calls on the main thread (no overlap,
    next starts ≤5 min after the previous returned)."""
    calls = [t for t in s.tools_by_thread.get("", []) if t["name"] in ("Agent", "Task") and t["result_ts"]
             and not t.get("background")]
    groups, cur = [], []
    for c in calls:
        if cur and ep(c["ts"]) >= ep(cur[-1]["result_ts"]) and ep(c["ts"]) - ep(cur[-1]["result_ts"]) <= BACK_TO_BACK_S:
            cur.append(c)
        else:
            if cur:
                groups.append(cur)
            cur = [c]
    if cur:
        groups.append(cur)
    return groups


def _agent_by_tool(s):
    return {a["tool_use_id"]: a for a in s.agents if a["tool_use_id"]}


def capped(s, a):
    tc = len(s.tools_by_thread.get(a["agent_id"], []))
    return (a["n_requests"] or 0) > AGENT_REQ_CAP or tc >= AGENT_REQ_CAP


def relaunch_of(s, a):
    """First agent of the same type spawned ≤10 min after `a`'s last request."""
    reqs = s.by_thread.get(a["agent_id"], [])
    if not reqs:
        return None
    end = ep(reqs[-1]["ts"])
    for b in s.agents:
        if b["agent_id"] != a["agent_id"] and b["agent_type"] == a["agent_type"] and b["spawn_ts"] \
                and 0 <= ep(b["spawn_ts"]) - end <= RELAUNCH_S:
            return b, end
    return None


# ---- time ledger (§5) -------------------------------------------------------
def ledger(con, pr, sessions_on_branch=None):
    """Every second of [first request on head branch, last push before merge]
    in exactly one bucket. Returns (first, ready, merged, {bucket: seconds})."""
    b = pr["head_branch"]
    merged = ep(pr["merged_at"]) if pr["merged_at"] else None
    if b in MAIN_BRANCHES:
        return None
    rows = _q(con, "SELECT session_id, MIN(ts) FROM requests WHERE git_branch=? GROUP BY 1 ORDER BY 2", (b,))
    if not rows:
        return None
    sids = [r[0] for r in rows]
    first = ep(rows[0][1])
    ready = None
    if _has(con, "tool_calls", "git_op"):
        pushes = [ep(r[0]) for r in _q(con, "SELECT ts FROM tool_calls WHERE git_op='push' AND branch=? ORDER BY ts", (b,))]
        pushes = [t for t in pushes if merged is None or t <= merged]
        ready = pushes[-1] if pushes else None
    if ready is None:
        lim = pr["merged_at"] or "9999"
        last = _q(con, "SELECT MAX(ts) FROM requests WHERE git_branch=? AND ts<=?", (b, lim))[0][0]
        ready = ep(last) if last else first
    if merged is not None:
        ready = min(ready, merged)
    if ready <= first:
        return first, first, merged, {}
    iv = []    # (start, end, bucket)
    work = []  # activity spans; uncovered stretches >15 min become idle
    order = {sid: i for i, sid in enumerate(sids)}
    agent_rank = 0
    for sid in sids:
        s = sess(con, sid)
        # base: consecutive main-thread points
        pts = [(ep(r["ts"]), "assistant") for r in s.main()]
        for t in s.tools_by_thread.get("", []):
            pts.append((ep(t["ts"]), "assistant"))
            if t["result_ts"]:
                pts.append((ep(t["result_ts"]), "result"))
        pts += [(ep(t["ts"]), "human" if t["origin"] == "human" else "result") for t in s.turns]
        pts.sort()
        for (a, _), (c, kind) in zip(pts, pts[1:]):
            if c <= a:
                continue
            bk = {"assistant": "model", "result": "tool_other", "human": "owner_wait"}[kind]
            iv.append((a, c, bk))
            if c - a <= IDLE_S:
                work.append((a, c))
        # agent activity (background or foreground) is work
        for aid, rs in s.by_thread.items():
            if aid:
                for x, y in zip(rs, rs[1:]):
                    a, c = ep(x["ts"]), ep(y["ts"])
                    if 0 < c - a <= IDLE_S:
                        iv.append((a, c, "tool_other"))
                        work.append((a, c))
        # tools on main
        for t in s.tools_by_thread.get("", []):
            if t["result_ts"]:
                iv.append((ep(t["ts"]), ep(t["result_ts"]),
                           "build_test" if t["cmd_class"] in BUILD_CLASSES else "tool_other"))
                work.append((ep(t["ts"]), ep(t["result_ts"])))
        # compaction: durationMs before the boundary record
        for e in s.compacts:
            try:
                d = (json.loads(e["detail"] or "{}").get("durationMs") or 0) / 1000.0
            except ValueError:
                d = 0
            if d > 0:
                iv.append((ep(e["ts"]) - d, ep(e["ts"]), "compaction"))
                work.append((ep(e["ts"]) - d, ep(e["ts"])))
        # post-compaction re-reads count as work lost to compaction
        for (t0, t1) in post_compaction_rereads(s, intervals=True):
            iv.append((t0, t1, "compaction"))
        # reorientation: 2nd+ session on the branch
        if order[sid] > 0:
            anchors = [(s.reqs[0]["ts"] if s.reqs else None, "reorientation:session")]
            anchors += [(e["ts"], "reorientation:compact") for e in s.compacts]
            anchors += [(e["ts"], "reorientation:compact") for e in s.events
                        if e["kind"] == "slash_command" and e["detail"] == "/clear" and not e["agent_id"]]
            for ts, bk in anchors:
                if ts:
                    fe = s.first_edit("", ts)
                    if fe:
                        iv.append((ep(ts), ep(fe), bk))
        # agents on this branch: reorientation for the 2nd+; cap relaunch
        abt = _agent_by_tool(s)
        for a in s.agents:
            areqs = s.by_thread.get(a["agent_id"], [])
            if not areqs or areqs[0]["git_branch"] != b or not a["spawn_ts"]:
                continue
            agent_rank += 1
            if agent_rank > 1:
                fe = s.first_edit(a["agent_id"], a["spawn_ts"])
                if fe:
                    iv.append((ep(a["spawn_ts"]), ep(fe), "reorientation:agent"))
            if capped(s, a):
                rl = relaunch_of(s, a)
                if rl:
                    nb, end = rl
                    fe = s.first_edit(nb["agent_id"], nb["spawn_ts"]) or nb["spawn_ts"]
                    iv.append((end, ep(fe), "cap_relaunch"))
        # handoff
        for t in s.tools_by_thread.get("", []):
            if t.get("skill") in ("handoff",):
                iv.append((ep(t["ts"]), _next_human(s, t["ts"]), "handoff"))
        for e in s.events:
            if e["kind"] == "slash_command" and e["detail"] == "/handoff" and not e["agent_id"]:
                iv.append((ep(e["ts"]), _next_human(s, e["ts"]), "handoff"))
        # serialization: back-to-back foreground agents, all but the longest
        for g in agent_groups(s):
            if len(g) > 1:
                longest = max(g, key=lambda c: (ep(c["result_ts"]) - ep(c["ts"]), c["tool_use_id"]))
                for c in g:
                    if c is not longest:
                        iv.append((ep(c["ts"]), ep(c["result_ts"]), "serialization"))
        # stalls
        ok_ts = sorted(ep(r["ts"]) for r in s.reqs)
        for e in s.events:
            if e["kind"] == "rate_limit":
                t = ep(e["ts"])
                i = bisect_right(ok_ts, t)
                end = ok_ts[i] if i < len(ok_ts) else t
                iv.append((t, end, "rate_limited"))
                work.append((t, end))
        if s.v2:
            good = sorted(ep(t["result_ts"]) for t in s.tools if t["result_ts"] and not t["is_error"])
            for t in s.tools:
                if t.get("enospc") and t["result_ts"]:
                    a = ep(t["result_ts"])
                    i = bisect_right(good, a)
                    if i < len(good):
                        iv.append((a, good[i], "disk_full"))
                        work.append((a, good[i]))
    iv += [(a, c, "idle") for a, c in gaps(work, first, ready)]
    return first, ready, merged, sweep(iv, first, ready)


def gaps(spans, lo, hi):
    """Stretches of [lo, hi) longer than IDLE_S covered by no span."""
    out, t = [], lo
    for a, c in sorted(spans):
        if a > t:
            if min(a, hi) - t > IDLE_S:
                out.append((t, min(a, hi)))
        t = max(t, c)
        if t >= hi:
            break
    if hi - t > IDLE_S:
        out.append((t, hi))
    return out


def _next_human(s, ts):
    for t in s.turns:
        if t["ts"] > ts and t["origin"] == "human":
            return ep(t["ts"])
    return ep(s.reqs[-1]["ts"]) if s.reqs else ep(ts)


def sweep(intervals, lo, hi):
    """Assign every second of [lo, hi) to the highest-ranked covering bucket;
    uncovered time is idle (>15 min) or owner_wait. Sum == hi - lo."""
    evs = []
    for a, b, bk in intervals:
        a, b = max(a, lo), min(b, hi)
        if b > a:
            evs.append((a, 1, bk))
            evs.append((b, -1, bk))
    evs.sort(key=lambda e: (e[0], e[1]))
    active = {}
    out = {}
    t = lo
    i = 0
    while t < hi:
        while i < len(evs) and evs[i][0] <= t:
            _, d, bk = evs[i]
            active[bk] = active.get(bk, 0) + d
            i += 1
        nxt = evs[i][0] if i < len(evs) else hi
        nxt = min(nxt, hi)
        live = [bk for bk, n in active.items() if n > 0]
        if live:
            bk = max(live, key=lambda x: RANK[x])
        else:
            bk = "idle" if nxt - t > IDLE_S else "owner_wait"
        out[bk] = out.get(bk, 0.0) + (nxt - t)
        t = nxt
    return out


def collapse(buckets):
    out = {}
    for k, v in buckets.items():
        k2 = "reorientation" if k.startswith("reorientation") else k
        out[k2] = out.get(k2, 0.0) + v
    return out


# ---- waste counters (§6.3a) -----------------------------------------------
def post_compaction_rereads(s, intervals=False):
    if not s.v2 or not s.compacts:
        return [] if intervals else (0, 0)
    reads = [t for t in s.tools_by_thread.get("", []) if t["name"] == "Read" and t.get("arg_hash")]
    mts = [r["ts"] for r in s.main()]
    n, toks, ivs = 0, 0, []
    prev = ""
    for c in s.compacts:
        before = {t["arg_hash"] for t in reads if prev <= t["ts"] < c["ts"]}
        j = bisect_right(mts, c["ts"])
        lim = mts[min(j + 20, len(mts)) - 1] if j < len(mts) else c["ts"]
        seen = set()
        for t in reads:
            if c["ts"] < t["ts"] <= lim and t["arg_hash"] in before and t["arg_hash"] not in seen:
                seen.add(t["arg_hash"])
                n += 1
                toks += static.tokens(t["result_bytes"] or 0)
                if t["result_ts"]:
                    ivs.append((ep(t["ts"]), ep(t["result_ts"])))
        prev = c["ts"]
    return ivs if intervals else (n, toks)


def waste(ss, scope):
    rr_files = rr_excess = rr_tok = 0
    fail_groups = 0
    pc_n = pc_tok = 0
    ttl_n, ttl_cre, ttl_gaps = 0, 0.0, []
    by_tool = dict.fromkeys(RESULT_TOOLS + ("other",), 0)
    bash_n = reruns = 0
    v2 = all(s.v2 for s in ss) and bool(ss)
    for s in ss:
        cts = [c["ts"] for c in s.compacts]
        for aid, tools in sorted(s.tools_by_thread.items()):
            tools = [t for t in tools if scope.in_range(t["ts"]) or not scope.t0]
            for t in tools:
                k = t["name"] if t["name"] in RESULT_TOOLS else "other"
                by_tool[k] += static.tokens(t["result_bytes"] or 0)
            if s.v2:
                ctx_id, counts, fails, recent = 0, {}, {}, []
                for t in tools:
                    if aid == "":
                        ctx_id = bisect_right(cts, t["ts"])
                    h = t.get("arg_hash")
                    if t["name"] == "Bash":
                        bash_n += 1
                        if h and h in recent[-RERUN_WINDOW:]:
                            reruns += 1
                    recent = [] if t["name"] in EDIT_TOOLS or t.get("git_op") == "commit" else recent + [
                        h if t["name"] == "Bash" else None]
                    if t["name"] in EDIT_TOOLS and h:
                        counts.pop((ctx_id, h), None)
                    elif t["name"] == "Read" and h:
                        k = (ctx_id, h)
                        counts[k] = counts.get(k, 0) + 1
                        if counts[k] == 3:
                            rr_files += 1
                        if counts[k] >= 3:
                            rr_excess += 1
                            rr_tok += static.tokens(t["result_bytes"] or 0)
                    elif t["name"] == "Bash" and h and t["is_error"]:
                        fails[h] = fails.get(h, 0) + 1
                        if fails[h] == 3:
                            fail_groups += 1
        n, tk = post_compaction_rereads(s)
        pc_n += n
        pc_tok += tk
        for aid, reqs in sorted(s.by_thread.items()):
            prev = None
            for r in reqs:
                if prev and (not scope.t0 or scope.in_range(r["ts"])):
                    gap = ep(r["ts"]) - ep(prev["ts"])
                    if gap > CACHE_TTL_S and r["context_total"] > 20_000 and r["cache_read"] < 0.2 * r["context_total"]:
                        ttl_n += 1
                        ttl_cre += r["cache_write"] * CRE_WEIGHTS["cache_write"]
                        ttl_gaps.append(gap)
                prev = r
    return {"v2": v2, "repeat_read_files": rr_files, "repeat_read_excess": rr_excess, "repeat_read_tokens": rr_tok,
            "failing_cmd_groups": fail_groups, "post_compact_rereads": pc_n, "post_compact_tokens": pc_tok,
            "ttl_rewrites": ttl_n, "ttl_cre": ttl_cre, "ttl_median_gap_s": _median(ttl_gaps),
            "result_tokens": by_tool, "bash_calls": bash_n, "bash_reruns": reruns}


# ---- latency dividend (§5) -------------------------------------------------
def _fit(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx == 0:
        return my, 0.0
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    return my - b * mx, b


def latency_dividend(con, ss, scope):
    """Fit model seconds ~ a + b*context per model (main thread); dividend =
    Σ predicted latency at the pre-v2 median context − predicted at actual."""
    c0 = _q(con, "SELECT context_total FROM requests WHERE agent_id IS NULL AND ts<? ORDER BY context_total",
            (V2_DATE + "T00:00:00Z",))
    c0 = c0[len(c0) // 2][0] if c0 else None
    if not c0:
        return None
    data = {}
    for s in ss:
        pts = [(ep(t["result_ts"]), "r") for t in s.tools_by_thread.get("", []) if t["result_ts"]]
        pts += [(ep(t["ts"]), "h") for t in s.turns if t["origin"] == "human"]
        pts.sort()
        pt = [p[0] for p in pts]
        for r in s.main():
            if scope.t0 and not scope.in_range(r["ts"]):
                continue
            t = ep(r["ts"])
            i = bisect_left(pt, t) - 1
            if i < 0:
                continue
            y = t - pt[i]
            if 0 < y <= IDLE_S and r["model"]:
                data.setdefault(r["model"], []).append((r["context_total"], y))
    ss_res = ss_tot = 0.0
    div = 0.0
    nfit = 0
    for m, xy in sorted(data.items()):
        if len(xy) < 10:
            continue
        xs, ys = [x for x, _ in xy], [y for _, y in xy]
        a, b = _fit(xs, ys)
        my = sum(ys) / len(ys)
        ss_res += sum((y - (a + b * x)) ** 2 for x, y in xy)
        ss_tot += sum((y - my) ** 2 for y in ys)
        div += sum(b * (c0 - x) for x in xs)
        nfit += len(xy)
    if not nfit or ss_tot == 0:
        return None
    r2 = 1 - ss_res / ss_tot
    return {"seconds": div, "r2": r2, "n": nfit, "c0": c0}


# ---- compliance (§6.3) -------------------------------------------------------
# rules whose *compliance* adds minutes (compaction, fresh sessions, caps);
# the other rules' minutes are the cost of violating them
OVER_TIGHT_MIN_PER_EOU = 1.0  # below this the minutes are noise
COMPLIANCE_COSTS_TIME = ("5.1", "5.3", "5.5")
RULE_NAMES = {"5.1": "autocompact 200k", "5.2": "one model", "5.3": "session/workstream", "5.4": "fan-out",
              "5.5": "caps+recipe", "5.6": "payloads", "5.7": "MCP baseline", "5.9": "sequential",
              "5.10": "research ≤40", "5.13": "quiet-check", "5.15": "routing"}


def compliance(con, ss, scope, win):
    """Per-rule compliance over the sessions that started on/after the rule's
    effective_since date (rules_map.json); a rule with none is n/a."""
    m = static.rules_map()
    full = _compliance(con, ss, scope, win)
    start = {s.sid: (s.reqs[0]["ts"] if s.reqs else "") for s in ss}
    cache = {tuple(s.sid for s in ss): full}
    out = {}
    for k in full:
        eff = static.effective_since(k, m)
        keep = [s for s in ss if start[s.sid] >= eff]
        key = tuple(s.sid for s in keep)
        if key not in cache:
            cache[key] = _compliance(con, keep, scope, win)
        r = cache[key][k]
        out[k] = r if keep else dict(r, ok=None, cre=0.0, saved=0.0, detail=f"n/a before {eff[:10]}")
    return out


def _compliance(con, ss, scope, win):
    rules = {}
    inr = (lambda ts: scope.in_range(ts)) if scope.t0 else (lambda ts: True)
    bpt = static.BYTES_PER_TOKEN
    main_ctx = [r["context_total"] for s in ss for r in s.main() if inr(r["ts"])]
    # 5.1
    cost = sum(max(0, c - AUTOCOMPACT) for c in main_ctx)
    saved = 0.0
    for s in ss:
        mts = [r["ts"] for r in s.main()]
        cts = [c["ts"] for c in s.compacts]
        for c in s.compacts:
            try:
                d = json.loads(c["detail"] or "{}")
            except ValueError:
                d = {}
            saved += max(0, (d.get("preTokens") or 0) - (d.get("postTokens") or 0)) * _remaining(mts, c["ts"], cts)
    rules["5.1"] = {"ok": (max(main_ctx) if main_ctx else 0) <= AUTOCOMPACT, "cre": cost, "saved": saved,
                    "detail": f"max {fmt_tok(max(main_ctx) if main_ctx else 0)} med {fmt_tok(_median(main_ctx))}"}
    # 5.2
    n, cost = 0, 0.0
    for s in ss:
        for e in s.events:
            if e["kind"] == "model_switch" and not e["agent_id"] and inr(e["ts"]):
                n += 1
                nxt = next((r for r in s.main() if r["ts"] >= e["ts"]), None)
                if nxt:
                    cost += nxt["cache_write"] * CRE_WEIGHTS["cache_write"]
    rules["5.2"] = {"ok": n == 0, "cre": cost, "detail": f"{n} switches"}
    # 5.3
    viol, cost = 0, 0.0
    for s in ss:
        m = [r for r in s.main() if inr(r["ts"])]
        seen, firstctx = [], (m[0]["context_total"] if m else 0)
        mts = [r["ts"] for r in s.main()]
        cts = [c["ts"] for c in s.compacts]
        prev = None
        for r in m:
            b = r["git_branch"]
            if b not in MAIN_BRANCHES and b not in seen:
                seen.append(b)
                if len(seen) > 1 and prev is not None:
                    cost += max(0, prev["context_total"] - firstctx) * _remaining(mts, prev["ts"], cts)
            prev = r
        viol += len(seen) > 1
    saved = 0.0
    by_branch = {}
    for s in ss:
        m = s.main()
        if m and m[0]["git_branch"] not in MAIN_BRANCHES:
            by_branch.setdefault(m[0]["git_branch"], []).append(s)
    for br, group in sorted(by_branch.items()):
        group.sort(key=lambda x: x.main()[0]["ts"])
        for prev_s, cur in zip(group, group[1:]):
            m = cur.main()
            saved += max(0, prev_s.main()[-1]["context_total"] - m[0]["context_total"]) * sum(
                1 for r in m if inr(r["ts"]))
    rules["5.3"] = {"ok": viol == 0, "cre": cost, "saved": saved,
                    "detail": f"{viol}/{len(ss)} sessions >1 branch"}
    # 5.4
    heavy_per_win, hot, cost = {}, 0, 0.0
    for s in ss:
        for a in s.agents:
            if not a["spawn_ts"] or not inr(a["spawn_ts"]):
                continue
            if (a["n_requests"] or 0) > HEAVY_AGENT:
                w = win["win_at"](ep(a["spawn_ts"]))
                if w:
                    heavy_per_win[id(w)] = heavy_per_win.get(id(w), 0) + 1
                    if win["cum_at"](w, ep(a["spawn_ts"])) / w["ceiling"] > 0.60:
                        hot += 1
            if a["killed_by_429"]:
                cost += a["cre"] or 0
                rl = relaunch_of(s, a)
                if rl:
                    cost += s.orientation_cre(rl[0]["agent_id"])
    over = sum(1 for v in heavy_per_win.values() if v > 2)
    rules["5.4"] = {"ok": over == 0 and hot == 0, "cre": cost,
                    "detail": f"{over} windows >2 heavy · {hot} hot spawns"}
    # 5.5
    norec = capn = 0
    cost = relaunch = 0.0
    nag = 0
    relaunched = set()
    for s in ss:
        for a in s.agents:
            if not a["spawn_ts"] or not inr(a["spawn_ts"]):
                continue
            nag += 1
            norec += a["prompt_has_recipe"] == 0
            reqs = s.by_thread.get(a["agent_id"], [])
            over = (a["n_requests"] or 0) > AGENT_REQ_CAP or (a["max_context"] or 0) > AGENT_CTX_CAP
            capn += over
            cost += sum(r["cre"] for r in reqs[AGENT_REQ_CAP:])
            cost += sum(max(0, r["context_total"] - AGENT_CTX_CAP) for r in reqs[:AGENT_REQ_CAP])
            if capped(s, a):
                rl = relaunch_of(s, a)
                if rl and rl[0]["agent_id"] not in relaunched:
                    relaunched.add(rl[0]["agent_id"])
                    relaunch += s.orientation_cre(rl[0]["agent_id"])
    rules["5.5"] = {"ok": norec == 0 and capn == 0, "cre": cost, "relaunch_cre": relaunch, "saved": cost,
                    "detail": f"{capn}/{nag} over cap · {norec} no recipe"}
    # 5.6
    n_img = n_w = 0
    cost = 0.0
    for s in ss:
        mts = [r["ts"] for r in s.main()]
        cts = [c["ts"] for c in s.compacts]
        for t in s.tools_by_thread.get("", []):
            if not inr(t["ts"]):
                continue
            tok = 0
            if t["is_image"]:
                n_img += 1
                tok = IMAGE_TOKENS
            elif t["name"] == "Write" and (t["input_bytes"] or 0) > WRITE_PAYLOAD:
                n_w += 1
                tok = (t["input_bytes"] or 0) / bpt
            if tok:
                cost += tok * _remaining(mts, t["ts"], cts)
    rules["5.6"] = {"ok": n_img == 0 and n_w == 0, "cre": cost, "detail": f"{n_img} images · {n_w} Write>10k in main"}
    # 5.7
    cost, base, resumed = 0.0, [], 0
    for s in ss:
        m = s.main()
        if not m:
            continue
        b0 = m[0]["context_total"]
        if b0 > FRESH_MAX:  # resumed/continued session: first request carries history
            resumed += 1
            continue
        base.append(b0)
        cost += max(0, b0 - MCP_BASELINE) * sum(1 for r in m if inr(r["ts"]))
    rules["5.7"] = {"ok": all(b <= MCP_BASELINE for b in base) if base else None, "cre": cost,
                    "detail": (f"baseline med {fmt_tok(_median(base))}" if base else "no fresh session")
                    + (f" · {resumed} resumed skipped" if resumed else "")}
    # 5.9
    chains, cost = 0, 0.0
    for s in ss:
        abt = _agent_by_tool(s)
        for g in agent_groups(s):
            if len(g) > 1 and inr(g[0]["ts"]):
                chains += 1
                for c in g[1:]:
                    a = abt.get(c["tool_use_id"])
                    if a:
                        cost += s.orientation_cre(a["agent_id"])
    rules["5.9"] = {"ok": chains == 0, "cre": cost, "detail": f"{chains} agent chains"}
    # 5.10
    n, cost = 0, 0.0
    for s in ss:
        mts = [r["ts"] for r in s.main()]
        cts = [c["ts"] for c in s.compacts]
        for t in s.tools_by_thread.get("", []):
            lines = t.get("result_lines") or 0
            if t["name"] in ("Agent", "Task") and inr(t["ts"]) and lines > RESULT_LINES:
                n += 1
                tok = (t["result_bytes"] or 0) / bpt * (lines - RESULT_LINES) / lines
                cost += tok * _remaining(mts, t["result_ts"] or t["ts"], cts)
    v2 = bool(ss) and all(x.v2 for x in ss)
    rules["5.10"] = {"ok": (n == 0) if v2 else None, "cre": cost,
                     "detail": f"{n} results >{RESULT_LINES} lines" if v2 else "n/a (parser v1)"}
    # 5.13
    raw = qc = 0
    cost = 0.0
    for s in ss:
        for aid, tools in s.tools_by_thread.items():
            rts = [r["ts"] for r in s.by_thread.get(aid, [])]
            cts = [c["ts"] for c in s.compacts] if aid == "" else []
            for t in tools:
                if not inr(t["ts"]):
                    continue
                if t["cmd_class"] == "quiet-check":
                    qc += 1
                elif t["cmd_class"] in ("raw-build", "raw-test"):
                    raw += 1
                    cost += (t["result_bytes"] or 0) / bpt * _remaining(rts, t["result_ts"] or t["ts"], cts)
    rules["5.13"] = {"ok": raw == 0, "cre": cost, "detail": f"{raw} raw vs {qc} quiet-check"}
    # 5.15 (informational)
    mix = {}
    for s in ss:
        for a in s.agents:
            if a["spawn_ts"] and inr(a["spawn_ts"]):
                ms = [r["model"] for r in s.by_thread.get(a["agent_id"], []) if r["model"]]
                m = max(sorted(set(ms)), key=ms.count) if ms else "?"
                mix[_short_model(m)] = mix.get(_short_model(m), 0) + 1
    rules["5.15"] = {"ok": None, "cre": 0.0,
                     "detail": "agents " + (" ".join(f"{k}×{v}" for k, v in sorted(mix.items())) or "none")}
    return rules


# ---- owner actions (§5 Owner action, §6.6) ---------------------------------
def _auto_cre(con, pat):
    """CRE of the cheapest request that issued a Bash call matching `pat`
    itself (i.e. the step automated), anywhere in the index; None if never."""
    row = con.execute(
        "SELECT MIN((SELECT r.cre FROM requests r WHERE r.session_id=t.session_id "
        "AND r.agent_id IS t.agent_id AND r.ts<=t.ts ORDER BY r.ts DESC LIMIT 1)) "
        "FROM tool_calls t WHERE t.owner_pattern=?", (pat,)).fetchone()
    return row[0] if row else None


def owner_actions(con, scope):
    """Per-class counts of classified human turns in scope (turns carry no
    branch, so a branch scope filters by session + time only)."""
    from . import owner as O
    out = {"total": 0, "counts": {c: 0 for c in O.CLASSES}, "infeasible": 0, "minutes": 0.0, "manual": [],
           "unclassified": 0}
    if not scope.sessions or not _has(con, "turns", "pattern"):
        return out
    sql, args = f"session_id IN {_in(scope.sessions)} AND origin IN ('human','ask')", list(scope.sessions)
    if scope.t0:
        sql += " AND ts>=?"
        args.append(scope.t0)
    if scope.t1:
        sql += " AND ts<?"
        args.append(scope.t1)
    pats = {}
    for r in _q(con, f"SELECT class, pattern, infeasible, feat FROM turns WHERE {sql}", args):
        f = json.loads(r["feat"]) if r["feat"] else {}
        if not (f.get("first") or f.get("slash")):
            out["total"] += 1  # binding: plain count, no classifier
        c = r["class"]
        if c not in out["counts"]:
            out["unclassified"] += 1
            continue
        out["counts"][c] += 1
        if c == "manual_step":
            out["infeasible"] += 1 if r["infeasible"] else 0
            k = r["pattern"] or "ui"
            pats[k] = pats.get(k, 0) + 1
    m = O.MINUTES
    out["minutes"] = float(m["manual_step"] * out["counts"]["manual_step"] + m["approval"] * out["counts"]["decision"])
    for k, n in sorted(pats.items(), key=lambda kv: (-kv[1], O.PATTERN_ORDER.get(kv[0], 99), kv[0]))[:3]:
        out["manual"].append({"pattern": k, "count": n, "minutes": float(m["manual_step"] * n),
                              "infeasible": k in O.INFEASIBLE, "auto_cre": _auto_cre(con, k)})
    return out


def _short_model(m):
    for k in ("fable", "opus", "sonnet", "haiku"):
        if k in (m or ""):
            return k
    return m or "?"


# ---- formatting helpers ---------------------------------------------------
def fmt_tok(n):
    n = float(n or 0)
    if abs(n) >= 1e9:
        return f"{n / 1e9:.2f}B"
    if abs(n) >= 1e6:
        return f"{n / 1e6:.1f}M"
    if abs(n) >= 1e3:
        return f"{n / 1e3:.0f}k"
    return f"{n:.0f}"


# ---- the whole scorecard --------------------------------------------------
def analyze(con, scope, prs):
    ss = [sess(con, sid) for sid in scope.sessions]
    win = windows(con, prs)
    w, a = scope.req_filter()
    reqs = _q(con, f"SELECT agent_id IS NULL AS main, ts, cre, cache_read, cache_write, context_total "
                   f"FROM requests WHERE {w}", a) if scope.sessions else []
    main = [r for r in reqs if r["main"]]
    res = {"label": scope.label, "sessions": len(scope.sessions)}
    res["cre"] = sum(r["cre"] or 0 for r in reqs)
    res["main_requests"] = len(main)
    res["agent_requests"] = len(reqs) - len(main)
    agents = [ag for s in ss for ag in s.agents if ag["spawn_ts"] and (not scope.t0 or scope.in_range(ag["spawn_ts"]))]
    res["agents"] = len(agents)
    mctx = [r["context_total"] for r in main]
    res["main_ctx_median"], res["main_ctx_max"] = _median(mctx), (max(mctx) if mctx else 0)
    actx = [r["context_total"] for r in reqs if not r["main"]]
    res["agent_ctx_median"] = _median(actx)
    # cache rebuilds (v2 script definition, main thread; agents separately)
    from .ingest import is_cache_rebuild
    reb_main = reb_agent = 0
    for s in ss:
        for aid, rs in s.by_thread.items():
            for r in rs[1:]:
                if (not scope.t0 or scope.in_range(r["ts"])) and (not scope.branch or r["git_branch"] == scope.branch) \
                        and is_cache_rebuild(r["cache_read"], r["cache_write"]):
                    if aid:
                        reb_agent += 1
                    else:
                        reb_main += 1
    res["rebuilds_main"], res["rebuilds_agent"] = reb_main, reb_agent
    # PRs / EOU
    sp = scope_prs(scope, prs)
    # a PR counts toward the scope when the scope holds ≥50% of its CRE share
    # (EOU stays share-weighted, so shared PRs are never double counted)
    res["prs"] = sum(1 for p, e in sp if not p["eou"] or e / p["eou"] >= 0.5 - 1e-9)
    res["prs_touched"] = len(sp)
    res["eou"] = sum(e for _, e in sp)
    res["penalized"] = sum(1 for p, _ in sp if p["penalized"])
    res["changed_lines"] = sum((p.get("changed_lines") or 0) * (e / p["eou"] if p["eou"] else 0) for p, e in sp)
    # windows touched
    tset = sorted(ep(r["ts"]) for r in reqs)
    ws = []
    for x in win["windows"]:
        i = bisect_left(tset, x["start"])
        if i < len(tset) and tset[i] < x["end"]:
            ws.append(x)
    act = [x for x in ws if x["active"]]
    res["windows"] = len(ws)
    res["active_windows"] = len(act)
    res["win_classes"] = {k: sum(1 for x in act if x["class"] == k) for k in ("limited", "normal", "headroom")}
    res["median_util"] = _median([x["utilization"] for x in act])
    res["ceiling"], res["ceiling_estimated"] = win["ceiling"], win["estimated"]
    res["regime"] = "headroom" if act and res["median_util"] < 0.60 else ("limited" if act else "n/a")
    res["active_hours"] = len({int(t // 60) for t in tset}) / 60.0
    # lead time + ledger
    lead = 0.0
    buckets = {}
    merge_lat = []
    eou_w = 0.0
    for p, e in sp:
        L = ledger(con, p)
        if not L:
            continue
        first, ready, merged, bk = L
        lead += (ready - first) * (e / p["eou"] if p["eou"] else 0)
        frac = e / p["eou"] if p["eou"] else 0
        for k, v in bk.items():
            buckets[k] = buckets.get(k, 0.0) + v * frac
        if merged:
            merge_lat.append(merged - ready)
        eou_w += e
    res["lead_s"], res["ledger_eou"] = lead, eou_w
    res["buckets"] = collapse(buckets)
    res["buckets_raw"] = buckets
    res["merge_latency_median_s"] = _median(merge_lat)
    busy = sum(v for k, v in res["buckets"].items() if k in ("model", "build_test", "tool_other"))
    denom = lead - res["buckets"].get("idle", 0)
    res["flow_eff"] = busy / denom if denom > 0 else None
    res["dividend"] = latency_dividend(con, ss, scope)
    res["owner"] = owner_actions(con, scope)
    ovh = sum(res["buckets"].get(k, 0) for k in OVERHEAD)
    div = res["dividend"]["seconds"] if res["dividend"] and res["dividend"]["r2"] >= 0.3 else 0.0
    res["net_s"] = ovh - div
    # compliance, waste, static, attribution
    res["rules"] = compliance(con, ss, scope, win)
    rb = buckets
    mins = {"5.1": rb.get("compaction", 0) + rb.get("reorientation:compact", 0),
            "5.3": rb.get("reorientation:session", 0), "5.5": rb.get("cap_relaunch", 0),
            "5.9": rb.get("serialization", 0) + rb.get("reorientation:agent", 0)}
    for k, r in res["rules"].items():
        r["minutes"] = mins.get(k, 0.0) / 60.0
    res["waste"] = waste(ss, scope)
    res["static"] = static_overhead(ss, scope, len(main))
    for k, r in res["rules"].items():
        r["text_cre"] = res["static"]["rule_text_tokens"].get(k, 0) * len(main)
    _over_tight(res)
    res["by_agent_type"], res["by_skill"] = attribution(ss, scope)
    return res


def _over_tight(res):
    """§6.5: minutes added vs. the CRE saving's value at the current exchange rate."""
    eou = res["eou"] or 0
    rate = WINDOW_S / 60.0 / res["ceiling"] if res["regime"] == "limited" else 0.0  # minutes per CRE
    flags = []
    for k in COMPLIANCE_COSTS_TIME:
        r = res["rules"][k]
        m = r.get("minutes", 0)
        if m <= 0 or (eou and m / eou < OVER_TIGHT_MIN_PER_EOU):
            continue
        value = (r.get("saved") or 0) * rate
        if m > value:
            flags.append(k)
    r55 = res["rules"]["5.5"]
    if r55.get("relaunch_cre", 0) > r55["cre"] and "5.5" not in flags:
        flags.append("5.5")
    flags.sort(key=_rk)
    res["over_tight"] = flags
    res["min_per_eou"] = {k: (r.get("minutes", 0) / eou if eou else None) for k, r in res["rules"].items()}


def _rk(k):
    return tuple(int(x) for x in k.split("."))


def static_overhead(ss, scope, n_main):
    per, est, n, rt = {}, False, 0, {}
    for s in ss:
        sj = s.row.get("static_json")
        m = s.main()
        if not sj or not m or m[0]["context_total"] > FRESH_MAX:  # resumed: first request carries history
            continue
        sj = json.loads(sj)
        for k, v in (sj.get("rule_bytes") or {}).items():
            rt[k] = max(rt.get(k, 0), v)
        sp = static.split(sj, m[0]["context_total"])
        for k, v in sp.items():
            per[k] = per.get(k, 0) + v
        n += 1
        est = True
    avg = {k: v / n for k, v in per.items()} if n else {}
    files = sum(v for k, v in avg.items() if k != "system")
    if not rt:
        rt = static.rule_text_bytes()  # v1 sessions: global CLAUDE.md only
    return {"available": bool(n), "avg_tokens": avg, "file_tokens": files, "estimated": est,
            "cre": files * n_main, "rule_text_tokens": {k: static.tokens(v) for k, v in rt.items()}}


def attribution(ss, scope):
    by_type = {}
    for s in ss:
        for a in s.agents:
            if not a["spawn_ts"] or (scope.t0 and not scope.in_range(a["spawn_ts"])):
                continue
            reqs = s.by_thread.get(a["agent_id"], [])
            mins = (ep(reqs[-1]["ts"]) - ep(a["spawn_ts"])) / 60.0 if reqs else 0.0
            d = by_type.setdefault(a["agent_type"] or "?", [0, 0.0, 0.0])
            d[0] += 1
            d[1] += a["cre"] or 0
            d[2] += max(0.0, mins)
    by_skill = {}
    for s in ss:
        inv = [(t["ts"], t["skill"]) for t in s.tools_by_thread.get("", []) if t.get("skill")]
        inv += [(e["ts"], e["detail"].lstrip("/")) for e in s.events
                if e["kind"] == "slash_command" and not e["agent_id"] and e["detail"]
                and e["detail"] not in ("/clear", "/compact", "/model", "/usage", "/context")]
        for ts, name in sorted(inv):
            if scope.t0 and not scope.in_range(ts):
                continue
            end = _next_human(s, ts)
            c = sum(r["cre"] for r in s.main() if ts <= r["ts"] and ep(r["ts"]) <= end)
            d = by_skill.setdefault(name, [0, 0.0, 0.0])
            d[0] += 1
            d[1] += c
            d[2] += max(0.0, end - ep(ts)) / 60.0
    return by_type, by_skill
