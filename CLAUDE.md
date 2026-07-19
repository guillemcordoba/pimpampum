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
│   │       ├── types.ts           # EnemyTemplate (role, measured threat, basePV), EnemyModule
│   │       ├── catalog.ts         # ENEMY_TEMPLATES, ENEMY_SKILLS, registerEnemySkills(registry)
│   │       ├── factory.ts         # createEnemyFromTemplate(template, levels, name?, equipment?, pv?)
│   │       ├── generator.ts       # Encounter balancer v2: solveEncounter, predictEncounter, TARGET_WINRATES…
│   │       └── enemies/           # One EnemyModule per creature (goblin, wolf, basilisk, stone-golem, …)
│   ├── simulator/                 # @pimpampum/simulator — balance testing (tsx + vitest)
│   │   └── src/
│   │       ├── main.ts            # Mirror-match balance + parametric balancer check
│   │       ├── sanity.ts          # Quick smoke run + step-API demo
│   │       ├── measure-threat.ts / measure-model-accuracy.ts       # balancer measurement scripts
│   │       ├── experiment-{tuning,heal,berserk,seat,day}.ts        # one-off experiment harnesses
│   │       └── tests/             # helpers.ts, balance.test.ts, seams.test.ts, enemy-threat.test.ts, model-accuracy.test.ts
│   └── web/                       # @pimpampum/web — Vue 3 SPA (character creation + combat + printable cards)
```

## Architecture & Source of Truth

- **`rules.md`** is the prose source of truth for game mechanics (read it before changing combat logic). **`intentions.md`** holds the balance/design intentions (strategy triangle, dice philosophy, fatigue philosophy).
- **`packages/engine`** is content-agnostic — STRICTLY: it never names a card, skill or status key, and never interprets `StatusEntry.data` (inert payload). Effects dispatch through an **`EffectRegistry`**; a status gets ALL its mechanics from a **`StatusBehavior`** attached to the status instance by whoever sets it (`setStatus(key, value, turns, data, BEHAVIOR)` — no registration). The engine invokes behaviour hooks at fixed seams: query hooks (`modifySpeed`, `rollMode` — advantage/disadvantage rolls the whole pool twice, `modifyOutgoingDamage`, `modifyIncomingDamage`, `modifyContestTotal` — clutch adjust of a contested total seeing both sides (content-side save contests route through `EngineApi.adjustContestTotal`), `clampPvLoss`, `attackRollAgainstHolder`, `preventsGuard`, `blocksActionType`, `untargetable`, `ignoresConcealment`, `preventsGuardBypass`, `absorbsGuard`, `cardSwapCharges`/`spendCardSwapCharge`, `adjustActionWeight`) and engine hooks (`onAttackAction`, `redirectAttackTarget`, `onEnemyAttackAction` — hazards/traps, `attackRepeats`, `standingGuard`/`onStandingGuardBroken` — persistent walls, `onRoundEnd` — dots/regen tick here). A new card must NEVER require an engine edit — if no seam fits, add a new *generic parameterised* seam, then implement the content in skills.
- **`packages/skills`** defines all PLAYER skills, their actions, the effect handlers, and equipment. **Co-location rule**: handlers and the StatusBehavior consts they attach live IN that skill's file (`skills/*.ts`, handlers on `SkillDefinition.effects`, registered by `registerSkills`); `effects/` holds only generic parameterised handlers shared across skills (plus shared behaviours `DOT`/`REGEN` in `effects/status-behaviors.ts`).
- **`packages/enemies`** defines enemy content the same way: each creature is an `EnemyModule` (template + its `SkillDefinition`s with co-located handlers, e.g. the basilisc's `petrify_gaze`) in its own file under `enemies/`. **`registerEnemySkills(registry)` MUST be called alongside `createRegistry()` whenever enemies fight**, or enemy-specific handlers are missing. It also owns the **encounter balancer** (`generator.ts`) — there are NO fixed encounters; encounters are solved on demand.
- The simulator and web app derive everything from these three packages.

**Card/action descriptions are authoritative.** Each action's `description` (Catalan) defines what it does; if the effect implementation disagrees, the description wins and the handler must be fixed.

**Description style: brief, mechanical, non-standard effects only — no lore.** A `description` states *only* what deviates from a vanilla action (AoE, dots, debuffs, drains, armour-ignore, etc.) — e.g. "Afecta tots els enemics.", "Ignora l'armadura.". Do **not** restate things already shown on the card: the contest dice, speed, or a fatigue/resource cost (costs are rendered in the card's corner). Drop all flavour prose.

## Core Mechanics (see rules.md)

- **PV** is the only base stat. Players default to **12** (provisional — the free knob tuned for the ≤5-round combat-duration target; dice are the felt power curve, never PV). Enemy durability is the template's hand-set `basePV` (often overridden per encounter by the balancer). There are no character sizes and no rest system beyond the one-line sleep rule.
- **Skills** are small ordinals: level N = knows the first N actions (`ActionDefinition.unlockLevel` is the ordinal position within the skill).
- **Action**: belongs to a skill; has a **speed**, a **type** (Atac / Defensa / Focus), **dice** (attack dice for Atac, defense dice for Defensa; the card's dice are both its precision and its power), and a **fatigue cost** (default 1).
- **Attack**: ONE contested roll — attacker rolls the action's attack dice (+ bonuses) vs the defender's defense dice (+ bonuses). Ties hold for the defense. **Damage = the margin** (attack total − defense total), minus the recipient's passive armour (min 0), subtracted from PV. **Undefended targets are auto-hit for the full attack total.** No to-hit roll, no separate damage roll. **AoE/multi-target: ONE attack roll per pass — every target defends against that same roll separately.**
- **Defense (dual target)**: at resolution the defender picks an **ally** (guard: attacks on that ally also resolve against the defender's defense; penetrating damage hits the **defender**, not the ally) **or an enemy** (block: "els enemics bloquejats fan totes les seves tirades d'atac contra el defensor" — the blocked enemy loses target choice; attacks that don't choose targets, i.e. full-coverage AoE, are unaffected). Defenses covering the same attack **sum** (defensa conjunta): 2+ blockers on the same enemy, or 2+ guards on the same target (the target's own self-defense included), form a wall that contests with the **sum** of their defense rolls; a breach damages the lowest individual roller (the weak link), and on a close breach (≤ SKILL_UP_MARGIN) **all** wall members learn. Extra attacks (counters) respect walls too. Either way the defender **always also defends themselves**, rolling their defense dice separately against each incoming attack. Engine: `Character.guards` + `Character.blockers`, round-scoped, resolved at resolution time in speed order; `TargetRequirement 'defense'` drives the dual prompt.
- **Focus**: special effects, usually slow; cancelled if the actor takes DAMAGE before it resolves (a hit fully absorbed by armour does NOT interrupt — rule changed 2026-07-18).
- **Skill level-up**: after a contested roll, the **loser** levels up (+1 = learns the skill's next action) if they lost by ≤ `SKILL_UP_MARGIN` (2). A tie counts as the attacker losing by 0. Undefended auto-hits are not contests and never teach (`checkSkillUp`).
- **Fatigue** (`fatigue.ts`): a daily stamina budget, never a dice modifier. Every action played (in or out of combat) adds its `fatigueCost` (default 1; esgotadora cards declare 2-4, shown on the card). `FATIGUE_CONFIG.max = 20` is THE pacing knob (~2-3 combats/day); a card that would exceed it is unplayable. Fatigue persists across combats; `Character.sleep()` clears it. It NEVER touches rolls — roll penalties were measured to freeze fights into draws and are permanently rejected (intentions.md). Nobody is ever action-less: every combatant holds **Cop desesperat** (universal, 0 fatigue, 1d4 slow attack, 1 PV self-damage hit or miss — skills/src/desperation.ts), playable ONLY when nothing else is (the generic `ActionDefinition.lastResort` flag), so exhausted fights end through desperate play.
- **Speed**: higher resolves first; heavy armour subtracts a speed penalty. **Ties resolve simultaneously** (per-tier alive/interrupt snapshots); the engine shuffles the queue before the speed sort so no seat holds tie priority (a measured seat bias fix).
- **Equipment**: slot-based (Tors/Cap/Braços/Cames/Mà principal/Mà secundària); gives passive armour, speed penalty, roll bonuses, a **weapon attack modifier** (`attackBonus`, present = the item is a weapon: bastó +0, destral +2, gran destral +4; weapon-tagged actions — the `weapon_damage` effect — roll their OWN dice plus the wielded modifier and REQUIRE a weapon, shown as "Necessita arma equipada." on the card), and/or **granted action cards** while equipped (`grantsActions`, `unlockLevel: 0`, e.g. the shield = the «Alçar l'escut» 2d4 defense card).
- **Enemies & encounters**: templates carry a fielding `role` (horda/elit/solitari), hand-set `basePV` and a MEASURED `threat` per body; enemy kits have ordinal unlocks too (level = coarse encounter lever). **Difficulty is an INPUT** (a target player winrate; `TARGET_WINRATES` presets), never a label: `solveEncounter(pool, playerCount, targetWinrate)` / `generateEncounter` pick body counts and a PV multiplier; `predictEncounter` scores arbitrary compositions; `buildSolvedEncounter` instantiates the result.
- **Balancer v2 model** (`generator.ts`, all constants measured by the simulator's `measure-threat.ts` / `measure-model-accuracy.ts` / `measure-player-level.ts`; re-measured 2026-07-18 after the player-kit re-ordering pass): per-body threat normalized so a 4-reference-player party's strength is 1; party strength S = (Σ g(levels_i)/4)^2.6 where the optional per-player input g(levels) = 0.65 + 0.35·(levels/6) (≡ 1 at the reference ~6 levels/player; without the input every player counts 1); winrate = logistic with k = 3.2 on the threat/strength ratio; threat is SUPER-linear in bodies — a shared-economy β-power-mean over ALL bodies (β = 2.0, known ~−8pp overpricing bias on mixed comps), counts snap HARD to the measured probe counts (horda 6 / elit 3 / solitari 1; max drift ×1.1 — per-kit count-scaling variance measured 20-30pp both ways when counts drift) with PV multiplier as the fine lever (clamped 0.4-3); `levelFactor = max(0.3, level/kit)`.
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
import { createEnemyFromTemplate, getEnemyTemplate, registerEnemySkills } from '@pimpampum/enemies';

const registry = createRegistry();        // generic + player-skill effect handlers
registerEnemySkills(registry);            // enemy-skill handlers (petrify_gaze…) — required when enemies fight

const hero = buildCharacter({             // players: pick skills + ordinal levels on the fly
  name: 'Aragorn', classCss: 'mestre-armes', pv: 12,
  skills: { 'mestre-armes': 4, metge: 2 },   // knows the first 4 / first 2 actions
  equipment: ['armadura-de-cuir', 'destral'],
});                                       // actions default to those unlocked by the levels
const goblin = createEnemyFromTemplate(getEnemyTemplate('goblin')!, { goblin: 3 });
const engine = new CombatEngine([hero], [goblin], { registry });
```

Players are human-controlled when `aiStrategy === null`. Enemies get their strategy from `EnemyTemplate.aiStrategy` (stamped by `createEnemyFromTemplate`; default Aggro) — pick it to match how a GM would play the kit, since calibration runs with it. `assignStrategies` is only for simulated *player* teams (it downgrades a strategy the character can't cash in — Protect without a Defensa action, Power without a Focus — to Aggro). The AI models human play: actions are chosen at plan time by weighted sampling sharpened by `CombatEngineOptions.aiSharpness` (weights^τ, default 2; 1 = soft play), with attacks weighted by **expected PV removed** (projected margin damage blended over defended/undefended outcomes and armour — constants recalibrated for margin damage); **targets** are chosen at resolution time (`pickResolveTargets`), seeing what a human sees after the reveal: take lethal kills, interrupt enemies whose slower focus is still pending, prefer dangerous and wounded targets, avoid active guards; defenses use a **guard-vs-block heuristic** (guard wounded allies, else block the scariest enemy whose attack is still pending, else self-guard). Calibration counts draws as ½.

## Adding or changing content

**Design principle (lore first, mechanics second).** When *designing* new actions, disregard the current mechanics entirely. Do not let the existing effect handlers, what is easy to implement, or "what already exists" shape the design. The goal is **originality** and staying **as close as possible to the lore/fantasy of the skill**. Design the action the skill *should* have, then build whatever new effect handlers, engine seams, or mechanics that requires — implementation effort is never a reason to compromise the design. (This applies to design; the registry pattern still governs *how* it's eventually coded.)

- **New skill / actions**: create `packages/skills/src/skills/<skill>.ts` with the `SkillDefinition` (use the `action()` and `d()` helpers) and add it to `ALL_SKILLS` in `catalog.ts`. Reference existing generic effect `type` keys where they fit; anything skill-specific goes on the definition's own `effects` map in the same file, with its `StatusBehavior` consts alongside (attached via `setStatus(..., BEHAVIOR)`). Only add to `packages/skills/src/effects/` when a handler/behaviour is genuinely generic (parameterised, reusable by several skills).
- **New enemy**: create `packages/enemies/src/enemies/<enemy>.ts` exporting an `EnemyModule` (template + skill definitions, handlers co-located like player skills) and list it in `catalog.ts`. Then **measure its `threat`** (`measure-threat.ts`) — the balancer is only as good as the template's measured threat; re-measure after kit changes.
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

- `main.ts` reports mirror-match balance (equal-budget random teams should win ~50/50, draws included), per-skill and per-action win correlation, action-type play mix, combat length, and a parametric balancer check (solved encounters vs their promised winrate per template × difficulty preset).
- `tests/balance.test.ts` checks resolution math (`checkSkillUp`, `resolveAttack`, `resolveDamage`), engine sanity (terminates, valid winner, PV in range), mirror balance ~50%, and combat length. `tests/seams.test.ts` tests every generic StatusBehavior seam deterministically with inline behaviours (1d1 dice → exact-PV assertions). `tests/enemy-threat.test.ts` is the balancer calibration guard (solved encounters must land near their promised winrate). `tests/model-accuracy.test.ts` guards the threat model against a fixed diverse set of setups (mixed comps, off-probe counts, all party sizes).
- Measurement scripts: `measure-threat.ts` (per-template threat via adaptive PV-multiplier ladders + logit fits) and `measure-model-accuracy.ts` (scores candidate threat models on random setups). One-off experiment harnesses: `experiment-tuning.ts` (PV/armour sweeps), `experiment-heal.ts` (heal-stall draws), `experiment-berserk.ts` (component attribution), `experiment-seat.ts` (seat bias), `experiment-day.ts` (fatigue budget across a 2-3-combat day). Run any with `pnpm --filter @pimpampum/simulator exec tsx src/<file>.ts`.
- `tests/helpers.ts` models INTENDED play: `randomPlayer` picks a main skill first (complementary kits — metge/runes/ombres/gel — only ever appear as second skills), guarantees weapon kits a mid weapon (destral), uses `PLAYER_PV` 12 and ordinal budgets of ~6-7; `REGISTRY` is a shared registry with player + enemy handlers.

**Balance verification**: any content change is experimental until simulated. Run the `/analyze` skill (or `pnpm simulate`), present results, and flag conflicts with `intentions.md`.

## Web app (`packages/web`)

Vue 3 + Vue Router SPA. Combat uses the engine's **step-by-step** API via `composables/useGame.ts`:
setup (character creation) → card-selection → reveal (with Estat-de-flux card swaps) → resolving (one action at a time, with mid-resolution target prompts) → victory. `TargetSelector.vue` supports the defense **dual prompt** (ally to guard OR enemy to block). `composables/useActionDisplay.ts` converts actions/equipment to printable-card props: contest dice under the crossed-swords icon (Atac) or shield icon (Defensa), an auto-appended "Necessita arma equipada." on weapon cards, and corner stats for above-default fatigue costs and resource costs (càrregues, pressió); an item whose only mechanics are one granted card renders AS that card (the shield).

Routes: `/` (home), `/combat` (create characters + play), `/skills` (printable skill cards), `/objects` (equipment cards), `/enemies` (enemy templates + cards), `/encounters` (the balancer's encounter creator: pick players + difficulty + enemy pool in a Jugadors | Enemics | Encontre column layout; difficulty is a target winrate), `/fitxa` (printable character sheet), `/rules`.

### Card design / theming

Printable cards are 63×88mm (`components/cards/PrintableCard.vue`, parchment style in `assets/cards.css`). Each card has a class CSS theme keyed by `SkillDefinition.classCss` (one `--class-<name>` colour var in `assets/style.css` plus `.portrait.<name>`/`.mini-card.<name>` rules there and `.print-card.<name>` rules in `assets/cards.css` — grep `--class-` for the current set), and an action-type header colour (`atac-fisic`, `defensa`, `focus`). Icons come from `packages/web/public/icons/` (game-icons.net, CC BY 3.0), served at `/icons/`.

## Development environment

- NixOS dev shell via `flake.nix` (`nodejs_22`, `pnpm`, `csv-tui`).
- TypeScript strict, ES2022, ESNext modules, bundler resolution.
- GitHub Pages deploy via `.github/workflows/pages.yml` (`pnpm install --frozen-lockfile && pnpm build`, copies `index.html`→`404.html`, uploads `packages/web/dist/`).
