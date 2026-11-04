"""Text-free skeletons (PRD §6.2).

Allow-list: record types, ids, timestamps, model, effort, tool names,
gitBranch, usage, compactMetadata and ingest-time labels (keys starting with
"_"). Every other string becomes its length (an int). Tool inputs, tool
results, attachments and toolUseResult collapse to byte lengths plus a few
booleans. Everything downstream (sa.ingest.Extractor) reads ONLY skeleton
records, so `reindex` from skeletons reproduces the same non-text rows by
construction.
"""
import hashlib
import json
import re

from . import owner

# Top-level / nested keys whose string values are kept verbatim.
KEEP_STR = {
    "type", "subtype", "uuid", "parentUuid", "logicalParentUuid", "requestId",
    "timestamp", "model", "effort", "gitBranch", "version", "agentId",
    "toolUseID", "tool_use_id", "sourceToolAssistantUUID", "promptId",
    "leafUuid", "operation", "level", "stop_reason", "role", "kind",
    "promptSource", "prNumber", "prRepository", "mode", "entrypoint",
    "userType", "permissionMode", "agentType", "toolUseId", "trigger",
}
# Keys whose whole (structured) value is kept: numbers/ids only by nature.
KEEP_WHOLE = {"usage", "compactMetadata"}
# Keys dropped entirely (redundant per file, or paths).
DROP = {"sessionId", "slug", "cwd", "message_id"}
IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,40}$")
SLASH = re.compile(r"<command-name>\s*(/[A-Za-z0-9:_.-]{1,40})\s*</command-name>")
RECIPE_MARK = "Scope caps (binding)"

CMD_CLASSES = ("grep", "read", "quiet-check", "raw-build", "raw-test", "git", "gh", "other")
_RAW_TEST = re.compile(r"\b(pytest|playwright\s+test|vitest|jest|xcodebuild\b[^|;&]*\btest\b|go\s+test|cargo\s+test|npm\s+(run\s+)?test|swift\s+test|unittest)\b")
_RAW_BUILD = re.compile(r"\b(xcodebuild|npm\s+run\s+build|next\s+build|swift\s+build|cargo\s+build|go\s+build|make\b|tsc\b|gradle)\b")
_GREP = re.compile(r"^(grep|rg|ag|find|fd|ls|tree|wc)\b")
_READ = re.compile(r"^(cat|sed|head|tail|less|more|bat|nl|awk|jq)\b")


def _first_cmd(cmd: str) -> str:
    c = cmd.strip()
    c = re.sub(r"^(cd\s+[^;&|]+(&&|;)\s*)+", "", c)  # leading `cd X &&`
    c = re.sub(r"^([A-Z_][A-Z0-9_]*=\S*\s+)+", "", c)  # leading env assignments
    return c


def cmd_class(tool: str, tool_input) -> str:
    """Ingest-time label for tool_calls.cmd_class (§6.2)."""
    if tool in ("Grep", "Glob"):
        return "grep"
    if tool == "Read":
        return "read"
    if tool != "Bash":
        return None
    cmd = tool_input.get("command", "") if isinstance(tool_input, dict) else ""
    if not isinstance(cmd, str):
        return "other"
    if "quiet-check" in cmd:
        return "quiet-check"
    if _RAW_TEST.search(cmd):
        return "raw-test"
    if _RAW_BUILD.search(cmd):
        return "raw-build"
    c = _first_cmd(cmd)
    if re.match(r"^git\b", c):
        return "git"
    if re.match(r"^gh\b", c):
        return "gh"
    if _GREP.match(c):
        return "grep"
    if _READ.match(c):
        return "read"
    return "other"


_GIT_PUSH = re.compile(r"(^|[;&|]\s*|\s)git\s+(-C\s+\S+\s+|-c\s+\S+\s+)*push\b")
_GIT_COMMIT = re.compile(r"(^|[;&|]\s*|\s)git\s+(-C\s+\S+\s+|-c\s+\S+\s+)*commit\b")
_PR_CREATE = re.compile(r"(^|[;&|]\s*|\s)gh\s+pr\s+create\b")
_ENOSPC = re.compile(r"No space left on device|ENOSPC")
_USAGE_PCT = re.compile(r"(\d{1,3})%\s*used", re.I)
_CTX_SNAP = re.compile(r"(\d+(?:\.\d+)?)k\s*/\s*(\d+(?:\.\d+)?)k\s*tokens", re.I)


def h12(s: str) -> str:
    """Text-free identity for a path or command (waste counters, §6.3a)."""
    return hashlib.sha1(s.encode("utf-8", "surrogatepass")).hexdigest()[:12]


def git_op(cmd: str):
    if not isinstance(cmd, str):
        return None
    if _PR_CREATE.search(cmd):
        return "pr_create"
    if _GIT_PUSH.search(cmd):
        return "push"
    if _GIT_COMMIT.search(cmd):
        return "commit"
    return None


def _tool_labels(name, inp, out):
    if not isinstance(inp, dict):
        return
    if name in ("Read", "Edit", "Write", "MultiEdit", "NotebookEdit"):
        fp = inp.get("file_path") or inp.get("notebook_path")
        if isinstance(fp, str):
            out["_arg_hash"] = h12(fp)
    elif name == "Bash" and isinstance(inp.get("command"), str):
        cmd = inp["command"]
        out["_arg_hash"] = h12(" ".join(cmd.split()))
        pats = owner.patterns_in(cmd)
        if pats:
            out["_opat"] = pats[0]  # owner_rules id: an automated instance of a manual-step pattern
        op = git_op(cmd)
        if op:
            out["_git_op"] = op
    elif name == "Skill" and isinstance(inp.get("skill"), str):
        sk = inp["skill"]
        if len(sk) <= 60 and IDENT.match(sk.replace("-", "_").replace(":", "_").replace(".", "_")):
            out["_skill"] = sk
    elif name in ("Agent", "Task"):
        out["_bg"] = bool(inp.get("run_in_background"))


def _blen(v) -> int:
    if isinstance(v, str):
        return len(v.encode("utf-8", "surrogatepass"))
    return len(json.dumps(v, ensure_ascii=False).encode("utf-8", "surrogatepass"))


def _generic(v, key=None):
    if isinstance(v, str):
        return v if key in KEEP_STR else len(v)
    if isinstance(v, dict):
        out = {}
        for k, x in v.items():
            if k in DROP:
                continue
            if not IDENT.match(k):
                out.setdefault("_odd_keys", 0)
                out["_odd_keys"] += 1
                continue
            out[k] = x if k in KEEP_WHOLE else _generic(x, k)
        return out
    if isinstance(v, list):
        return [_generic(x, key) for x in v]
    return v  # numbers, bools, None


def _content_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(b.get("text", "") for b in content if isinstance(b, dict) and isinstance(b.get("text"), str))
    return ""


def _is_image(content) -> bool:
    return isinstance(content, list) and any(isinstance(b, dict) and b.get("type") == "image" for b in content)


def _block(b):
    if not isinstance(b, dict):
        return _blen(b)
    t = b.get("type")
    if t == "tool_use":
        inp = b.get("input")
        out = {"type": t, "id": b.get("id"), "name": b.get("name"), "input": _blen(inp)}
        cc = cmd_class(b.get("name"), inp)
        if cc:
            out["_cmd_class"] = cc
        if b.get("name") in ("Agent", "Task") and isinstance(inp, dict):
            out["_has_recipe"] = RECIPE_MARK in str(inp.get("prompt", ""))
            if isinstance(inp.get("subagent_type"), str) and IDENT.match(inp["subagent_type"].replace("-", "_")):
                out["_subagent_type"] = inp["subagent_type"]
        _tool_labels(b.get("name"), inp, out)
        return out
    if t == "tool_result":
        c = b.get("content")
        txt = _content_text(c)
        out = {"type": t, "tool_use_id": b.get("tool_use_id"), "is_error": bool(b.get("is_error")),
               "content": _blen(txt) if not _is_image(c) else _blen(c), "_image": _is_image(c),
               "_lines": txt.count("\n") + (1 if txt and not txt.endswith("\n") else 0)}
        if _ENOSPC.search(txt):
            out["_enospc"] = True
        return out
    if t in ("text", "thinking", "redacted_thinking"):
        return {"type": t, "len": _blen(b.get("text") or b.get("thinking") or b.get("data") or "")}
    if t == "image":
        return {"type": t, "len": _blen(b)}
    return {"type": t if isinstance(t, str) and IDENT.match(t) else "?", "len": _blen(b)}


_RL = re.compile(r"\b429\b|rate.?limit|usage limit|limit reached|too many requests", re.I)


def _api_err_label(rec) -> str:
    """rate_limit | api_error | None, computed from text at ingest time."""
    t = rec.get("type")
    if t == "assistant":
        m = rec.get("message") or {}
        if not (rec.get("isApiErrorMessage") or rec.get("error") or m.get("model") == "<synthetic>"):
            return None
        blob = json.dumps(rec.get("error") or "") + _content_text(m.get("content"))
    elif t == "system" and rec.get("subtype") == "api_error":
        blob = json.dumps(rec.get("error") or rec.get("cause") or "")
    else:
        return None
    return "rate_limit" if _RL.search(blob) else "api_error"


def skeletonize(rec: dict) -> dict:
    t = rec.get("type")
    out = {}
    for k, v in rec.items():
        if k in DROP:
            continue
        if k == "message" and isinstance(v, dict):
            msg = {}
            for mk, mv in v.items():
                if mk == "content":
                    msg["content"] = [_block(b) for b in mv] if isinstance(mv, list) else _blen(mv)
                elif mk in KEEP_WHOLE:
                    msg[mk] = mv
                elif mk in ("model", "id", "role", "stop_reason", "type"):
                    msg[mk] = mv if isinstance(mv, (str, type(None))) else _generic(mv)
                else:
                    msg[mk] = _blen(mv) if mv is not None else None
            out["message"] = msg
        elif k == "toolUseResult":
            r = {"len": _blen(v)}
            if isinstance(v, dict):
                for bk in ("isImage", "interrupted", "isAsync"):
                    if isinstance(v.get(bk), bool):
                        r[bk] = v[bk]
                if isinstance(v.get("agentId"), str) and IDENT.match(v["agentId"]):
                    r["agentId"] = v["agentId"]
            out[k] = r
        elif k == "attachment" and isinstance(v, dict):
            at = v.get("type")
            out[k] = {"type": at if isinstance(at, str) and IDENT.match(at) else "?", "len": _blen(v)}
        elif k in KEEP_WHOLE:
            out[k] = v
        else:
            out[k] = _generic(v, k)
    lab = _api_err_label(rec)
    if lab:
        out["_api_err"] = lab
    if t == "user":
        c = (rec.get("message") or {}).get("content")
        text = c if isinstance(c, str) else _content_text([b for b in (c or []) if isinstance(b, dict) and b.get("type") == "text"]) if isinstance(c, list) else ""
        m = SLASH.search(text[:400]) if text else None
        if m:
            out["_slash"] = m.group(1)
        out["_chars"] = len(text)
        uo = owner.user_labels(text) if text else None
        if _is_image(c) and (rec.get("origin") or {}).get("kind") == "human":
            uo = dict(uo or {}, img=1)  # owner attached a screenshot
        if uo:
            out["_uo"] = uo  # owner-action cue booleans (§5), text-free
    elif t == "assistant":
        c = (rec.get("message") or {}).get("content")
        text = c if isinstance(c, str) else _content_text([b for b in (c or []) if isinstance(b, dict) and b.get("type") == "text"]) if isinstance(c, list) else ""
        ao = owner.assistant_labels(text) if text else None
        if ao is not None:
            out["_ao"] = ao
    if t in ("user", "system"):
        _snapshots(rec, out)
    return out


def _snapshots(rec, out):
    """/usage and /context outputs -> numbers (usage_snapshot / context_snapshot)."""
    c = rec.get("content")
    if not isinstance(c, str):
        c = (rec.get("message") or {}).get("content")
        c = c if isinstance(c, str) else _content_text(c)
    if not c or "local-command-stdout" not in c:
        return
    m = _USAGE_PCT.search(c)
    if m and "usage" in c.lower() or (m and "session" in c.lower()):
        out["_usage_pct"] = int(m.group(1))
    m = _CTX_SNAP.search(c)
    if m:
        out["_ctx_snap"] = [float(m.group(1)) * 1000, float(m.group(2)) * 1000]


def text_labels(rec: dict) -> dict:
    """Labels that ARE text (index-only, never in skeletons): session title."""
    if rec.get("type") == "custom-title" and isinstance(rec.get("customTitle"), str):
        return {"title": rec["customTitle"][:200]}
    return {}


def skeleton_meta(meta: dict) -> dict:
    out = {}
    for k in ("agentType", "toolUseId", "spawnDepth", "model"):
        v = meta.get(k)
        if isinstance(v, (int, float, bool)) or (isinstance(v, str) and len(v) <= 80 and IDENT.match(v.replace("-", "_").replace(".", "_"))):
            out[k] = v
    if isinstance(meta.get("description"), str):
        out["description"] = len(meta["description"])
    return out
