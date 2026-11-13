#!/usr/bin/env bash
# The night runs. Each works in a fresh worktree off origin/main, as an
# interactive Claude session inside tmux with Remote Control on (watch or
# question it from the phone or claude.ai/code), and leaves at most one pull
# request, or one comment on the "Night log" issue. The session stays open
# until its pull request is merged or closed, KEEP_DAYS at most.
#
#   NIGHT_JOB=goals     the first unfinished goal in GOALS.md (goals.md)
#   NIGHT_JOB=simplify  one pure refactor, guarded by `pnpm fingerprint` (simplify.md)
#   NIGHT_MINUTES=...   working budget (goals 360, simplify 50); then a wrap-up message and GRACE more
#   NIGHT_DRY_RUN=1     nothing leaves the machine (no push, no PR, no issue)
#   NIGHT_PROMPT=...    replaces the job's prompt (a plumbing test)
#   NIGHT_BASE=...      the ref to start from (origin/main; another, to test a change to this script)
set -euo pipefail
shopt -u patsub_replacement 2>/dev/null || true

JOB="${NIGHT_JOB:-goals}"
case "$JOB" in
  goals)    PREFIX=night;    MINUTES="${NIGHT_MINUTES:-360}" ;;
  simplify) PREFIX=simplify; MINUTES="${NIGHT_MINUTES:-50}" ;;
  *) echo "NIGHT_JOB=$JOB: goals or simplify"; exit 2 ;;
esac
REPO="${NIGHT_REPO:-$HOME/pimpampum}"
DRY="${NIGHT_DRY_RUN:-}"
BASE="${NIGHT_BASE:-origin/main}"
KEEP_DAYS=7
GRACE=30
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/pimpampum-night"
mkdir -p "$STATE"
# What a night measures outlives its worktree: the bench cache is keyed by the
# sources and the content, so the next night reads every finished chunk while
# neither changed. Entries nobody wrote for CACHE_DAYS go.
CACHE="$STATE/bench-cache"
CACHE_DAYS=14
mkdir -p "$CACHE"
find "$CACHE" -type f -mtime +"$CACHE_DAYS" -delete 2>/dev/null || true

TMUX_BIN="$(command -v tmux || echo "$(nix build --no-link --print-out-paths nixpkgs#tmux^out)/bin/tmux")"
T() { "$TMUX_BIN" -L pimpampum "$@"; }

exec 9>"$STATE/$JOB.lock"
flock -n 9 || { echo "another $JOB run holds $STATE/$JOB.lock"; exit 0; }

# --- close what the owner is done with ----------------------------------------
# A night's session, worktree and local branch go once its pull request is
# merged or closed, or after KEEP_DAYS.
for meta in "$STATE"/*/branch; do
  [ -e "$meta" ] || continue
  run="$(dirname "$meta")"; name="$(basename "$run")"; branch="$(cat "$meta")"
  age_days=$(( ($(date +%s) - $(stat -c %Y "$meta")) / 86400 ))
  pr_state="$(cd "$REPO" && gh pr list --head "$branch" --state all --json state --jq '.[0].state // ""' 2>/dev/null || true)"
  if [ "$pr_state" = MERGED ] || [ "$pr_state" = CLOSED ] || [ "$age_days" -ge "$KEEP_DAYS" ]; then
    echo "closing $name ($pr_state, $age_days days)"
    T kill-session -t "$name" 2>/dev/null || true
    git -C "$REPO" worktree remove --force "$REPO/.claude/worktrees/$name" 2>/dev/null || true
    git -C "$REPO" branch -D "$branch" 2>/dev/null || true
    rm -f "$meta"
  fi
done
git -C "$REPO" worktree prune

# --- at most one simplify pull request waits for the owner ---------------------
git -C "$REPO" fetch -q origin main
if [ "$JOB" = simplify ]; then
  waiting="$(cd "$REPO" && gh pr list --state open --json headRefName --jq '[.[] | select(.headRefName | startswith("simplify/"))] | length')"
  if [ "$waiting" -gt 0 ]; then echo "a simplify pull request is still open: skipping tonight"; [ -n "$DRY" ] || exit 0; fi
fi

# --- the worktree ---------------------------------------------------------------
DATE="$(date +%F)"
BRANCH="$PREFIX/$DATE"
git -C "$REPO" show-ref --quiet "refs/heads/$BRANCH" && BRANCH="$BRANCH-$(date +%H%M)"
NAME="${BRANCH//\//-}"
WT="$REPO/.claude/worktrees/$NAME"
RUN="$STATE/$NAME"
REPORT="$RUN/report.md"
DONE="$RUN/done"
mkdir -p "$RUN"
exec > >(tee -a "$RUN/night.log") 2>&1
echo "== $JOB run $NAME, $(date)"

git -C "$REPO" worktree add -q -b "$BRANCH" "$WT" "$BASE"
echo "$BRANCH" > "$RUN/branch"
cd "$WT"
pnpm install --frozen-lockfile --silent

fingerprint() { pnpm --silent fingerprint 2>&1 | sed -n 's/^fingerprint \([0-9a-f]*\).*/\1/p'; }
BASE_PRINT=""
if [ "$JOB" = simplify ]; then
  BASE_PRINT="$(fingerprint)"
  echo "fingerprint on origin/main: ${BASE_PRINT:-FAILED}"
  [ -n "$BASE_PRINT" ] || { echo "pnpm fingerprint fails on origin/main: no simplify run until it works"; exit 1; }
fi

# --- the prompt -------------------------------------------------------------------
START="$(date +%s)"
DEADLINE_AT=$(( START + MINUTES * 60 ))
DEADLINE="$(date -d "@$DEADLINE_AT" +%H:%M)"
if [ -n "${NIGHT_PROMPT:-}" ]; then PROMPT="$NIGHT_PROMPT"; else PROMPT="$(cat "scripts/night/$JOB.md")"; fi
RECENT="$(git log --since=7.days --name-only --format= "$BASE" -- 'packages/*.ts' 'packages/*.vue' \
  | grep -v -e '/calibration-kits/' -e '/dist/' | sort -u | sed 's/^/- /' | head -60)"
PACKAGES=(engine ai combat-balancer bench playtest sets/common sets/fantasy sets/elements tools web)
ROTATION="packages/${PACKAGES[$(( 10#$(date +%j) % ${#PACKAGES[@]} ))]}"
PROMPT="${PROMPT//'{{DATE}}'/$DATE}"
PROMPT="${PROMPT//'{{BRANCH}}'/$BRANCH}"
PROMPT="${PROMPT//'{{DEADLINE}}'/$DEADLINE}"
PROMPT="${PROMPT//'{{REPORT}}'/$REPORT}"
PROMPT="${PROMPT//'{{DONE}}'/$DONE}"
PROMPT="${PROMPT//'{{FINGERPRINT}}'/$BASE_PRINT}"
PROMPT="${PROMPT//'{{RECENT}}'/${RECENT:-(nothing changed this week)}}"
PROMPT="${PROMPT//'{{ROTATION}}'/$ROTATION}"
printf '%s\n' "$PROMPT" > "$RUN/prompt.txt"

# --- the session --------------------------------------------------------------------
SESSION="$(cat /proc/sys/kernel/random/uuid)"
echo "$SESSION" > "$RUN/session"
T new-session -d -s "$NAME" -x 220 -y 50 -c "$WT" -e "PATH=$PATH" -e "BENCH_CACHE_DIR=$CACHE" \
  "claude --remote-control $NAME --session-id $SESSION --permission-mode auto --effort high \"\$(cat $(printf %q "$RUN/prompt.txt"))\""
LINK=""
for _ in $(seq 1 30); do
  LINK="$(T capture-pane -p -t "$NAME" 2>/dev/null | grep -o 'https://claude.ai/code/session_[A-Za-z0-9]*' | head -1 || true)"
  [ -n "$LINK" ] && break
  sleep 3
done
echo "session $SESSION, ${LINK:-no Remote Control link seen}, working until $DEADLINE"

warned=""
while [ ! -e "$DONE" ] && T has-session -t "$NAME" 2>/dev/null; do
  now="$(date +%s)"
  if [ "$now" -ge "$DEADLINE_AT" ] && [ -z "$warned" ]; then
    T send-keys -t "$NAME" -l "It is $DEADLINE: wrap up now. Leave the branch at its last good commit, write the report, then touch $DONE."
    T send-keys -t "$NAME" Enter
    warned=1
  fi
  [ "$now" -ge $(( DEADLINE_AT + GRACE * 60 )) ] && { echo "no done marker after the grace period"; break; }
  sleep 30
done
echo "session finished its work at $(date +%H:%M)"

# --- the morning ------------------------------------------------------------------
ASK="Open this night's session: ${LINK:-(no Remote Control link)} · at the desk: \`tmux -L pimpampum attach -t $NAME\` (once closed: \`cd $WT && claude --resume $SESSION\`)"
[ -s "$REPORT" ] || printf '%s night %s: no report\n\nThe session left no report. Log: %s\n' "$JOB" "$DATE" "$RUN/night.log" > "$REPORT"

ahead="$(git rev-list --count "$BASE"..HEAD)"
refusal=""
if [ "$JOB" = simplify ] && [ "$ahead" -gt 0 ]; then
  AFTER_PRINT="$(fingerprint)"
  [ "$AFTER_PRINT" = "$BASE_PRINT" ] || refusal="Refused: the fingerprint moved ($BASE_PRINT → ${AFTER_PRINT:-no hash}), so this changes the game. Nothing was pushed."
fi

if [ -n "$DRY" ]; then
  echo "dry run ($ahead commits${refusal:+; $refusal}): report at $REPORT"; cat "$REPORT"; echo; echo "$ASK"
  exit 0
fi

if [ "$ahead" -gt 0 ] && [ -z "$refusal" ]; then
  git push -q -u origin "$BRANCH"
  pr="$(gh pr create --base main --head "$BRANCH" --title "$(head -1 "$REPORT")" --body "$(tail -n +3 "$REPORT")")"
  gh pr comment "$pr" --body "$ASK"
  echo "pull request: $pr"
else
  issue="$(gh issue list --state open --search 'Night log in:title' --json number,title --jq '.[] | select(.title == "Night log") | .number' | head -1)"
  [ -n "$issue" ] || issue="$(gh issue create --title 'Night log' --body 'One comment per night run that opened no pull request (scripts/night/).' | grep -o '[0-9]*$')"
  gh issue comment "$issue" --body "**$JOB, $DATE**${refusal:+ — $refusal}

$(cat "$REPORT")

$ASK"
  echo "no pull request; reported on issue #$issue"
fi
