#!/bin/sh
# Commits and pushes data/ after an analysis run (both auto-analysis workflows).
set -e
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add data
if git diff --cached --quiet; then
  echo 'Keine Änderungen.'
  exit 0
fi
git commit -m "$1"
git pull --rebase
git push
