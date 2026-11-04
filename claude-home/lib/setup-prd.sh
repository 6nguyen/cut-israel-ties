# Setup PRD (docs/prd/repo-setup.md) shared by scripts/bootstrap.sh and
# claude-home/adopt.sh. Source it. The template lives in
# claude-home/templates/repo-setup.md (template-only, never copied).

SETUP_PRD=docs/prd/repo-setup.md
POINTER='Setup pending: when no other task is given or when asked to continue setup, run /implement-prd-section docs/prd/repo-setup.md. <!-- prd-pointer: docs/prd/repo-setup.md -->'
INDEX_ROW='| [repo-setup](repo-setup.md) | APPROVED | `CLAUDE.md`, `scripts/quiet-check.sh`, area maps |'
SETUP_NEXT="next: after merging, run /implement-prd-section $SETUP_PRD (or start a Claude session and say 'continue setup')"

# setup_prd TEMPLATE N SOURCE: the template with placeholders filled;
# {{MIGRATE}} lines are kept (marker stripped) only when N > 0.
setup_prd() {
  local owner; owner="$(git config user.name || echo owner)"
  awk -v n="$2" -v s="$3" -v d="$(date +%F)" -v o="$owner" '
    index($0, "{{MIGRATE}}") == 1 { if (n == 0) next; $0 = substr($0, 12) }
    { gsub(/\{\{DATE\}\}/, d); gsub(/\{\{SOURCE\}\}/, s); gsub(/\{\{N\}\}/, n)
      i = index($0, "{{OWNER}}"); if (i) $0 = substr($0, 1, i - 1) o substr($0, i + 9)
      print }' "$1"
}
# Insert the setup row after the index table's separator (stdin → stdout).
add_index_row() {
  awk -v r="$INDEX_ROW" '{ print } /^## Index/ { ix = 1 } ix && !done && /^\|---/ { print r; done = 1 }'
}
