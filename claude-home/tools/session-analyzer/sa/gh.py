"""PR cache + EOU (§5, §6.4). `gh` is the only network call in the tool.

`runner` is injectable (tests replace it); it takes the gh argv (without
"gh") and returns stdout, or raises. A failed refresh keeps the cache.
"""
import json
import os
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

from . import store
from .skeleton import h12

FIELDS = "number,headRefName,mergedAt,additions,deletions,files"
EXCLUDE = re.compile(
    r"(^|/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Podfile\.lock|Package\.resolved|Cargo\.lock|"
    r"poetry\.lock|uv\.lock|Gemfile\.lock|composer\.lock|go\.sum)$"
    r"|\.xcodeproj/|(^|/)(__snapshots__|__Snapshots__|fixtures|snapshots)/|\.snap$"
    r"|^docs/perf/results/|(^|/)(dist|build|generated)/|\.generated\.|\.min\.(js|css)$|_pb2\.py$|\.pb\.go$")
DOC = re.compile(r"(\.(md|mdx|txt|rst)$|^docs/)")


def _subprocess_runner(args):
    """SESSION_ANALYZER_GH: gh binary to run; "0" disables the fetch (tests, offline)."""
    exe = os.environ.get("SESSION_ANALYZER_GH", "gh")
    if exe == "0":
        raise RuntimeError("gh disabled")
    return subprocess.run([exe, *args], capture_output=True, text=True, timeout=60, check=True).stdout


runner = _subprocess_runner


def size_of(files):
    """(changed_lines, docs_only, file_hashes) after §5 exclusions."""
    kept = [f for f in files or [] if isinstance(f, dict) and not EXCLUDE.search(f.get("path", ""))]
    lines = sum(int(f.get("additions") or 0) + int(f.get("deletions") or 0) for f in kept)
    docs_only = int(bool(kept) and all(DOC.search(f.get("path", "")) for f in kept))
    hashes = ",".join(sorted(h12(f.get("path", "")) for f in kept))
    return lines, docs_only, hashes


def base_eou(changed_lines, docs_only) -> float:
    if docs_only:
        return 0.5
    if changed_lines < 50:
        return 0.5
    if changed_lines <= 400:
        return 1.0
    return 2.0


def fetch(repo, since=None):
    args = ["pr", "list", "-R", repo, "--state", "merged", "--limit", "1000", "--json", FIELDS]
    if since:
        args += ["--search", f"merged:>={since}"]
    out = json.loads(runner(args) or "[]")
    rows = []
    for p in out:
        lines, docs, hashes = size_of(p.get("files"))
        rows.append({"number": int(p["number"]), "repo": repo, "head_branch": p.get("headRefName"),
                     "merged_at": p.get("mergedAt"), "additions": p.get("additions"), "deletions": p.get("deletions"),
                     "changed_lines": lines, "docs_only": docs, "file_hashes": hashes})
    return rows


def refresh(con_rw, repos):
    """Incremental: per repo, fetch PRs merged since (latest cached − 1 day)."""
    got = []
    todo = []
    for repo in sorted(set(r for r in repos if r)):
        last = con_rw.execute("SELECT MAX(merged_at) FROM prs WHERE repo=?", (repo,)).fetchone()[0] if con_rw else None
        since = None
        if last:
            since = (datetime.strptime(last[:10], "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
        todo.append((repo, since))

    def one(rs):
        try:
            return fetch(*rs)
        except Exception:
            return None  # offline / gh missing: keep the cache

    with ThreadPoolExecutor(max_workers=4) as pool:  # gh latency dominates `report`
        results = list(pool.map(one, todo))
    for (repo, _), rows in zip(todo, results):
        if rows is None:
            continue
        got.extend(rows)
        if con_rw is not None:
            now = store.now()
            for r in rows:
                con_rw.execute(
                    "INSERT INTO prs(number,repo,head_branch,merged_at,additions,deletions,eou,penalized,changed_lines,"
                    "docs_only,file_hashes,fetched_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(repo,number) DO UPDATE SET "
                    "head_branch=excluded.head_branch, merged_at=excluded.merged_at, additions=excluded.additions, "
                    "deletions=excluded.deletions, changed_lines=excluded.changed_lines, docs_only=excluded.docs_only, "
                    "file_hashes=excluded.file_hashes, fetched_at=excluded.fetched_at",
                    (r["number"], repo, r["head_branch"], r["merged_at"], r["additions"], r["deletions"],
                     base_eou(r["changed_lines"], r["docs_only"]), 0, r["changed_lines"], r["docs_only"],
                     r["file_hashes"], now))
    return got


def _dt(s):
    return datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S")


def score(prs):
    """prs: list of dicts (cache rows). Adds eou + penalized (§5 quality penalty):
    reverted (a later `revert-<n>-…` head branch) or a `fix/` PR merged within
    7 days touching ≥50% of the same files -> EOU halved."""
    by_repo = {}
    for p in prs:
        by_repo.setdefault(p["repo"], []).append(p)
    for repo, ps in by_repo.items():
        ps.sort(key=lambda p: (p["merged_at"] or "", p["number"]))
        reverted = set()
        for p in ps:
            m = re.match(r"revert-(\d+)-", p["head_branch"] or "")
            if m:
                reverted.add(int(m.group(1)))
        for i, p in enumerate(ps):
            files = set(filter(None, (p.get("file_hashes") or "").split(",")))
            pen = p["number"] in reverted
            if not pen and files and p["merged_at"]:
                t0 = _dt(p["merged_at"])
                for q in ps[i + 1:]:
                    if not q["merged_at"] or _dt(q["merged_at"]) - t0 > timedelta(days=7):
                        break
                    if (q["head_branch"] or "").startswith("fix/"):
                        qf = set(filter(None, (q.get("file_hashes") or "").split(",")))
                        if qf and len(files & qf) >= 0.5 * len(qf):
                            pen = True
                            break
            b = base_eou(p.get("changed_lines") or 0, p.get("docs_only"))
            p["penalized"] = int(pen)
            p["eou"] = b / 2 if pen else b
    return prs
