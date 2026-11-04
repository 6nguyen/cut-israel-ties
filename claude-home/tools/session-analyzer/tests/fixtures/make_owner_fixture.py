#!/usr/bin/env python3
"""Regenerate the hand-labeled owner-action fixture (PRD §9: ≥40 real turns,
≥90% agreement). Labels were assigned by reading the owner's prompts locally
(2026-09-30, before the classifier rules were written); the committed file
holds ONLY the text-free classifier features + label, never prompt text.

    SESSION_ANALYZER_HOME=<scratch> session-analyzer ingest   # live transcripts
    python3 tests/fixtures/make_owner_fixture.py <scratch>/index.db

Split: whole sessions are held out (never used while writing the rules)."""
import json
import sqlite3
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
D, R, M, S, N = "decision", "redirect", "manual_step", "resume", "new_request"
# session-prefix -> held out?
HOLDOUT = {"2bbc49bf", "3a94025a", "5361d071", "5d22f07b", "73eb42c0", "785363bb", "81e1c87f", "841c78b8", "9a4f4072", "ababbd05", "be32d1a1", "cbdfd305", "df5cafeb", "e9962f47"}
# (session prefix, turn uuid prefix, label)
LABELS = [
    ("026ad94e", "ca09b753", N), ("026ad94e", "c6730daf", N), ("026ad94e", "1b026154", N), ("026ad94e", "b1abbea0", N),
    ("026ad94e", "22bc896a", R), ("026ad94e", "12843cc2", R), ("026ad94e", "5b989373", D), ("026ad94e", "fc0ae956", N),
    ("026ad94e", "19fb4180", N), ("026ad94e", "6ad6a1f1", M), ("026ad94e", "624327ec", M), ("026ad94e", "81474b5e", M),
    ("03c98095", "fcd0bc97", N), ("03c98095", "e4695821", M), ("03c98095", "4509df98", M), ("03c98095", "a7c0a919", N),
    ("03c98095", "d9d815be", D), ("03c98095", "6083b9e3", N), ("03c98095", "e00f2db8", N), ("03c98095", "a97a6ceb", N),
    ("03c98095", "f734442d", R), ("03c98095", "09b497e1", M), ("03c98095", "d9e709dd", N), ("03c98095", "18ae52ac", N),
    ("18cc724f", "908f9461", N), ("18cc724f", "bebf4701", M), ("18cc724f", "39188629", N), ("18cc724f", "16742a69", N),
    ("18cc724f", "e1e34944", D), ("18cc724f", "2e677bb6", N), ("18cc724f", "77899772", M), ("18cc724f", "9ae372b4", R),
    ("18cc724f", "e7f04402", N), ("18cc724f", "df49539e", R), ("18cc724f", "e1b8870f", N), ("18cc724f", "3d42d6eb", M),
    ("216cfdeb", "325681e5", N), ("216cfdeb", "44b1e90d", N), ("216cfdeb", "292b6896", D), ("216cfdeb", "41678ffe", D),
    ("216cfdeb", "33208733", N), ("216cfdeb", "9ad33d0b", N), ("216cfdeb", "13bf641b", N), ("216cfdeb", "5d83aa68", N),
    ("216cfdeb", "c9ce58aa", D), ("216cfdeb", "638f127e", N),
    ("4a34773f", "bc033e55", N), ("4a34773f", "9f565e01", D), ("4a34773f", "d9e4f82a", N), ("4a34773f", "d5c2b98a", D),
    ("4a34773f", "12e6f6a2", N), ("4a34773f", "b000c6e4", D), ("4a34773f", "a77a92ed", D), ("4a34773f", "7a6686ae", N),
    ("4a34773f", "655ba6ad", D), ("4a34773f", "0213c4c7", N), ("4a34773f", "4bce9287", M), ("4a34773f", "6a16264d", N),
    ("683eab28", "51cdbf51", N), ("683eab28", "a0a9489a", R), ("683eab28", "7e9d1729", R), ("683eab28", "8f8520be", M),
    ("683eab28", "7d27c970", R), ("683eab28", "cc1a73d5", R), ("683eab28", "325bf647", N), ("683eab28", "13502ba7", N),
    ("683eab28", "c563960b", N), ("683eab28", "1fa32aef", N), ("683eab28", "9d1f5ce0", M), ("683eab28", "742e15a9", N),
    ("785363bb", "ad95b2b0", N), ("785363bb", "76e99818", N), ("785363bb", "103dd4f0", N), ("785363bb", "79561e15", D),
    ("785363bb", "dfadc70e", D), ("785363bb", "0d8b5e2a", D),
    ("790fe572", "b976f496", N), ("790fe572", "14d7fc66", M), ("790fe572", "998c9fa8", R), ("790fe572", "0b923c6b", M),
    ("790fe572", "da22768a", R), ("790fe572", "3399061b", N), ("790fe572", "f87c4de5", N), ("790fe572", "47712b3f", N),
    ("790fe572", "a6dda4ed", N), ("790fe572", "295fee76", N), ("790fe572", "668ad98b", R), ("790fe572", "a84836b0", D),
    ("96aa49e8", "6c8d2cfa", N), ("96aa49e8", "394303ee", N), ("96aa49e8", "242f4d7e", N), ("96aa49e8", "776b7274", N),
    ("96aa49e8", "6afb48c3", N), ("96aa49e8", "60b341e1", N), ("96aa49e8", "fe150fe6", N), ("96aa49e8", "5f156e3f", N),
    ("96aa49e8", "dc4259ac", D), ("96aa49e8", "14d9e992", N), ("96aa49e8", "dafb7866", N), ("96aa49e8", "dcfc44b5", M),
    ("9a4f4072", "2c866592", N), ("9a4f4072", "0eafa8b5", M), ("9a4f4072", "fc155917", M), ("9a4f4072", "f6b1e697", S),
    ("9a4f4072", "67647005", M), ("9a4f4072", "129a5e0a", D), ("9a4f4072", "5a3d6b16", N), ("9a4f4072", "644fd65c", M),
    ("9a4f4072", "3afcda7e", M), ("9a4f4072", "c5560adb", N), ("9a4f4072", "782fa8b5", D),
    ("e77e3e89", "d43ffd07", N), ("e77e3e89", "4405e9b0", D), ("e77e3e89", "1ab68254", S), ("e77e3e89", "672a8171", D),
    ("e77e3e89", "a1d6973f", S), ("e77e3e89", "8ed6f8e0", N), ("e77e3e89", "51666f1c", D), ("e77e3e89", "543927c2", D),
    ("e9962f47", "437f4914", S), ("e9962f47", "fb4a9d02", S), ("e9962f47", "5ce20f1d", M), ("e9962f47", "14acda6d", N),
    ("e9962f47", "73917ab4", M), ("e9962f47", "058f2b67", M), ("e9962f47", "17b86453", R), ("e9962f47", "a623df4f", M),
    ("e9962f47", "a13835b3", M), ("e9962f47", "02e142f8", M),
    ("81e1c87f", "7052ca97", N), ("81e1c87f", "3b1b57eb", N), ("81e1c87f", "8a3aa15b", N), ("81e1c87f", "06350515", D),
    ("81e1c87f", "de2e5553", M), ("81e1c87f", "6d8e19b8", M), ("81e1c87f", "b4238349", M), ("81e1c87f", "1875a4bb", N),
    # round 3 (2026-09-30): held-out expansion, labeled blind before any prediction was run
    ("2bbc49bf", "1667649e", N),
    ("3a94025a", "518b61dc", N),
    ("3a94025a", "a85654f6", D),
    ("3a94025a", "095758d9", M),
    ("3a94025a", "e3abd346", M),
    ("3a94025a", "24da53f6", N),
    ("3a94025a", "92b46c96", D),
    ("3a94025a", "062da37c", N),
    ("3a94025a", "3f6d16eb", N),
    ("3a94025a", "9345c65c", N),
    ("3a94025a", "c1aafb0e", N),
    ("3a94025a", "5116d49c", N),
    ("3a94025a", "4704b79c", R),
    ("3a94025a", "aa063fc1", D),
    ("3a94025a", "da219d28", N),
    ("3a94025a", "317aeb29", N),
    ("3a94025a", "ce6e16b1", N),
    ("3a94025a", "b45c058a", N),
    ("3a94025a", "2f9a38e1", D),
    ("3a94025a", "28be5c6f", D),
    ("3a94025a", "0ac9b81c", D),
    ("5361d071", "5bcd408e", N),
    ("5361d071", "c308a7b9", D),
    ("5361d071", "592be3ae", N),
    ("5d22f07b", "42d5e692", N),
    ("5d22f07b", "72ef179c", N),
    ("73eb42c0", "79e3b450", N),
    ("841c78b8", "47de3498", N),
    ("841c78b8", "22be061f", N),
    ("9a4f4072", "2e84992f", M),
    ("9a4f4072", "89365b3b", R),
    ("9a4f4072", "a95ef919", M),
    ("9a4f4072", "f3c0be8b", M),
    ("9a4f4072", "df46290a", M),
    ("9a4f4072", "5b5d3d7b", D),
    ("9a4f4072", "d3cb9715", M),
    ("9a4f4072", "f4eb72e7", M),
    ("9a4f4072", "9cce21f4", M),
    ("9a4f4072", "e1668462", M),
    ("9a4f4072", "9593a93d", M),
    ("9a4f4072", "bce27f6b", M),
    ("9a4f4072", "51a5c7de", R),
    ("9a4f4072", "10ffc0eb", M),
    ("9a4f4072", "8be35638", N),
    ("9a4f4072", "560348bd", M),
    ("9a4f4072", "b01ac187", M),
    ("9a4f4072", "47ced242", N),
    ("9a4f4072", "7953f636", R),
    ("9a4f4072", "477d8a53", N),
    ("9a4f4072", "7ea629f7", M),
    ("9a4f4072", "d51446c8", N),
    ("9a4f4072", "2d522e93", N),
    ("9a4f4072", "5e9877a8", N),
    ("9a4f4072", "01f2ff89", M),
    ("9a4f4072", "bf89fb25", M),
    ("9a4f4072", "0d92ba05", M),
    ("9a4f4072", "c0ebb9a2", M),
    ("9a4f4072", "4762dd78", M),
    ("9a4f4072", "3d83ecc1", M),
    ("9a4f4072", "71c11c74", M),
    ("9a4f4072", "babedb0e", M),
    ("9a4f4072", "08fdaef7", M),
    ("9a4f4072", "25b96254", M),
    ("9a4f4072", "16d58f11", N),
    ("9a4f4072", "261378cf", N),
    ("9a4f4072", "5f99289d", N),
    ("9a4f4072", "4979627b", M),
    ("9a4f4072", "19ef288a", S),
    ("9a4f4072", "e7895506", N),
    ("9a4f4072", "ecb4cf3b", N),
    ("9a4f4072", "5435a17d", S),
    ("9a4f4072", "1e387958", N),
    ("9a4f4072", "797b4c6b", M),
    ("9a4f4072", "a50658df", M),
    ("9a4f4072", "48d4d74e", R),
    ("9a4f4072", "3129ffc8", M),
    ("9a4f4072", "18cfe2c2", M),
    ("9a4f4072", "f95f0b84", M),
    ("9a4f4072", "cdcff916", M),
    ("9a4f4072", "e4f9d28a", M),
    ("9a4f4072", "19e0369e", M),
    ("9a4f4072", "378b76ca", M),
    ("9a4f4072", "780a09a8", M),
    ("9a4f4072", "131b823d", N),
    ("9a4f4072", "6f962a69", D),
    ("9a4f4072", "9daaae97", M),
    ("9a4f4072", "1740b07f", M),
    ("9a4f4072", "3d1de7f9", N),
    ("9a4f4072", "55aa78da", N),
    ("9a4f4072", "3386d57a", N),
    ("9a4f4072", "05fb7a48", D),
    ("9a4f4072", "96bcd720", S),
    ("9a4f4072", "221b9b22", N),
    ("ababbd05", "c6803c59", N),
    ("ababbd05", "35a1efbc", N),
    ("be32d1a1", "614aa5ab", N),
    ("cbdfd305", "ad1fd890", N),
    ("cbdfd305", "417122fa", N),
    ("df5cafeb", "fbc2000d", N),
    ("df5cafeb", "4f0e3d70", N),
    ("df5cafeb", "2eb6db34", D),
]


def _strip(f):
    """Drop zero/empty features to keep fixtures ≤1 MB; classify() reads with .get()."""
    return {k: (_strip(v) if isinstance(v, dict) else v) for k, v in f.items() if k == "ratio" or v not in (0, None, [], "")}


def main(db):
    con = sqlite3.connect(db)
    alias, out, missing = {}, [], []
    for sp, up, label in LABELS:
        # forked sessions share record uuids; the turn row belongs to whichever ingested first
        r = con.execute("SELECT feat FROM turns WHERE uuid LIKE ? AND origin='human'",
                        (up + "%",)).fetchone()
        if not r or not r[0]:
            missing.append(f"{sp}:{up}")
            continue
        s = alias.setdefault(sp, f"s{len(alias) + 1:02d}")
        out.append({"s": s, "split": "holdout" if sp in HOLDOUT else "dev", "label": label, "f": _strip(json.loads(r[0]))})
    (HERE / "owner_labeled.jsonl").write_text("".join(json.dumps(x, sort_keys=True, separators=(",", ":")) + "\n" for x in out))
    print(f"{len(out)} turns, {len(alias)} sessions, missing {missing}")


if __name__ == "__main__":
    main(sys.argv[1])
