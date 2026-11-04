# Linters every repo runs in CI (docs/prd/repo-guards.md §1), shared by
# claude-home/adopt.sh and scripts/bootstrap.sh. Source it. The scripts are
# copied, not fetched: the template repo is private.

LINTERS="prd-lint.sh features.sh doc-lint.sh"  # prd-lint.sh calls features.sh beside it
LINTER_DIR=claude-home/skills/implement-prd-section/scripts  # under the template root
MANAGED='# managed by llm-repo-template adopt; edit it there'

# managed_copy: a linter (stdin → stdout) with the managed line as line 2.
managed_copy() { awk -v m="$MANAGED" '{ print } NR == 1 { print m }'; }

# add_lint_targets: quiet-check.sh (stdin → stdout) with the prd-lint and
# doc-lint targets added when missing, before the TARGETS block's first
# comment line or its closing quote.
add_lint_targets() {
  awk '
    { line[NR] = $0 }
    /^TARGETS=/ { b = 1; next }
    b && /^'"'"'/ { b = 0 }
    b && /^prd-lint\|/ { p = 1 }
    b && /^doc-lint\|/ { d = 1 }
    END {
      for (i = 1; i <= NR; i++) {
        if (line[i] ~ /^TARGETS=/) b = 1
        else if (b && !done && (line[i] ~ /^#/ || line[i] ~ /^'"'"'/)) {
          if (!p) print "prd-lint|.|bash scripts/prd-lint.sh|generic"
          if (!d) print "doc-lint|.|bash scripts/doc-lint.sh|generic"
          done = 1
        }
        print line[i]
      }
    }'
}

# set_ci_targets: ci.yml (stdin → stdout) running both linters.
set_ci_targets() { sed 's/^\( *CI_TARGETS: \)""   # e\.g\. "/\1"prd-lint doc-lint"   # add yours, e.g. "/'; }
