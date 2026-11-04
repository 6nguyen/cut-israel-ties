"""index.db: schema v1 (PRD §6.2) + forward-only migrations.

Columns beyond the PRD's v1 list (all needed for idempotent upserts or for
later steps) are marked `-- +`. Tables for later steps (turns.class, prs,
pr_sessions, windows, ledger, pr_lead) are created empty.
"""
import os
import re
import sqlite3
import time
from pathlib import Path

from . import paths

SCHEMA_V1 = """
CREATE TABLE sessions(
  id TEXT PRIMARY KEY, project TEXT, title TEXT, started_at TEXT, ended_at TEXT,
  models TEXT, first_branch TEXT, n_requests INTEGER, ingested_at TEXT,
  parser_version INTEGER, skeleton_path TEXT, pinned_label TEXT,
  unknown_records INTEGER DEFAULT 0          -- + counted, never fatal (§10)
);
CREATE TABLE pins(
  label TEXT PRIMARY KEY, created_at TEXT, expires_at TEXT, until_decision INTEGER,
  decision TEXT, decided_at TEXT, bytes INTEGER,
  deleted_at TEXT, notified_at TEXT,         -- + expiry bookkeeping
  sessions TEXT                              -- + comma-separated session ids
);
CREATE TABLE requests(
  request_id TEXT PRIMARY KEY, session_id TEXT, agent_id TEXT, ts TEXT, model TEXT,
  effort TEXT, input INTEGER, cache_read INTEGER, cache_write INTEGER, output INTEGER,
  thinking INTEGER, context_total INTEGER, cre REAL,
  git_branch TEXT                            -- + EOU attribution / ledger (step 3)
);
CREATE INDEX requests_session ON requests(session_id, agent_id, ts);
CREATE INDEX requests_ts ON requests(ts);
CREATE TABLE agents(
  agent_id TEXT PRIMARY KEY, session_id TEXT, agent_type TEXT, description TEXT,
  spawn_ts TEXT, prompt_has_recipe INTEGER, n_requests INTEGER, max_context INTEGER,
  cre REAL, killed_by_429 INTEGER,
  tool_use_id TEXT, spawn_depth INTEGER      -- + link to the parent's Agent call
);
CREATE INDEX agents_session ON agents(session_id);
CREATE TABLE tool_calls(
  session_id TEXT, agent_id TEXT, ts TEXT, name TEXT, input_bytes INTEGER,
  result_bytes INTEGER, is_image INTEGER, cmd_class TEXT,
  tool_use_id TEXT PRIMARY KEY,              -- + idempotency / result join
  is_error INTEGER, result_ts TEXT,          -- + tool time (ledger, step 3)
  has_recipe INTEGER                         -- + Agent/Task calls only
);
CREATE INDEX tool_calls_session ON tool_calls(session_id, ts);
CREATE TABLE events(
  session_id TEXT, ts TEXT, kind TEXT, detail TEXT,
  key TEXT PRIMARY KEY, agent_id TEXT        -- + idempotency (record uuid + kind)
);
CREATE INDEX events_session ON events(session_id, ts);
CREATE TABLE turns(
  session_id TEXT, ts TEXT, origin TEXT, class TEXT, chars INTEGER,
  uuid TEXT PRIMARY KEY                      -- + idempotency; class filled in step 4
);
CREATE TABLE pr_links(                       -- + Claude Code `pr-link` records (EOU, step 3)
  session_id TEXT, pr_number INTEGER, repo TEXT, ts TEXT,
  PRIMARY KEY(session_id, repo, pr_number)
);
CREATE TABLE prs(number INTEGER, repo TEXT, head_branch TEXT, merged_at TEXT,
  additions INTEGER, deletions INTEGER, eou REAL, penalized INTEGER, PRIMARY KEY(repo, number));
CREATE TABLE pr_sessions(pr INTEGER, session_id TEXT, cre_share REAL);
CREATE TABLE windows(start_ts TEXT, end_ts TEXT, cre REAL, ceiling REAL, utilization REAL,
  estimated INTEGER, limit_hit INTEGER, active INTEGER);
CREATE TABLE ledger(session_id TEXT, agent_id TEXT, branch TEXT, start_ts TEXT, end_ts TEXT, bucket TEXT);
CREATE TABLE pr_lead(pr INTEGER, first_ts TEXT, ready_ts TEXT, merged_ts TEXT);
CREATE TABLE files(                          -- + incremental ingest state
  path TEXT PRIMARY KEY, session_id TEXT, agent_id TEXT, size INTEGER, mtime REAL,
  offset INTEGER, ingested_at TEXT
);
CREATE TABLE alerts(subject TEXT, kind TEXT, ts TEXT, PRIMARY KEY(subject, kind));  -- + one notification each
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
"""

# v2 (step 3): ingest-time hash/op labels on tool calls, per-session repo +
# static-overhead numbers, PR cache columns. Hashes only; never text.
SCHEMA_V2 = """
ALTER TABLE tool_calls ADD COLUMN arg_hash TEXT;      -- sha1[:12] of file path / command
ALTER TABLE tool_calls ADD COLUMN git_op TEXT;        -- push | pr_create | commit
ALTER TABLE tool_calls ADD COLUMN branch TEXT;        -- gitBranch of the calling record
ALTER TABLE tool_calls ADD COLUMN skill TEXT;         -- Skill tool: skill name
ALTER TABLE tool_calls ADD COLUMN background INTEGER; -- Agent: run_in_background
ALTER TABLE tool_calls ADD COLUMN result_lines INTEGER;
ALTER TABLE tool_calls ADD COLUMN enospc INTEGER;
ALTER TABLE sessions ADD COLUMN repo TEXT;            -- owner/name from the cwd's git remote
ALTER TABLE sessions ADD COLUMN static_json TEXT;     -- §6.3a source sizes (bytes), numbers only
ALTER TABLE prs ADD COLUMN changed_lines INTEGER;     -- after §5 exclusions
ALTER TABLE prs ADD COLUMN docs_only INTEGER;
ALTER TABLE prs ADD COLUMN file_hashes TEXT;          -- sorted sha1[:12] of paths (fix-forward overlap)
ALTER TABLE prs ADD COLUMN fetched_at TEXT;
ALTER TABLE pr_sessions ADD COLUMN repo TEXT;
CREATE INDEX tool_calls_branch ON tool_calls(branch);
CREATE INDEX requests_branch ON requests(git_branch);
"""

# v3 (step 4): owner-action classifier (§5 Owner action, §6.6). Rule ids and
# booleans only; never text.
SCHEMA_V3 = """
ALTER TABLE turns ADD COLUMN pattern TEXT;            -- manual_step: owner_rules.json id
ALTER TABLE turns ADD COLUMN infeasible INTEGER;      -- manual_step the agent cannot do (not penalized)
ALTER TABLE turns ADD COLUMN feat TEXT;               -- classifier features (JSON, text-free)
ALTER TABLE tool_calls ADD COLUMN owner_pattern TEXT; -- Bash: owner_rules id (automated instance)
CREATE INDEX turns_session ON turns(session_id, ts);
"""

# v4 (step 5): experiment ledger (§6.9). Config text only (catalog patches +
# their undo data); never transcript text.
SCHEMA_V4 = """
CREATE TABLE experiments(
  id INTEGER PRIMARY KEY, label TEXT, metric TEXT, direction TEXT, started_at TEXT,
  rec_id TEXT, template TEXT, target TEXT, params TEXT, undo TEXT,
  commit_sha TEXT, pr_url TEXT, source TEXT,  -- source: catalog | manual
  status TEXT,                                -- live | decided | reverted
  verdict TEXT, verdict_at TEXT, verdict_line TEXT, first_n INTEGER, saved_cre REAL,
  ended_at TEXT, revert_pr_url TEXT
);
CREATE INDEX experiments_metric ON experiments(metric, status);
"""

# Forward-only: (version, sql). Never edit a shipped entry; append.
MIGRATIONS = [(1, SCHEMA_V1), (2, SCHEMA_V2), (3, SCHEMA_V3), (4, SCHEMA_V4)]
SCHEMA_VERSION = MIGRATIONS[-1][0]

# Tables holding rows derived from transcripts, per session (cleared on rebuild).
SESSION_TABLES = ("requests", "agents", "tool_calls", "events", "turns", "pr_links")


def now() -> str:
    """UTC now; SESSION_ANALYZER_NOW pins it (tests)."""
    return os.environ.get("SESSION_ANALYZER_NOW") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def connect_ro(db: Path = None) -> sqlite3.Connection:
    """Read-only connection (report). Never migrates, never writes."""
    db = Path(db or paths.index_db())
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA temp_store=MEMORY")
    con.execute("PRAGMA query_only=1")
    return con


def has_column(con, table, col) -> bool:
    return any(r[1] == col for r in con.execute(f"PRAGMA table_info({table})"))


def connect(db: Path = None) -> sqlite3.Connection:
    db = Path(db or paths.index_db())
    paths.ensure_dir(db.parent)
    con = sqlite3.connect(str(db), isolation_level=None)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA temp_store=MEMORY")  # never spill to $TMPDIR
    con.execute("PRAGMA journal_mode=DELETE")
    con.execute("PRAGMA synchronous=NORMAL")
    migrate(con)
    try:
        db.chmod(0o600)
    except OSError:
        pass
    return con


def current_version(con) -> int:
    con.execute("CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY, applied_at TEXT)")
    r = con.execute("SELECT MAX(version) FROM schema_version").fetchone()
    return r[0] or 0


def migrate(con):
    v = current_version(con)
    for ver, sql in MIGRATIONS:
        if ver > v:
            con.execute("BEGIN")
            body = re.sub(r"--[^\n]*", "", sql)
            for stmt in [s for s in body.split(";") if s.strip()]:
                con.execute(stmt)
            con.execute("INSERT INTO schema_version VALUES(?,?)", (ver, now()))
            con.execute("COMMIT")


def get_meta(con, key, default=None):
    r = con.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
    return r[0] if r else default


def set_meta(con, key, value):
    con.execute("INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, str(value)))


def clear_session(con, session_id, keep_files=False):
    """Drop a session's derived rows before a full rebuild (title/pin kept)."""
    for t in SESSION_TABLES:
        con.execute(f"DELETE FROM {t} WHERE session_id=?", (session_id,))
    con.execute("UPDATE sessions SET started_at=NULL, ended_at=NULL, first_branch=NULL, unknown_records=0 "
                "WHERE id=?", (session_id,))
    con.execute("DELETE FROM meta WHERE key=?", (f"owner_ctx:{session_id}",))
    if not keep_files:
        con.execute("DELETE FROM files WHERE session_id=?", (session_id,))
