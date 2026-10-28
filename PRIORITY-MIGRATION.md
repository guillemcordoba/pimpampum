# Priority system — migration plan (replaces speed)

**Goal.** Replace speed with the priority system in every package and both sets, keeping the
engine content-free (CLAUDE.md non-negotiables). Work on a new branch `priority-system` cut from
`elements-set`. Nothing is merged into `elements-set` or `main` without the user's acceptance.

## The rules (decided 2026-10-28)

| # | Rule |
|---|---|
| R1 | **No speed.** No speed stat, no armour speed penalty, no speed modifiers. |
| R2 | **Order of resolution.** First a fast step: fast Defense → fast Attack → fast Focus. Then the normal steps: Defense → Attack → Focus. A card is fast only when its text says so. |
| R3 | **Attacks aim at the reveal.** Attackers choose targets after seeing every revealed card. |
| R4 | **Defenses choose after the aims.** A Defense guards **yourself or one ally**, and blocks every attack on either. Defenses on the same character **sum into a wall** (defensa conjunta). **There's no "block an enemy" mode.** |
| R5 | **Order inside a step.** Cards of the same step resolve in the order their players committed them. At the table, whoever decided first goes first. In the simulator (AI seats) the order is random, as the tie shuffle does today. |
| R6 | **Focus.** A Focus is cancelled if its actor took damage earlier in the round (unchanged). |
| R7 | **No global price on attacking.** No cooldown, no hand rules. Every defense card carries its own on-block payoff (counter, wall, weaken…; already in intentions.md). Dice let a Focus-pumped attack break through a Defense. Both are content, through the design pass. |

### Defaults for the smaller questions (to confirm or change)

| | Default |
|---|---|
| An aimed target is already down at resolution | The attack retargets another living enemy (today's behaviour) |
| `slow` keyword | **None.** The three cards that would need it go to the design pass |
| Cop desesperat ("lent") | A normal card |
| Armour (leather, iron) and the gran destral | They lose their speed cost; values unchanged; re-measured against the ≤15% rule; a re-pricing proposal in the morning |
| The 7 "Bloqueja…" cards | They keep their current mechanic through an explicit enemy-target Defensa **until redesigned**. The generic Defense choice becomes ally/self only. The block machinery is deleted once the redesigns land |

## Overnight phases

Each phase ends green (`pnpm build && pnpm test`) and is committed and pushed to `priority-system`.

### P0. Baseline
- Cut `priority-system` from `elements-set`.
- Record the baseline: `pnpm build`, `pnpm test` and `pnpm test:smoke` results.

### P1. Engine (`packages/engine`)

**Types and statuses**
- Add `ActionDefinition.fast?: boolean`; delete `speed`.
- Delete `EquipmentDefinition.speedPenalty`.
- Delete the `'speed'` modifier kind.
- Replace `StatusBehavior.modifySpeed` with `StatusBehavior.fast?(ref, action): boolean | void`, to grant or strip fast (Patinet d'aire, Poció de rapidesa).

**Order of the queue**
- Write one function, `orderKey(type, fast)`, that encodes R2 and reads only `ActionType` and `fast`.
- `planActions` sorts by that key. Inside a key it uses the commit order: the position of each human selection, with AI seats interleaved at random. The existing shuffle stays for AI-only ties.
- Steps replace speed tiers (equal key = one tier; the tier snapshots stay).
- `delayPendingAction` means "after the last step"; `advancePendingAction` joins the current step.
- `flowSwap` re-sorts the queue, and re-aims when the new card is an Attack.

**Aims and guards**
- **Every Attack aims at the reveal.** Generalise `aimsAtReveal` / `aimNow` / `aimAtReveal`; the human prompt already exists. Order of prompts: aim first, then reveal options.
- Expose the aims in `PendingSummary` and `plannedThisRound()` as `targets`, for the AI, the UI and content (Punyalada traïdora, Puny de la muntanya).
- Defenses choose their target at the Defense step, after the aims. The `'defense'` target requirement becomes **ally or self only**. An explicit enemy-target Defensa stays possible, for the 7 interim cards.
- Add a reveal-time type pick (`resolveAs` asked at the reveal), so Braços d'aigua lands in the right step.

**Tests**
- New `flow.test.ts` cases asserting:
  - R2, including the fast step;
  - R3 (attack aims are fixed at the reveal);
  - R4 (guards chosen after the aims, walls sum, no enemy block from the generic choice);
  - R5 (commit order, random for AI);
  - R6.
- Rewrite the speed-based engine tests: `flow`, `seams`, the `seams-*` files, `character`, `properties`.
- Use the content-free fixtures in `engine/src/testing.ts`.

### P2. Content, mechanical pass (`sets/common`, `sets/fantasy`, `sets/elements`)

**Speed out**
- Remove every `speed:` literal (about 160) and every `speedPenalty`.
- Remove `ModKind 'speed'`.
- Fix the default kind of `debuff_on_hit`: today a missing kind silently becomes a speed debuff (`elements/.../effects/generic.ts:247`).
- **Never touch `bench/calibration-kits/`.** Keep `speed` optional in the type until P6 re-pins them, so the snapshot still compiles.

**Fast marked where F2 carries the card** (from the audit; see the appendix)
- Plain fast attacks: Punyalada ràpida, Urpa ràpida, Mossegada en vol, Punys encesos, Fletxa a l'escletxa, Llengua paralitzant, Vol propulsat.
- The timing cards that F2 carries:
  - Trampolí de mans, Ràfega de dits, Bomba de fum, Marca de la perdició (fast only; its −3 de velocitat waits for the design pass);
  - Rugit de guerra, Injecció d'adrenalina, Poció de vida, Amagar-se;
  - Fuet d'aigua, Sang sota la lluna, Ira de l'oceà, Guant de pedra;
  - Catapulta de vent, Cop i fuga, Ull de l'huracà, Palmell d'aire (with "act last" = after the last step).

**Handlers that need the new reads**
- `flanking`, `pile_on` and `mountain_fist` read the aims.
- `shape_shift` (Braços d'aigua) picks its type at the reveal.
- Trampolí's `aiWeight` stops reading `def.speed`.

**Descriptions**
- Only text that becomes false changes: `{V}` and "velocitat" clauses, "actues primer", "actua l'últim", Bardissa d'acer's redundant clause.
- Every changed text is listed for the morning review. Anything that needs a new idea goes to P3, not here.

### P3. Content, design pass (concepts only; nothing implemented without the user's picks)

Per CLAUDE.md: `card-designer` designs, a fresh `card-taste` judges each round, and the user picks.
The night produces `DESIGN-PROPOSALS.md` for the morning, covering:
- **Cards that lose their point (4):** Tombarella de rescat, Alè de gebre, Paisatge congelat, Escut de fusta.
- **The Gel kit** as a whole (both of its cards are speed effects).
- **The 7 enemy-block defense cards:**
  - common: 2;
  - elements: 5, including "Bloqueja un enemic. Si aguanta, el torn següent cap dels dos juga carta" and "Bloqueja tots els enemics".
- **Cards F2 doesn't carry:**
  - Llamp de sang freda, Salt del meteor and Punyals de foc (they would have needed `slow`);
  - Punyalada traïdora (could read the aims instead);
  - Caiguda de cometa;
  - Ganxo salvavides (the defender would pick which blow to stop);
  - Poció de rapidesa and Patinet d'aire (they need a grant-fast status).
- **Clause drops:** Invocar l'ombra de l'infern, Udol de terror, Marca de la perdició.
- **Every defense card without an on-block payoff** (R7). A list is drawn up first, then the designer gives each one a payoff that fits its lore.

### P4. AI (`packages/ai`)

**Code changes**
- Drop the `speed` argument from `TargetChooser`, `Policy` and `searchTargets`.
- Depth-0 heuristics:
  - **interrupt value:** an enemy plays a normal Focus, so any attack this round can interrupt it;
  - **first-strike prior:** becomes a fast bonus;
  - **`focusing` bonus:** becomes "the enemy plays a Focus".
- **Defense:** `guardOrBlock` and `incomingByAlly` read the **real aims**, no longer predicting them.
- **Attack aiming:** predicts cover from the *revealed* Defense cards, because guards don't exist yet when attacks aim.
- **Look-ahead:** the target search runs at the reveal for attacks, and at the Defense step for guards.
- **AI audit:** archetype parameters (jab, advance, taunt and hide rebuilt on fast), `profile.ts` re-measured with `ai-audit-calibrate.ts`, the arithmetic in `controls.ts`, and the referee's decision order (aims at the reveal, then defenders).

**Verification** (memory rules)
- the Nash referee audit after the AI changes;
- the bot ladder (ai-strength vs spam must not get worse);
- the puzzle and defect-puzzle suites updated for the new order.

### P5. Tooling, web, docs

**Tooling**
- `tools/play.ts` (reveal by step).
- `mutation.ts`: the F8 rename, and the stale find-string at `:285`.
- Playtest control kits: the "speed 9" tricks become fast or priority. Re-check their requirement bands.
- The bench's synthetic set.
- The snapshot test's simulated drift (it edits a `speed:` literal), and `content.test.ts`.

**Web**
- Card face: a fast badge replaces the speed stat.
- The reveal list is grouped by step.
- **Aims are shown before the defense prompts.**
- **The order cards are locked in is recorded,** for R5.
- `RulesView` and `card-template.html`.

**Docs**
- `rules.md`: speed, order, armour, and Cop desesperat.
- `intentions.md`: the speed-ordering bullet, the triangle's reasons, and the speed levers.
- `CLAUDE.md`, `ARCHITECTURE.md`, and the speed lines in `card-taste.md`.

### P6. Re-measure

- `pnpm calibration:refresh`: re-pins the kits without speed, and recalibrates once. Only then is `speed` deleted from the type.
- `pnpm test`, `pnpm test:smoke`, `pnpm test:slow`.
- The kit suites, the triangle test, the armour ≤15% assertion.
- `/analyze`.
- Dated numbers go in `NEXT-STEPS.md`, and every conflict with `intentions.md` is flagged.
- Measurements are throttled (memory): one measuring agent at a time. Long runs are split to fit the 2-hour limit on background jobs.

## Done criteria for the night

- **Builds and suites:** `pnpm build`, `pnpm test` and `pnpm test:smoke` are green on `priority-system`.
- **No speed left:** `grep` finds no speed in the engine, AI or content outside the pinned calibration copies (until P6 re-pins them) and dated history.
- **New tests:** the new `flow.test.ts` assertions for R2–R6 exist and pass.
- **Slow tier reported as it is:** failures are explained, never skipped. Any balance shift is listed with its intentions conflict.
- **Morning files:** `DESIGN-PROPOSALS.md` and a `PRIORITY-REPORT.md`, covering what changed, what's pending the user, and the measurements.
- **Merges:** nothing merged; `priority-system` pushed.

## Risks

- **About 33 test files assume speed.** The heaviest: engine `seams` and `flow`, AI `defect-puzzles`.
- **The AI changes have to pass the referee audit and the bot ladder.** Attack aiming loses its view of guards.
- **Balance moves everywhere.**
  - Slow attacks and guards gain.
  - Plain fast attacks lose their edge.
  - Every Focus becomes interruptible by any normal attack.
  - The triangle needs re-measuring; intentions.md says to buff the corner that beats the winner.
- **The calibration snapshot** must never be hand-edited. The bench cache recomputes everything.
- **Phases left unfinished.** P3 to P6 may not all finish in one night. The order above puts the engine and the green suites first.

## Appendix: the audit's card classification under F2

*(Recovered from the deleted exploration, 2026-10-27.)*

| Card | F2 carries it? | Otherwise / also needs |
|---|---|---|
| Trampolí de mans | yes (with `advancePendingAction` pulling the ally's Atac in) | AI hint reads `def.speed` |
| Ganxo salvavides | — | the defender picks *which* aimed blow |
| Ràfega de dits | yes (also vs Defensa) | — |
| Bomba de fum | yes | or drop "aquest torn" |
| Marca de la perdició | yes (same-round reap) | drop/replace "−3 de velocitat" |
| Invocar l'ombra de l'infern | — | drop/replace "−3 de velocitat" (text only) |
| Rugit de guerra | yes | — |
| Injecció d'adrenalina | yes | — |
| Poció de vida | yes (only fast attacks interrupt) | — |
| Poció de rapidesa | — | grant-fast status |
| Punyalada traïdora | — | read the aims, or `slow` |
| Amagar-se | yes | — |
| Udol de terror | — | drop "{V}−2" (text only) |
| Fuet d'aigua | yes | — |
| Braços d'aigua | — | reveal-time type pick |
| Sang sota la lluna | yes | — |
| Ira de l'oceà | yes | — |
| Guant de pedra | yes | — |
| Llamp de sang freda | no | `slow`, or Focus-step resolution |
| Caiguda de cometa | partly | or "can't be interrupted" |
| Palmell d'aire | yes ("act last" = after every step) | — |
| Patinet d'aire | — | grant-fast status |
| Catapulta de vent | yes | — |
| Cop i fuga | yes | — |
| Salt del meteor | no | `slow` |
| Ull de l'huracà | yes | — |
| Punyals de foc | no | `slow`, or read the aims |

### Other changes

**Plain fast candidates:** Punyalada ràpida, Urpa ràpida, Mossegada en vol, Punys encesos, Fletxa a l'escletxa, Llengua paralitzant, Vol propulsat.

**Slow cards that gain** (resolving last was their price; balance, not meaning):
- **Slow attacks:** Traca final, Puny de la muntanya, Pluja de flames, Esclafament, Erupció, Allau de la horda, Terratrèmol, Pilar de foc, Guèiser, Cop desesperat.
- **Slow guards:** Barricada, Mur de pedra, Defensa esquelètica, Defensa diabòlica.

**Cards that get stronger** because Defenses are always up first: Finta traïdora, Esclat del tercer ull, Canó d'aigua, Guèiser.
