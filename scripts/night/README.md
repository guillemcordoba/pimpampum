# The night runs

Two jobs, each a Claude session in a fresh worktree off `origin/main`:

| job | when | budget | what | prompt |
|---|---|---|---|---|
| `simplify` | 00:00 | 50 min | one pure refactor; skipped while a `simplify/` PR is open | `simplify.md` |
| `goals` | 01:00 | 6 h | the first unfinished goal in `GOALS.md` | `goals.md` |

Each session is interactive, inside tmux, with **Remote Control** on: watch it
or ask it something from the phone or claude.ai/code, or at the desk with
`tmux -L pimpampum attach -t <night>`. At its deadline it is told to wrap up,
and given 30 more minutes. Then the script, never the agent, pushes and opens
the pull request (five-line description) or, when nothing landed, comments on
the `Night log` issue; both carry the session's link. A session stays open
until its pull request is merged or closed (7 days at most).

**The simplify guard:** `pnpm fingerprint` hashes 300 seeded fights in both
sets. The script takes it on `origin/main` before the session and again after;
if it moved, the change altered the game and nothing is pushed.

Install (once, as the user; the computer must be on, not suspended, at night):

    for u in 'pimpampum-night@.service' pimpampum-night-goals.timer pimpampum-night-simplify.timer; do
      git -C ~/pimpampum show "origin/main:scripts/night/systemd/$u" > ~/.config/systemd/user/"$u"
    done
    systemctl --user daemon-reload
    systemctl --user enable --now pimpampum-night-goals.timer pimpampum-night-simplify.timer

The units are copies: re-run that after changing them. Try a job without
anything leaving the machine:

    NIGHT_JOB=simplify NIGHT_DRY_RUN=1 NIGHT_MINUTES=10 nix develop ~/pimpampum --command \
      bash <(git -C ~/pimpampum show origin/main:scripts/night/night.sh)

Logs and reports: `~/.local/state/pimpampum-night/<night>/`. Start a job now:
`systemctl --user start pimpampum-night@goals`. Stop one:
`systemctl --user disable --now pimpampum-night-simplify.timer`.
