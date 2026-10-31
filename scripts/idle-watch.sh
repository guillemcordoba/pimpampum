#!/usr/bin/env bash
# Tell the measurements whether you are at the computer (packages/bench/src/parallel.ts).
#
# While you use the keyboard or mouse the file says "active" and simulations
# keep to BENCH_LANES_BUSY workers (4); after IDLE_SECONDS without input it says
# "idle" and they use the whole machine. Needs a Wayland compositor with the
# idle-notify protocol (niri, sway, Hyprland…). Stop it with Ctrl-C or kill;
# the file is removed and measurements go back to their default.
set -euo pipefail
STATE="${XDG_RUNTIME_DIR:-/tmp}/pimpampum-user-state"
IDLE_SECONDS="${IDLE_SECONDS:-180}"
echo active > "$STATE"
# Not exec'd: the shell must outlive swayidle to remove the file (an exec'd
# script left a stale "active" behind when killed). `wait` lets a signal in at once.
watcher=
cleanup() { [ -n "$watcher" ] && kill "$watcher" 2>/dev/null; rm -f "$STATE"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
nix run nixpkgs#swayidle -- -w \
  timeout "$IDLE_SECONDS" "echo idle > '$STATE'" \
  resume "echo active > '$STATE'" &
watcher=$!
wait "$watcher"
