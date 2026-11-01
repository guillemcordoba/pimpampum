# Pim Pam Pum

A tabletop RPG combat system, written in Catalan. **Skill-based**: one base stat (PV) plus skills whose level N means the character knows the skill's first N actions. **No classes**: players build characters from skills and levels. Combat is a **dice contest**: each card carries its own dice, one contested roll decides everything, and **damage is the margin** minus passive armour. **Fatigue** is a DM-assigned level (0-5), −1 on every roll.

pnpm monorepo, layered — each package only looks DOWN (enforced by `tools/test/conventions.test.ts`):

| package | what it is | depends on |
|---|---|---|
| `engine` | the rules. No AI, no content. `@pimpampum/engine/testing`: content-free fixtures for tests | — |
| `ai` | today's AI (`aiPolicy`: depth-0 heuristic + depth-1 lookahead), an INSTRUMENT, not an opponent. `ai/audit`: the exact referee, the equilibrium player (`equilibriumPolicy`) and the imaginary cards they are graded on. `ai/parallel` (Node only): a solve's cells on worker threads | engine |
| `combat-balancer` | solves enemy PV so a simulated fight hits a target winrate; content-agnostic (`EncounterContent`) | engine, ai |
| `bench` | set-agnostic measurement: cells, baselines, regret, report maths, cache, `isolated()`. `@pimpampum/bench/testing`: a small synthetic set | engine, ai, combat-balancer |
| `playtest` | the requirement rules, `analyze`, control kits; `@pimpampum/playtest/vitest` is the assertion API a set's tests use | engine, bench |
| `sets/common` | content shared by several sets: the `action()`/`d()` builders, effect helpers, `COMMON_EFFECTS`, shared skills (Esgrima, id `mestre-armes`) | engine |
| `sets/fantasy` | THE CONTENT: players, enemies, the bound balancer; `./bench` is its `GameSet` adapter + calibration data | engine, ai, bench, combat-balancer, set-common |
| `sets/elements` | a second set, *Els Quatre Elements* (its `DESIGN.md`); harnesses pick it with `--set elements` | as `sets/fantasy` |
| `tools` | CLI harnesses, the repo conventions, mutation testing | everything |
| `web` | Vue 3 SPA | engine, ai, set-fantasy, combat-balancer |

## Where the truth lives

| | |
|---|---|
| `rules.md` | The mechanics, in prose (Catalan). **Read before changing combat logic.** |
| `intentions.md` | Balance/design intentions — strategy triangle, dice, fatigue. |
| `ARCHITECTURE.md` | Engine seams, effect-handler catalogue, AI and audit internals, balancer, web. **Read the relevant section before touching a subsystem.** |
| `OPEN.md` | Everything still to do, and the rulings decided but not yet implemented. Delete an item when it is done. |
| `NEXT-STEPS.md` | FROZEN history (2026-08 → 11), cited by code comments; being retired (`OPEN.md`, last item). Never append to it. |
| An action's `description` | What that card does. If the implementation disagrees, **the description wins** and the handler is fixed. |

## Non-negotiables

- **The engine never knows about content.** It never names a card or a skill and never interprets `StatusEntry.data`; effects dispatch through an `EffectRegistry`. **A new card must never require an engine edit**: if no seam fits, add a *generic, parameterised* seam and keep the content in the set.
- **Statuses price themselves.** The AI's evaluator sees PV, bodies, fatigue and what each status says it is worth (`StatusBehavior.positionValue`), nothing else. Statuses come from the engine's vocabulary of kinds that price themselves (`engine/src/status-kinds.ts`, `applyKind`); a card that needs something no kind covers may bring its own `StatusBehavior`, which must price itself (`tools/test/status-pricing.test.ts`). A card the AI never plays is usually an unpriced status, not a weak card (`isBlindSpot`, `KNOWN_BLIND`).
- **Co-location.** A skill's handlers and the `StatusBehavior`s they attach live in the skill's own file (`SkillDefinition.effects`). `players/effects/` holds only generic handlers reused by several skills; what several SETS share lives in `sets/common`.
- **One registry per set**: `createRegistry()` registers every handler, player and enemy.
- **The calibration is a snapshot.** Baselines are measured with PINNED copies of the player kits (`sets/fantasy/src/bench/calibration-kits/`, ids `berserk@cal`), never the live ones; never edit the copies. `pnpm calibration:refresh` re-pins them (and recalibrates everything, once).
- **Measurement never names a set.** `bench`, `playtest` and `combat-balancer` take their content as a parameter (`GameSet`, `EncounterContent`); `useSet(FANTASY)` installs it once per process.
- **Design lore-first.** Design a card from its skill's fantasy, ignoring existing mechanics and implementation effort; then build whatever handlers or seams it needs (the registry pattern still governs the code).
- **Cards are designed by the `card-designer` agent and judged by fresh `card-taste` agents** (`.claude/agents/`; the loop is in `card-designer.md`). The user picks, the main session adds mechanics and dice, a fresh `card-taste` reviews the final cards before implementing. Show the verdicts; the user may overrule them.
- **Card descriptions are brief and mechanical**: only what deviates from a vanilla action ("Afecta tots els enemics.", "Ignora l'armadura."); never what the card already shows (dice, the fast badge, a cost), no flavour.
- **A content change is experimental until simulated** (`/analyze`); present the results and flag conflicts with `intentions.md`.

## Core mechanics (a summary — `rules.md` is the truth)

- **PV** is the only base stat; players default to 12. Enemies carry none: the encounter balancer solves it (`solveEncounter(pool, party, targetWinrate)`, by simulating the real fight). Difficulty and the party are INPUTS — an explicit party is the real table, a drawn one (`players/party.ts`) a representative sample.
- **An action** belongs to a skill, has a type (Atac / Defensa / Focus), dice, and rarely the **fast** keyword. It costs no fatigue unless its text says so.
- **The roll** = the card's dice + roll bonuses − fatigue. **A level enters no roll** (2026-11-01), in combat or out: it only gates which cards a character knows (mestratge, then the flat level, were removed by design decision).
- **Attack**: one contested roll against the defense; ties hold for the defense; damage = margin − armour; an undefended target takes the whole total. AoE: one roll, each target defends against it separately.
- **Defense** guards the defender or one ally, chosen when it resolves; defenses covering one attack sum into a wall. **Envoltat**: a body n attacks aim at this round has each defense covering it roll n times and keep the worst. No generic enemy block (a few interim cards block through their own 'enemy' target). Every defense card should pay off when it blocks.
- **Focus**: usually slow; cancelled if the actor takes damage first (armour-absorbed hits don't count).
- **Priority, no speed**: a fast step (Defense → Attack → Focus), then Defense → Attack → Focus. Attacks aim at the reveal. Inside a step people resolve in commit order, AI seats at random. `ActionDefinition.fast` and `StatusBehavior.fast` are the only order seams.
- **Skill level-up**: the loser of a contested roll by ≤ `SKILL_UP_MARGIN` (2) learns the skill's next action; a tie counts as the attacker losing by 0; undefended hits never teach.
- **Fatigue**: levels 0-5, −1 per level on every roll; the engine never raises it, only a card's text or the DM; enemies never carry it; it persists until `Character.rest()`. Everyone always holds **Cop desesperat**.
- **Out of combat**: 1d20 + the action's dice against a DM difficulty (5–25), meet-or-beat; no skill rolls the bare d20; failing by ≤ 2 levels the skill, from zero too.
- **Equipment**: armor / weapon / shield slots. Weapons give a flat `attackBonus`; armour is a small lever (cuir +2, ferro +3).
- **Balance principle**: a fight is fair when both teams have a similar total skill-level sum.

## Measurement: three rules (the full account: `packages/tools/README.md`)

- **A harness must run at `GAMES=2`** — `tools/test/harnesses.slow.test.ts` runs every script that way. Read the sample size through bench's `games()`, never a hardcoded const.
- **A one-off experiment is deleted** once its conclusion is written down, dated, in the doc it changes (`rules.md`, `intentions.md`, `ARCHITECTURE.md`) or the commit message. Only a standing question earns a permanent harness.
- **A claim that can go stale must be executable** (assert it), computed at print time, or dated in a doc — never a measured number in a comment.

## Adding content

- **Skill** → `packages/sets/<set>/src/players/skills/<skill>.ts` (`SkillDefinition`, `action()`/`d()`), listed in `ALL_SKILLS` (`players/catalog.ts`). A MAIN kit also needs `test/kits/<skill>.slow.test.ts`, a place in `COMPANY`, and a `pnpm calibration:refresh` (the tests say so until it has them).
- **Enemy** → `src/enemies/creatures/<enemy>.ts` exporting an `EnemyDefinition` (name, icon, bulk, its skills), listed in `enemies/catalog.ts`; the calibration test asks where it is measured.
- **Equipment** → an `EquipmentDefinition` in `ALL_EQUIPMENT`.

```ts
import { buildCharacter, createEnemy, createRegistry } from '@pimpampum/set-fantasy';
import { aiPolicy } from '@pimpampum/ai';

const registry = createRegistry();        // every handler: player AND enemy
const hero = buildCharacter({
  name: 'Aragorn', classCss: 'mestre-armes', pv: 12,
  skills: { 'mestre-armes': 4, metge: 2 },   // knows the first 4 / first 2 actions
  equipment: ['armadura-de-cuir', 'destral'],
});
const goblin = createEnemy('goblin', { pv: 16, level: 3 })!;
const engine = new CombatEngine([hero], [goblin], { registry, ...aiPolicy({ depth: 1 }) });   // no silent default policy
```

## Building & running

```bash
pnpm build                                # every package, topologically
pnpm test                                 # build, then the FAST tier of every package (seconds)
pnpm test:slow                            # build, then the statistical tier (*.slow.test.ts, minutes)
pnpm test:smoke                           # does every slow file still EXECUTE (GAMES=2, BENCH_SMOKE=1)
pnpm --filter @pimpampum/tools exec tsx src/mutation.ts   # can the fast tier actually fail?
pnpm --filter @pimpampum/tools exec tsx src/kit-analyzer.ts --player berserk   # one kit's report card
pnpm calibration:refresh                  # re-pin the calibration kits (recalibrates)
pnpm dev                                  # engine tsc --watch + web dev server
```

Tests live in each package's `test/` (never `src/`), import their own package from `../src`, and are typechecked by its `tsconfig.test.json`. Anything that measures for more than a minute runs in a child process (`isolated()` / `analyzeIsolated()`): a vitest worker blocked that long fails on an RPC timeout. Consumers import the built `dist/` of workspace packages, so build dependencies before their dependents (`pnpm test` does). NixOS dev shell via `flake.nix`; TypeScript strict, ES2022, ESNext modules.
