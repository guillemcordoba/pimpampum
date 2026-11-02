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

- A12. Contingencies from the agent playtest (2026-11-01, 10 games of 2v2 benders through `tools/agent-duel`, both players 4/10: ~5–6 at level 6, ~2 at level 10): hero-vs-hero fights at level 10 end on the first reveal (the top dice outgrow 12 PV, and the area finishers cost nothing); damage that ignores defense (Tempesta d'espurnes) makes defending pointless; nothing answers a fast card (no fast defense; fast Focus resolves after fast attacks); the order inside a step is commit speed at a real table; rules players had to discover: a guard takes the hit for the ally it protects, a hero felled earlier in a step still plays its card, Mantell de flames does not burn a Tempesta (not a contested attack).
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
- B16. [M] The AI's misplays on the new benders. **Landed 2026-11-02 (40cb399):** the rollouts' aim (`pickResolveTargets`) piled every blow on one body and never saw a body fall by its own card, so Supernova looked free; it now counts allies' aimed blows (no overkill), skips a body whose own card fells it (`EffectHandler.aiFellsItsPlayer`) and weighs danger as a tie-break. Checked: audit unchanged (its 1v1/2v1 positions never pile on), new vs old head to head 51.0% ±2.9, vs old-aim spam 76.3% vs 75.2%, the depth-0 heuristic vs spam 57.5% vs 47.0%; puzzles (h) and (i) (a sacrifice: (i) is the referee's PV currency, like (g)). The elements spread fell from 24pp to 13pp with it (B17). **Landed 2026-11-02, second:** the leaf capped next round's threat at the other side's whole health, so once a horde's raw blows exceeded the party's health a stun or a kill that took one blow away was worth nothing there; uncapped (puzzle (j)). Checked: the audit and the AI match unchanged (none of their positions reaches the cap: the match's 16-pair duplicates never differed), the ladder not worse (production vs spam 96.2% ±1.0, was 96.8% ±0.9; vs the heuristic 97.4%, was 94.9%; vs uniform 93.4%, was 91.3%). **Open: the Focus stuns (Trampa de gel, Remolí) are still almost never played** though often the best play. Measured 2026-11-02 at each real decision where the trap was legal (a scratch probe, deleted): not how often the AI expects its Focus broken — once the allies play the joint plan (one guards the bender) its rollouts expect the trap to land 71-78% of the time, real play 78-81%; and not the threat cap — in the elements fights it rarely binds (the trap's mean rank 4.8 → 4.2 uncapped, still never picked). What is left: in the patrol the trap trails Boira by ~0.8 point every round, and Boira is overplayed (picked 24.6%, best play 9%, B17). Suspect: the untargetable kind prices each veiled ally as a blow dodged (`0.5 × threatOn × turns`), though while the bender stays targetable the foes' blows only move to it — and a slow Boira's whole worth is that next-round price. No puzzle pins it yet: a slow veil is interrupted in every rollout, because the rollouts' aim adds +3 to hitting any pending Focus, which also makes a slow Focus a lightning rod worth something in health fractions (the currency of (g)). Playing more rounds before the leaf (`continuation`) flips puzzle (i) and breaks (d), (e1) and the hide control.
- B18. [S] `sets/fantasy/test/encounter-speed.test.ts` is red in the fast tier: the goblin horde and the mixed band solve in 6-12 s on a quiet machine, the bone devils near the 3 s bar (measured 2026-11-02; already at 08900e0, before that night's AI changes). Likely the longer fights since the level left the rolls; the fantasy content is to be redesigned anyway (C1), so retune the bar or the test fights then.
- B17. [M] Balance of the new elements set (kit analyzer with the AI aim fix of B16 and Ventada fast again, 2026-11-02, ~800 combats a kit): every kit inside the ±15pp band — air +11.0, Acrobàcia +7.7, water +6.8, earth +3.2, Mestre del xi +2.0, Artífex +0.8, Esgrima −1.9, fire −1.9 (from air +17.4 to fire −7.1 before the fix: the spread fell from 24pp to 13pp). Fights run long for earth (p90 9), fire (p90 9) and Artífex (p90 13), in `KNOWN`; water and Mestre del xi now end. The blind spots left (`KNOWN_BLIND`): Trampa de gel, Remolí, Parany de molla. **The measurement is thin: only 7 of 32 calibration cells are usable.** With the aim fix the heroes kill faster, the patrol (5 soldiers) caps on the 5-round fight length before it gets fair and the heroes win 89-100% of it; the lone unagi always did (82-100%). Recalibrating does not help (the shapes re-solve on every run); the creature count is the lever (`probe-shapes.ts --set elements`).
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
