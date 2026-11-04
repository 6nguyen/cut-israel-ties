"""session-analyzer: zero-token metrics store for Claude Code transcripts.

Steps 2-3 of docs/prd/session-analyzer.md (hypertrophy-goals): ingest (index +
text-free skeletons), pins with expiry, reindex, disk budget, capture;
report/compare (CRE, compliance, EOU, time ledger, windows).
Later steps plug in through `sa.cli.COMMANDS` and read `index.db` via
`sa.store.connect()`.
"""

# Bump when skeleton labels or row derivation change. Rows and skeletons
# record the version they were made with (PRD §6.2 Re-deriving).
PARSER_VERSION = 5  # v5: hand-off-still-open owner feature (ho, hpats)
# v2: v2: arg/path hashes, git ops, skill, bg, lines, ENOSPC, snapshots, repo+static

# §5 CRE weights (one constant; changing them re-computes from the archive).
# output_tokens already includes thinking tokens ("thinking counts as output").
CRE_WEIGHTS = {"cache_read": 1.0, "cache_write": 12.5, "input": 10.0, "output": 50.0}


def cre(input_tokens, cache_read, cache_write, output):
    w = CRE_WEIGHTS
    return (input_tokens * w["input"] + cache_read * w["cache_read"]
            + cache_write * w["cache_write"] + output * w["output"])
