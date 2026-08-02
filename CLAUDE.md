# Pim Pam Pum

Pim Pam Pum is a tabletop RPG combat system (written in Catalan). It is **skill-based**: characters have a single base stat (PV) plus a set of skills whose level is a small ordinal — **level N = the character knows the first N actions of the skill**. Combat is a **dice contest**: each card carries its own dice (attack dice or defense dice), one contested roll decides everything, and the **damage is the margin** (attack total − defense total) minus passive armour. There is no d20, no separate to-hit roll and no separate damage roll. Every action played costs **fatigue** from a daily stamina budget. There are **no predefined player classes** — players build characters on the fly by choosing skills and levels.

The project is a pnpm monorepo with four packages: a content-agnostic engine, a skills content package, an enemies package (content + encounter balancer), and the consumers (CLI simulator + Vue web app).

## Project Structure

```
pimpampum/
├── CLAUDE.md                      # This file
├── rules.md                       # Game rules (Catalan, prose) — source of truth for mechanics
├── intentions.md                  # Design intentions for balance
├── package.json / pnpm-workspace.yaml / tsconfig.base.json / flake.nix
├── packages/
│   ├── engine/                    # @pimpampum/engine — generic combat system, NO game content
│   │   └── src/
│   │       ├── index.ts           # Public API
│   │       ├── dice.ts            # DiceRoll
│   │       ├── types.ts           # ActionType, ActionDefinition (dice, unlockLevel, fatigueCost), SkillInstance, EquipmentDefinition, TargetRequirement
│   │       ├── resolution.ts      # resolveAttack (margin), resolveDamage, checkSkillUp, SKILL_UP_MARGIN
│   │       ├── fatigue.ts         # FATIGUE_CONFIG — the daily stamina budget
│   │       ├── effects.ts         # EffectRegistry, EffectHandler, EffectContext, EngineApi, AttackModifiers, AIContext
│   │       ├── status.ts          # StatusBehavior, StatusRef, StatusHookContext, AttackStatusMods, ContestKind
│   │       ├── action.ts          # ActionInstance, getActionTargetRequirement/Count
│   │       ├── modifier.ts        # CombatModifier, ModifierDuration
│   │       ├── character.ts       # Character (PV + skills Map + statuses + guards + blockedBy + fatigue), createCharacter
│   │       ├── combat.ts          # CombatEngine — step-by-step state machine + AI driver
│   │       ├── ai.ts              # selectAction (weighted pick) + pickResolveTargets (resolution-time targeting), AIView
│   │       ├── strategy.ts        # AIStrategy enum
│   │       └── display.ts         # ACTION_TYPE_*, STAT_ICONS, SLOT_LABELS, RULES_SUMMARY
│   ├── skills/                    # @pimpampum/skills — PLAYER game content
│   │   └── src/
│   │       ├── index.ts           # Public API
│   │       ├── types.ts           # SkillDefinition + the action() / d() helpers
│   │       ├── setup.ts           # registerSkills(registry), createRegistry()
│   │       ├── catalog.ts         # ALL_SKILLS / ALL_ACTIONS / unlockedActions
│   │       ├── build.ts           # buildCharacter(spec) — resolve skill/action/equipment ids → Character
│   │       ├── effects/           # GENERIC parameterised handlers only (attack/focus/defense/weapon) + shared DOT/REGEN behaviours
│   │       ├── skills/            # One file per skill: SkillDefinition + its own effects/StatusBehaviors
│   │       └── equipment/         # ALL_EQUIPMENT (armour + weapons with weapon dice)
│   ├── enemies/                   # @pimpampum/enemies — enemy content + encounter balancer
│   │   └── src/
│   │       ├── index.ts           # buildSolvedEncounter(), re-exports
│   │       ├── types.ts           # EnemyDefinition (name, icon, kit) + fullKitLevel
│   │       ├── catalog.ts         # ENEMY_DEFINITIONS, ENEMY_SKILLS, registerEnemySkills(registry)
│   │       ├── factory.ts         # createEnemyFrom(def, { pv, level?, name?, equipment? })
│   │       ├── simulate.ts        # Encounter balancer v3 (SIMULATED): simulateEncounter, solveEncounter…
│   │       └── enemies/           # One EnemyDefinition per creature (goblin, wolf, basilisk, stone-golem, …)
│   ├── simulator/                 # @pimpampum/simulator — balance testing (tsx + vitest)
│   │   └── src/
│   │       ├── main.ts            # Mirror-match balance + parametric balancer check
│   │       ├── play.ts            # MANUAL play harness (seeded; play a fight by hand, round by round)
│   │       ├── sanity.ts          # Quick smoke run + step-API demo
│   │       ├── experiment-{tuning,heal,berserk,seat,day}.ts        # one-off experiment harnesses
│   │       └── tests/             # helpers.ts, balance.test.ts, seams.test.ts, enemy-threat.test.ts
│   └── web/                       # @pimpampum/web — Vue 3 SPA (character creation + combat + printable cards)
```

## Architecture & Source of Truth

- **`rules.md`** is the prose source of truth for game mechanics (read it before changing combat logic). **`intentions.md`** holds the balance/design intentions (strategy triangle, dice philosophy, fatigue philosophy).
- **`packages/engine`** is content-agnostic — STRICTLY: it never names a card, skill or status key, and never interprets `StatusEntry.data` (inert payload). Effects dispatch through an **`EffectRegistry`**; a status gets ALL its mechanics from a **`StatusBehavior`** attached to the status instance by whoever sets it (`setStatus(key, value, turns, data, BEHAVIOR)` — no registration). The engine invokes behaviour hooks at fixed seams: query hooks (`modifySpeed`, `rollMode` — advantage/disadvantage rolls the whole pool twice, `modifyOutgoingDamage`, `modifyIncomingDamage`, `modifyContestTotal` — clutch adjust of a contested total seeing both sides (content-side save contests route through `EngineApi.adjustContestTotal`), `clampPvLoss`, `attackRollAgainstHolder`, `preventsGuard`, `blocksActionType`, `untargetable`, `ignoresConcealment`, `preventsGuardBypass`, `absorbsGuard`, `cardSwapCharges`/`spendCardSwapCharge`, `adjustActionWeight`) and engine hooks (`onAttackAction`, `redirectAttackTarget`, `onEnemyAttackAction` — hazards/traps, `attackRepeats`, `standingGuard`/`onStandingGuardBroken` — persistent walls, `onRoundEnd` — dots/regen tick here). The engine also keeps a **combat history** (`EngineApi.history`: every RESOLVED action as an `ActionEvent` {round, actor, action, targets — final list after redirects}; interrupted focuses excluded) that content queries (the generic `flanking` effect: undefendable when an ally already attacked the target this round). A new card must NEVER require an engine edit — if no seam fits, add a new *generic parameterised* seam, then implement the content in skills.
- **`packages/skills`** defines all PLAYER skills, their actions, the effect handlers, and equipment. **Co-location rule**: handlers and the StatusBehavior consts they attach live IN that skill's file (`skills/*.ts`, handlers on `SkillDefinition.effects`, registered by `registerSkills`); `effects/` holds only generic parameterised handlers shared across skills (plus shared behaviours `DOT`/`REGEN` in `effects/status-behaviors.ts`).
- **`packages/enemies`** defines enemy content the same way: each creature is an `EnemyDefinition` (a name, an icon and its `SkillDefinition`s with co-located handlers) in its own file under `enemies/`. **`registerEnemySkills(registry)` MUST be called alongside `createRegistry()` whenever enemies fight**, or enemy-specific handlers are missing. It also owns the **encounter balancer** (`simulate.ts`) — there are NO fixed encounters; encounters are solved on demand by SIMULATING them.
- The simulator and web app derive everything from these three packages.

**Card/action descriptions are authoritative.** Each action's `description` (Catalan) defines what it does; if the effect implementation disagrees, the description wins and the handler must be fixed.

**Description style: brief, mechanical, non-standard effects only — no lore.** A `description` states *only* what deviates from a vanilla action (AoE, dots, debuffs, drains, armour-ignore, etc.) — e.g. "Afecta tots els enemics.", "Ignora l'armadura.". Do **not** restate things already shown on the card: the contest dice, speed, or a fatigue/resource cost (costs are rendered in the card's corner). Drop all flavour prose.

## Core Mechanics (see rules.md)

- **PV** is the only base stat. Players default to **12** (provisional — the free knob tuned for the ≤5-round combat-duration target; dice are the felt power curve, never PV). Enemies carry NO printed PV — the encounter sets it, and the balancer solves it. There are no character sizes and no rest system beyond the one-line sleep rule.
- **Skills** are small ordinals: level N = knows the first N actions (`ActionDefinition.unlockLevel` is the ordinal position within the skill).
- **Action**: belongs to a skill; has a **speed**, a **type** (Atac / Defensa / Focus), **dice** (attack dice for Atac, defense dice for Defensa; the card's dice are both its precision and its power), and a **fatigue cost** (default 1).
- **Attack**: ONE contested roll — attacker rolls the action's attack dice (+ bonuses) vs the defender's defense dice (+ bonuses). Ties hold for the defense. **Damage = the margin** (attack total − defense total), minus the recipient's passive armour (min 0), subtracted from PV. **Undefended targets are auto-hit for the full attack total.** No to-hit roll, no separate damage roll. **AoE/multi-target: ONE attack roll per pass — every target defends against that same roll separately.**
- **Defense (dual target)**: at resolution the defender picks an **ally** (guard: attacks on that ally also resolve against the defender's defense; penetrating damage hits the **defender**, not the ally) **or an enemy** (block: "els enemics bloquejats fan totes les seves tirades d'atac contra el defensor" — the blocked enemy loses target choice; attacks that don't choose targets, i.e. full-coverage AoE, are unaffected). Defenses covering the same attack **sum** (defensa conjunta): 2+ blockers on the same enemy, or 2+ guards on the same target (the target's own self-defense included), form a wall that contests with the **sum** of their defense rolls; a breach damages the lowest individual roller (the weak link), and on a close breach (≤ SKILL_UP_MARGIN) **all** wall members learn. Extra attacks (counters) respect walls too. Either way the defender **always also defends themselves**, rolling their defense dice separately against each incoming attack. Engine: `Character.guards` + `Character.blockers`, round-scoped, resolved at resolution time in speed order; `TargetRequirement 'defense'` drives the dual prompt.
- **Focus**: special effects, usually slow; cancelled if the actor takes DAMAGE before it resolves (a hit fully absorbed by armour does NOT interrupt — rule changed 2026-07-18).
- **Skill level-up**: after a contested roll, the **loser** levels up (+1 = learns the skill's next action) if they lost by ≤ `SKILL_UP_MARGIN` (2). A tie counts as the attacker losing by 0. Undefended auto-hits are not contests and never teach (`checkSkillUp`).
- **Fatigue** (`fatigue.ts`): a daily stamina budget, never a dice modifier. Every action played (in or out of combat) adds its `fatigueCost` (default 1; esgotadora cards declare 2-4, shown on the card). `FATIGUE_CONFIG.max = 20` is THE pacing knob (~2-3 combats/day); a card that would exceed it is unplayable. Fatigue persists across combats; `Character.sleep()` clears it. It NEVER touches rolls — roll penalties were measured to freeze fights into draws and are permanently rejected (intentions.md). Nobody is ever action-less: every combatant holds **Cop desesperat** (universal, 0 fatigue, 1d4 slow attack, 1 PV self-damage hit or miss — skills/src/desperation.ts), playable ONLY when nothing else is (the generic `ActionDefinition.lastResort` flag), so exhausted fights end through desperate play.
- **Speed**: higher resolves first; heavy armour subtracts a speed penalty. **Ties resolve simultaneously** (per-tier alive/interrupt snapshots); the engine shuffles the queue before the speed sort so no seat holds tie priority (a measured seat bias fix).
- **Equipment**: three slots, one item each — **Armor / Weapon / Shield** (no body-part inventory, no main/off/two-hand; simplified 2026-07-19). Gives passive armour, speed penalty, roll bonuses, a **weapon attack modifier** (`attackBonus`, present = the item is a weapon: bastó +0, destral +2, gran destral +4; weapon-tagged actions — the `weapon_damage` effect — roll their OWN dice plus the wielded modifier and REQUIRE a weapon, shown as "Necessita arma equipada." on the card), and/or **granted action cards** while equipped (`grantsActions`, `unlockLevel: 0`, e.g. the shield = the «Escut de fusta» 2d4 defense card). **Armour is a small bounded lever** (intentions.md ≤15% of outcome): only two armours, Armadura de cuir (+1) and de ferro (+2), worn one at a time — flat per-hit armour negates small hits, so keeping it small stops it hard-countering many-small-hits swarms.
- **Enemies & encounters**: a creature is just a name, an icon, a kit and a **`bulk`** (`EnemyDefinition`) — no printed PV, no level, no fitted threat number. `bulk` is how much flesh the creature is relative to a 70 kg human (**`bulk = ∛(kg / 70)`**, from the weight it has in the fantasies it comes from — goblin 20 kg → 0.66, stone golem 907 kg → 2.35, a Rowling basilisk 3.2 t → 3.57). The solver searches ONE scale and every body gets `scale × bulk`, so a goblin beside a basilisk is no longer equally durable. It redistributes only: a single-species encounter solves to the same PV whatever its bulk, so bulk can never make a creature secretly harder. The cube root is deliberate — raw mass spans 82× and would leave mixed fights as one boss plus confetti. **Difficulty is an INPUT** (a target player winrate; `TARGET_WINRATES` presets), never a label. `solveEncounter(pool, party, targetWinrate)` takes the composition the GM wants (which creatures, how many, at what level) and solves the PV that hits the target; `generateEncounter` is the single-creature convenience; `simulateEncounter` scores any composition; `buildSolvedEncounter` instantiates the result.
- **Balancer v3 — SIMULATED, not modelled** (`simulate.ts`, 2026-08-01): the balancer does not predict difficulty from constants, it **plays the encounter**. A full 4v6 combat runs in ~0.8 ms, so a few hundred real combats price a fight exactly — for the real party, the real armour, the real counts and the real cards. A solve brackets the PV scale by bisection (geometric, progressive sample sizes), then **fits** the crossing rather than trusting the last bracket: every evaluation the search made is kept, and a games-weighted least-squares line through `logit(winrate)` vs scale is inverted at the target. Bisection alone decides each step from a ±4pp sample, so near the crossing it decides on noise and its answer random-walks — measured at up to ±4.6pp of placement error on a lone basilisk, down to ≤1.4pp with the fit. The reported winrate is then measured over `SOLVE_REPORT_GAMES` (1000, ±1.7pp) because that one number is what the GM trusts. Below 12 PV a body's integer rounding is worth more than the noise, so the neighbouring integers are tried too — but ONLY there: doing it at 43 PV picks lucky samples and added ~10pp of error. A solve costs ~1-4 s. Consequences: any composition and any body count work, party armour/size/levels are played rather than fitted, and **a new or homebrew creature needs no measurement pass at all**. Key invariants: every candidate in a solve shares one seed (COMMON RANDOM NUMBERS — this is what makes bisecting a stochastic function stable, via the engine's `withSeed`); the reported winrate is an INDEPENDENT measurement, never the sample the search steered on (selecting the best of several noisy candidates and reporting that sample is winner's curse, ~4pp optimistic); `stderr` is inflated ×1.25 over binomial because the party is redrawn per game; PV is an integer lever, so some targets are genuinely unreachable and the solver reports what it achieved (`clamped`). **The AI now defines difficulty** — every number is the winrate of AI play, so `ai.ts` quality is balance quality.
- **Balance principle**: a fight is fair when both teams have a similar **total skill-level sum** (ordinal budgets — mirror teams use ~6-7 per player).

## Engine: how an action resolves

1. `prepareRound()` — advance round, apply stun/skip.
2. `planActions(humanSelections)` — build the pending queue (humans supply action ids; AI fills the rest via `selectAction`), **shuffle it, then sort by speed** (tie fairness); returns `RevealedAction[]`.  Between plan and resolve, `flowSwapRefs()`/`flowSwap()` let card-swap statuses (Estat de flux) replace a revealed card.
3. `resolveNextAction()` — returns `{kind:'target'|'resolved'|'done'}`. On `'target'` the UI prompts and calls `setResolveTarget(targets)`. Speed ties resolve simultaneously (per-tier alive/interrupt snapshots). Blocked attackers have every chosen slot forced onto their blocker. Attacks roll once per pass; each target defends against that roll; `attackRepeats` statuses grant extra full passes (re-rolled).
4. `finishRound()` — postRound effect hooks, status `onRoundEnd` (dots/regen tick), fatigue accrual for every acted character, `advanceTurn`.
5. The simulator drives all of this automatically via `runRound()` / `runCombat(stats)`.

**Effect handlers** implement hooks: `modifyAttack`, `onAttackHit`, `onAttackMiss`, `onDefend`, `onBlockFail`, `onResolve`, `postRound`, `getTargetRequirement`, `aiWeight`, `onCombatStart`, `canPlay`, `onPlay`. They only touch the engine through the `EngineApi` interface. Generic parameterised handlers (`packages/skills/src/effects`) cover most effects: `weapon_damage`, `piercing`, `bonus_damage`, `extra_dice`, `pack`, `crossfire`, `reckless`, `frenzy`, `lifedrain`, `debuff_on_hit`, `poison_on_hit`, `stun_on_hit`, `mark_on_hit`, `silence_on_hit`, `second_attack`, `self_stun`, `undefendable_on_hit`, `buff_on_hit`, `skill_bonus_from`, `spell_leech_on_hit`, `self_damage`, `double_wound`, `counter`, `retaliate_wound`, `debuff_on_block`, `buff_on_block`, `buff_on_block_fail`, `self_armor`, `heal`, `skill_mod`, `stun`, `evasion`, `nimble_escape`, `mark_target`, `weapon_buff`, `wound_wounded`, `regen`, `dot`, `wild_shape`, `summon`, `sacrifice`, `detonate`, `cleanse`. Skill-specific handlers (e.g. `enter_rage`, `chain_attack`/`flow_state`, `charge_cost`, `adrenaline`, `condemn`/`reap`, `carve_rune`, `shadow_melt`/`shadow_bind`, `seismic_sense`/`earth_wall`/`bury`, `pressure_gain`/`eruption`) live on their skill's `SkillDefinition.effects`; the **StatusBehavior** consts they attach (`FURIA_ESTAT`, `CADENA`, `FLUX`, `ENCEGAT`, `CAMP_MINAT`, `CONDEMNAT`, `PUTREFACCIO`, `ADRENALINA`, `RUNA_FULLA/CONFUSIO/ESCUT`, `FOS`, `LLIGAT`, `SENTIT`, `MUR`, `ENTERRAT`, `RIU_DE_LAVA`…) are defined alongside them in the same file.

## Building characters

```ts
import { CombatEngine } from '@pimpampum/engine';
import { createRegistry, buildCharacter } from '@pimpampum/skills';
import { createEnemy, getEnemy, registerEnemySkills } from '@pimpampum/enemies';

const registry = createRegistry();        // generic + player-skill effect handlers
registerEnemySkills(registry);            // enemy-skill handlers (petrify_gaze…) — required when enemies fight

const hero = buildCharacter({             // players: pick skills + ordinal levels on the fly
  name: 'Aragorn', classCss: 'mestre-armes', pv: 12,
  skills: { 'mestre-armes': 4, metge: 2 },   // knows the first 4 / first 2 actions
  equipment: ['armadura-de-cuir', 'destral'],
});                                       // actions default to those unlocked by the levels
const goblin = createEnemy('goblin', { pv: 16, level: 3 })!;
const engine = new CombatEngine([hero], [goblin], { registry });
```

Players are human-controlled when `aiStrategy === null`. Enemies get their strategy from `EnemyDefinition.aiStrategy` (stamped by `createEnemyFrom`; default Aggro) — pick it to match how a GM would play the kit, since calibration runs with it. `assignStrategies` is only for simulated *player* teams (it downgrades a strategy the character can't cash in — Protect without a Defensa action, Power without a Focus — to Aggro). The AI models human play: actions are chosen at plan time by weighted sampling sharpened by `CombatEngineOptions.aiSharpness` (weights^τ, default 2; 1 = soft play), with attacks weighted by **expected PV removed** (projected margin damage blended over defended/undefended outcomes and armour — constants recalibrated for margin damage); **targets** are chosen at resolution time (`pickResolveTargets`), seeing what a human sees after the reveal: take lethal kills, interrupt enemies whose slower focus is still pending, prefer dangerous and wounded targets, avoid active guards; defenses use a **guard-vs-block heuristic** (guard wounded allies, else block the scariest enemy whose attack is still pending, else self-guard). Calibration counts draws as ½.

## Adding or changing content

**Design principle (lore first, mechanics second).** When *designing* new actions, disregard the current mechanics entirely. Do not let the existing effect handlers, what is easy to implement, or "what already exists" shape the design. The goal is **originality** and staying **as close as possible to the lore/fantasy of the skill**. Design the action the skill *should* have, then build whatever new effect handlers, engine seams, or mechanics that requires — implementation effort is never a reason to compromise the design. (This applies to design; the registry pattern still governs *how* it's eventually coded.)

- **New skill / actions**: create `packages/skills/src/skills/<skill>.ts` with the `SkillDefinition` (use the `action()` and `d()` helpers) and add it to `ALL_SKILLS` in `catalog.ts`. Reference existing generic effect `type` keys where they fit; anything skill-specific goes on the definition's own `effects` map in the same file, with its `StatusBehavior` consts alongside (attached via `setStatus(..., BEHAVIOR)`). Only add to `packages/skills/src/effects/` when a handler/behaviour is genuinely generic (parameterised, reusable by several skills).
- **New enemy**: create `packages/enemies/src/enemies/<enemy>.ts` exporting an `EnemyDefinition` (name, icon, its skill definitions with co-located handlers) and list it in `catalog.ts`. **No measurement step** — the balancer simulates the creature, so a new enemy is priceable the moment its cards exist.
- **New equipment**: add an `EquipmentDefinition` to `ALL_EQUIPMENT`.
- The engine NEVER needs changes for new content — effects dispatch through the registry and statuses carry their own behaviour. If a design truly needs a new engine capability, add it as a generic parameterised seam (a new `StatusBehavior` hook at a pipeline point), never as a named status/card check.

## Building & running

```bash
pnpm install
pnpm build                          # builds engine → skills → enemies → web (topological)
pnpm simulate                       # CLI balance simulation (packages/simulator/src/main.ts)
pnpm --filter @pimpampum/simulator test   # vitest balance suite
pnpm dev                            # engine tsc --watch + web dev server (concurrently)
```

Consumers import the built `dist/` of the workspace packages, so engine/skills/enemies must be built before running the web/simulator.

## Simulator & balance tests

- `experiment-level.ts` sweeps enemy LEVEL against solved PV at a fixed target winrate, reporting the fight length each choice buys. It is what established that level is a real length lever (6 goblins at 65%: 20.5 rounds at level 1, 9.1 at level 4) but that the long fights come from compositions that cannot threaten the party at all (4 wolves need 91 PV each, 22 rounds, because a level-2 wolf attacks with 1d2).
- `main.ts` reports mirror-match balance (equal-budget random teams should win ~50/50, draws included), per-skill and per-action win correlation, action-type play mix, combat length, and a parametric balancer check (solved encounters vs their promised winrate per template × difficulty preset).
- `tests/balance.test.ts` checks resolution math (`checkSkillUp`, `resolveAttack`, `resolveDamage`), engine sanity (terminates, valid winner, PV in range), mirror balance ~50%, and combat length. `tests/seams.test.ts` tests every generic StatusBehavior seam deterministically with inline behaviours (1d1 dice → exact-PV assertions). `tests/enemy-threat.test.ts` is the balancer guard: every solved encounter is REPLAYED with an independent seed and must land near the winrate it reported, plus determinism, arbitrary body counts and mixed comps.
- `play.ts` is the MANUAL play harness: a seeded RNG plus a per-round script, so you can play a fight by hand (cards chosen blind, targets after the reveal) and read what actually happens — how the 6-goblin diagnosis was done. One-off experiment harnesses: `experiment-tuning.ts` (PV/armour sweeps), `experiment-heal.ts` (heal-stall draws), `experiment-berserk.ts` (component attribution), `experiment-seat.ts` (seat bias), `experiment-day.ts` (fatigue budget across a 2-3-combat day). Run any with `pnpm --filter @pimpampum/simulator exec tsx src/<file>.ts`.
- `tests/helpers.ts` models INTENDED play: `randomPlayer` picks a main skill first (complementary kits — metge/runes/ombres/gel — only ever appear as second skills), guarantees weapon kits a mid weapon (destral), uses `PLAYER_PV` 12 and ordinal budgets of ~6-7; `REGISTRY` is a shared registry with player + enemy handlers.

**Balance verification**: any content change is experimental until simulated. Run the `/analyze` skill (or `pnpm simulate`), present results, and flag conflicts with `intentions.md`.

## Web app (`packages/web`)

Vue 3 + Vue Router SPA. Combat uses the engine's **step-by-step** API via `composables/useGame.ts`:
setup (character creation) → card-selection → reveal (with Estat-de-flux card swaps) → resolving (one action at a time, with mid-resolution target prompts) → victory. `TargetSelector.vue` supports the defense **dual prompt** (ally to guard OR enemy to block). `composables/useActionDisplay.ts` converts actions/equipment to printable-card props: contest dice under the crossed-swords icon (Atac) or shield icon (Defensa), an auto-appended "Necessita arma equipada." on weapon cards, and corner stats for above-default fatigue costs and resource costs (càrregues, pressió); an item whose only mechanics are one granted card renders AS that card (the shield).

Routes: `/` (home), `/skills` (printable skill cards), `/objects` (equipment cards), `/enemies` (creatures + their cards), `/fitxa` (printable character sheet), `/rules`, plus everything about a fight under one **`/combats`** tab (`CombatsView.vue` = a thin sub-tab strip + nested `router-view`, so only the active section renders):

- `/combats/creador` — the balancer's encounter creator (pick players + difficulty + enemy pool in a Jugadors | Enemics | Encontre column layout; difficulty is a target winrate). Each species carries **how many** and at **what level** — level is a LORE input (a green scout vs a war-leader), not something the solver optimises, and the result panel reads back the two numbers the GM tunes against: measured winrate and average rounds, with a warning past 6 rounds. Its two start buttons are **Combat contra la IA** and **Combat contra els jugadors**.
- `/combats/jugadors` — the list of combats being run at a table (the tracker sessions in localStorage), and `/combats/jugadors/:id` — one of them. The tracker is a nested child but renders WITHOUT the sub-tab strip (`CombatsView` shows the strip only for the three section routes): it is a focused screen with its own sticky bar and a `← Combats` link back to the list.
- `/combats/ia` — create characters + play in the browser.

`/combats/jugadors/:id/pantalla` (the players' read-only screen) is declared top-level with `meta.bare` so it gets no chrome at all despite the nested-looking path. The old `/combat`, `/encounters` and `/tracker/:id` paths redirect into the new ones.

**Height, not viewport math.** The creator and the AI-combat setup screen fill the height their host hands down (`main` → `CombatsView` → section) and scroll only *inside* their columns; nothing measures `100vh` any more (`SetupScreen`'s old `calc(100vh - 7rem)` broke the moment the sub-tab strip appeared above it). Below 760px each releases the cap (`height: auto`) and the page scrolls normally.

### Combat tracker (running a fight at a real table)

A solved encounter has two "start" buttons: **Combat contra la IA** (the simulated fight in `/combat`) and **Combat contra els jugadors**, which mints a random id and opens `/tracker/:id` — the GM's screen for a fight played with real dice and printed cards. It shows, per creature, the **names** of the cards that creature's level unlocks (plus the cards its gear grants — the shield's «Escut de fusta») as a checklist, since the GM plays from the printed deck, and a **PV tracker per body** (bar, ±1 steppers, editable number, renameable). ONLY the enemies are tracked — the players keep their own sheets at the table — and there is no round counter.

State lives in `composables/combatTracker.ts` — one `TrackerSession` per id in **localStorage** under `pimpampum.tracker.<id>`, written on every edit, so a refresh never loses a fight. `listTrackerSessions()` key-scans the prefix (no separate index to drift), and `/encounters` lists the saved combats.

`/tracker/:id/players` is the same session **read-only** for a second screen the players watch: `meta.bare` skips the app chrome, and it follows the GM's tab through the `storage` event (same browser only — there is no backend). The GM's `revealPV` switch decides what it shows: PV bars with numbers when on, and when off **only the damage each enemy has taken**, which never leaks how much it can still absorb.

### Card design / theming

Printable cards are 63×88mm (`components/cards/PrintableCard.vue`, parchment style in `assets/cards.css`). Each card has a class CSS theme keyed by `SkillDefinition.classCss` (one `--class-<name>` colour var in `assets/style.css` plus `.portrait.<name>`/`.mini-card.<name>` rules there and `.print-card.<name>` rules in `assets/cards.css` — grep `--class-` for the current set), and an action-type header colour (`atac-fisic`, `defensa`, `focus`). Icons come from `packages/web/public/icons/` (game-icons.net, CC BY 3.0), served at `/icons/`.

## Development environment

- NixOS dev shell via `flake.nix` (`nodejs_22`, `pnpm`, `csv-tui`).
- TypeScript strict, ES2022, ESNext modules, bundler resolution.
- GitHub Pages deploy via `.github/workflows/pages.yml` (`pnpm install --frozen-lockfile && pnpm build`, copies `index.html`→`404.html`, uploads `packages/web/dist/`).
