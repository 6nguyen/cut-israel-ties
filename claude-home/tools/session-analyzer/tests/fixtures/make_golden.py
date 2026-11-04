#!/usr/bin/env python3
"""Derive the golden fixture from the live index (read-only). Numbers only:
per request (thread index, Δseconds, input, cache_read, cache_write, output)
for the audited 2026-09-26→28 sessions (v2 report: 1.42B CRE, 775 main /
4,152 agent requests, 12 main cache rebuilds). Run once; output is committed.
    python3 tests/fixtures/make_golden.py [~/.claude-archive/index.db]"""
import lzma
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

SESSIONS = ("e77e3e89-6a78-44c0-b9ab-eaebc390bc4a", "4a34773f-9f6c-4ace-9c2c-9835851a1510")
OUT = Path(__file__).resolve().parent / "golden-2026-09-26.tsv.xz"


def main(db):
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    lines = []
    for si, sid in enumerate(SESSIONS):
        threads, prev = {}, None
        for aid, ts, i, cr, cw, o in con.execute(
                "SELECT IFNULL(agent_id,''), ts, input, cache_read, cache_write, output FROM requests "
                "WHERE session_id=? ORDER BY ts, request_id", (sid,)):
            t = int(datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp())
            th = threads.setdefault(aid, len(threads) + 1) if aid else 0  # 0 = main thread
            lines.append(f"{si}\t{th}\t{t - (prev or t)}\t{i}\t{cr}\t{cw}\t{o}")
            prev = t
    OUT.write_bytes(lzma.compress(("\n".join(lines) + "\n").encode(), preset=9 | lzma.PRESET_EXTREME))
    print(OUT, OUT.stat().st_size, len(lines))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.claude-archive/index.db"))
