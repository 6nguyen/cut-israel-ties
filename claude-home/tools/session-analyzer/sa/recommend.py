"""§6.7 deterministic recommendations: ≤3 per report, each mapped to a §6.7a
catalog template (or `needs-session`) with its evidence numbers.

Score (CRE units) = CRE saved − projected cost, where minutes convert at one
window's ceiling per 300 min (the §6.5 exchange rate). Loosen candidates score
the minutes they buy back minus the CRE they give up. needs-session items pay
an estimated 1M CRE session and are discounted so they rank below catalog
items of similar saving."""
import json

from . import analyze as A
from . import catalog, paths
from .verdict import METRICS

SHARE = 0.05             # finding threshold: ≥5% of scope CRE or of lead time
SESSION_CRE = 1e6        # §6.9 cost table: a needs-session item, usually ≤1M CRE
SESSION_DISCOUNT = 0.8
AUTOCOMPACT_LOOSE = 300_000
AUTOCOMPACT_TIGHT = 160_000
fmt = A.fmt_tok

# violated rule -> (template, params, expect, change text)
TIGHTEN = {
    "5.1": ("set-key", {"key": "autoCompactWindow", "value": A.AUTOCOMPACT}, "cre:down"),
    "5.13": ("enforce-rule", {"rule": "5.13"}, "cre:down"),
    "5.7": ("connector-off", {}, "cre:down"),
}
SESSION_FIX = {
    "5.2": "pin one model per session (find the switch trigger)",
    "5.3": "split mixed-branch sessions (one workstream each)",
    "5.4": "pace heavy agents across windows",
    "5.5": "add the spawn recipe to agent prompts that lack it",
    "5.6": "move image/large-Write payloads into agents",
    "5.9": "fold agent chains into one session's commits",
    "5.10": "cap research returns at 40 lines",
}


def _settings_value(key):
    try:
        d = json.loads((paths.claude_home() / catalog.SETTINGS).read_text())
    except (OSError, ValueError):
        return None
    for k in key.split("."):
        d = d.get(k) if isinstance(d, dict) else None
    return d


def _target_label(template, p):
    if template == "set-key":
        return f"~/.claude/{p['file']}"
    if template == "connector-off":
        return "Claude app → Settings → Connectors"
    return p.get("file", "")


def _change(template, p):
    if template == "set-key":
        return f"set {p['key']}={p['value']} in {_target_label(template, p)}"
    if template == "enforce-rule":
        return f"install {p['hook']} + drop rule {p['rule']} prose from {p['file']}"
    if template == "drop-rule":
        return f"drop rule {p['rule']} lines from {p['file']}"
    if template == "shorten-rule":
        return f"shorten rule {p['rule']} in {p['file']}: \"{catalog.SHORT[p['rule']][0][2:60]}…\""
    if template == "connector-off":
        return "turn off unused connectors (Claude app → Settings → Connectors)"
    return p.get("what", "")


def drop_eligibility(standing, res):
    """THE drop gate, shared by the report's no-effect line and TOP 3 drop
    items so they cannot diverge. `standing` = verdict.standing_detail()
    (a bare list = already-gated flags, for tests). A flagged rule is
    droppable only if it has prose text and owns ≥1 line no other rule
    shares; rules that failed the effective-window / PR minimum gate are
    `insufficient`."""
    if not isinstance(standing, dict):
        standing = {"flag": list(standing), "insufficient": [], "why": ""}
    out = {"drop": [], "kept": [], "insufficient": list(standing["insufficient"]), "why": standing["why"]}
    for k in standing["flag"]:
        ok = (res["rules"].get(k) or {}).get("text_cre") and catalog.editable("drop-rule", k)
        out["drop" if ok else "kept"].append(k)
    return out


def candidates(res, standing=()):
    out = []
    cre, eou = res["cre"] or 0.0, res["eou"] or 0.0
    lead_min = (res["lead_s"] or 0) / 60.0
    le = res["ledger_eou"] or 0.0
    rate = (res["ceiling"] or A.CEILING_EST) / 300.0  # CRE per minute
    bk = res["buckets"]
    wc = res["win_classes"]
    rules = res["rules"]
    per = (lambda s: s / 60.0 / le) if le else (lambda s: 0.0)

    def add(kind, rule, template, params, expect, score, evidence):
        if not catalog.editable(template, rule):  # never touch lines another rule shares
            return
        p = catalog.params_for(template, **params) if template != "needs-session" else dict(params)
        out.append({"kind": kind, "rule": rule, "template": template, "params": p, "expect": expect,
                    "score": float(score), "evidence": evidence, "target": _target_label(template, p),
                    "change": _change(template, p)})

    # tighten: violated rules with attributed cost ≥5% of scope CRE
    for k in sorted(rules, key=A._rk):
        r = rules[k]
        if r["ok"] is not False or not cre or r["cre"] < SHARE * cre:
            continue
        ev = f"rule {k} {A.RULE_NAMES[k]}: {r['detail']}, −{fmt(r['cre'])} CRE ({100 * r['cre'] / cre:.0f}% of scope)"
        if k in TIGHTEN:
            t, p, ex = TIGHTEN[k]
            if t == "set-key" and _settings_value(p["key"]) == p["value"]:
                add("tighten", k, "needs-session", {"what": f"{p['key']} already {p['value']}; find what still "
                                                            f"exceeds it"}, ex, SESSION_DISCOUNT * r["cre"] - SESSION_CRE, ev)
                continue
            add("tighten", k, t, p, ex, r["cre"], ev)
        else:
            add("tighten", k, "needs-session", {"what": SESSION_FIX.get(k, f"fix rule {k}")}, "cre:down",
                SESSION_DISCOUNT * r["cre"] - SESSION_CRE, ev)
    # loosen: over-tight rules (minutes outweigh the CRE they save)
    for k in res["over_tight"]:
        r = rules[k]
        m = r.get("minutes", 0.0)
        ev = (f"rule {k} {A.RULE_NAMES[k]} over-tight: +{m / eou if eou else m:.0f} min/EOU vs "
              f"{fmt(r.get('saved') or 0)} CRE saved, regime {res['regime']}")
        if k == "5.1":
            add("loosen", k, "set-key", {"key": "autoCompactWindow", "value": AUTOCOMPACT_LOOSE}, "lead:down",
                m * rate - (r.get("saved") or 0), ev)
        elif k in catalog.SHORT:
            add("loosen", k, "shorten-rule", {"rule": k}, "lead:down", m * rate - (r.get("saved") or 0), ev)
    # loosen: headroom windows while token-discipline minutes are ≥5% of lead time
    if lead_min and wc.get("headroom", 0) >= 2:
        ser = bk.get("serialization", 0) / 60.0
        if ser >= SHARE * lead_min:
            add("loosen", "5.4", "shorten-rule", {"rule": "5.4"}, "lead:down", ser * rate,
                f"headroom {wc['headroom']}/{res['active_windows']} windows while serialization "
                f"{per(bk.get('serialization', 0)):.0f} min/EOU ({100 * ser / lead_min:.0f}% of lead)")
        cr = (bk.get("compaction", 0) + bk.get("reorientation", 0)) / 60.0
        if cr >= SHARE * lead_min:
            add("loosen", "5.1", "set-key", {"key": "autoCompactWindow", "value": AUTOCOMPACT_LOOSE}, "lead:down",
                cr * rate, f"compaction+reorient {per(bk.get('compaction', 0) + bk.get('reorientation', 0)):.0f} "
                           f"min/EOU ({100 * cr / lead_min:.0f}% of lead) with headroom {wc['headroom']}/"
                           f"{res['active_windows']} windows")
    # tighten: limited windows with 429 stalls ≥5% of lead time
    if lead_min and wc.get("limited", 0) >= 2:
        rl = bk.get("rate_limited", 0) / 60.0
        if rl >= SHARE * lead_min:
            add("tighten", "5.1", "set-key", {"key": "autoCompactWindow", "value": AUTOCOMPACT_TIGHT}, "lead:down",
                rl * rate, f"limited {wc['limited']}/{res['active_windows']} windows, 429 stalls "
                           f"{per(bk.get('rate_limited', 0)):.0f} min/EOU")
    # standing no-effect checks → drop the rule's prose
    for k in drop_eligibility(standing, res)["drop"]:
        r = rules.get(k) or {}
        if r.get("text_cre"):
            add("drop", k, "drop-rule", {"rule": k}, "cre:down", r["text_cre"],
                f"rule {k} followed ≥80% with no CRE/EOU difference over 4 weeks; text costs {fmt(r['text_cre'])} CRE")
    # waste: cache-TTL rewrites
    w = res["waste"]
    if cre and w.get("ttl_cre", 0) >= SHARE * cre:
        add("tighten", "ttl", "needs-session", {"what": "keep turns <5 min apart or /compact before long pauses"},
            "cre:down", SESSION_DISCOUNT * w["ttl_cre"] - SESSION_CRE,
            f"cache-TTL rewrites {w['ttl_rewrites']} (−{fmt(w['ttl_cre'])} CRE, {100 * w['ttl_cre'] / cre:.0f}% of scope)")
    return out


def _key(c):
    p = c["params"]
    return (c["template"], p.get("key") or p.get("rule") or p.get("what") or "")


def rank(res, standing=(), live=()):
    """≤3 recommendations, deterministic. `live` = live experiments; a
    candidate whose expected metric already has one is held back (one
    experiment per metric), as is one that is already applied."""
    busy = {e["metric"] for e in live}
    applied = {(e["template"], json.loads(e["params"] or "{}").get("key") or
                json.loads(e["params"] or "{}").get("rule") or "") for e in live if e.get("template")}
    best = {}
    for c in candidates(res, standing):
        if c["score"] <= 0:
            continue
        k = _key(c)
        if k in applied or c["expect"].split(":")[0] in busy and c["template"] != "connector-off":
            continue
        if k not in best or c["score"] > best[k]["score"]:
            best[k] = c
    order = sorted(best.values(), key=lambda c: (-round(c["score"]), c["template"] == "needs-session", _key(c)))
    out = []
    for i, c in enumerate(order[:3], 1):
        c = dict(c, id=f"R{i}", slug=catalog.slug(f"{c['kind']}-{c['rule']}-{_key(c)[1]}"))
        out.append(c)
    return out


def lines(recs):
    if not recs:
        return ["TOP 3    none: no finding ≥5% of scope CRE or lead time"]
    out = []
    for i, c in enumerate(recs):
        head = "TOP 3    " if i == 0 else "         "
        act = "needs-session (est. 1M CRE)" if c["template"] == "needs-session" else (
            "owner step" if c["template"] == "connector-off" else f"`session-analyzer apply {c['id']}`")
        m, d = c["expect"].split(":")
        out.append(f"{head}{c['id']} {c['kind']} {c['rule']}: {c['change']} · expect {METRICS[m]} {d} · {act}")
        out.append(f"            evidence: {c['evidence']}")
    return out
