"""reindex: rebuild index rows for ALL sessions from skeletons (non-text),
then text labels (session title, agent description) from raw where it still
exists (Claude Code's 14-day copies + live pins)."""
from . import paths
from .ingest import ingest_skeleton
from .parse import discover, find_session, iter_records, read_meta
from .skeleton import text_labels


def _raw_sources():
    found = {}
    pd = paths.pinned_dir()
    if pd.is_dir():
        for label_dir in sorted(pd.iterdir()):
            for s in discover(label_dir, pinned_label=label_dir.name):
                found[s.session_id] = s
    for s in discover(paths.projects_root()):
        found[s.session_id] = s  # raw in projects wins over a pin
    return found


def relabel_text(con, src):
    """Text labels only; never touches non-text rows."""
    title = None
    for _end, rec in iter_records(src.main):
        if rec.get("type") == "custom-title":
            title = text_labels(rec).get("title", title)
    if title is not None:
        con.execute("UPDATE sessions SET title=? WHERE id=?", (title, src.session_id))
    if src.pinned_label:
        con.execute("UPDATE sessions SET pinned_label=? WHERE id=?", (src.pinned_label, src.session_id))
    for a in src.agents:
        d = read_meta(a.meta_path).get("description")
        if isinstance(d, str):
            con.execute("UPDATE agents SET description=? WHERE agent_id=?", (d[:200], a.agent_id))


def reindex(con, on_error=None) -> dict:
    counts = {"skeletons": 0, "relabeled": 0, "error": 0}
    sd = paths.skeleton_dir()
    sids = set()
    for p in sorted(sd.glob("*.jsonl.xz")) if sd.is_dir() else []:
        try:
            sids.add(ingest_skeleton(con, p))
            counts["skeletons"] += 1
        except Exception as e:
            counts["error"] += 1
            if on_error:
                on_error(p, e)
    for sid, src in _raw_sources().items():
        if sid in sids:
            relabel_text(con, src)
            counts["relabeled"] += 1
    return counts
