"""§6.9 experiment ledger, deterministic verdicts, standing no-effect checks
and the quarterly self-audit. All arithmetic here; nothing calls a model.

Verdict axes (r8): CRE/EOU, lead time/EOU and TOTAL owner actions/EOU (the
experimental per-class split never feeds a verdict). Each is a ratio of sums
over the arm's PRs; the effect is the relative change after/before − 1 with a
bootstrap 95% CI (1,000 resamples over PRs, fixed seed)."""
import json
import random
from datetime import datetime, timedelta, timezone

from . import analyze as A
from . import paths, store

SEED = 20260930
RESAMPLES = 1000
MIN_PRS, MIN_EOU = 10, 5.0
WORSE = 0.10          # another axis worsening beyond this (CI lower bound) → REVERT
BEFORE_DAYS = 28
STANDING_DAYS = 28
STANDING_FOLLOWED = 0.80
STANDING_MIN_GROUP = 3
READ_CRE_EST = 0.3e6  # §6.9 cost table: one /session-report read, worst case
ANALYZER_BRANCHES = ("feat/session-metrics-store", "feat/session-analyzer", "feat/session-report-skill",
                     "docs/session-analyzer")
METRICS = {"cre": "CRE/EOU", "lead": "lead/EOU", "owner": "owner/EOU"}
ALIASES = {"cre": "cre", "cre/eou": "cre", "lead": "lead", "lead/eou": "lead", "lead_time": "lead",
           "owner": "owner", "owner/eou": "owner", "owner_actions": "owner"}


class MarkError(Exception):
    pass


def parse_expect(s):
    """'CRE/EOU' | 'cre:down' | 'lead time/EOU up' -> (metric, direction)."""
    s = (s or "").strip().lower().replace("lead time", "lead")
    direction = "down"
    for sep in (":", " "):
        if sep in s:
            s, d = s.rsplit(sep, 1)
            if d not in ("down", "up"):
                raise MarkError(f"direction must be down|up, got {d!r}")
            direction = d
            break
    m = ALIASES.get(s.strip())
    if not m:
        raise MarkError(f"unknown metric {s!r}; use one of {', '.join(sorted(set(ALIASES)))}")
    return m, direction


def live(con, metric=None):
    sql = "SELECT * FROM experiments WHERE status='live'"
    args = []
    if metric:
        sql += " AND metric=?"
        args.append(metric)
    return [dict(r) for r in con.execute(sql + " ORDER BY id", args)]


def mark(con, label, expect, *, at=None, rec_id=None, template=None, target=None, params=None, undo=None,
         sha=None, pr_url=None, source="manual"):
    metric, direction = parse_expect(expect)
    clash = live(con, metric)
    if clash:
        raise MarkError(f"E{clash[0]['id']} ({clash[0]['label']}) is live on {METRICS[metric]}; "
                        "one experiment per metric until it has a verdict")
    cur = con.execute(
        "INSERT INTO experiments(label, metric, direction, started_at, rec_id, template, target, params, undo, "
        "commit_sha, pr_url, source, status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'live')",
        (label, metric, direction, at or store.now(), rec_id, template, target,
         json.dumps(params, sort_keys=True) if params is not None else None,
         json.dumps(undo, sort_keys=True) if undo is not None else None, sha, pr_url, source))
    return cur.lastrowid


# ---- per-PR rows -------------------------------------------------------------
def pr_rows(con, prs, t0, t1):
    """[{eou, cre, lead_s, owner}] for PRs merged in [t0, t1) with an owner."""
    out = []
    for p in prs:
        if not p["_owners"] or not p["merged_at"] or not (t0 <= p["merged_at"] < t1) or not p["eou"]:
            continue
        b = p["head_branch"]
        cre = 0.0
        for sid, share in p["_owners"]:
            if b in A.MAIN_BRANCHES:
                r = con.execute("SELECT SUM(cre) FROM requests WHERE session_id=?", (sid,)).fetchone()
            else:
                r = con.execute("SELECT SUM(cre) FROM requests WHERE session_id=? AND git_branch=?",
                                (sid, b)).fetchone()
            cre += (r[0] or 0.0) * (share if b in A.MAIN_BRANCHES else 1.0)
        L = A.ledger(con, p)
        lead, owner = 0.0, 0.0
        if L:
            first, ready = L[0], L[1]
            lead = ready - first
            if A._has(con, "turns", "feat"):
                for sid, share in p["_owners"]:
                    for r in con.execute("SELECT feat FROM turns WHERE session_id=? AND origin IN ('human','ask') "
                                         "AND ts>=? AND ts<=?", (sid, A.iso(first), A.iso(ready))):
                        f = json.loads(r[0]) if r[0] else {}
                        if not (f.get("first") or f.get("slash")):
                            owner += share
        out.append({"eou": p["eou"], "cre": cre, "lead_s": lead, "owner": owner})
    return out


# ---- bootstrap ---------------------------------------------------------------
_KEY = {"cre": "cre", "lead": "lead_s", "owner": "owner"}


def _ratio(rows, idx, k):
    e = sum(rows[i]["eou"] for i in idx)
    return sum(rows[i][k] for i in idx) / e if e else None


def _rel(a, b):
    if a is None or b is None or b == 0:
        return None
    return a / b - 1.0


def effects(before, after, seed=SEED, n=RESAMPLES):
    """metric -> (point, lo, hi) of after/before − 1."""
    rng = random.Random(seed)
    nb, na = len(before), len(after)
    allb, alla = list(range(nb)), list(range(na))
    samples = {m: [] for m in METRICS}
    for _ in range(n):
        ib = [rng.randrange(nb) for _ in range(nb)]
        ia = [rng.randrange(na) for _ in range(na)]
        for m, k in _KEY.items():
            v = _rel(_ratio(after, ia, k), _ratio(before, ib, k))
            if v is not None:
                samples[m].append(v)
    out = {}
    for m, k in _KEY.items():
        s = sorted(samples[m])
        point = _rel(_ratio(after, alla, k), _ratio(before, allb, k))
        if point is None or len(s) < n * 0.9:
            out[m] = None
            continue
        out[m] = (point, s[int(0.025 * len(s))], s[min(len(s) - 1, int(0.975 * len(s)))])
    return out


def evaluate(before, after, metric, direction="down", first_n=None, seed=SEED):
    """§6.9 decision. Returns {verdict, effects, n_before, n_after, eou_before,
    eou_after, first_n}. verdict ∈ KEEP | REVERT | INCONCLUSIVE |
    REVERT-for-simplicity | INSUFFICIENT."""
    eb, ea = sum(r["eou"] for r in before), sum(r["eou"] for r in after)
    res = {"n_before": len(before), "n_after": len(after), "eou_before": eb, "eou_after": ea,
           "effects": {}, "first_n": first_n}
    if len(before) < MIN_PRS or len(after) < MIN_PRS or eb < MIN_EOU or ea < MIN_EOU:
        res["verdict"] = "INSUFFICIENT"
        return res
    ef = effects(before, after, seed)
    res["effects"] = ef
    e = ef.get(metric)
    good = e is not None and (e[2] < 0 if direction == "down" else e[1] > 0)
    worse = [m for m, v in ef.items() if v is not None and (v[1] > WORSE if (m != metric or direction == "down")
                                                             else v[2] < -WORSE)]
    if worse:
        res["verdict"], res["worse"] = "REVERT", worse
    elif good:
        res["verdict"] = "KEEP"
    else:
        if first_n is None:
            res["first_n"] = len(after)
            res["verdict"] = "INCONCLUSIVE"
        elif len(after) >= 2 * first_n:
            res["verdict"] = "REVERT-for-simplicity"
        else:
            res["verdict"] = "INCONCLUSIVE"
    return res


def _pct(v):
    return f"{100 * v:+.0f}%"


def line(exp, res):
    """One deterministic verdict line."""
    parts = [f"E{exp['id']} {exp['label']} (expect {METRICS[exp['metric']]} {exp['direction']}, "
             f"since {exp['started_at'][:10]})"]
    if res["verdict"] == "INSUFFICIENT":
        parts.append(f"insufficient data: {res['n_before']}/{res['n_after']} PRs, "
                     f"{res['eou_before']:.1f}/{res['eou_after']:.1f} EOU (need ≥{MIN_PRS} PRs, ≥{MIN_EOU:.0f} EOU per arm)")
    else:
        for m in METRICS:
            v = res["effects"].get(m)
            parts.append(f"{METRICS[m]} " + ("n/a" if v is None else f"{_pct(v[0])} [{_pct(v[1])}, {_pct(v[2])}]"))
        v = res["verdict"]
        undo = f" → `session-analyzer revert E{exp['id']}`" if v.startswith("REVERT") and exp.get("template") else ""
        if v == "INCONCLUSIVE":
            v += f" (extends to {2 * (res['first_n'] or res['n_after'])} PRs)"
        parts.append(v + undo)
    return " · ".join(parts)


def arms(con, prs, exp, now=None):
    t = exp["started_at"]
    t0 = (_dt(t) - timedelta(days=BEFORE_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    end = exp.get("ended_at") or now or store.now()
    return pr_rows(con, prs, t0, t), pr_rows(con, prs, t, end)


def _dt(s):
    return datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)


def status(con, prs, now=None):
    """[(exp, res)] for live experiments, read-only."""
    out = []
    for e in live(con):
        b, a = arms(con, prs, e, now)
        out.append((e, evaluate(b, a, e["metric"], e["direction"], e["first_n"])))
    return out


FINAL = ("KEEP", "REVERT", "REVERT-for-simplicity")


def record(con, prs, now=None):
    """Evaluate live experiments; persist first_n and final verdicts; append
    final lines to reports/verdicts.md (0600). Returns new final lines."""
    new = []
    for e, res in status(con, prs, now):
        if res["verdict"] == "INCONCLUSIVE" and e["first_n"] is None:
            con.execute("UPDATE experiments SET first_n=? WHERE id=?", (res["first_n"], e["id"]))
        if res["verdict"] not in FINAL:
            continue
        ln = line(e, res)
        saved = 0.0
        c = res["effects"].get("cre")
        if res["verdict"] == "KEEP" and c and c[0] < 0:
            b, a = arms(con, prs, e, now)
            rb = sum(r["cre"] for r in b) / sum(r["eou"] for r in b)
            ea = sum(r["eou"] for r in a)
            saved = -c[0] * rb * ea
        con.execute("UPDATE experiments SET status='decided', verdict=?, verdict_at=?, verdict_line=?, saved_cre=? "
                    "WHERE id=?", (res["verdict"], now or store.now(), ln, saved, e["id"]))
        new.append(ln)
    if new:
        append_verdicts(new, now)
    return new


def append_verdicts(lines_, now=None):
    p = paths.ensure_dir(paths.reports_dir()) / "verdicts.md"
    new = not p.exists()
    with open(p, "a") as f:
        if new:
            f.write("# session-analyzer verdicts\n\n")
        for ln in lines_:
            f.write(f"- {(now or store.now())[:10]} {ln}\n")
    p.chmod(0o600)


# ---- standing no-effect checks ------------------------------------------------
def standing(con, prs, t1, seed=SEED):
    """Flagged rule ids only (see standing_detail)."""
    return standing_detail(con, prs, t1, seed)["flag"]


def standing_detail(con, prs, t1, seed=SEED):
    """§6.9 standing checks over the 4 weeks before t1. A rule is eligible
    only when that whole span is on/after its effective_since date and holds
    ≥10 attributed PRs and ≥5 EOU (else "insufficient"); it is flagged when
    followed in ≥80% of sessions and followed-vs-violated sessions show no
    CRE/EOU difference (CI spans 0). Returns {"flag": [rule],
    "insufficient": [rule], "why": str}."""
    from . import static
    t0 = (_dt(t1) - timedelta(days=STANDING_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    m = static.rules_map()
    eff = {k: static.effective_since(k, m) for k in A.RULE_NAMES}
    sids = [r[0] for r in con.execute("SELECT DISTINCT session_id FROM requests WHERE ts>=? AND ts<?", (t0, t1))]
    eou, n_prs = {}, 0
    for p in prs:
        if p["merged_at"] and t0 <= p["merged_at"] < t1 and p["_owners"]:
            n_prs += 1
            for sid, share in p["_owners"]:
                eou[sid] = eou.get(sid, 0.0) + p["eou"] * share
    tot = sum(eou.values())
    out = {"flag": [], "insufficient": [], "why": ""}
    ok_rules = []
    whys = set()
    for k in sorted(A.RULE_NAMES, key=A._rk):
        days = (_dt(t1) - _dt(eff[k])).days
        if days < STANDING_DAYS:
            out["insufficient"].append(k)
            whys.add(f"effective {eff[k][:10]}, {max(days, 0)} of {STANDING_DAYS} d")
        elif n_prs < MIN_PRS or tot < MIN_EOU:
            out["insufficient"].append(k)
            whys.add(f"{n_prs} PRs/{tot:.1f} EOU < {MIN_PRS}/{MIN_EOU}")
        else:
            ok_rules.append(k)
    out["why"] = "; ".join(sorted(whys))
    if not ok_rules:
        return out
    rows = {}
    win = A.windows(con, prs)
    for sid in sorted(sids):
        if not eou.get(sid):
            continue
        sc = A.Scope(sid, [sid], t0, t1)
        cre = con.execute("SELECT SUM(cre) FROM requests WHERE session_id=? AND ts>=? AND ts<?",
                          (sid, t0, t1)).fetchone()[0] or 0.0
        rules = A.compliance(con, [A.sess(con, sid)], sc, win)
        rows[sid] = ({k: r["ok"] for k, r in rules.items()}, {"eou": eou[sid], "cre": cre})
    for k in ok_rules:
        fol = [m for ok, m in rows.values() if ok.get(k) is True]
        vio = [m for ok, m in rows.values() if ok.get(k) is False]
        if len(fol) + len(vio) == 0 or len(fol) / (len(fol) + len(vio)) < STANDING_FOLLOWED:
            continue
        if len(fol) < STANDING_MIN_GROUP or len(vio) < STANDING_MIN_GROUP:
            continue
        e = effects([dict(r, lead_s=0, owner=0) for r in fol], [dict(r, lead_s=0, owner=0) for r in vio], seed)["cre"]
        if e is not None and e[1] <= 0 <= e[2]:
            out["flag"].append(k)
    return out


# ---- quarterly self-audit ------------------------------------------------------
def audit(con, t1):
    """Analyzer build + read CRE vs CRE saved by KEEP verdicts. One line."""
    like = " OR ".join("git_branch LIKE ?" for _ in ANALYZER_BRANCHES)
    r = con.execute(f"SELECT SUM(cre), MIN(ts) FROM requests WHERE ({like}) AND ts<?",
                    [b + "%" for b in ANALYZER_BRANCHES] + [t1]).fetchone()
    build, first = r[0] or 0.0, r[1]
    reads = con.execute("SELECT COUNT(*) FROM tool_calls WHERE skill='session-report' AND ts<?", (t1,)).fetchone()[0] \
        if A._has(con, "tool_calls", "skill") else 0
    read_cre = reads * READ_CRE_EST
    saved, n = 0.0, 0
    if A._has(con, "experiments", "saved_cre"):
        r = con.execute("SELECT COALESCE(SUM(saved_cre),0), COUNT(*) FROM experiments WHERE status='decided' "
                        "AND verdict_at<?", (t1,)).fetchone()
        saved, n = r[0], r[1]
    q = _dt(t1)
    label = f"{q.year}-Q{(q.month - 1) // 3 + 1}"
    spent = build + read_cre
    fmt = A.fmt_tok
    s = (f"AUDIT    {label}: analyzer build {fmt(build)} + reads {fmt(read_cre)} CRE vs saved {fmt(saved)} "
         f"by {n} verdict{'s' if n != 1 else ''}")
    if saved >= spent and spent:
        s += " → paid back"
    elif first and (q - _dt(first)).days >= 182:
        s += " → not paid back after 2 quarters: freeze at ingest-only (unload com.claude.session-report)"
    else:
        s += " → not yet paid back"
    return s
