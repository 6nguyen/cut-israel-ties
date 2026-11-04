"""CLI. Later steps add subcommands by registering in COMMANDS
(name -> (configure_parser, run)). Write paths exit 0 on the free-space
floor (one log line, zero bytes written)."""
import argparse
import json
import os
import sys

from . import PARSER_VERSION, disk, paths, store

COMMANDS = {}


def command(name, help_):
    def deco(fn):
        COMMANDS[name] = (help_, fn)
        return fn
    return deco


def _floor_guard():
    if disk.below_floor():
        disk.log(f"{' '.join(sys.argv[1:2]) or 'cmd'}: free space {disk.free_bytes() / disk.GB:.1f} GB below floor; wrote nothing")
        return True
    return False


@command("ingest", "ingest changed sessions (or --session ID) into index + skeletons")
def _ingest(p, a=None):
    if a is None:
        p.add_argument("--session", action="append", help="session id (repeatable)")
        p.add_argument("--force", action="store_true", help="full rebuild (current parser)")
        p.add_argument("--quiet", action="store_true")
        return
    if _floor_guard():
        return 0
    from .ingest import ingest_all
    from .parse import discover, find_session
    root = paths.projects_root()
    if a.session:
        srcs = [s for s in (find_session(root, sid) for sid in a.session) if s]
    else:
        srcs = discover(root)
    con = store.connect()
    errs = []
    try:
        counts = ingest_all(con, srcs, a.force, on_error=lambda s, e: errs.append(f"{s.session_id}: {type(e).__name__}: {e}"))
    except disk.FloorError as e:
        disk.log(f"ingest: {e}")
        return 0
    for e in errs:
        disk.log(f"ingest error {e}")
    from .pins import enforce_cap
    enforce_cap(con)
    disk.log(f"ingest: {counts}")
    if not a.quiet:
        print(json.dumps(counts))
    return 0


@command("pin", "pin raw transcripts (xz, self-expiring)")
def _pin(p, a=None):
    if a is None:
        p.add_argument("label")
        p.add_argument("--session", nargs="+")
        p.add_argument("--since")
        p.add_argument("--until", help="YYYY-MM-DD (inclusive)")
        g = p.add_mutually_exclusive_group()
        g.add_argument("--days", type=int)
        g.add_argument("--until-decision", action="store_true")
        return
    if _floor_guard():
        return 0
    from .pins import PinError, pin
    try:
        r = pin(store.connect(), a.label, a.session, a.since, a.until, a.days, a.until_decision)
    except PinError as e:
        print(f"pin refused: {e}", file=sys.stderr)
        return 2
    except disk.FloorError as e:
        disk.log(f"pin: {e}")
        return 0
    print(json.dumps(r))
    return 0


@command("unpin", "re-ingest then delete a pin early")
def _unpin(p, a=None):
    if a is None:
        p.add_argument("label")
        return
    from .pins import PinError, unpin
    try:
        unpin(store.connect(), a.label)
    except PinError as e:
        print(e, file=sys.stderr)
        return 2
    return 0


@command("decide", "log an --until-decision pin's outcome, then delete it")
def _decide(p, a=None):
    if a is None:
        p.add_argument("label")
        p.add_argument("outcome")
        return
    from .pins import PinError, decide
    try:
        decide(store.connect(), a.label, a.outcome)
    except PinError as e:
        print(e, file=sys.stderr)
        return 2
    return 0


@command("pins", "list pins")
def _pins(p, a=None):
    if a is None:
        return
    from .pins import list_pins
    for r in list_pins(store.connect()):
        print(json.dumps(r))
    return 0


@command("reindex", "rebuild index rows from skeletons (+ text labels from raw)")
def _reindex(p, a=None):
    if a is None:
        return
    if _floor_guard():
        return 0
    from .reindex import reindex
    r = reindex(store.connect(), on_error=lambda pth, e: disk.log(f"reindex error {pth}: {e}"))
    print(json.dumps(r))
    return 0


@command("hook", "SessionEnd hook: detached ingest, silent, exit 0")
def _hook(p, a=None):
    if a is None:
        p.add_argument("--session")
        return
    from .capture import hook
    return hook(a.session)


@command("nightly", "launchd job: ingest changed, expire pins, cap, day-12 alert, vacuum")
def _nightly(p, a=None):
    if a is None:
        return
    from .capture import nightly
    return nightly()


@command("status", "archive size, free space, row counts")
def _status(p, a=None):
    if a is None:
        return
    out = {"archive": str(paths.archive_root()), "archive_bytes": disk.archive_bytes(),
           "pinned_bytes": disk.pinned_bytes(), "free_gb": round(disk.free_bytes() / disk.GB, 1),
           "floor_gb": disk.min_free_bytes() / disk.GB, "parser_version": PARSER_VERSION}
    if paths.index_db().exists():
        con = store.connect()
        for t in ("sessions", "requests", "agents", "tool_calls", "events", "turns", "pr_links", "pins"):
            out[t] = con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    print(json.dumps(out))
    return 0


@command("install-hook", "merge the SessionEnd hook into a settings.json (install.sh)")
def _install_hook(p, a=None):
    if a is None:
        p.add_argument("settings")
        p.add_argument("--command", required=True)
        p.add_argument("--event", default="SessionEnd")
        p.add_argument("--matcher")
        p.add_argument("--mark", help="substring that identifies our hook (default: the command)")
        p.add_argument("--conflict", action="append", default=[],
                       help="skip with a WARN if an existing hook command contains this (repeatable)")
        return
    from .settings_merge import merge
    try:
        r = merge(a.settings, a.command, a.event, a.matcher, a.mark, a.conflict)
        if r.startswith("conflict:"):
            print(f"WARN: {a.event} hook not added: an existing hook matches '{r[9:]}' "
                  f"(at most one hook may rewrite input; remove it, then re-run)")
        else:
            print(f"{a.event} hook: {r}")
    except ValueError as e:
        print(f"WARN: {a.settings} not valid JSON ({e}); add the SessionEnd hook by hand: {a.command}")
        return 1
    return 0


def _stub(step):
    def run(p, a=None):
        if a is None:
            p.add_argument("rest", nargs=argparse.REMAINDER)
            return
        print(f"not yet implemented — step {step}")
        return 0
    return run


# Extension points for later PRD steps (replace the stub in that step's PR).
def _scope_args(p):
    p.add_argument("--db", help="index path (default: archive index); opened read-only")
    p.add_argument("--no-refresh", action="store_true", help="skip the gh PR fetch (use the cached prs table)")
    p.add_argument("--no-cache-write", action="store_true", help="fetch PRs in memory; never write the prs cache")


def _prs_for(a):
    """Read-only connection + scored PRs. The only write `report` may do is
    the incremental `prs` cache refresh (skipped on --no-cache-write, --db,
    or below the free-space floor)."""
    from . import analyze, gh
    db = a.db or paths.index_db()
    if not os.path.exists(db):
        print(f"no index at {db}; run ingest first")
        return None, None
    con = store.connect_ro(db)
    if not store.has_column(con, "prs", "changed_lines") and not a.db and not disk.below_floor():
        store.connect().close()  # migrate once (schema only)
        con = store.connect_ro(db)
    fetched = []
    if not a.no_refresh:
        repos = analyze.repos_seen(con)
        if a.no_cache_write or a.db or disk.below_floor():
            fetched = gh.refresh(None, repos)
        else:
            rw = store.connect()
            gh.refresh(rw, repos)
            rw.close()
    return con, analyze.load_prs(con, fetched)


def _baseline(con, prs, scope):
    from . import analyze
    if not scope.t0 or scope.t0 < analyze.V2_DATE:
        return None
    bs = analyze.resolve(con, {"since": "2000-01-01", "until": analyze.V2_DATE}, prs)
    bs.t1 = analyze.V2_DATE + "T00:00:00Z"
    return analyze.analyze(con, bs, prs) if bs.sessions else None


@command("report", "print the §7 scorecard for a scope")
def _report(p, a=None):
    if a is None:
        g = p.add_mutually_exclusive_group()
        g.add_argument("--session", action="append", help="session id or prefix (repeatable)")
        g.add_argument("--pr", type=int)
        g.add_argument("--since", help="YYYY-MM-DD or -Nd")
        g.add_argument("--window", help="any timestamp inside the 5-h window")
        p.add_argument("--until", help="inclusive end date for --since")
        p.add_argument("--repo", help="owner/name for --pr")
        p.add_argument("--json", action="store_true", help="raw numbers instead of text")
        _scope_args(p)
        return
    from . import analyze, report
    con, prs = _prs_for(a)
    if con is None:
        return 0
    spec = {"session": a.session, "pr": a.pr, "repo": a.repo, "since": a.since, "until": a.until,
            "window": a.window}
    if not (a.session or a.pr is not None or a.since or a.window):
        spec["since"] = "-7d"
    scope = analyze.resolve(con, spec, prs)
    if not scope.sessions:
        print(f"Scope: {scope.label} · no sessions")
        return 0
    res = analyze.analyze(con, scope, prs)
    if a.json:
        print(json.dumps({k: v for k, v in res.items() if not k.startswith("_")}, sort_keys=True, default=str))
        return 0
    sys.stdout.write(report.render(res, _baseline(con, prs, scope), extra=_extras(con, prs, scope, res)))
    return 0


def _t_end(con, scope):
    """Scope end for standing checks / audit / verdict status: the scope's
    own end, else the newest request in the index (never the wall clock, so
    the report stays byte-identical per index state)."""
    if scope.t1:
        return scope.t1
    r = con.execute("SELECT MAX(ts) FROM requests").fetchone()[0] or store.now()
    return r[:19] + "Z"


def _extras(con, prs, scope, res):
    """§6.9 standing checks, live experiment status, self-audit and §6.7 top 3."""
    from . import recommend, verdict
    t1 = _t_end(con, scope)
    has_exp = store.has_column(con, "experiments", "metric")
    live = verdict.live(con) if has_exp else []
    exps = [verdict.line(e, r) for e, r in verdict.status(con, prs, t1)] if has_exp else []
    sdd = verdict.standing_detail(con, prs, t1)
    return {"standing": recommend.drop_eligibility(sdd, res), "experiments": exps, "audit": verdict.audit(con, t1),
            "recs": recommend.rank(res, sdd, live)}


def _recs_for(a):
    """Recommendations `apply` acts on: the newest weekly sidecar (what the
    owner read), else a fresh `--since` analysis."""
    import glob
    files = sorted(glob.glob(str(paths.reports_dir() / "*.json")))
    files = [f for f in files if not f.endswith("verdicts.json")]
    if a.since is None and files:
        return json.loads(open(files[-1]).read())["recs"], files[-1]
    from . import analyze
    a.db, a.no_cache_write = None, getattr(a, "no_cache_write", False)
    con, prs = _prs_for(a)
    if con is None:
        return [], None
    scope = analyze.resolve(con, {"since": a.since or "-7d"}, prs)
    if not scope.sessions:
        return [], None
    res = analyze.analyze(con, scope, prs)
    return _extras(con, prs, scope, res)["recs"], f"report --since {a.since or '-7d'}"


def _find_exp(con, ident):
    ident = ident.upper()
    if ident.startswith("E") and ident[1:].isdigit():
        r = con.execute("SELECT * FROM experiments WHERE id=?", (int(ident[1:]),)).fetchone()
    else:
        r = con.execute("SELECT * FROM experiments WHERE rec_id=? AND status!='reverted' ORDER BY id DESC LIMIT 1",
                        (ident,)).fetchone()
    return dict(r) if r else None


@command("mark", "start an experiment: mark LABEL --expect METRIC[:down|up]")
def _mark(p, a=None):
    if a is None:
        p.add_argument("label")
        p.add_argument("--expect", required=True, help="cre | lead | owner (per EOU), optional :down|:up")
        p.add_argument("--at", help="start timestamp (default now, UTC)")
        return
    if _floor_guard():
        return 0
    from . import verdict
    try:
        eid = verdict.mark(store.connect(), a.label, a.expect, at=a.at)
    except verdict.MarkError as e:
        print(f"mark refused: {e}", file=sys.stderr)
        return 2
    print(f"E{eid} live")
    return 0


@command("verdicts", "evaluate live experiments; record final verdicts (reports/verdicts.md)")
def _verdicts(p, a=None):
    if a is None:
        _scope_args(p)
        return
    if _floor_guard():
        return 0
    from . import verdict
    con, prs = _prs_for(a)
    if con is None:
        return 0
    rw = store.connect()
    new = verdict.record(rw, prs)
    for e, r in verdict.status(rw, prs):
        print(verdict.line(e, r))
    for ln in new:
        print(ln)
    return 0


def _apply_args(p):
    p.add_argument("id", help="R<n> (apply) or E<k>/R<n> (revert)")
    p.add_argument("--since", help="recompute recommendations for this scope instead of the newest weekly report")
    p.add_argument("--dry-run", action="store_true", help="print the patched files' diff; write nothing")
    p.add_argument("--no-refresh", action="store_true")


def _diff(template, target, params, undo=None):
    import difflib
    from . import catalog
    root = catalog.root_for(target)
    rels = catalog.TEMPLATES[template][3](params)
    cur = catalog.read_files(root, rels)
    new = catalog.patch(template, cur, params)[0] if undo is None else catalog.inverse(template, cur, params, undo)
    for r in rels:
        sys.stdout.writelines(difflib.unified_diff((cur.get(r) or "").splitlines(True),
                                                   (new.get(r) or "").splitlines(True), f"a/{r}", f"b/{r}"))


@command("apply", "apply recommendation R<n> (catalog patch → PR or backup) and mark the experiment")
def _apply(p, a=None):
    if a is None:
        _apply_args(p)
        return
    if _floor_guard():
        return 0
    from . import catalog, verdict
    a.db = None
    recs, src = _recs_for(a)
    rec = next((r for r in recs if r["id"] == a.id.upper()), None)
    if not rec:
        print(f"no {a.id} in {src or 'any report'}", file=sys.stderr)
        return 2
    t = rec["template"]
    if t == "needs-session":
        print(f"{rec['id']} needs a session (outside the catalog, est. 1M CRE): {rec['change']}")
        return 2
    con = store.connect()
    metric, _ = verdict.parse_expect(rec["expect"])
    clash = verdict.live(con, metric)
    if clash:
        print(f"apply refused: E{clash[0]['id']} is live on {verdict.METRICS[metric]}", file=sys.stderr)
        return 2
    target = catalog.TEMPLATES[t][2]
    if a.dry_run:
        if t != "connector-off":
            _diff(t, target, rec["params"])
        return 0
    label = f"{rec['id']} {rec['change']}"[:100]
    res = {"undo": None, "sha": None, "pr_url": None, "backups": []}
    if t == "connector-off":
        print(f"owner step (infeasible to automate): {rec['change']}")
    else:
        body = (f"session-analyzer {rec['id']} ({rec['kind']} {rec['rule']}, template `{t}`), from {src}.\n\n"
                f"Evidence: {rec['evidence']}\n\nChange: {rec['change']}\n\nExpected: "
                f"{verdict.METRICS[metric]} {rec['expect'].split(':')[1]}; the weekly report evaluates the verdict "
                f"(§6.9). Undo: `session-analyzer revert {rec['id']}`.")
        try:
            res = catalog.execute(t, target, rec["params"], branch=f"chore/sa-{rec['id']}-{rec['slug']}",
                                  title=f"session-analyzer {rec['id']}: {rec['change']}"[:72], body=body)
        except catalog.PatchError as e:
            print(f"apply failed: {e}", file=sys.stderr)
            return 2
    eid = verdict.mark(con, label, rec["expect"], rec_id=rec["id"], template=t, target=target,
                       params=rec["params"], undo=res["undo"], sha=res["sha"], pr_url=res["pr_url"], source="catalog")
    print(f"E{eid} live: {label}")
    for b in res["backups"]:
        print(f"backup {b}")
    if res["pr_url"]:
        print(f"PR {res['pr_url']}")
    return 0


@command("revert", "apply the inverse patch of an applied experiment (E<k> or R<n>)")
def _revert(p, a=None):
    if a is None:
        _apply_args(p)
        return
    if _floor_guard():
        return 0
    from . import catalog, verdict
    con = store.connect()
    e = _find_exp(con, a.id)
    if not e or not e["template"]:
        print(f"no applied experiment {a.id}", file=sys.stderr)
        return 2
    if e["status"] == "reverted":
        print(f"E{e['id']} already reverted", file=sys.stderr)
        return 2
    t, params, undo = e["template"], json.loads(e["params"] or "{}"), json.loads(e["undo"] or "null")
    if a.dry_run:
        if t != "connector-off":
            _diff(t, e["target"], params, undo)
        return 0
    res = {"pr_url": None, "backups": []}
    if t == "connector-off":
        print("owner step: turn the connector back on (Claude app → Settings → Connectors)")
    else:
        body = (f"Reverts session-analyzer E{e['id']} ({e['label']}), applied in {e['pr_url'] or e['commit_sha'] or 'a backup write'}.\n\n"
                f"Verdict: {e['verdict_line'] or 'none yet (owner decision)'}")
        try:
            res = catalog.execute(t, e["target"], params, undo, branch=f"chore/sa-revert-E{e['id']}-{catalog.slug(e['label'])}"[:60],
                                  title=f"session-analyzer revert E{e['id']}: {e['label']}"[:72], body=body)
        except catalog.PatchError as x:
            hint = f" (if {e['pr_url']} is unmerged, close it instead)" if e["pr_url"] else ""
            print(f"revert failed: {x}{hint}", file=sys.stderr)
            return 2
    now = store.now()
    con.execute("UPDATE experiments SET status='reverted', ended_at=?, revert_pr_url=? WHERE id=?",
                (now, res.get("pr_url"), e["id"]))
    verdict.append_verdicts([f"E{e['id']} {e['label']} reverted" + (f" ({res['pr_url']})" if res.get("pr_url") else "")])
    for b in res["backups"]:
        print(f"backup {b}")
    print(f"E{e['id']} reverted" + (f": PR {res['pr_url']}" if res.get("pr_url") else ""))
    return 0


@command("weekly", "launchd (Mondays 08:00): ingest, verdicts, report --since -7d to reports/, notify")
def _weekly(p, a=None):
    if a is None:
        return
    import time as _t
    from datetime import datetime, timezone
    from . import analyze, recommend, report, verdict
    from .capture import notify
    if _floor_guard():
        return 0
    t0 = _t.monotonic()
    try:
        from .ingest import ingest_all
        from .parse import discover
        ingest_all(store.connect(), discover(paths.projects_root()), False)
    except disk.FloorError as e:
        disk.log(f"weekly: {e}")
        return 0
    ns = argparse.Namespace(db=None, no_refresh=False, no_cache_write=False)
    con, prs = _prs_for(ns)
    if con is None:
        return 0
    new = verdict.record(store.connect(), prs)
    con = store.connect_ro()
    scope = analyze.resolve(con, {"since": "-7d"}, prs)
    if scope.sessions:
        res = analyze.analyze(con, scope, prs)
        ex = _extras(con, prs, scope, res)
        text = report.render(res, _baseline(con, prs, scope), extra=ex)
    else:
        res, ex, text = None, {"recs": []}, f"Scope: {scope.label} · no sessions\n"
    now = datetime.strptime(store.now()[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
    y, w, _ = now.isocalendar()
    d = paths.ensure_dir(paths.reports_dir())
    md, js = d / f"{y}-W{w:02d}.md", d / f"{y}-W{w:02d}.json"
    for path, body in ((md, text), (js, json.dumps({"scope": scope.label, "recs": ex["recs"]}, sort_keys=True,
                                                     indent=1) + "\n")):
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(body)
        os.chmod(path, 0o600)
    if res:
        eou, le = res["eou"], res["ledger_eou"]
        head = (f"CRE/EOU {analyze.fmt_tok(res['cre'] / eou) if eou else 'n/a'} · lead/EOU "
                f"{res['lead_s'] / le / 3600:.1f} h" if le else "lead n/a")
        head += f" · owner/EOU {report.owner_total(res['owner']) / eou:.1f}" if eou else ""
        notify("Session report", f"{head} · {len(new)} new verdicts · {len(ex['recs'])} recommendations")
    disk.log(f"weekly: wrote {md.name} in {_t.monotonic() - t0:.1f}s")
    print(md)
    return 0


@command("compare", "compare two scopes side by side (A B: ids, pr:N, D..D, -7d, window:TS)")
def _compare(p, a=None):
    if a is None:
        p.add_argument("a")
        p.add_argument("b")
        _scope_args(p)
        return
    from . import analyze, report
    con, prs = _prs_for(a)
    if con is None:
        return 0
    ra = analyze.analyze(con, analyze.resolve(con, a.a, prs), prs)
    rb = analyze.analyze(con, analyze.resolve(con, a.b, prs), prs)
    sys.stdout.write(report.compare(ra, rb))
    return 0




def main(argv=None) -> int:
    os.umask(0o077)
    ap = argparse.ArgumentParser(prog="session-analyzer")
    sp = ap.add_subparsers(dest="cmd", required=True)
    for name, (help_, fn) in COMMANDS.items():
        fn(sp.add_parser(name, help=help_))
    a = ap.parse_args(argv)
    if a.cmd == "hook":  # must never fail or print
        try:
            return COMMANDS["hook"][1](None, a) or 0
        except Exception:
            return 0
    try:
        return COMMANDS[a.cmd][1](None, a) or 0
    except Exception as e:
        disk.log(f"{a.cmd}: {type(e).__name__}: {e}")
        if a.cmd in ("ingest", "nightly"):
            return 0  # capture paths never fail loudly
        raise
