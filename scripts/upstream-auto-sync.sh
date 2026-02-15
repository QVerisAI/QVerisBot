#!/usr/bin/env bash
set -euo pipefail

# Idempotent upstream sync script for fork repositories.
# Optional env overrides:
#   UPSTREAM_REMOTE=upstream
#   UPSTREAM_URL=https://github.com/openclaw/openclaw.git
#   BASE_BRANCH=main
#   SYNC_BRANCH=sync/upstream-YYYY-MM-DD

UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/openclaw/openclaw.git}"
BASE_BRANCH="${BASE_BRANCH:-main}"
TODAY="$(date +"%Y-%m-%d")"
SYNC_BRANCH="${SYNC_BRANCH:-sync/upstream-$TODAY}"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

ensure_git_repo() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "Not inside a git repository."
}

ensure_clean_tree() {
  if [[ -n "$(git status --porcelain)" ]]; then
    die "Working tree is not clean. Commit/stash changes before sync."
  fi
}

ensure_no_in_progress_ops() {
  git rev-parse -q --verify MERGE_HEAD >/dev/null && die "A merge is already in progress."
  git rev-parse -q --verify REBASE_HEAD >/dev/null && die "A rebase is already in progress."
  [[ -d .git/rebase-apply || -d .git/rebase-merge ]] && die "A rebase is already in progress."
}

ensure_remote() {
  if git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
    local existing_url
    existing_url="$(git remote get-url "$UPSTREAM_REMOTE")"
    if [[ "$existing_url" != "$UPSTREAM_URL" ]]; then
      die "Remote '$UPSTREAM_REMOTE' exists with different URL: $existing_url"
    fi
  else
    git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
  fi
}

switch_or_create_sync_branch() {
  if git show-ref --verify --quiet "refs/heads/$SYNC_BRANCH"; then
    git checkout "$SYNC_BRANCH"
  else
    git checkout -b "$SYNC_BRANCH" "origin/$BASE_BRANCH"
  fi
}

ensure_git_repo
ensure_no_in_progress_ops
ensure_clean_tree
ensure_remote

echo "==> Fetch remotes"
git fetch origin --prune
git fetch "$UPSTREAM_REMOTE" --prune

git show-ref --verify --quiet "refs/remotes/origin/$BASE_BRANCH" \
  || die "Missing origin/$BASE_BRANCH. Run fetch and verify base branch."
git show-ref --verify --quiet "refs/remotes/$UPSTREAM_REMOTE/$BASE_BRANCH" \
  || die "Missing $UPSTREAM_REMOTE/$BASE_BRANCH. Verify upstream remote/branch."

echo "==> Checkout sync branch: $SYNC_BRANCH"
switch_or_create_sync_branch

if git merge-base --is-ancestor "$UPSTREAM_REMOTE/$BASE_BRANCH" HEAD; then
  echo "==> Already up to date: HEAD already contains $UPSTREAM_REMOTE/$BASE_BRANCH"
  exit 0
fi

echo "==> Merge $UPSTREAM_REMOTE/$BASE_BRANCH into $SYNC_BRANCH"
if ! git merge --no-ff --no-edit "$UPSTREAM_REMOTE/$BASE_BRANCH"; then
  echo
  echo "Merge has conflicts. Resolve them, then run:"
  echo "  git add <resolved-files>"
  echo "  git commit"
  echo
  echo "Conflicted files:"
  git diff --name-only --diff-filter=U || true
  exit 1
fi

echo
echo "Sync merge completed on branch: $SYNC_BRANCH"
echo "Next recommended steps:"
echo "  pnpm install"
echo "  pnpm build"
echo "  pnpm check"
echo "  pnpm test:pack:smoke        # verify npm pack + install (optional)"
