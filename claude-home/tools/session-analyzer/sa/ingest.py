"""ingest: raw transcript -> skeleton (xz) + index rows.

Pipeline per record: raw --skeletonize--> skeleton --Extractor--> rows.
The Extractor reads skeleton records only, so `reindex` (skeleton ->
Extractor) yields the same non-text rows. Text labels (session title, agent
description) come from raw only (`text_labels`, meta description).

Idempotent: rows keyed by requestId / tool_use_id / record uuid. Incremental:
per-file byte offset + size + mtime in `files`; a grown file is read from its
offset and its skeleton chunk is appended as a new xz stream.
"""
import json
import lzma
import os
from pathlib import Path

from . import PARSER_VERSION, cre, disk, owner, paths, static, store
from .parse import SessionSource, iter_records, read_meta
from .skeleton import skeletonize, skeleton_meta, text_labels

KNOWN_TYPES = {
    "user", "assistant", "attachment", "system", "custom-title", "mode", "pr-link",
    "queue-operation", "last-prompt", "bridge-session", "atis-latch", "summary",
    "file-history-snapshot", "agent-name", "tag",
}
SKEL_SEP = (",", ":")
# v2 "cache rebuild": a non-first request that re-writes >150k of prefix while
# reading <50k (only the system prompt survived). Matches the v2 script.
REBUILD_WRITE, REBUILD_MAX_READ = 150_000, 50_000
ASK_TOOLS = ("AskUserQuestion", "ExitPlanMode")


def is_cache_rebuild(cache_read, cache_write) -> bool:
    return cache_write > REBUILD_WRITE and cache_read < REBUILD_MAX_READ


class Extractor:
    """Skeleton records -> index rows for one session. Agent id '' = main thread."""

    def __init__(self, con, session_id):
        self.con = con
        self.sid = session_id
        self.last_model = {}
        self.unknown = 0
        self.ts_min = None
        self.ts_max = None
        self.first_branch = None
        self.has_req = {}
        self.env_info = None
        # owner-action context (§5): what the owner is answering. Persisted in
        # meta so an incremental ingest classifies its first new turn the same
        # way a full rebuild would.
        r = con.execute("SELECT value FROM meta WHERE key=?", (f"owner_ctx:{session_id}",)).fetchone()
        self.oc = json.loads(r[0]) if r else {"n": 0, "a": {}, "ask": [], "err": 0, "int": 0, "last": None}

    def env(self, e):
        self.env_info = e

    def _has_prev(self, aid):
        if aid not in self.has_req:
            self.has_req[aid] = self.con.execute(
                "SELECT 1 FROM requests WHERE session_id=? AND IFNULL(agent_id,'')=? LIMIT 1", (self.sid, aid)).fetchone() is not None
        return self.has_req[aid]

    def _prev_model(self, aid):
        if aid not in self.last_model:
            r = self.con.execute(
                "SELECT model FROM requests WHERE session_id=? AND IFNULL(agent_id,'')=? ORDER BY ts DESC, rowid DESC LIMIT 1",
                (self.sid, aid)).fetchone()
            self.last_model[aid] = r[0] if r else None
        return self.last_model[aid]

    def _event(self, key, ts, kind, detail, aid):
        self.con.execute("INSERT OR IGNORE INTO events(session_id,ts,kind,detail,key,agent_id) VALUES(?,?,?,?,?,?)",
                         (self.sid, ts, kind, detail, key, aid or None))

    def meta(self, aid, m):
        self.con.execute(
            "INSERT INTO agents(agent_id,session_id,agent_type,tool_use_id,spawn_depth) VALUES(?,?,?,?,?) "
            "ON CONFLICT(agent_id) DO UPDATE SET agent_type=excluded.agent_type, tool_use_id=excluded.tool_use_id, "
            "spawn_depth=excluded.spawn_depth",
            (aid, self.sid, m.get("agentType"), m.get("toolUseId"), m.get("spawnDepth")))

    def record(self, aid, r):
        t = r.get("type")
        ts = r.get("timestamp") if isinstance(r.get("timestamp"), str) else None
        if ts:
            self.ts_min = ts if self.ts_min is None or ts < self.ts_min else self.ts_min
            self.ts_max = ts if self.ts_max is None or ts > self.ts_max else self.ts_max
        if not aid and self.first_branch is None and isinstance(r.get("gitBranch"), str) and r["gitBranch"]:
            self.first_branch = r["gitBranch"]
        if t not in KNOWN_TYPES:
            self.unknown += 1
            return
        uuid = r.get("uuid") if isinstance(r.get("uuid"), str) else None
        if r.get("_api_err") and uuid:
            self._event(f"{uuid}:{r['_api_err']}", ts, r["_api_err"], None, aid)
            if not aid:
                self.oc["err"] = 1
        if t == "assistant":
            self._assistant(aid, r, ts, uuid)
        elif t == "user":
            self._user(aid, r, ts, uuid)
        elif t == "system" and r.get("subtype") != "compact_boundary":
            self._snap(aid, r, ts, uuid)
        elif t == "system" and r.get("subtype") == "compact_boundary":
            cm = r.get("compactMetadata") or {}
            detail = json.dumps({k: cm.get(k) for k in ("trigger", "preTokens", "postTokens", "durationMs")}, sort_keys=True)
            self._event(f"{uuid}:compact", ts, "compact", detail, aid)
        elif t == "pr-link":
            try:
                n = int(r.get("prNumber"))
            except (TypeError, ValueError):
                return
            self.con.execute("INSERT OR IGNORE INTO pr_links VALUES(?,?,?,?)", (self.sid, n, r.get("prRepository"), ts))

    def _owner_assistant(self, r, ts):
        oc = self.oc
        ao = r.get("_ao")
        content = (r.get("message") or {}).get("content") or []
        if any(isinstance(b, dict) and b.get("type") == "tool_use" for b in content):
            oc["a"].pop("q", None)  # text before a tool call is narration; the final message decides
            oc["a"].pop("offer", None)
        if ao is not None and not r.get("_api_err"):
            a = oc["a"]
            for k in ("q", "offer"):
                if ao.get(k):
                    a[k] = 1
            # the latest text block's shape, kept across trailing tool calls
            for k in ("lq", "opts"):
                a.pop(k, None)
            if ao.get("q") or ao.get("offer"):
                a["lq"] = 1
            if ao.get("opts"):
                a["opts"] = 1
            if ao.get("alen"):
                a["alen"] = ao["alen"]
            if ao.get("handoff"):
                oc["ho"] = 1  # a hand-off is open until the owner reports back or moves on
                oc["hpats"] = ao.get("pats", [])
                a["handoff"] = 1
                a["pats"] = sorted(set(a.get("pats", [])) | set(ao.get("pats", [])), key=owner.PATTERN_ORDER.get)
        for b in (r.get("message") or {}).get("content") or []:
            if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") in ASK_TOOLS and b.get("id"):
                oc["ask"].append(b["id"])
        if ts:
            oc["last"] = ts

    def _assistant(self, aid, r, ts, uuid):
        if not aid:
            self._owner_assistant(r, ts)
        m = r.get("message") or {}
        u = m.get("usage")
        model = m.get("model")
        rid = r.get("requestId") or uuid
        if isinstance(u, dict) and rid and model != "<synthetic>":
            inp = int(u.get("input_tokens") or 0)
            cr = int(u.get("cache_read_input_tokens") or 0)
            cw = int(u.get("cache_creation_input_tokens") or 0)
            out = int(u.get("output_tokens") or 0)
            think = int((u.get("output_tokens_details") or {}).get("thinking_tokens") or 0)
            prev = self._prev_model(aid)  # before the insert, which would shadow it
            had_prev = self._has_prev(aid)
            cur = self.con.execute(
                "INSERT OR IGNORE INTO requests VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (rid, self.sid, aid or None, ts, model, r.get("effort"), inp, cr, cw, out, think,
                 inp + cr + cw, cre(inp, cr, cw, out), r.get("gitBranch")))
            if cur.rowcount:  # first record of this requestId only (dedupe)
                if prev and model and prev != model:
                    self._event(f"{uuid or rid}:model_switch", ts, "model_switch", f"{prev}->{model}", aid)
                if model:
                    self.last_model[aid] = model
                if had_prev and is_cache_rebuild(cr, cw):
                    self._event(f"{rid}:cache_rebuild", ts, "cache_rebuild",
                                json.dumps({"read": cr, "write": cw}, sort_keys=True), aid)
                self.has_req[aid] = True
        for b in m.get("content") or []:
            if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("id"):
                hr = b.get("_has_recipe")
                bg = b.get("_bg")
                self.con.execute(
                    "INSERT INTO tool_calls(session_id,agent_id,ts,name,input_bytes,cmd_class,tool_use_id,has_recipe,"
                    "arg_hash,git_op,branch,skill,background,owner_pattern) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tool_use_id) DO UPDATE SET session_id=excluded.session_id, "
                    "agent_id=excluded.agent_id, ts=excluded.ts, name=excluded.name, input_bytes=excluded.input_bytes, "
                    "cmd_class=excluded.cmd_class, has_recipe=excluded.has_recipe, arg_hash=excluded.arg_hash, "
                    "git_op=excluded.git_op, branch=excluded.branch, skill=excluded.skill, background=excluded.background, "
                    "owner_pattern=excluded.owner_pattern",
                    (self.sid, aid or None, ts, b.get("name"), b.get("input"), b.get("_cmd_class"), b["id"],
                     None if hr is None else int(hr), b.get("_arg_hash"), b.get("_git_op"), r.get("gitBranch"),
                     b.get("_skill"), None if bg is None else int(bg), b.get("_opat")))

    def _snap(self, aid, r, ts, uuid):
        if uuid and isinstance(r.get("_usage_pct"), int):
            self._event(f"{uuid}:usage_snapshot", ts, "usage_snapshot", str(r["_usage_pct"]), aid)
        if uuid and isinstance(r.get("_ctx_snap"), list):
            self._event(f"{uuid}:context_snapshot", ts, "context_snapshot", json.dumps(r["_ctx_snap"]), aid)

    def _user(self, aid, r, ts, uuid):
        self._snap(aid, r, ts, uuid)
        m = r.get("message") or {}
        c = m.get("content")
        if isinstance(c, list):
            for b in c:
                if isinstance(b, dict) and b.get("type") == "tool_result" and b.get("tool_use_id"):
                    self.con.execute(
                        "INSERT INTO tool_calls(session_id,agent_id,tool_use_id,result_bytes,is_image,is_error,result_ts,"
                        "result_lines,enospc) "
                        "VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(tool_use_id) DO UPDATE SET result_bytes=excluded.result_bytes, "
                        "is_image=excluded.is_image, is_error=excluded.is_error, result_ts=excluded.result_ts, "
                        "result_lines=excluded.result_lines, enospc=excluded.enospc",
                        (self.sid, aid or None, b["tool_use_id"], b.get("content"), int(bool(b.get("_image"))),
                         int(bool(b.get("is_error"))), ts, b.get("_lines"), int(bool(b.get("_enospc")))))
        if r.get("_slash") and uuid:
            self._event(f"{uuid}:slash_command", ts, "slash_command", r["_slash"], aid)
        if aid:
            return
        oc = self.oc
        if isinstance(c, list) and oc["ask"]:
            for b in c:
                if isinstance(b, dict) and b.get("type") == "tool_result" and b.get("tool_use_id") in oc["ask"]:
                    oc["ask"].remove(b["tool_use_id"])  # §5: answering AskUserQuestion = decision
                    if uuid and not b.get("is_error"):
                        self.con.execute(
                            "INSERT OR IGNORE INTO turns(session_id,ts,origin,class,chars,uuid,feat) VALUES(?,?,?,?,?,?,?)",
                            (self.sid, ts, "ask", "decision", b.get("content"), uuid, '{"ask":1}'))
        uo = r.get("_uo") or {}
        if uo.get("int"):
            oc["int"] = 1
        origin = r.get("origin")
        if not (uuid and isinstance(origin, dict) and origin.get("kind")):
            return
        cls = pat = inf = feat = None
        if origin["kind"] == "human" and not r.get("isMeta"):
            a = dict(oc["a"])
            if oc["ask"]:
                a["ask"] = 1
            f = {"first": int(oc["n"] == 0), "chars": r.get("_chars") or 0, "slash": int(bool(r.get("_slash"))),
                 "after_err": oc["err"], "after_int": oc["int"], "a": a, "u": uo}
            if oc["last"] and ts:
                f["gap_s"] = _gap(oc["last"], ts)
            if a.get("alen"):
                f["ratio"] = owner.ratio_bucket(f["chars"], a["alen"])
            if oc.get("ho"):
                f["ho"] = oc["ho"]  # 1 = handed off in the reply just before, 2+ = owner turns since
                if oc.get("hpats"):
                    f["hpats"] = oc["hpats"]
            cls, pat, inf = owner.classify(f)
            oc["ho"] = owner.next_handoff_state(f)
            feat = json.dumps(f, sort_keys=True, separators=SKEL_SEP)
            oc.update(n=oc["n"] + 1, a={}, ask=[], err=0, int=0)
        self.con.execute("INSERT OR IGNORE INTO turns(session_id,ts,origin,class,chars,uuid,pattern,infeasible,feat) "
                         "VALUES(?,?,?,?,?,?,?,?,?)",
                         (self.sid, ts, origin["kind"], cls, r.get("_chars"), uuid, pat,
                          None if cls is None else int(inf), feat))

    def finalize(self, project, skeleton_rel, pinned_label=None, title=None, parser_version=PARSER_VERSION):
        con, sid = self.con, self.sid
        store.set_meta(con, f"owner_ctx:{sid}", json.dumps(self.oc, sort_keys=True, separators=SKEL_SEP))
        con.execute("INSERT OR IGNORE INTO sessions(id) VALUES(?)", (sid,))
        models = ",".join(r[0] for r in con.execute(
            "SELECT DISTINCT model FROM requests WHERE session_id=? AND model IS NOT NULL ORDER BY model", (sid,)))
        n_main = con.execute("SELECT COUNT(*) FROM requests WHERE session_id=? AND agent_id IS NULL", (sid,)).fetchone()[0]
        con.execute(
            "UPDATE sessions SET project=?, started_at=CASE WHEN started_at IS NULL OR ?<started_at THEN ? ELSE started_at END, "
            "ended_at=CASE WHEN ended_at IS NULL OR ?>ended_at THEN ? ELSE ended_at END, models=?, "
            "first_branch=IFNULL(first_branch, ?), n_requests=?, ingested_at=?, parser_version=?, skeleton_path=?, "
            "pinned_label=IFNULL(?, pinned_label), title=IFNULL(?, title), unknown_records=IFNULL(unknown_records,0)+? "
            "WHERE id=?",
            (project, self.ts_min, self.ts_min, self.ts_max, self.ts_max, models, self.first_branch, n_main,
             store.now(), parser_version, skeleton_rel, pinned_label, title, self.unknown, sid))
        if self.env_info:
            con.execute("UPDATE sessions SET repo=IFNULL(?, repo), static_json=IFNULL(?, static_json) WHERE id=?",
                        (self.env_info.get("repo"), json.dumps(self.env_info.get("static"), sort_keys=True)
                         if self.env_info.get("static") else None, sid))
        con.execute("""
            UPDATE agents SET
              n_requests=(SELECT COUNT(*) FROM requests r WHERE r.agent_id=agents.agent_id),
              max_context=(SELECT MAX(context_total) FROM requests r WHERE r.agent_id=agents.agent_id),
              cre=(SELECT IFNULL(SUM(cre),0) FROM requests r WHERE r.agent_id=agents.agent_id),
              prompt_has_recipe=(SELECT has_recipe FROM tool_calls t WHERE t.tool_use_id=agents.tool_use_id),
              spawn_ts=IFNULL((SELECT ts FROM tool_calls t WHERE t.tool_use_id=agents.tool_use_id),
                              (SELECT MIN(ts) FROM requests r WHERE r.agent_id=agents.agent_id)),
              killed_by_429=EXISTS(SELECT 1 FROM events e WHERE e.agent_id=agents.agent_id AND e.kind='rate_limit'
                  AND e.ts >= IFNULL((SELECT MAX(ts) FROM requests r WHERE r.agent_id=agents.agent_id), ''))
            WHERE session_id=?""", (sid,))


def _gap(t0, t1):
    from datetime import datetime
    try:
        return int((datetime.fromisoformat(t1.replace("Z", "+00:00"))
                    - datetime.fromisoformat(t0.replace("Z", "+00:00"))).total_seconds())
    except ValueError:
        return None


def _skel_line(aid, rec) -> bytes:
    return (json.dumps({"_f": aid or "", **rec}, separators=SKEL_SEP, ensure_ascii=False) + "\n").encode("utf-8", "surrogatepass")


def _file_state(con, path):
    return con.execute("SELECT size, mtime, offset FROM files WHERE path=?", (str(path),)).fetchone()


def ingest_session(con, src: SessionSource, force=False) -> str:
    """Ingest one session (main + agents). Returns 'full' | 'incremental' | 'unchanged'.
    Raises disk.FloorError (nothing written) when under the free-space floor."""
    disk.require_space()
    sid = src.session_id
    skel = paths.skeleton_path(sid)
    files = [(aid, Path(p)) for aid, p in src.files()]
    compressed = any(p.suffix == ".xz" for _, p in files)
    has_row = con.execute("SELECT parser_version FROM sessions WHERE id=?", (sid,)).fetchone()
    states = {str(p): _file_state(con, p) for _, p in files}
    full = force or compressed or not has_row or has_row[0] != PARSER_VERSION or not skel.exists()
    work = []
    for aid, p in files:
        try:
            stt = p.stat()
        except OSError:
            continue
        s = states[str(p)]
        if full or s is None:
            off = 0
        elif stt.st_size < s["offset"]:
            full = True
            off = 0
        elif stt.st_size == s["size"] and stt.st_mtime == s["mtime"]:
            continue
        else:
            off = s["offset"]
        work.append((aid, p, off, stt))
    if full:
        work = []
        for aid, p in files:
            try:
                work.append((aid, p, 0, p.stat()))
            except OSError:
                pass
    if not work:
        return "unchanged"

    comp = lzma.LZMACompressor(preset=6)
    chunks = []
    con.execute("BEGIN")
    try:
        if full:
            store.clear_session(con, sid)
            chunks.append(comp.compress(_skel_line("", {"_skel": 1, "session_id": sid, "project": src.project,
                                                       "parser_version": PARSER_VERSION})))
        ex = Extractor(con, sid)
        title = None
        stats = {}
        for aid, p, off, stt in work:
            if aid and off == 0:
                src_agent = next(a for a in src.agents if a.agent_id == aid)
                raw_meta = read_meta(src_agent.meta_path)
                sm = skeleton_meta(raw_meta)
                chunks.append(comp.compress(_skel_line(aid, {"_meta": sm})))
                ex.meta(aid, sm)
                if isinstance(raw_meta.get("description"), str):  # text label: index only
                    con.execute("UPDATE agents SET description=? WHERE agent_id=?", (raw_meta["description"][:200], aid))
            end = off
            need_env = not aid and off == 0
            for end, rec in iter_records(p, off, stats):
                if not aid:
                    title = text_labels(rec).get("title", title)
                    if need_env and isinstance(rec.get("cwd"), str):
                        need_env = False
                        e = static.env_for(rec["cwd"], src.project)  # numbers + owner/name only
                        chunks.append(comp.compress(_skel_line("", {"_env": e})))
                        ex.env(e)
                s = skeletonize(rec)
                chunks.append(comp.compress(_skel_line(aid, s)))
                ex.record(aid or "", s)
            con.execute("INSERT INTO files VALUES(?,?,?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET "
                        "size=excluded.size, mtime=excluded.mtime, offset=excluded.offset, ingested_at=excluded.ingested_at",
                        (str(p), sid, aid or None, stt.st_size, stt.st_mtime, end if not compressed else stt.st_size, store.now()))
        ex.finalize(src.project, os.path.relpath(skel, paths.archive_root()), src.pinned_label, title)
        chunks.append(comp.flush())
        data = b"".join(chunks)
        disk.require_space()
        paths.ensure_dir(skel.parent)
        if full:
            part = skel.with_name(skel.name + ".partial")
            fd = os.open(part, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "wb") as f:
                f.write(data)
            part.replace(skel)
        else:
            with open(skel, "ab") as f:
                f.write(data)
        con.execute("COMMIT")
    except BaseException:
        con.execute("ROLLBACK")
        raise
    return "full" if full else "incremental"


def ingest_all(con, sources, force=False, on_error=None) -> dict:
    counts = {"full": 0, "incremental": 0, "unchanged": 0, "error": 0}
    for src in sources:
        try:
            counts[ingest_session(con, src, force)] += 1
        except disk.FloorError:
            raise
        except Exception as e:  # one bad transcript never stops the run
            counts["error"] += 1
            if on_error:
                on_error(src, e)
    return counts


def ingest_skeleton(con, skel_path: Path) -> str:
    """Rebuild one session's non-text rows from its skeleton (reindex)."""
    header, ex, sid = None, None, None
    con.execute("BEGIN")
    try:
        for _end, rec in iter_records(skel_path):
            f = rec.pop("_f", "")
            if "_skel" in rec:
                if header is None:
                    header = rec
                    sid = rec["session_id"]
                    store.clear_session(con, sid, keep_files=True)
                    ex = Extractor(con, sid)
                continue
            if ex is None:
                raise ValueError(f"skeleton without header: {skel_path}")
            if "_meta" in rec:
                ex.meta(f, rec["_meta"])
            elif "_env" in rec:
                ex.env(rec["_env"])
            else:
                ex.record(f, rec)
        if ex is None:
            raise ValueError(f"empty skeleton: {skel_path}")
        ex.finalize(header.get("project"), os.path.relpath(skel_path, paths.archive_root()),
                    parser_version=header.get("parser_version"))
        con.execute("COMMIT")
    except BaseException:
        con.execute("ROLLBACK")
        raise
    return sid
