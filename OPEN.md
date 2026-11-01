# Open work

Everything still to do, from the inventory of 2026-11-01. Tick an item off by
deleting it; when the file is empty, delete it, `NEXT-STEPS.md` and the branch
documents (`PRIORITY-REPORT.md`, `PRIORITY-MIGRATION.md`, `DESIGN-PROPOSALS.md`,
`AI-EQUILIBRIUM-PLAN.md`), repointing what cites them. Findings go into the doc
they change (`rules.md`, `intentions.md`, `ARCHITECTURE.md`) or the commit
message — never into a growing log.

## Decided, to implement

- **Real cards during structural work:** mechanical changes only (no design or balance edits).
- **Encounter-speed test:** stays red until fights shorten.

## Decisions for the owner

- A1. Card picks, batches A–D (`DESIGN-PROPOSALS.md`): final texts, two title changes, batch A renames, Colós de butxaca, Coixí de vent.
- A2. Rulings for `rules.md`: the wall rule, an AoE "apunta" each target, the end-of-round order, a Cometa that never lands and its fatigue, *desavantatge*.
- A3. Interim defaults: a vanished aim retargets; no slow keyword; Cop desesperat is a normal card; the 7 enemy-block cards until batch B.
- A4. Balance direction: fights 4.3 → 6.0 rounds, Aggro > Power at 22.6% (Cures de camp), Guard +28.9 in card value. Report's advice: the AI first, then numbers.
- A6. Armour's price now that speed is gone (default: keep).
- A7. The equilibrium player: (a) its decision leaf, after the settled/adaptive run; (b) when it replaces today's AI; (c) whether the balancer and bench switch too (about 160× today's cost on 3v3).
- A8. Today's AI knobs (`continuation`, 9 samples): drop if A7b lands.
- A9. Merge path: priority-system → elements-set → main (main is 173 commits behind; the elements set was never accepted).
- A10. The web app playing the elements set (19 web files import set-fantasy).

## Work (assistant), in order

- B2. [M] The AI's estimates from the engine's contest (the engine side landed 2026-11-01, rulings in `rules.md`): the weapon bonus only with `weapon_damage`, a diceless attack is 0 not 3, Envoltat, roll modes, the status roll hooks, standing walls, `onlyAgainst` guards; then the bot ladder and the referee audit.
- B1. [M] The status vocabulary landed 2026-11-01 (`status-kinds.ts`, prices, `fieldValue`, `harmful`, the pricing test). Left: move the audit's statuses onto the kinds; drop `expectedIncomingDamage` and `unpricedChange` once nothing needs them; the 33 unused generic handlers. (Real cards move onto the kinds in C1.)
- B10. [S] Close the decision-leaf measurement (needs A7a); delete the losing leaves.
- B3. [M–L] The round as a first-class value (one prompt loop, no public `roundPrepared`, no seat remapping, a referee that branches instead of replaying).
- B4. [S] `isBlindSpot` requires a gain when best; empties `KNOWN_BLIND`.
- B5. [M] Pin calibration data, not code; drop `speed`/`speedPenalty`; the control kits' "fastest" cards become `fast`.
- B6. [S] Card legality from one engine source.
- B11. [S] `bench/test/positions.test.ts`: read stalls as saturated (or field a shape that cannot stall).
- B12. [M] Re-run the content-free slow tests never run under priority (bench pipeline, card value, playtest controls) and fix the instrument.
- B13. [S] Check the web app in a real browser.
- B14. [S] `bench/combatlog.ts` from structured log events; the balancer's `HETEROGENEITY` from a clustered error bar.
- B8. [M] Before the switch: bot-ladder and benchmark rows for the equilibrium player, puzzles as "the mix weighs the right card", the bench columns the plan names.
- B9. [M–L] 4v4 rounds from 12 s toward 5 s.
- B7. [L] After A7b: delete depth 0 and its constants, and `continuation`.
- B15. [S] After A7: keep only the standing equilibrium harnesses.

## Waits for the card migration (real cards are frozen)

- C1. Implement the picks (A1), building statuses from the engine's kinds (`applyKind`) or pricing bespoke ones (the 28 in `status-pricing.test.ts`), the `harm`/`bodyOut` marks onto `harmful`, the duplicated `status-behaviors.ts` into `sets/common`; delete the enemy-block machinery.
- C2. Real-card bugs: `silenced` never read (`attack-effects.ts:166`); putrefacció's `WeakSet` not cloned (`nigromant.ts:34`); 15 behaviour-less status keys.
- C3. `TODO(balance)` constants from the d20 era (`runes.ts:81`, `explosives-engineer.ts:10`, the `*-effects.ts`).
- C4. One recalibration for the migration and the AI switch (`calibration:refresh`), then the kit suites, both triangles, the armour bound, `/analyze`, and tuning per A4.
- C5. Elements questions: the unagi as boss or creature (needs a cards-per-round seam), the Cop i fuga ★ text, the lopsided calibration cells, the shirshu and the puppeteer alone.
- C6. The 80 gold cards: a pass for the priority rules, then picking (`sets/common/DESIGN.md`).
- C7. Toc de la mort's rule, re-decided after C4.

## Last

- Retire `NEXT-STEPS.md` (158 references in 69 files) and the branch documents; drop them from `CLAUDE.md`.
