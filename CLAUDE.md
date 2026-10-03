# Pim Pam Pum

A tabletop RPG combat system, written in Catalan. **Skill-based**: characters have one base stat (PV) plus skills whose level is a small ordinal — **level N = the character knows the first N actions of the skill**. Combat is a **dice contest**: each card carries its own dice, one contested roll decides everything, and the **damage is the margin** (attack total − defense total) minus passive armour. No d20, no to-hit roll, no separate damage roll. **Fatigue** is a DM-assigned level (0-5) that subtracts from every roll — playing a card costs none unless its text says so (Entrar en Fúria). There are **no predefined classes** — players build characters on the fly from skills and levels.

pnpm monorepo, layered — each package only looks DOWN (enforced by `tools/test/conventions.test.ts`):

| package | what it is | depends on |
|---|---|---|
| `engine` | the rules. No AI, no content. `@pimpampum/engine/testing` has content-free fixtures for tests | — |
| `ai` | the policy (`aiPolicy`): depth-0 heuristic + depth-1 lookahead. An INSTRUMENT, not an opponent | engine |
| `combat-balancer` | solves enemy PV so a simulated fight hits a target winrate; content-agnostic (`EncounterContent`) | engine, ai |
| `bench` | set-agnostic measurement: cells, positions (baselines), regret, report maths, cache, `isolated()`. `@pimpampum/bench/testing` is a small SYNTHETIC second set | engine, ai, combat-balancer |
| `playtest` | the requirement rules, `analyze`, control kits; `@pimpampum/playtest/vitest` is the assertion API a set's tests use | engine, bench |
| `sets/fantasy` | THE CONTENT: players, enemies, the bound balancer (browser-safe root); `./bench` is its `GameSet` adapter + calibration data | engine, ai, bench, combat-balancer |
| `tools` | CLI harnesses (kit analyzer, AI benchmark, probes…), the repo conventions, mutation testing | everything |
| `web` | Vue 3 SPA | engine, ai, set-fantasy, combat-balancer |

## Where the truth lives

| | |
|---|---|
| `rules.md` | Game mechanics, in prose (Catalan). **Read before changing combat logic.** |
| `intentions.md` | Balance/design intentions — strategy triangle, dice philosophy, fatigue philosophy. |
| `ARCHITECTURE.md` | Engine seam list, effect-handler catalogue, balancer internals, web-app detail, measured findings. **Read the relevant section before touching that subsystem.** |
| `NEXT-STEPS.md` | Open balance work: the 2026-08-03 audit, the kit scoreboard, and what to do next. Read before changing enemy or player kits. |
| An action's `description` | What that card does. If the implementation disagrees, **the description wins** and the handler is fixed. |

## Non-negotiables

- **The engine never knows about content.** It never names a card, skill or status key, and never interprets `StatusEntry.data` (inert payload). Effects dispatch through an `EffectRegistry`; a status gets all its mechanics from a `StatusBehavior` attached at `setStatus(key, value, turns, data, BEHAVIOR)` — no registration. **A new card must never require an engine edit.** If no seam fits, add a *generic parameterised* seam, then implement the content in the set (`sets/fantasy`).
- **A card the AI never plays is usually a blind EVALUATOR, not a weak card.** `positionScore` sees PV, bodies and fatigue; anything else a card does is invisible to it unless the status prices itself through `StatusBehavior.positionValue`. Check that before redesigning a card that measures as dead — eleven of them did, and none of them were weak.
- **Co-location.** A skill's handlers and the `StatusBehavior` consts they attach live in that skill's own file, handlers on `SkillDefinition.effects`. `sets/fantasy/src/players/effects/` holds only genuinely generic, parameterised handlers reused by several skills.
- **One registry per set.** `createRegistry()` from `@pimpampum/set-fantasy` registers every handler — player AND enemy. (It used to be two calls, and forgetting the second silently made enemy cards do nothing.)
- **The calibration is a snapshot.** Baselines (reference party, stand-ins, company rows) are measured with PINNED copies of the player kits (`sets/fantasy/src/bench/calibration-kits/`, ids `berserk@cal`), never the live ones — so editing a kit re-measures only that kit. `pnpm calibration:refresh` re-pins them (and recalibrates everything, once); do it when the baselines should follow the game. Never edit the copies. The analyzer and the fast tier print which live kits the snapshot is stale for.
- **Measurement never names a set.** `bench`, `playtest` and `combat-balancer` take their content as a parameter (`GameSet`, `EncounterContent`); `useSet(FANTASY)` installs it once per process and bench THROWS if nothing is installed.
- **Design lore-first.** When designing new actions, disregard current mechanics entirely — not the existing handlers, not what is easy to implement, not what already exists. Aim for originality and the skill's own fantasy, then build whatever handlers or seams that requires. Implementation effort is never a reason to compromise a design. (Design only; the registry pattern still governs how it is coded.)
- **Card descriptions are brief, mechanical, non-standard effects only.** State *only* what deviates from a vanilla action — "Afecta tots els enemics.", "Ignora l'armadura." Never restate what the card already shows (contest dice, speed, resource cost). No flavour prose.
- **Any content change is experimental until simulated.** Run `/analyze` (or `pnpm simulate`), present the results, and flag conflicts with `intentions.md`.

## Core mechanics

- **PV** is the only base stat; players default to **12**. Enemies carry no printed PV — the encounter sets it and the balancer solves it. No character sizes, no rest system beyond the one-line sleep rule.
- **Action**: belongs to a skill; has a **speed**, a **type** (Atac / Defensa / Focus) and **dice** (the card's dice are both its precision and its power). Playing one costs no fatigue unless its text says so.
- **The roll** = the card's **dice + your level in that card's skill** (`skillLevelBonus`, the only place a level enters a roll). Both sides add their own, so equal levels cancel exactly and a same-level contest is identical to one with no bonus — it only speaks when training is uneven, which is what makes an enemy's level a real danger dial and not just a wider hand. `unlockLevel` gates which cards a level unlocks; it does **not** enter the roll. (It used to: **mestratge** added `level − unlockLevel` so old cards stayed relevant as their dice fell behind. Removed 2026-09-20 by design decision — don't reintroduce it.)
- **Attack**: ONE contested roll, attack dice vs defense dice. Ties hold for the defense. **Damage = the margin**, minus the recipient's passive armour (min 0). **Undefended targets are auto-hit for the full attack total.** AoE: ONE roll per pass, every target defends against that same roll separately.
- **Defense** targets an **ally** (guard) or an **enemy** (block); defenses covering the same attack **sum** into a wall, and the defender always also defends themselves. See `ARCHITECTURE.md`.
- **Focus**: usually slow, cancelled if the actor takes damage first (armour-absorbed hits do not interrupt).
- **Skill level-up**: after a contested roll the **loser** gains +1 level (learns the skill's next action) if they lost by ≤ `SKILL_UP_MARGIN` (2). A tie counts as the attacker losing by 0. Undefended auto-hits are not contests and never teach.
- **Fatigue**: a **DM-assigned level 0-5** (Fresc, Cansat, Fatigat, Extenuat, Exhaust, Esgotat), **−1 per level on every roll** — attack, defense, focus, out of combat. The engine never raises it; only a card whose text says so does (Entrar en Fúria's price, Injecció d'adrenalina's effect). **One level ≈ one difficulty tier** (measured). Persists across combats; only `Character.rest()` (a 4h+ rest) clears it. **Enemies never carry fatigue** — a symmetric penalty cancels in the margin and freezes fights (measured). Every combatant always holds **Cop desesperat**, playable only when nothing else is.
- **Out of combat**: a challenge is `1d20 + the action's dice + skill level` vs a DM difficulty (5/10/15/20/25), meet-or-beat. **No skill? Roll the bare d20** — anyone may attempt anything, so there is no Perception or Investigation skill. The margin is the payload, and failing by ≤2 levels the skill **including from zero** (that is how a brand-new skill is born). Reward invention by lowering the difficulty, never with a bonus. See `rules.md`.
- **Speed**: higher resolves first; ties resolve simultaneously. Heavy armour subtracts speed.
- **Equipment**: three slots, one item each — **Armor / Weapon / Shield**. Weapons carry a flat `attackBonus` (bastó +0, destral +2, gran destral +4) and weapon-tagged actions require one. **Armour is a small bounded lever** (≤15% of outcome): only cuir (+2 armour, −1 speed) and ferro (+3, −2). It must have a **sweet spot** — right on some of the party, wrong on all of it (`sweetSpotVerdict`): cuir peaks around three wearers, ferro around one or two.
- **Difficulty is an INPUT** (a target player winrate; `TARGET_WINRATES` presets), never a label. There are no fixed encounters — `solveEncounter(pool, party, targetWinrate)` solves the PV that hits the target by **simulating the real fight**. A creature is just a name, an icon, a kit and a `bulk`; a new or homebrew creature needs no measurement pass.
- **The party is an input, in two flavours** (`sets/fantasy/src/players/party.ts`): an **explicit** party (`{ characters: CharacterBuildSpec[] }`) is the real table, built identically every game — this is what the web app passes. A **drawn** party (`{ count, levels, armor?, pv? }`) says only how many players and how strong, and a representative one is drawn per game — used by the simulator sweeps and the balancer tests. `isExplicitParty()` distinguishes them.
- **Balance principle**: a fight is fair when both teams have a similar **total skill-level sum** (mirror teams use ~6-7 per player).

## Measurement: three rules, all learned the hard way

The measurement layer exists to produce numbers someone changes content on, so a wrong
number is worse than no number. Full account in `packages/tools/README.md`.

- **A harness must run at `GAMES=2`, and it lives or dies by `tools/test/harnesses.slow.test.ts`.**
  Read the sample size through bench's `games()`, never a hardcoded const — and that
  includes test budgets and floors (a hard-coded 40-game screen made a "smoke" run take a minute per file). A
  harness nobody can run cheaply is one nobody runs, and one nobody runs rots in
  silence — `experiment-berserk` and `experiment-balance-pass` both *crashed* on
  a renamed card for months, because checking them cost 2,500 and 4,000 combats.
  The smoke test runs every script in `src/` at two combats; it checks no
  numbers, only that each still executes against today's content.
- **A one-off experiment is DELETED once its conclusion is written down.** The
  conclusion is the durable artifact; the script is scaffolding. Write the
  finding into `NEXT-STEPS.md` with a date, then remove the file. Only a
  *standing* question — one you will ask again after the next content change —
  earns a permanent harness. Eight scripts were deleted on 2026-09-20 and
  eight more on 2026-09-23 for failing this; repairing them instead was the
  wrong instinct.
- **A claim that can go stale must be executable.** Assert it (`REFERENCE_SIGMA`
  throws when the reference party moves), compute it at print time
  (`gamesFor(3)`), or date it in a doc. **Never state a measured number in a
  comment as if it were permanent** — "measured: +51.7pp", "the balancer's hard
  solve promises 65%", "roll penalties are permanently gone" were all true once
  and silently became false. Comments describe *why*; docs hold *what was
  measured, when*.

## Adding content

- **New skill / actions** → `packages/sets/fantasy/src/players/skills/<skill>.ts` with the `SkillDefinition` (use the `action()` and `d()` helpers), listed in `ALL_SKILLS` in `players/catalog.ts`. Reuse generic effect `type` keys where they fit; anything skill-specific goes on that definition's own `effects` map, `StatusBehavior` consts alongside. A new MAIN kit also needs a `test/kits/<skill>.slow.test.ts` (the coverage test fails until it has one), a place in `COMPANY`, and a `pnpm calibration:refresh` (the snapshot test fails until it is pinned).
- **New enemy** → `packages/sets/fantasy/src/enemies/creatures/<enemy>.ts` exporting an `EnemyDefinition` (name, icon, bulk, its skill definitions with co-located handlers), listed in `enemies/catalog.ts`. The calibration test then asks where it is measured (`SHAPES` or `UNFIELDED_ENEMIES`) and how many bodies to field.
- **New equipment** → an `EquipmentDefinition` in `ALL_EQUIPMENT`.

```ts
import { buildCharacter, createEnemy, createRegistry } from '@pimpampum/set-fantasy';
import { aiPolicy } from '@pimpampum/ai';

const registry = createRegistry();        // every handler: player AND enemy

const hero = buildCharacter({
  name: 'Aragorn', classCss: 'mestre-armes', pv: 12,
  skills: { 'mestre-armes': 4, metge: 2 },   // knows the first 4 / first 2 actions
  equipment: ['armadura-de-cuir', 'destral'],
});                                       // actions default to those the levels unlock
const goblin = createEnemy('goblin', { pv: 16, level: 3 })!;
const engine = new CombatEngine([hero], [goblin], { registry, ...aiPolicy({ depth: 1 }) });   // no silent default policy
```

## Building & running

```bash
pnpm build                                # every package, topologically
pnpm test                                 # build, then the FAST tier of every package (~300 tests, seconds)
pnpm test:slow                            # build, then the statistical tier (*.slow.test.ts, minutes)
pnpm test:smoke                           # does every slow file still EXECUTE (GAMES=2 …; minutes, not hours)
pnpm --filter @pimpampum/tools exec tsx src/mutation.ts   # can the fast tier actually fail?
pnpm --filter @pimpampum/tools exec tsx src/kit-analyzer.ts --player berserk   # one kit's report card
pnpm calibration:refresh                  # re-pin the calibration kits to the live ones (recalibrates)
pnpm simulate                             # CLI balance simulation
pnpm dev                                  # engine tsc --watch + web dev server
```

Tests live in each package's `test/` (never `src/`), import their own package from `../src`, and are typechecked by that package's `tsconfig.test.json`. Anything that measures for more than a minute runs in a child process (`isolated()` / `analyzeIsolated()`): a vitest worker blocked that long fails the run on an RPC timeout whatever the assertions say.

Consumers import the built `dist/` of the workspace packages, so dependencies must be built before their dependents run (`pnpm test` builds first).

NixOS dev shell via `flake.nix` (`nodejs_22`, `pnpm`). TypeScript strict, ES2022, ESNext modules, bundler resolution. GitHub Pages deploy via `.github/workflows/pages.yml`.
