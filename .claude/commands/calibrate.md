Calibrate the enemy `difficulty` factors so the encounter model's promised winrates match simulated reality. Run this after adding a new enemy or changing any enemy's cards.

**Argument (optional):** an enemy template id (e.g. `/calibrate basilisk`). If given ($ARGUMENTS), calibrate ONLY that species — pass it to every sweep below as `pnpm --filter @pimpampum/simulator calibrate <id>` (much faster per iteration: one species ≈ 1 min vs ~8 for all). With an argument, still finish with ONE full no-argument sweep at the end to confirm nothing else moved.

## Background

Each `EnemyTemplate` carries `difficulty` (threat per PV point, goblin ≈ 1.0) in its file under `packages/enemies/src/enemies/*.ts`. The encounter creator promises a player winrate from these factors; `packages/simulator/src/calibration.ts` measures whether reality agrees (random parties, model-solved encounters, many battles). The guard test `src/tests/enemy-difficulty.test.ts` fails when a species drifts beyond 12pp.

## Steps

1. Build first (the simulator imports built dist):
```bash
pnpm build 2>&1 | grep -iE "error|failed" || echo BUILD_OK
```

2. Run the calibration sweep (~6-9 min for all species, ~1 min for one; heavy sampling so 3pp is signal, not noise):
```bash
pnpm --filter @pimpampum/simulator calibrate            # all species
pnpm --filter @pimpampum/simulator calibrate basilisk   # one species (use $ARGUMENTS if given)
```
Each line shows: verdict (`OK` = |claim − real| ≤ **3pp**, the acceptance window), current `difficulty`, the model's promised winrate, the measured one, the drift, and a suggested value.

3. For every species marked `DRIFT` that is **not** in `CALIBRATION_EXCLUDED` (see `calibration.ts` — currently the wolf, whose Udol summon-stall breaks the scalar model): edit its template in `packages/enemies/src/enemies/<species>.ts`, setting `difficulty:` to the suggested value rounded to 2 decimals. Do NOT touch `OK` species — inside the window, suggestions are sampling noise (±1pp).

4. Rebuild the enemies package and rerun the sweep:
```bash
pnpm --filter @pimpampum/enemies build && pnpm --filter @pimpampum/simulator calibrate
```
Iterate steps 3-4 until every non-excluded species reads `OK` — keep going until ALL drifts are within the 3pp window (normally 2-4 rounds; corrections shrink each round).

5. **Non-convergence is a signal, not a tuning failure.** If a species keeps drifting after 3 rounds, or its measured winrate barely responds to the target (flat across t30…t85 like the wolf), the kit itself breaks the scalar model (stall loops, save-locks, unbounded synergies). Stop, report the pattern, and propose a kit fix instead of forcing a factor. Only add it to `CALIBRATION_EXCLUDED` if the user agrees.

6. Confirm with the guard test:
```bash
pnpm --filter @pimpampum/simulator test 2>&1 | tail -5
```

7. Report a table: species | old → new difficulty | claim vs real (final round). Note any excluded/non-converging species. Update the enemy-balance memory file if factors changed.
