# Pim Pam Pum

Pim Pam Pum is a tabletop RPG combat system (written in Catalan). It is **skill-based**: characters have a single base stat (PV) plus a set of skills (level 1-100); skills unlock actions; combat is resolved with d20 + skill rolls and damage dice reduced by passive armour. There are **no predefined player classes** — players build characters on the fly by choosing skills and levels.

The project is a pnpm monorepo with four packages: a content-agnostic engine, a skills content package, an enemies package, and the consumers (CLI simulator + Vue web app).

## Project Structure

```
pimpampum/
├── CLAUDE.md                      # This file
├── rules.md                       # Game rules (Catalan, prose) — source of truth for mechanics
├── intentions.md                  # Design intentions for balance
├── package.json / pnpm-workspace.yaml / tsconfig.base.json / flake.nix
├── .reference-catalog.md          # Harvested catalog of the OLD class-based content (historical reference)
├── packages/
│   ├── engine/                    # @pimpampum/engine — generic combat system, NO game content
│   │   └── src/
│   │       ├── index.ts           # Public API
│   │       ├── dice.ts            # DiceRoll
│   │       ├── types.ts           # ActionType, ActionDefinition, SkillInstance, EquipmentDefinition, CharacterDefinition, EquipmentSlot
│   │       ├── resolution.ts      # rollD20, resolveAttack, resolveDamage, checkSkillUp
│   │       ├── effects.ts         # EffectRegistry, EffectHandler, EffectContext, EngineApi, AttackModifiers, AIContext
│   │       ├── action.ts          # ActionInstance, getActionTargetRequirement/Count
│   │       ├── modifier.ts        # CombatModifier, ModifierDuration
│   │       ├── character.ts       # Character (PV + skills Map + statuses Map + guards), createCharacter
│   │       ├── combat.ts          # CombatEngine — step-by-step state machine + AI driver
│   │       ├── ai.ts              # selectAction (action-based weighted selection), AIView
│   │       ├── strategy.ts        # AIStrategy enum
│   │       └── display.ts         # ACTION_TYPE_* , STAT_ICONS, SLOT_LABELS, RULES_SUMMARY
│   ├── skills/                    # @pimpampum/skills — ALL game content (player + enemy skills)
│   │   └── src/
│   │       ├── index.ts           # Public API
│   │       ├── setup.ts           # registerSkills(registry), createRegistry()
│   │       ├── build.ts           # buildCharacter(spec) — resolve skill/action/equipment ids → Character
│   │       ├── effects/           # Effect handlers (attack/focus/defense) + registerAllEffects
│   │       ├── skills/            # SkillDefinitions grouped by theme (martial/arcane/divine-nature/social/enemy)
│   │       └── equipment/         # ALL_EQUIPMENT
│   ├── enemies/                   # @pimpampum/enemies — enemy templates + encounters
│   │   └── src/
│   │       ├── index.ts           # buildEncounter(), re-exports
│   │       ├── templates.ts       # ENEMY_TEMPLATES, createEnemyFromTemplate(template, levels)
│   │       └── encounters/        # ALL_ENCOUNTERS (per-player-count compositions)
│   ├── simulator/                 # @pimpampum/simulator — balance testing (tsx + vitest)
│   │   └── src/{main.ts, tests/{helpers.ts, balance.test.ts}}
│   └── web/                       # @pimpampum/web — Vue 3 SPA (character creation + combat + printable cards)
```

## Architecture & Source of Truth

- **`rules.md`** is the prose source of truth for game mechanics (read it before changing combat logic).
- **`packages/engine`** is content-agnostic: it knows about actions, skills, effects, damage and armour, but nothing about "Esgrima" or "Bola de foc". Effects are dispatched through an **`EffectRegistry`** (registry pattern), not a discriminated union.
- **`packages/skills`** defines ALL skills (player and enemy), their actions, the effect handlers, and equipment. This is the game-content source of truth.
- **`packages/enemies`** only references skill ids from `@pimpampum/skills`; it sets PV and skill levels at runtime (`createEnemyFromTemplate`).
- The simulator and web app derive everything from these three packages.

**Card/action descriptions are authoritative.** Each action's `description` (Catalan) defines what it does; if the effect implementation disagrees, the description wins and the handler must be fixed.

**Description style: brief, mechanical, non-standard effects only — no lore.** A `description` states *only* what deviates from a vanilla action (AoE, dots, debuffs, drains, armour-ignore, etc.) — e.g. "Afecta tots els enemics.", "Ignora l'armadura.". Do **not** restate things already shown on the card: the standard d20+skill roll, damage dice, speed, or a resource/charge cost (the cost is rendered in the card's corner). Drop all flavour prose ("Llença una granada a la línia enemiga…").

## Core Mechanics (see rules.md)

- **PV** is the only base stat. **Skills** are 1-100; a skill unlocks **actions** at given levels.
- **Action**: belongs to a skill; has a **speed** and a **type** (Atac / Defensa / Focus). Attacks also have **damage dice**.
- **Attack**: `d20 + skill + modifiers` vs the defender's `d20 + defense skill + modifiers` (or auto-hit if undefended). On a hit, roll damage dice, subtract passive armour (min 0), subtract from PV.
- **Defense**: pick an ally to protect; each attack on that ally (or on the defender) is rolled against the defender's defense; on penetration the **defender** takes the damage. (Implemented as `guards` resolved in speed order.)
- **Focus**: special effects, usually slow; cancelled if the actor takes an undefended hit before it resolves.
- **Skill level-up**: after a contested roll, fail-by-<10 or succeed-by-<5 → +1 level (`checkSkillUp`).
- **Equipment**: slot-based (Tors/Cap/Braços/Cames/Mà principal/Mà secundària); gives passive armour, speed penalty, and/or skill bonuses.
- **Balance principle**: a fight is fair when both teams have a similar **total skill-level sum**.

## Engine: how an action resolves

1. `prepareRound()` — advance round, apply stun/skip.
2. `planActions(humanSelections)` — build the speed-ordered pending queue (humans supply action ids; AI fills the rest via `selectAction`); returns `RevealedAction[]`.
3. `resolveNextAction()` — returns `{kind:'target'|'resolved'|'done'}`. On `'target'` the UI prompts and calls `setResolveTarget(targets)`. Speed ties resolve simultaneously (per-tier alive/interrupt snapshots).
4. `finishRound()` — postRound effect hooks, damage-over-time / regen (generic via status `data.dot` / `data.regen`), `advanceTurn`.
5. Simulator drives all of this automatically via `runRound()` / `runCombat(stats)`.

**Effect handlers** (`packages/skills/src/effects`) implement hooks: `modifyAttack`, `onAttackHit`, `onAttackMiss`, `onDefend`, `onResolve`, `postRound`, `getTargetRequirement`, `aiWeight`. They only touch the engine through the `EngineApi` interface. Generic parameterised handlers cover most effects: `piercing`, `bonus_damage`, `extra_dice`, `pack`, `crossfire`, `reckless`, `frenzy`, `lifedrain`, `debuff_on_hit`, `poison_on_hit`, `stun_on_hit`, `mark_on_hit`, `silence_on_hit`, `heal`, `skill_mod`, `stun`, `evasion`, `regen`, `dot`, `wild_shape`, `summon`, `sacrifice`, `detonate`, `cleanse`, `counter`, `retaliate_wound`, `debuff_on_block`, `self_armor`.

## Building characters

```ts
import { CombatEngine } from '@pimpampum/engine';
import { createRegistry, buildCharacter } from '@pimpampum/skills';
import { createEnemyFromTemplate, getEnemyTemplate } from '@pimpampum/enemies';

const registry = createRegistry();                 // registers all effect handlers
const hero = buildCharacter({                       // players: pick skills + levels on the fly
  name: 'Aragorn', classCss: 'guerrer', pv: 22,
  skills: { esgrima: 38, 'tactica-militar': 22 },
  equipment: ['armadura-de-cuir'],
});                                                 // actions default to those unlocked by the skill levels
const goblin = createEnemyFromTemplate(getEnemyTemplate('goblin')!, { 'tactiques-goblin': 25 });
const engine = new CombatEngine([hero], [goblin], { registry });
```

Players are human-controlled when `aiStrategy === null`; enemies get a strategy via `assignStrategies`.

## Adding or changing content

**Design principle (lore first, mechanics second).** When *designing* new actions, disregard the current mechanics entirely. Do not let the existing effect handlers, what is easy to implement, or "what already exists" shape the design. The goal is **originality** and staying **as close as possible to the lore/fantasy of the character or skill**. Design the action the character *should* have, then build whatever new effect handlers, engine support, or mechanics that requires — implementation effort is never a reason to compromise the design. (This applies to design; the registry pattern still governs *how* it's eventually coded.)

- **New skill / actions**: add a `SkillDefinition` (use the `action()` helper) in the appropriate `packages/skills/src/skills/*.ts` file and include it in that file's exported array (which `skills/index.ts` aggregates into `ALL_SKILLS`). Reference existing effect `type` keys; only add a new handler in `packages/skills/src/effects/` if no parameterised one fits, and register it in `effects/index.ts`.
- **New enemy**: add an `EnemyTemplate` to `ENEMY_TEMPLATES` referencing skill ids; add encounters to `ALL_ENCOUNTERS`.
- **New equipment**: add an `EquipmentDefinition` to `ALL_EQUIPMENT`.
- The engine almost never needs changes for new content — that's the point of the registry.

## Building & running

```bash
pnpm install
pnpm build                          # builds engine → skills → enemies → web (topological)
pnpm simulate                       # CLI balance simulation (packages/simulator/src/main.ts)
pnpm --filter @pimpampum/simulator test   # vitest balance suite
pnpm dev                            # web dev server
```

Consumers import the built `dist/` of the workspace packages, so engine/skills/enemies must be built before running the web/simulator.

## Simulator & balance tests

- `main.ts` reports mirror-match balance (equal-budget random teams should win ~50/50), per-skill and per-action win correlation, combat length, and encounter win rates.
- `tests/balance.test.ts` checks: resolution math (`checkSkillUp`, `resolveDamage`), engine sanity (terminates, valid winner, PV in range), mirror balance ~50%, combat length, all action types see play, and that every encounter resolves for each player count. Helpers in `tests/helpers.ts` generate random skill-based characters.

**Balance verification**: any content change is experimental until simulated. Run the `/analyze` skill (or `pnpm simulate`), present results, and flag conflicts with `intentions.md`.

## Web app (`packages/web`)

Vue 3 + Vue Router SPA. Combat uses the engine's **step-by-step** API via `composables/useGame.ts`:
setup (character creation) → card-selection → reveal → resolving (one action at a time, with mid-resolution target prompts) → victory. `composables/useActionDisplay.ts` converts actions/equipment to printable-card props.

Routes: `/` (home), `/combat` (create characters + play), `/cards[/:section]` (printable skill actions + equipment + rules), `/encounters` (enemy templates + encounters), `/rules`.

### Card design / theming

Printable cards are 63×88mm (`components/cards/PrintableCard.vue`, parchment style in `assets/cards.css`). Each card has a class CSS theme (`guerrer`, `mag`, `murri`, `barbar`, `clergue`, `monjo`, `trobador`, `fetiller`, `paladi`, `druida`, `bruixot`, `objecte`, `goblin`, `goblin-shaman`, `basilisc`, `diable-espinos`, `diable-dos`, `diable-banyut`, `golem-de-pedra`, `llop`, `enginyer`, `mestre-armes`, `nigromant`) used as a colour theme on `SkillDefinition.classCss`, and an action-type header colour (`atac-fisic`, `defensa`, `focus`). Icons come from `packages/web/public/icons/` (game-icons.net, CC BY 3.0), served at `/icons/`.

## Development environment

- NixOS dev shell via `flake.nix` (`nodejs_22`, `pnpm`, `csv-tui`).
- TypeScript strict, ES2022, ESNext modules, bundler resolution.
- GitHub Pages deploy via `.github/workflows/pages.yml` (`pnpm install --frozen-lockfile && pnpm build`, copies `index.html`→`404.html`, uploads `packages/web/dist/`).
