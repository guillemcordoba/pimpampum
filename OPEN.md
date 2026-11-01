# Open work

Everything still to do, from the inventory of 2026-11-01. Tick an item off by
deleting it; when the file is empty, delete it, `NEXT-STEPS.md` and the branch
documents (`PRIORITY-REPORT.md`, `PRIORITY-MIGRATION.md`, `DESIGN-PROPOSALS.md`,
`AI-EQUILIBRIUM-PLAN.md`), repointing what cites them. Findings go into the doc
they change (`rules.md`, `intentions.md`, `ARCHITECTURE.md`) or the commit
message — never into a growing log.

## Decided, to implement

- **Every card is redesigned** (2026-11-01): the player kits (same skills, 10 cards each), the enemies, the gold cards and the item cards, each from a design doc the user writes (CLAUDE.md, "The user designs each kit"). The batch A–D proposals (`DESIGN-PROPOSALS.md`) are dropped. Pilot: the firebender, from the user's concept doc ("Maestre del foc — conceptes de cartes", https://claude.ai/artifact/2doahvh6T7Rwr3t6YsgkQb): all ten concepts kept, in the order 1 Bola de foc · 2 Mantell de flames · 3 Esclat · 4 Tempesta d'espurnes · 5 Pell d'obsidiana · 6 Alè de drac · 7 Foc interior · 8 Anell de foc · 9 Llamp · 10 Supernova.
- **Old cards until their kit is redesigned:** mechanical changes only (no design or balance edits).
- **Encounter-speed test:** stays red until fights shorten.

## Decisions for the owner

- A2. Rulings for `rules.md`, when a redesigned card needs them: the wall rule (every card in a holding wall pays its payoff), what "apunta" means for an area attack, the end-of-round order.
- A3. Interim defaults: a vanished aim retargets; no slow keyword; Cop desesperat is a normal card.
- A4. Balance direction: fights 4.3 → 6.0 rounds, Aggro > Power at 22.6% (Cures de camp), Guard +28.9 in card value. Report's advice: the AI first, then numbers.
- A6. Armour's price now that speed is gone (default: keep).
- A7. The equilibrium player: (a) its decision leaf; (b) when it replaces today's AI; (c) whether the balancer and bench switch too (about 160× today's cost on 3v3).
  The leaf run (2026-11-01, 300 duplicate pairs a cell, before the level left the roll), points over `margin`, ±1σ:
  'settled' +3.6 ±2.5 (2v2 archetypes), +2.0 ±2.8 (2v2 composed), +7.6 ±5.6 (3v3 archetypes);
  'adaptive' +4.3 ±2.5, +3.4 ±3.1, +2.4 ±6.2. Both ahead in every cell, none alone significant
  (pooled, settled ≈ +4.4 ±2.3, adaptive ≈ +3.4 ±2.5); the two are indistinguishable. Recommendation: 'settled', the cheaper.
- A8. Today's AI knobs (`continuation`, 9 samples): drop if A7b lands.
- A9. Merge path: priority-system → elements-set → main (main is 173 commits behind; the elements set was never accepted).
- A10. The web app playing the elements set (19 web files import set-fantasy).

## Work (assistant), in order

- B2. [M] The AI's estimates from the engine's contest (the engine side landed 2026-11-01, rulings in `rules.md`): the weapon bonus only with `weapon_damage`, a diceless attack is 0 not 3, Envoltat, roll modes, the status roll hooks, standing walls, `onlyAgainst` guards; then the bot ladder and the referee audit.
- B1. [M] The status vocabulary landed 2026-11-01 (`status-kinds.ts`, prices, `fieldValue`, `harmful`, the pricing test). Left: move the audit's statuses onto the kinds; drop `expectedIncomingDamage` and `unpricedChange` once nothing needs them; the 33 unused generic handlers. (Real cards move onto the kinds in C1.)
- B16. [M] The AI misvalues the new firebender (kit analyzer, 2026-11-01): it plays Supernova, which drops the bender to 0 PV, on ~40% of the turns it may (the worst card, −8 PV against the hand); it never plays Foc interior (best 9–13%, played 0.2%) and rarely Mantell de flames (in `KNOWN_BLIND`).
  **Why (probe, 2026-11-01, fire + water + earth at level 10 against five fire soldiers):** the lookahead's ROLLOUT MODEL of the enemy (depth-0 cards, `pickResolveTargets` aims) kills the fire bender in every rollout, whatever he plays (bender alive after a Llamp round: rollout model 0%, real enemy AI 21%). So in the AI's imagination the bender is doomed anyway: Supernova costs nothing extra and hits five enemies, and a bender's Focus (Foc interior) is always interrupted. The real enemy AI, aiming after the reveal, sends its blows at the other heroes when the bender burns himself out (heroes alive after a Supernova round: rollout model 2.00, real 0.54), and playouts to the end give Supernova 0% wins against Llamp's 30–75%. The evaluator's weights are not the cause: a heavier body weight (12, 24), more samples, a searched opponent or depth 2 all keep Supernova first by the same ~2.2 points. **Fix direction:** an opponent model whose aim reads the reveal and spreads like the real AI (or `searchTargets` with a small budget inside rollouts), checked against the real AI on positions like this one; then a generic puzzle (a self-sacrificing area attack), the bot ladder and the referee.
- B10. [S] Close the decision-leaf measurement (needs A7a); delete the losing leaves.
- B3. [M–L] The round as a first-class value (one prompt loop, no public `roundPrepared`, no seat remapping, a referee that branches instead of replaying).
- B4. [S] `isBlindSpot` requires a gain when best; empties `KNOWN_BLIND`.
- B5. [M] Pin calibration data, not code; drop `speed`/`speedPenalty`; the control kits' "fastest" cards become `fast`.
- B6. [S] Card legality from one engine source.
- B12. [M] Re-run the content-free slow tests never run under priority (bench pipeline, card value, playtest controls) and fix the instrument.
- B13. [S] Check the web app in a real browser.
- B14. [S] `bench/combatlog.ts` from structured log events; the balancer's `HETEROGENEITY` from a clustered error bar.
- B8. [M] Before the switch: bot-ladder and benchmark rows for the equilibrium player, puzzles as "the mix weighs the right card", the bench columns the plan names.
- B9. [M–L] 4v4 rounds from 12 s toward 5 s.
- B7. [L] After A7b: delete depth 0 and its constants, and `continuation`.
- B15. [S] After A7: keep only the standing equilibrium harnesses.

## Waits for the card migration (real cards are frozen)

- C1. Redesign kit by kit, firebender first: the user's design doc → mechanics and dice on the ramp (`intentions.md`) → implement, statuses from the engine's kinds (`applyKind`) or priced bespoke → `/analyze` and tuning → one fresh `card-taste` read → the results into the user's doc. Along the way: the `harm`/`bodyOut` marks onto `harmful`, the duplicated `status-behaviors.ts` into `sets/common`, delete the enemy-block machinery, and check that the old cards' bugs (`silenced` never read, putrefacció's uncloned `WeakSet`, 15 behaviour-less status keys), their `TODO(balance)` constants and the 28 unpriced statuses in `status-pricing.test.ts` all went with them.
- C4. One recalibration for the migration and the AI switch (`calibration:refresh`; the pinned copies still add a level by hand in places, and `skillLevelBonus` lives on for them until then), then the kit suites, both triangles, the armour bound, `/analyze`, and tuning per A4.
- C5. Elements questions: the unagi as boss or creature (needs a cards-per-round seam), the Cop i fuga ★ text, the lopsided calibration cells, the shirshu and the puppeteer alone.
- C6. The 80 gold cards, redesigned with the rest (`sets/common/DESIGN.md`).
- C7. Toc de la mort's rule, re-decided after C4.

## Last

- Retire `NEXT-STEPS.md` (158 references in 69 files) and the branch documents; drop them from `CLAUDE.md`.
