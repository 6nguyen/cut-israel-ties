"""Owner-action classifier (PRD §5 Owner action, §6.6).

Two halves:
- ingest-time labels (`assistant_labels`, `user_labels`): regex cues over
  text, reduced to booleans + rule ids. Only these land in skeletons/index;
  the text never does.
- `classify(features)`: a pure, ordered rule list over those text-free
  features. `reindex` re-derives everything from skeletons.

Classes: decision (wanted, never penalized), redirect, manual_step, resume
(penalized), new_request (neutral). manual_step is not penalized when its
pattern is `infeasible` in owner_rules.json.
"""
import json
import re
from pathlib import Path

CLASSES = ("decision", "redirect", "manual_step", "resume", "new_request")
PENALIZED = ("redirect", "manual_step", "resume")
SHORT = 200  # §5: "a turn ≤200 chars"
TINY = 40
# The per-class split is experimental. HELDOUT_ACC is the last blind held-out
# result (round 3, n=136, before the set was spent on tuning). The split becomes
# binding only after >=0.90 on >=100 fresh turns from sessions started on or
# after FRESH_EVAL_SINCE (PRD §9).
HELDOUT_ACC = 0.65
FRESH_EVAL_SINCE = "2026-10-01"
HANDOFF_MAX = TINY  # longer turns mid-hand-off are new instructions (tuned on all labels)

RULES = json.loads((Path(__file__).with_name("owner_rules.json")).read_text())
MINUTES = RULES["minutes"]
PATTERNS = [(p["id"], re.compile(p["re"]), bool(p["infeasible"])) for p in RULES["patterns"]]
PATTERN_ORDER = {pid: i for i, (pid, _, _) in enumerate(PATTERNS)}
INFEASIBLE = {pid for pid, _, inf in PATTERNS if inf}

# ---- assistant side (final text of the turn before the owner speaks) ------
_FENCE = re.compile(r"```(?:bash|sh|zsh|shell|console)?[ \t]*\n\s*(?:cd|git|gh|launchctl|xcodegen|npm|npx|python3?|"
                    r"alembic|tail|grep|ls|cat|sudo|brew|curl|scripts/|\.venv|/[a-z][a-z0-9:-]+)\b")
_HANDOFF = re.compile(
    r"(?i)\b(?:you(?:'ll)? (?:can|need to|should|must|'ll need to)|please|then|first|just)\s+"
    r"(?:run|open|restart|rebuild|click|tap|paste|plug|install|press|type|enter|select|go to|quit|reopen|"
    r"launch|sign in|accept)\b"
    r"|(?:(?:^|\n)\s*(?:\d+\.\s+|[-*]\s+)?\**|\bNext:\s*)(?:Run|Open|Restart|Rebuild|Click|Tap|Paste|Plug|Install|"
    r"Press|Type|Enter|Select|Go to|Quit|Reopen|Launch|Accept|run|open|restart|rebuild|quit|reopen)\b"
    r"|Cmd\+R|\btell me (?:when|once|what you see)|\bsay done\b|\bpaste (?:me|the|it)\b|\bsend me\b"
    r"|\blet me know (?:when|once|what)")
_OFFER = re.compile(
    r"(?i)\b(?:want me to|should i|shall i|would you like|do you want|which (?:do you|one|would you)|"
    r"say (?:the word|go|which|yes)|pick (?:one|a\b)|your call|let me know which|"
    r"or would you rather|waiting on your (?:answers|calls)|ready for your answers)")
_OPTS = re.compile(r"(?m)^\s*(?:\*\*)?(?:\d{1,2}[.)]|[A-Da-d][.):]|\(?[A-Da-d]\)|Option [A-D1-9]\b|Q\d+[:.)]?)\s*\S")
_TRAIL = re.compile(r"[\s*_`)\]>.!]+$")


def _ends_with_question(text):
    t = _TRAIL.sub("", text[-600:])
    if t.endswith("?"):
        return True
    last = re.split(r"(?<=[.!?])\s+|\n", t.strip())[-1:] or [""]
    return "?" in last[0]


def patterns_in(text):
    return sorted({pid for pid, rx, _ in PATTERNS if rx.search(text)}, key=PATTERN_ORDER.get)


def assistant_labels(text):
    """Text-free labels for one assistant text block. q/offer describe the
    block (the turn's LAST text block wins); handoff/pats accumulate."""
    if not text or not text.strip():
        return None
    tail = text[-700:]
    out = {}
    if _ends_with_question(text) or tail.count("?") >= 2:
        out["q"] = 1
    if _OFFER.search(tail):
        out["offer"] = 1
    if len(_OPTS.findall(tail)) >= 2:
        out["opts"] = 1  # numbered/lettered options near the end
    out["alen"] = len(text).bit_length()  # log2 length bucket
    if _FENCE.search(text) or _HANDOFF.search(text):
        out["handoff"] = 1
        pats = patterns_in(text)
        if pats:
            out["pats"] = pats
    return out


# ---- owner side --------------------------------------------------------------
_NEG_START = re.compile(
    r"(?i)^\W*(?:no\b|nope|nah\b|wrong|that'?s not|that is not|not what|i'?m not sure (?:that|this|it)|"
    r"sorry,? (?:this|that|i|wrong)|this is too|they look|you'?ve (?:once again|again)|i'?m\s+s?o*\s*confused|"
    r"i intentionally|why (?:did|would|is|isn'?t|does|are)\b|it'?s (?:still|not)\b|still\b|so you'?re telling me|"
    r"actually,? (?:no|i|it|that))")
_NEG_ANY = re.compile(
    r"(?i)\b(?:not what i (?:meant|asked|wanted)|isn'?t showing|is still showing|still (?:showing|broken|failing|"
    r"not working|wrong|the same)|doesn'?t work|not working|too many steps|not satisfied|confus(?:ed|ing)|"
    r"that'?s wrong|incorrect|you (?:forgot|missed|broke)|didn'?t (?:work|fix)|\brevert\b|\bundo\b)")
_RESUME_START = re.compile(r"(?i)^\W*(?:continue|resume|try again|retry|go on|keep going|carry on|proceed)\b\W*$|"
                           r"^\W*(?:continue|resume|try again|retry)\b")
_RESUME_ANY = re.compile(r"(?i)\b(?:left off|has reset|limit (?:has )?reset|pick up where|continue from where|"
                         r"resume prompt)")
_DONE = re.compile(
    r"(?i)^\W*(?:done|did it|ran it|it'?s done|finished|it finished|i ran|i'?ve (?:run|added|done|installed|restarted)|"
    r"i added|added (?:the|it)|plugged|installed|restarted|tried|got (?:the|it)|i have the|i got|"
    r"this is what i (?:see|got)|here'?s what i (?:see|got)|found\b|step \d|okay,? (?:app|it)|ok,? (?:app|it)|"
    r"my (?:phone|watch|mac) is|test failed|it (?:said|says|worked|failed|launched))"
    r"|\b(?:completed|is what i see|what i got)\b")
_YES = re.compile(r"(?i)^\W*(?:y|yes|yep|yeah|ok|okay|sure|approved?|agreed?|go ahead|do it|lgtm|sounds good|"
                  r"let'?s go|go|ship it|perfect)\b")
_MERGED = re.compile(r"(?i)^\W*(?:(?:pr\s*)?#?\d+(?:\s*(?:and|,|&)\s*#?\d+)*\s+)?merged\b")
_ASK_START = re.compile(r"(?i)^\W*(?:what|why|how|does|do|is|are|can|could|should|did|where|when|which|will|would)\b")
_IMPERATIVE = re.compile(r"(?i)^\W*(?:give|create|make|add|fix|update|implement|build|show|check|review|deploy|push|"
                         r"open|plan|draft|write|explain|tell me|can you|could you|please|now)\b")
_OPT_START = re.compile(r"(?i)^\W*(?:(?:\d{1,2}|[a-d]|q\d+|option\s+\w+)(?:[.):,]|\s*$|\s+(?:and|&|\+|,)\s)|"
                        r"(?:both|all of (?:them|it|those)|neither|the (?:first|second|third|last) one|first one|"
                        r"second one|go with|let'?s (?:go with|do)|i'?ll (?:go|take)|i (?:prefer|pick|choose))\b)")
_ENUM = re.compile(r"(?m)^\s*(?:\d+[.)]|[-*•]|Q\d+[:.]?|[A-Z]\d?[:.)])\s+\S")


def user_labels(text):
    """Text-free cue booleans for a human turn (or an interrupt marker)."""
    if not isinstance(text, str):
        return None
    if text.startswith("[Request interrupted by user"):
        return {"int": 1}
    text = text.replace("\u2019", "'").replace("\u2018", "'")
    out = {}
    if "<bash-input>" in text:
        out["bash"] = 1
        pats = patterns_in(text)
        if pats:
            out["pats"] = pats
        return out
    head = text[:300]
    if _NEG_START.search(head) or _NEG_ANY.search(head):
        out["neg"] = 1
    if _RESUME_START.search(head) or _RESUME_ANY.search(head):
        out["res"] = 1
    if _DONE.search(head[:160]):
        out["done"] = 1
    if _YES.search(head):
        out["yes"] = 1
    if _OPT_START.search(head):
        out["opt"] = 1  # starts by picking an option
    if _MERGED.search(head):
        out["merged"] = 1  # the owner's merge gate (policy, not a hand-off)
    if head.rstrip().endswith("?") or _ASK_START.search(head):
        out["ask"] = 1
    if _IMPERATIVE.search(head):
        out["imp"] = 1
    if len(_ENUM.findall(text[:4000])) >= 2:
        out["enum"] = 1
    if "<pasted_content" in head or text.count("\n") >= 40:
        out["paste"] = 1
    return out


def ratio_bucket(chars, alen):
    """Owner turn length vs the assistant's last message (log2 bucket):
    0 = under ~1/8, 1 = under ~1/2, 2 = comparable or longer."""
    r = (chars or 0) / float(1 << max(alen - 1, 0))
    return 0 if r < 0.125 else (1 if r < 0.5 else 2)


# ---- classification (pure, text-free) -----------------------------------------
def classify(f):
    """f: {first, chars, slash, after_err, after_int, a:{q,offer,handoff,pats,ask}, u:{...}}.
    Returns (class, pattern|None, infeasible: bool)."""
    a, u = f.get("a") or {}, f.get("u") or {}
    chars = f.get("chars") or 0
    if f.get("first"):
        return "new_request", None, False
    if f.get("after_err") or (u.get("res") and chars <= SHORT):
        return "resume", None, False
    if u.get("bash"):
        pat = (u.get("pats") or ["shell"])[0]
        return "manual_step", pat, pat in INFEASIBLE
    if f.get("slash"):
        return "new_request", None, False
    if u.get("neg") or f.get("after_int"):
        return "redirect", None, False
    if (u.get("done") or u.get("img")) and (a.get("handoff") or chars <= TINY):
        pat = (a.get("pats") or ["ui"])[0]
        return "manual_step", pat, pat in INFEASIBLE
    if a.get("ask"):
        return "decision", None, False
    # mid-hand-off: a short status report or question while a hand-off is still open
    ho = f.get("ho") or 0
    if ho and not (u.get("imp") or u.get("opt") or u.get("yes") or u.get("merged")) and chars <= HANDOFF_MAX:
        pat = (a.get("pats") or f.get("hpats") or ["ui"])[0]
        return "manual_step", pat, pat in INFEASIBLE
    if u.get("merged"):
        return "new_request", None, False
    imp = u.get("imp")
    # the assistant laid out numbered/lettered options (not steps) and a short reply answers them
    if a.get("opts") and not a.get("handoff") and not (imp or u.get("ask")) and chars <= SHORT:
        return "decision", None, False
    # the owner opens by picking an option, and the turn is far shorter than what it answers
    if u.get("opt") and not imp and f.get("ratio") == 0:
        return "decision", None, False
    # a question back, or a fresh imperative, is not an answer
    answers = u.get("yes") or u.get("enum") or not (u.get("ask") or u.get("imp"))
    if (a.get("q") or a.get("offer")) and answers and (chars <= SHORT or u.get("enum")):
        return "decision", None, False
    if u.get("yes") and chars <= SHORT:
        return "decision", None, False
    return "new_request", None, False


def next_handoff_state(f):
    """Hand-off still open after this owner turn? 0 = closed, else turns since (capped)."""
    u, ho = f.get("u") or {}, f.get("ho") or 0
    if not ho or f.get("first") or f.get("slash") or u.get("bash") or u.get("done") or u.get("merged") \
            or (u.get("imp") and (f.get("chars") or 0) > SHORT):
        return 0
    return min(ho + 1, 3)


def penalized(cls, infeasible):
    return cls in PENALIZED and not (cls == "manual_step" and infeasible)
