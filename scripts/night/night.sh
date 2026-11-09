#!/usr/bin/env bash
# The night run: the first unfinished goal in GOALS.md, worked unattended in a
# fresh worktree off origin/main, one pull request (or one line in the
# "Night log" issue) for the morning. Started by the systemd user timer in
# scripts/night/systemd/; run it by hand the same way to test it.
#
#   NIGHT_HOURS=6     working budget; the run is killed 30 minutes after it
#   NIGHT_DRY_RUN=1   nothing leaves the machine (no push, no PR, no issue)
#   NIGHT_PROMPT=...  replaces the goal prompt (a plumbing test)
set -euo pipefail

REPO="${NIGHT_REPO:-$HOME/pimpampum}"
HOURS="${NIGHT_HOURS:-6}"
DRY="${NIGHT_DRY_RUN:-}"
KEEP_DAYS=14

DATE="$(date +%F)"
BRANCH="night/$DATE"
git -C "$REPO" show-ref --quiet "refs/heads/$BRANCH" && BRANCH="$BRANCH-$(date +%H%M)"
NAME="${BRANCH//\//-}"
WT="$REPO/.claude/worktrees/$NAME"
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/pimpampum-night"
RUN="$STATE/$NAME"
REPORT="$RUN/report.md"
mkdir -p "$RUN"

exec 9>"$STATE/lock"
flock -n 9 || { echo "another night run holds $STATE/lock"; exit 0; }
exec > >(tee -a "$RUN/night.log") 2>&1
echo "== night run $NAME, $(date)"

# Worktrees stay so a night can still be questioned (`claude --resume`); old ones go.
for old in "$REPO"/.claude/worktrees/night-*; do
  [ -d "$old" ] && [ -n "$(find "$old" -maxdepth 0 -mtime +"$KEEP_DAYS")" ] || continue
  echo "pruning $old"
  git -C "$REPO" worktree remove --force "$old" || true
done
git -C "$REPO" worktree prune

git -C "$REPO" fetch -q origin main
git -C "$REPO" worktree add -q -b "$BRANCH" "$WT" origin/main
cd "$WT"
pnpm install --frozen-lockfile --silent

DEADLINE="$(date -d "+$HOURS hours" +%H:%M)"
if [ -n "${NIGHT_PROMPT:-}" ]; then PROMPT="$NIGHT_PROMPT"; else PROMPT="$(cat scripts/night/prompt.md)"; fi
PROMPT="${PROMPT//'{{DATE}}'/$DATE}"
PROMPT="${PROMPT//'{{BRANCH}}'/$BRANCH}"
PROMPT="${PROMPT//'{{DEADLINE}}'/$DEADLINE}"
PROMPT="${PROMPT//'{{REPORT}}'/$REPORT}"
if [ -n "$DRY" ]; then
  PROMPT="$PROMPT

DRY RUN: do not push, do not open a pull request, do not post anywhere."
fi

SESSION="$(cat /proc/sys/kernel/random/uuid)"
echo "session $SESSION, working until $DEADLINE"
status=0
timeout --signal=INT --kill-after=5m "$((HOURS * 60 + 30))m" \
  claude -p "$PROMPT" --session-id "$SESSION" --name "$NAME" \
    --permission-mode auto --permission-prompts none --output-format json \
    > "$RUN/result.json" || status=$?
echo "claude exited $status"

ASK="Question this night's session: \`cd $WT && claude --resume $SESSION\`"
[ -s "$REPORT" ] || printf 'Night %s: no report\n\nThe run ended (exit %s) without writing its report. Log: %s\n' "$DATE" "$status" "$RUN/night.log" > "$REPORT"

if [ -n "$DRY" ]; then
  echo "dry run: report at $REPORT"; cat "$REPORT"; echo; echo "$ASK"
  exit 0
fi

ahead="$(git rev-list --count origin/main..HEAD)"
pr="$(gh pr list --head "$BRANCH" --state open --json url --jq '.[0].url // empty')"
if [ "$ahead" -gt 0 ] && [ -z "$pr" ]; then
  git push -q -u origin "$BRANCH"
  pr="$(gh pr create --base main --head "$BRANCH" --title "$(head -1 "$REPORT")" --body "$(tail -n +3 "$REPORT")")"
fi

if [ -n "$pr" ]; then
  gh pr comment "$pr" --body "$ASK"
  echo "pull request: $pr"
else
  issue="$(gh issue list --state open --search 'Night log in:title' --json number,title --jq '.[] | select(.title == "Night log") | .number' | head -1)"
  [ -n "$issue" ] || issue="$(gh issue create --title 'Night log' --body 'One comment per night that landed nothing (scripts/night/night.sh).' | grep -o '[0-9]*$')"
  gh issue comment "$issue" --body "$(cat "$REPORT")

$ASK"
  echo "nothing landed; reported on issue #$issue"
fi
