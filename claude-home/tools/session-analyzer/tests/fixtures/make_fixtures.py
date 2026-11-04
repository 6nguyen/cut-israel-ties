#!/usr/bin/env python3
"""Regenerate the synthetic fixtures (deterministic). Run from anywhere:
    python3 tests/fixtures/make_fixtures.py
Writes projects/-fixture-proj/<SID>.jsonl + <SID>/subagents/agent-<AID>.jsonl(.meta.json).
Text sizes mimic real transcripts (~9 KB/record) so the skeleton ratio test
is meaningful; total stays < 1 MB."""
import json
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
SID = "11111111-2222-4333-8444-555555555555"
AID = "a0fixture00000001"
PROJ = "-fixture-proj"
FAKE_KEY = "sk-ant-api03-FAKEFIXTUREKEY0000000000000000000000000000000000000000000000000000000000000000000000-AAAAAA"
PROMPT = "PROMPT-SENTINEL-zebra-quartz please refactor the widget loader"
BODY = "FILE-BODY-SENTINEL-velvet-anchor"
RECIPE = "Scope caps (binding): <=100 tool calls and <=200k context."
WORDS = ("alpha beta gamma delta epsilon zeta theta kappa lambda sigma omega def class return import "
         "self value index count result error print token cache build test ").split()

rnd = random.Random(42)
_n = [0]


def uid():
    _n[0] += 1
    return "%08x-0000-4000-8000-%012x" % (_n[0], rnd.getrandbits(48))


def text(nbytes):
    out, size = [], 0
    while size < nbytes:
        w = rnd.choice(WORDS)
        out.append(w)
        size += len(w) + 1
    return " ".join(out)


def ts(i):
    return "2026-09-20T10:%02d:%02d.000Z" % (i // 60 % 60, i % 60)


BASE = {"userType": "external", "entrypoint": "claude-desktop", "cwd": "/Users/x/repo", "sessionId": SID,
        "version": "2.1.260", "slug": "fixture-slug", "isSidechain": False}


def usage(inp, cr, cw, out, think=0):
    return {"input_tokens": inp, "cache_read_input_tokens": cr, "cache_creation_input_tokens": cw,
            "output_tokens": out, "output_tokens_details": {"thinking_tokens": think}, "service_tier": "standard"}


def build(branch="feat/fixture", n_turns=40, agent=False):
    recs, t, parent = [], 0, None

    def add(r):
        nonlocal parent, t
        r = {**BASE, **r}
        r.setdefault("uuid", uid())
        r.setdefault("timestamp", ts(t))
        r.setdefault("gitBranch", branch)
        r["parentUuid"] = parent
        if agent:
            r["isSidechain"] = True
            r["agentId"] = AID
        parent = r["uuid"]
        t += 7
        recs.append(r)
        return r

    if not agent:
        recs.append({"type": "custom-title", "customTitle": "Fixture session title", "sessionId": SID})
        recs.append({"type": "mode", "mode": "normal", "sessionId": SID})
        add({"type": "user", "origin": {"kind": "human"}, "promptSource": "sdk",
             "message": {"role": "user", "content": PROMPT + " key=" + FAKE_KEY + " " + text(3000)}})
    else:
        add({"type": "user", "message": {"role": "user", "content": RECIPE + " " + text(4000)}})
    model = "claude-opus-5"
    for i in range(n_turns):
        rid = "req_%s_%03d" % ("agent" if agent else "main", i)
        if not agent and i == 20:
            model = "claude-sonnet-5"  # model_switch event
        tool_id = "toolu_%s_%03d" % ("a" if agent else "m", i)
        u = usage(3, 40000 + 1000 * i, 500 + i, 200 + i, 50)
        # Several records share one requestId (dedupe; usage repeated).
        add({"type": "assistant", "requestId": rid, "effort": "high",
             "message": {"model": model, "id": "msg_%s" % rid, "role": "assistant", "type": "message",
                         "content": [{"type": "thinking", "thinking": text(800), "signature": "sig"}],
                         "stop_reason": None, "usage": u}})
        add({"type": "assistant", "requestId": rid, "effort": "high",
             "message": {"model": model, "id": "msg_%s" % rid, "role": "assistant", "type": "message",
                         "content": [{"type": "text", "text": text(600)}], "stop_reason": None, "usage": u}})
        if not agent and i == 5:
            inp = {"description": "Fixture agent", "subagent_type": "general-purpose",
                   "prompt": "Do the thing. " + text(1500) + " " + RECIPE}
            name = "Agent"
            tool_id = "toolu_spawn_agent"
        elif i % 4 == 0:
            inp, name = {"command": "cd /Users/x/repo && cat backend/.env"}, "Bash"
        elif i % 4 == 1:
            inp, name = {"command": "scripts/quiet-check.sh pytest"}, "Bash"
        elif i % 4 == 2:
            inp, name = {"file_path": "/Users/x/repo/app.py"}, "Read"
        else:
            inp, name = {"pattern": "def main", "path": "."}, "Grep"
        add({"type": "assistant", "requestId": rid, "effort": "high",
             "message": {"model": model, "id": "msg_%s" % rid, "role": "assistant", "type": "message",
                         "content": [{"type": "tool_use", "id": tool_id, "name": name, "input": inp}],
                         "stop_reason": "tool_use", "usage": u}})
        body = BODY + "\nANTHROPIC_API_KEY=" + FAKE_KEY + "\n" + text(6000)
        add({"type": "user", "sourceToolAssistantUUID": parent,
             "toolUseResult": {"stdout": body, "stderr": "", "interrupted": False, "isImage": False},
             "message": {"role": "user", "content": [{"type": "tool_result", "tool_use_id": tool_id,
                                                      "content": body, "is_error": False}]}})
        add({"type": "attachment", "attachment": {"type": "total_tokens_reminder", "content": text(300)}})
        if not agent and i == 10:
            add({"type": "user", "origin": {"kind": "human"}, "promptSource": "sdk",
                 "message": {"role": "user", "content": "<command-name>/compact</command-name> " + text(100)}})
            add({"type": "system", "subtype": "compact_boundary", "content": "Conversation compacted", "level": "info",
                 "compactMetadata": {"trigger": "manual", "preTokens": 816209, "postTokens": 13543, "durationMs": 130303}})
            add({"type": "user", "isCompactSummary": True, "message": {"role": "user", "content": text(5000)}})
        if not agent and i == 30:
            recs.append({"type": "pr-link", "sessionId": SID, "prNumber": "75", "prUrl": "https://github.com/o/r/pull/75",
                         "prRepository": "o/r", "timestamp": ts(t)})
            recs.append({"type": "future-record-type", "sessionId": SID, "blob": text(200)})
    if agent:
        add({"type": "assistant", "isApiErrorMessage": True, "error": "rate_limit",
             "message": {"model": "<synthetic>", "role": "assistant", "type": "message",
                         "content": [{"type": "text", "text": "API Error: 429 rate limit reached"}]}})
    return recs


def write(path, recs):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        for r in recs:
            f.write(json.dumps(r) + "\n")


def main():
    base = HERE / "projects" / PROJ
    write(base / f"{SID}.jsonl", build())
    sub = base / SID / "subagents"
    write(sub / f"agent-{AID}.jsonl", build(agent=True, n_turns=12))
    (sub / f"agent-{AID}.meta.json").write_text(json.dumps(
        {"agentType": "general-purpose", "description": "Fixture agent", "toolUseId": "toolu_spawn_agent", "spawnDepth": 1}))


if __name__ == "__main__":
    main()
