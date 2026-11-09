# The night run

Every night at 01:00 a headless Claude session works the first unfinished goal
in `GOALS.md` (`prompt.md` holds its standing instructions) in a fresh worktree
off `origin/main`, for `NIGHT_HOURS` (6). In the morning there is either a pull
request with a five-line description, or a comment on the `Night log` issue
saying what was tried. Each carries the command to question that night's session.

Install (once, as the user; the computer must be on, not suspended, at 01:00):

    git -C ~/pimpampum show origin/main:scripts/night/systemd/pimpampum-night.service > ~/.config/systemd/user/pimpampum-night.service
    git -C ~/pimpampum show origin/main:scripts/night/systemd/pimpampum-night.timer > ~/.config/systemd/user/pimpampum-night.timer
    systemctl --user daemon-reload && systemctl --user enable --now pimpampum-night.timer

The units are copies: re-run those two lines after changing them. Try it without
anything leaving the machine:

    NIGHT_DRY_RUN=1 NIGHT_HOURS=1 nix develop ~/pimpampum --command \
      bash <(git -C ~/pimpampum show origin/main:scripts/night/night.sh)

Logs and reports: `~/.local/state/pimpampum-night/<night>/`. Start one now:
`systemctl --user start pimpampum-night`. Stop the habit: `systemctl --user disable --now pimpampum-night.timer`.
