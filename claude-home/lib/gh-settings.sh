# GitHub repo settings shared by scripts/bootstrap.sh and claude-home/adopt.sh.
# Source it; both functions take owner/name and print one status line.
# Templates and adopt can't copy these settings, so this is the only copy.

# Delete head branches on merge.
gh_repo_settings() {  # gh_repo_settings REPO
  if gh api -X PATCH "repos/$1" --silent -F delete_branch_on_merge=true; then
    echo "delete-branch-on-merge: on"
  else
    echo "WARN: could not turn on delete-branch-on-merge for $1"; return 1
  fi
}

# PR required, no force-push, no deletion. Branch protection on PRIVATE repos
# needs GitHub Pro; on Free it 403s, and the CLAUDE.md git rules are the only
# guard. Warn instead of failing.
gh_protect_main() {  # gh_protect_main REPO [BRANCH=main]
  local branch="${2:-main}"
  if gh api -X PUT "repos/$1/branches/$branch/protection" --silent --input - <<'JSON'
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
  then
    echo "$branch protected: PR required, no force-push, no deletion"
    echo "  once CI has run, require it too:"
    echo "  gh api -X PATCH repos/$1/branches/$branch/protection/required_status_checks -F strict=true -f 'contexts[]=checks'"
  else
    echo "WARN: branch protection not applied (private repo on GitHub Free needs Pro)."
  fi
  return 0
}
