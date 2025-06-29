#!/bin/bash
set -e


echo "Preparing for release: switching from workspace to remote dependencies."
if [ -f "pnpm-workspace.yaml" ]; then
    echo "Renaming pnpm-workspace.yaml to prevent workspace-protocol resolution"
    mv pnpm-workspace.yaml pnpm-workspace.yaml.bak
else
    echo "pnpm-workspace.yaml not found, skipping rename."
fi

echo "Updating dependencies to latest versions from registry"
pnpm update --latest

echo "Staging changes for release commit"
git add package.json pnpm-lock.yaml

echo "Running clean, lint, build, and test..."
pnpm run clean && pnpm run lint && pnpm run build && pnpm run test

if git diff --staged --quiet; then
  echo "No changes to commit, skipping commit."
else
  ./commit.sh
fi

echo "Bumping version..."
pnpm version patch

echo "Generating release notes..."
pnpm dlx @eldrforge/kodrdriv release > RELEASE_NOTES.md

echo "Pushing to origin..."
git push --follow-tags

echo "Creating GitHub pull request..."
PR_URL=$(gh pr create --fill)
PR_NUM=$(echo "$PR_URL" | grep -o '[0-9]*$')
echo "Pull request created: $PR_URL"

echo "Waiting for PR #$PR_NUM checks to complete..."
while true; do
  STATUS=$(gh pr view "$PR_NUM" --json statusCheckRollup --jq '.statusCheckRollup.state' 2>/dev/null)
  if [[ -z "$STATUS" ]]; then
    STATUS="PENDING"
  fi
  echo "PR status: $STATUS"
  if [[ "$STATUS" == "SUCCESS" ]]; then
    echo "All checks passed!"
    break
  elif [[ "$STATUS" == "FAILURE" || "$STATUS" == "ERROR" ]]; then
    echo "PR checks failed."
    gh pr checks "$PR_NUM"
    exit 1
  elif [[ "$STATUS" == "PENDING" || "$STATUS" == "EXPECTED" ]]; then
    echo "Checks are pending... waiting 10 seconds."
    sleep 10
  else
    echo "Unknown PR status: $STATUS. Waiting 10 seconds."
    sleep 10
  fi
done

echo "Merging PR #$PR_NUM..."
gh pr merge "$PR_NUM" --squash --delete-branch

echo "Checking out main branch..."
git checkout main
git pull origin main

echo "Creating GitHub release..."
TAG_NAME="v$(jq -r .version package.json)"
gh release create "$TAG_NAME" --notes-file RELEASE_NOTES.md

echo "Creating next release branch..."
CURRENT_VERSION=$(jq -r .version package.json)
MAJOR=$(echo "$CURRENT_VERSION" | cut -d. -f1)
MINOR=$(echo "$CURRENT_VERSION" | cut -d. -f2)
PATCH=$(echo "$CURRENT_VERSION" | cut -d. -f3)
NEXT_PATCH=$((PATCH + 1))
NEXT_VERSION="$MAJOR.$MINOR.$NEXT_PATCH"

echo "Next version is $NEXT_VERSION"
git checkout -b "release/v$NEXT_VERSION"
git commit -m "feat: Start release v$NEXT_VERSION"
git push -u origin "release/v$NEXT_VERSION"

echo "Release process completed."
