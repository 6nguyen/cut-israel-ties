#!/usr/bin/env bash
# state.sh — read or replace a PRD's `## State` block, line-anchored.
#   state.sh get <prd>          print the State block
#   state.sh set <prd> <file>   replace it with <file> (or insert one)
# Block = the `^## State` line to the line before the next `^## ` line, or
# EOF. Headings count only at line start and outside fenced code (``` / ~~~),
# so an inline `## State` in prose or a fenced one never matches.
# Errors (exit 1, PRD untouched): two State headings; <file> not starting
# with `## State`; <file> holding another `^## ` line. Bash 3.2 + awk.
set -euo pipefail
die() { echo "state.sh: $*" >&2; exit 1; }
usage() { echo "usage: state.sh get <prd> | state.sh set <prd> <file>" >&2; exit 64; }

# headings FILE: "<line> <S|O|H|C|-> " per `^## ` line outside fences
# (S State, O Open questions, C Changes, H other), then "E <last line>".
headings() {
  awk '
    { t = $0; sub(/^ {0,3}/, "", t) }
    fence == "" && (substr(t, 1, 3) == "```" || substr(t, 1, 3) == "~~~") { fence = substr(t, 1, 3); next }
    fence != "" { if (substr(t, 1, 3) == fence) fence = ""; next }
    /^## / {
      k = "H"
      if ($0 ~ /^## State([^A-Za-z]|$)/) k = "S"
      else if ($0 ~ /^## Open questions/) k = "O"
      else if ($0 ~ /^## Changes/) k = "C"
      print NR, k
    }
    END { print "E", NR }' "$1"
}

# block FILE: sets START END (0 0 when absent) and INSERT (line to insert
# before, or EOF+1); dies on a duplicate State.
block() {
  local n k last=0 states="" open=0 changes=0
  START=0 END=0
  while read -r n k; do
    if [ "$n" = E ]; then last=$k; continue; fi
    if [ "$START" != 0 ] && [ "$END" = 0 ]; then END=$((n - 1)); fi
    case "$k" in
      S) states="$states $n"; [ "$START" = 0 ] && START=$n ;;
      O) [ "$open" = 0 ] && open=$n ;;
      C) [ "$changes" = 0 ] && changes=$n ;;
    esac
  done < <(headings "$1")
  set -- $states
  [ $# -gt 1 ] && die "$PRD: $# '## State' headings (lines$states); fix by hand"
  if [ "$START" != 0 ] && [ "$END" = 0 ]; then END=$last; fi
  if [ "$open" != 0 ]; then INSERT=$open
  elif [ "$changes" != 0 ]; then INSERT=$changes
  else INSERT=$((last + 1)); fi
}

[ $# -ge 2 ] || usage
CMD=$1 PRD=$2
[ -f "$PRD" ] || die "$PRD: no such file"
case "$CMD" in
  get)
    [ $# = 2 ] || usage
    block "$PRD"
    [ "$START" != 0 ] || die "$PRD: no '## State' block"
    sed -n "${START},${END}p" "$PRD" ;;
  set)
    [ $# = 3 ] || usage
    NEW=$3
    [ -f "$NEW" ] || die "$NEW: no such file"
    head -n1 "$NEW" | grep -q '^## State' || die "$NEW: line 1 must start with '## State'"
    extra=$(headings "$NEW" | awk '$1 != "E" && $1 != 1 { printf " %s", $1 }')
    [ -z "$extra" ] || die "$NEW: '## ' heading other than line 1 (lines$extra)"
    block "$PRD"
    tmp=$(mktemp "${PRD}.XXXXXX")
    if [ "$START" != 0 ]; then
      { head -n $((START - 1)) "$PRD"; cat "$NEW"; tail -n +$((END + 1)) "$PRD"; } >"$tmp"
    else
      # Insert as its own section: a blank line after it when a heading follows.
      { head -n $((INSERT - 1)) "$PRD"; cat "$NEW"
        if [ "$INSERT" -le "$(wc -l <"$PRD")" ]; then
          [ -z "$(tail -n1 "$NEW")" ] || echo
          tail -n +"$INSERT" "$PRD"
        fi; } >"$tmp"
    fi
    cat "$tmp" >"$PRD"; rm -f "$tmp" ;;  # keep the PRD's inode and mode
  *) usage ;;
esac
