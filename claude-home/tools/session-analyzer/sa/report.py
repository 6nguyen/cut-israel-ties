"""§7 report text (≤60 lines) and `compare` (side by side). Pure
formatting over analyze.analyze() results; byte-identical for the same
index state (no wall clock, no free-space number — `status` has that)."""
from . import analyze as A
from . import owner as O

fmt = A.fmt_tok


def _h(s):
    return f"{s / 3600:.1f} h"


def _m(s):
    return f"{s / 60:.0f}"


def _per(x, eou):
    return x / eou if eou else None


def _ratio(x, eou, f):
    v = _per(x, eou)
    return "n/a" if v is None else f(v)


def standing_lines(el):
    """RULES no-effect lines from recommend.drop_eligibility (same gate as TOP 3)."""
    name = lambda k: f"{k} {A.RULE_NAMES[k]}"  # noqa: E731
    out = ["         no measured effect (4 wk, ≥80% followed): " + (
        ", ".join(f"{name(k)} → candidate to drop" for k in el["drop"]) if el["drop"] else "none")]
    if el["kept"]:
        out[0] += " · no droppable text: " + ", ".join(el["kept"])
    if el["insufficient"]:
        out.append(f"         insufficient data ({el['why']}): " + ", ".join(el["insufficient"]))
    return out


def lines(res, base=None, archive=None, extra=None):
    """extra (optional): {"standing": recommend.drop_eligibility(), "experiments": [line],
    "audit": line, "recs": [rec]} from cli._extras."""
    extra = extra or {}
    eou = res["eou"]
    out = []
    out.append(f"Scope: {res['label']} · {res['sessions']} sessions · {res['agents']} agents · {res['prs']} PRs "
               f"({eou:.1f} EOU{', ' + str(res['penalized']) + ' penalized' if res['penalized'] else ''}) · "
               f"{res['active_windows']} active windows")
    out.append(f"VOLUME   CRE {fmt(res['cre'])}  requests {res['main_requests']} main / {res['agent_requests']} agent  "
               f"cache rebuilds {res['rebuilds_main']} main / {res['rebuilds_agent']} agent")
    b = ""
    if base and base.get("eou"):
        b = f" (baseline {fmt(base['cre'] / base['eou'])})"
    out.append(f"COST     CRE/EOU {_ratio(res['cre'], eou, fmt)}{b}  median main ctx {fmt(res['main_ctx_median'])}  "
               f"max {fmt(res['main_ctx_max'])}  agent ctx med {fmt(res['agent_ctx_median'])}")
    bk = res["buckets"]
    bl = ""
    if base and base.get("ledger_eou"):
        bl = f" (baseline {_h(base['lead_s'] / base['ledger_eou'])})"
    eff = "n/a" if res["flow_eff"] is None else f"{100 * res['flow_eff']:.0f}%"
    ah = res["active_hours"]
    out.append(f"SPEED    lead time/EOU {_ratio(res['lead_s'], res['ledger_eou'], _h)}{bl}  "
               f"EOU/active h {eou / ah if ah else 0:.2f}  flow eff. {eff}  "
               f"merge wait med {_h(res['merge_latency_median_s'])}")
    le = res["ledger_eou"]
    pm = (lambda s: f"{s / 60 / le:.0f}") if le else (lambda s: "0")
    d = res["dividend"]
    if d is None:
        dv = "latency dividend n/a"
    elif d["r2"] < 0.3:
        dv = f"latency dividend omitted (R² {d['r2']:.2f})"
    else:
        dv = f"latency dividend {'−' if d['seconds'] >= 0 else '+'}{pm(abs(d['seconds']))} (R² {d['r2']:.2f})"
    net = res["net_s"]
    pct = f" ({100 * net / res['lead_s']:.0f}% of lead time)" if res["lead_s"] else ""
    out.append(f"         token-discipline net {'+' if net >= 0 else '−'}{pm(abs(net))} min/EOU{pct}: "
               f"compaction {pm(bk.get('compaction', 0))} · reorient {pm(bk.get('reorientation', 0))} · "
               f"cap relaunch {pm(bk.get('cap_relaunch', 0))}")
    out.append(f"         · handoff {pm(bk.get('handoff', 0))} · serialization {pm(bk.get('serialization', 0))} · {dv}   "
               f"stalls: 429 {_m(bk.get('rate_limited', 0))} min · disk {_m(bk.get('disk_full', 0))} min")
    wc = res["win_classes"]
    est = " est." if res["ceiling_estimated"] else ""
    arrow = {"headroom": "minutes outweigh tokens", "limited": "tokens buy minutes", "n/a": "no active windows"}
    out.append(f"         regime: {res['regime']} (median window {100 * res['median_util']:.0f}% of {fmt(res['ceiling'])}"
               f"{est}; limited {wc['limited']} · normal {wc['normal']} · headroom {wc['headroom']}) → "
               f"{arrow[res['regime']]}")
    if le:
        top = sorted(((v, k) for k, v in bk.items()), reverse=True)[:6]
        out.append("LEDGER   min/EOU " + " · ".join(f"{k} {pm(v)}" for v, k in top))
    out.extend(owner_lines(res["owner"], eou))
    rules = res["rules"]
    items = []
    for k in sorted(rules, key=A._rk):
        r = rules[k]
        mark = "·" if r["ok"] is None else ("✓" if r["ok"] else "✗")
        s = f"{k} {A.RULE_NAMES[k]} {mark} {r['detail']}"
        if r["cre"]:
            s += f" (−{fmt(r['cre'])} CRE"
            mp = res["min_per_eou"].get(k)
            s += f", +{mp:.0f} min/EOU)" if mp else ")"
        elif res["min_per_eou"].get(k):
            s += f" (+{res['min_per_eou'][k]:.0f} min/EOU)"
        items.append(s)
    out.append("RULES    " + items[0])
    for s in items[1:]:
        out.append("         " + s)
    ot = res["over_tight"]
    out.append("         over-tight: " + (", ".join(f"{k} {A.RULE_NAMES[k]}" for k in ot) if ot else "none"))
    if "standing" in extra:
        out += standing_lines(extra["standing"])
    rt = res["static"]["rule_text_tokens"]
    out.append("         rule text CRE: " + " · ".join(
        f"{k} {fmt(rules[k]['text_cre'])}" for k in sorted(rules, key=A._rk) if rt.get(k)) or "         rule text: n/a")
    st = res["static"]
    if st["available"]:
        av = st["avg_tokens"]
        out.append(f"STATIC   per request: global {fmt(av.get('claude_global', 0))} · project {fmt(av.get('claude_project', 0))}"
                   f" · memory {fmt(av.get('memory', 0))} · skills {fmt(av.get('skills', 0))} · agents "
                   f"{fmt(av.get('agents', 0))} · system+tools {fmt(av.get('system', 0))} → files {fmt(st['cre'])} CRE")
    else:
        out.append("STATIC   n/a (sessions indexed before parser v2; run reindex)")
    w = res["waste"]
    if w["v2"]:
        out.append(f"WASTE    repeat Read≥3 {w['repeat_read_files']} files ({w['repeat_read_excess']} reads, "
                   f"{fmt(w['repeat_read_tokens'])} tok) · failing cmd ≥3 {w['failing_cmd_groups']} · post-compact "
                   f"re-reads {w['post_compact_rereads']} ({fmt(w['post_compact_tokens'])} tok)")
    else:
        out.append("WASTE    repeat/failing/post-compact counters need parser v2 (reindex)")
    rt, tot = w.get("result_tokens") or {}, sum((w.get("result_tokens") or {}).values())
    if tot:
        rr = (f" · Bash re-runs ≤{A.RERUN_WINDOW} calls {w['bash_reruns']} "
              f"({100 * w['bash_reruns'] / w['bash_calls']:.1f}% of {w['bash_calls']})") if w["v2"] and w["bash_calls"] else ""
        out.append("         tool-result tok " + " · ".join(
            f"{k} {fmt(v)} ({100 * v / tot:.0f}%)" for k, v in rt.items()) + rr)
    out.append(f"         cache-TTL rewrites {w['ttl_rewrites']} ({fmt(w['ttl_cre'])} CRE, median gap "
               f"{w['ttl_median_gap_s'] / 60:.0f} min)")
    ag = sorted(res["by_agent_type"].items(), key=lambda kv: (-kv[1][1], kv[0]))[:5]
    if ag:
        out.append("AGENTS   " + " · ".join(f"{k} ×{v[0]} {fmt(v[1])} {v[2]:.0f}m" for k, v in ag))
    sk = sorted(res["by_skill"].items(), key=lambda kv: (-kv[1][1], kv[0]))[:5]
    if sk:
        out.append("SKILLS   " + " · ".join(f"{k} ×{v[0]} {fmt(v[1])} {v[2]:.0f}m" for k, v in sk))
    if archive:
        out.append(f"DISK     archive {archive['archive_mb']:.0f} MB (index {archive['index_mb']:.0f} · skeletons "
                   f"{archive['skel_mb']:.0f} · pinned {archive['pinned_mb']:.0f})")
    tail = []
    for i, ln in enumerate(extra.get("experiments") or []):
        tail.append(("EXPER    " if i == 0 else "         ") + ln)
    if extra.get("audit"):
        tail.append(extra["audit"])
    from . import recommend
    tail.extend(recommend.lines(extra.get("recs") or []))
    return out[:60 - len(tail)] + tail


_OWN = (("decision", "decisions"), ("manual_step", "manual"), ("redirect", "redirects"), ("resume", "resumes"))


def owner_total(o):
    """Binding metric: every owner turn except a session's opening prompt and
    slash commands. Plain count; the classifier does not touch it."""
    return o["total"]


def owner_lines(o, eou):
    """§7 OWNER line + §6.6 detail. The total is binding; the per-class split is
    classifier output and stays experimental until owner.FRESH_EVAL_SINCE passes."""
    c = o["counts"]
    per = (lambda n: f"{n / eou:.1f}") if eou else (lambda n: f"{n}")
    unit = "actions/EOU" if eou else "actions (no EOU)"
    out = [f"OWNER    {unit} {per(owner_total(o))} · experimental: "
           + " · ".join(f"{lbl} {per(c[k])}" for k, lbl in _OWN) + f" (held-out acc {O.HELDOUT_ACC:.2f})"]
    mins = f"{o['minutes'] / eou:.1f} min/EOU" if eou else f"{o['minutes']:.0f} min"
    d = f"         owner time {mins} · new requests {c['new_request']} · manual infeasible {o['infeasible']}"
    if o["unclassified"]:
        d += f" · unclassified {o['unclassified']} (reindex)"
    out.append(d)
    if o["manual"]:
        items = []
        for x in o["manual"]:
            auto = "infeasible" if x["infeasible"] else (
                f"auto {fmt(x['auto_cre'])} CRE" if x["auto_cre"] is not None else "auto unknown")
            items.append(f"{x['pattern']} ×{x['count']} {x['minutes']:.0f} min ({auto})")
        out.append("         top manual: " + " · ".join(items))
    return out


def render(res, base=None, archive=None, extra=None):
    return "\n".join(lines(res, base, archive, extra)) + "\n"


def compare(ra, rb):
    def row(name, fa, fb):
        return f"{name:<22}{fa:>22}  {fb:>22}"

    def v(r, f):
        try:
            return f(r)
        except (TypeError, ZeroDivisionError, KeyError):
            return "n/a"

    rows = [f"A: {ra['label']}", f"B: {rb['label']}", row("", "A", "B")]
    spec = [
        ("sessions", lambda r: str(r["sessions"])),
        ("PRs (EOU)", lambda r: f"{r['prs']} ({r['eou']:.1f})"),
        ("CRE", lambda r: fmt(r["cre"])),
        ("CRE/EOU", lambda r: fmt(r["cre"] / r["eou"])),
        ("main/agent requests", lambda r: f"{r['main_requests']}/{r['agent_requests']}"),
        ("cache rebuilds", lambda r: f"{r['rebuilds_main']}/{r['rebuilds_agent']}"),
        ("median main ctx", lambda r: fmt(r["main_ctx_median"])),
        ("lead time/EOU", lambda r: _h(r["lead_s"] / r["ledger_eou"])),
        ("net min/EOU", lambda r: f"{r['net_s'] / 60 / r['ledger_eou']:+.0f}"),
        ("flow eff.", lambda r: f"{100 * r['flow_eff']:.0f}%"),
        ("regime", lambda r: f"{r['regime']} ({100 * r['median_util']:.0f}%)"),
        ("over-tight", lambda r: ",".join(r["over_tight"]) or "none"),
        ("OWNER actions/EOU", lambda r: f"{owner_total(r['owner']) / r['eou']:.1f}"),
        ("  exp. decisions/EOU", lambda r: f"{r['owner']['counts']['decision'] / r['eou']:.1f}"),
        ("  exp. manual/EOU", lambda r: f"{r['owner']['counts']['manual_step'] / r['eou']:.1f}"),
        ("  exp. redirects/EOU", lambda r: f"{r['owner']['counts']['redirect'] / r['eou']:.1f}"),
        ("  exp. resumes/EOU", lambda r: f"{r['owner']['counts']['resume'] / r['eou']:.1f}"),
        ("  exp. owner min/EOU", lambda r: f"{r['owner']['minutes'] / r['eou']:.0f}"),
    ]
    for name, f in spec:
        rows.append(row(name, v(ra, f), v(rb, f)))
    for k in sorted(ra["rules"], key=A._rk):
        rows.append(row(f"{k} {A.RULE_NAMES[k]}"[:21], v(ra, lambda r: _rule(r, k)), v(rb, lambda r: _rule(r, k))))
    return "\n".join(rows) + "\n"


def _rule(r, k):
    x = r["rules"][k]
    m = "·" if x["ok"] is None else ("✓" if x["ok"] else "✗")
    return f"{m} {fmt(x['cre'])}"
