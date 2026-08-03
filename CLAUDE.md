# Pim Pam Pum

A tabletop RPG combat system, written in Catalan. **Skill-based**: characters have one base stat (PV) plus skills whose level is a small ordinal — **level N = the character knows the first N actions of the skill**. Combat is a **dice contest**: each card carries its own dice, one contested roll decides everything, and the **damage is the margin** (attack total − defense total) minus passive armour. No d20, no to-hit roll, no separate damage roll. Every action played costs **fatigue** from a daily budget. There are **no predefined classes** — players build characters on the fly from skills and levels.

pnpm monorepo: `engine` (content-agnostic combat), `skills` (player content), `enemies` (enemy content + encounter balancer), `simulator` (balance testing) and `web` (Vue 3 SPA).

## Where the truth lives

| | |
|---|---|
| `rules.md` | Game mechanics, in prose (Catalan). **Read before changing combat logic.** |
| `intentions.md` | Balance/design intentions — strategy triangle, dice philosophy, fatigue philosophy. |
| `ARCHITECTURE.md` | Engine seam list, effect-handler catalogue, balancer internals, web-app detail, measured findings. **Read the relevant section before touching that subsystem.** |
| `NEXT-STEPS.md` | Open balance work: the 2026-08-03 audit, the kit scoreboard, and what to do next. Read before changing enemy or player kits. |
| An action's `description` | What that card does. If the implementation disagrees, **the description wins** and the handler is fixed. |

## Non-negotiables

- **The engine never knows about content.** It never names a card, skill or status key, and never interprets `StatusEntry.data` (inert payload). Effects dispatch through an `EffectRegistry`; a status gets all its mechanics from a `StatusBehavior` attached at `setStatus(key, value, turns, data, BEHAVIOR)` — no registration. **A new card must never require an engine edit.** If no seam fits, add a *generic parameterised* seam, then implement the content in `skills`.
- **Co-location.** A skill's handlers and the `StatusBehavior` consts they attach live in that skill's own file, handlers on `SkillDefinition.effects`. `skills/src/effects/` holds only genuinely generic, parameterised handlers reused by several skills.
- **`registerEnemySkills(registry)` must be called alongside `createRegistry()` whenever enemies fight**, or enemy-specific handlers are missing.
- **Design lore-first.** When designing new actions, disregard current mechanics entirely — not the existing handlers, not what is easy to implement, not what already exists. Aim for originality and the skill's own fantasy, then build whatever handlers or seams that requires. Implementation effort is never a reason to compromise a design. (Design only; the registry pattern still governs how it is coded.)
- **Card descriptions are brief, mechanical, non-standard effects only.** State *only* what deviates from a vanilla action — "Afecta tots els enemics.", "Ignora l'armadura." Never restate what the card already shows (contest dice, speed, fatigue/resource cost). No flavour prose.
- **Any content change is experimental until simulated.** Run `/analyze` (or `pnpm simulate`), present the results, and flag conflicts with `intentions.md`.

## Core mechanics

- **PV** is the only base stat; players default to **12**. Enemies carry no printed PV — the encounter sets it and the balancer solves it. No character sizes, no rest system beyond the one-line sleep rule.
- **Action**: belongs to a skill; has a **speed**, a **type** (Atac / Defensa / Focus), **dice** (the card's dice are both its precision and its power) and a **fatigue cost** (default 1).
- **Attack**: ONE contested roll, attack dice vs defense dice. Ties hold for the defense. **Damage = the margin**, minus the recipient's passive armour (min 0). **Undefended targets are auto-hit for the full attack total.** AoE: ONE roll per pass, every target defends against that same roll separately.
- **Defense** targets an **ally** (guard) or an **enemy** (block); defenses covering the same attack **sum** into a wall, and the defender always also defends themselves. See `ARCHITECTURE.md`.
- **Focus**: usually slow, cancelled if the actor takes damage first (armour-absorbed hits do not interrupt).
- **Skill level-up**: after a contested roll the **loser** gains +1 level (learns the skill's next action) if they lost by ≤ `SKILL_UP_MARGIN` (2). A tie counts as the attacker losing by 0. Undefended auto-hits are not contests and never teach.
- **Fatigue**: a daily stamina budget, **never a dice modifier**. `FATIGUE_CONFIG.max = 20` is the pacing knob (~2-3 combats/day); a card that would exceed it is unplayable. Persists across combats; `Character.sleep()` clears it. Every combatant always holds **Cop desesperat**, playable only when nothing else is.
- **Speed**: higher resolves first; ties resolve simultaneously. Heavy armour subtracts speed.
- **Equipment**: three slots, one item each — **Armor / Weapon / Shield**. Weapons carry a flat `attackBonus` (bastó +0, destral +2, gran destral +4) and weapon-tagged actions require one. **Armour is a small bounded lever** (≤15% of outcome): only cuir (+1) and ferro (+2).
- **Difficulty is an INPUT** (a target player winrate; `TARGET_WINRATES` presets), never a label. There are no fixed encounters — `solveEncounter(pool, party, targetWinrate)` solves the PV that hits the target by **simulating the real fight**. A creature is just a name, an icon, a kit and a `bulk`; a new or homebrew creature needs no measurement pass.
- **The party is an input, in two flavours** (`skills/src/party.ts`): an **explicit** party (`{ characters: CharacterBuildSpec[] }`) is the real table, built identically every game — this is what the web app passes. A **drawn** party (`{ count, levels, armor?, pv? }`) says only how many players and how strong, and a representative one is drawn per game — used by the simulator sweeps and the balancer tests. `isExplicitParty()` distinguishes them.
- **Balance principle**: a fight is fair when both teams have a similar **total skill-level sum** (mirror teams use ~6-7 per player).

## Adding content

- **New skill / actions** → `packages/skills/src/skills/<skill>.ts` with the `SkillDefinition` (use the `action()` and `d()` helpers), listed in `ALL_SKILLS` in `catalog.ts`. Reuse generic effect `type` keys where they fit; anything skill-specific goes on that definition's own `effects` map, `StatusBehavior` consts alongside.
- **New enemy** → `packages/enemies/src/enemies/<enemy>.ts` exporting an `EnemyDefinition` (name, icon, bulk, its skill definitions with co-located handlers), listed in `catalog.ts`.
- **New equipment** → an `EquipmentDefinition` in `ALL_EQUIPMENT`.

```ts
const registry = createRegistry();        // generic + player-skill handlers
registerEnemySkills(registry);            // required whenever enemies fight

const hero = buildCharacter({
  name: 'Aragorn', classCss: 'mestre-armes', pv: 12,
  skills: { 'mestre-armes': 4, metge: 2 },   // knows the first 4 / first 2 actions
  equipment: ['armadura-de-cuir', 'destral'],
});                                       // actions default to those the levels unlock
const goblin = createEnemy('goblin', { pv: 16, level: 3 })!;
const engine = new CombatEngine([hero], [goblin], { registry });
```

## Building & running

```bash
pnpm build                                # engine → skills → enemies → web (topological)
pnpm simulate                             # CLI balance simulation
pnpm --filter @pimpampum/simulator test   # vitest balance suite
pnpm dev                                  # engine tsc --watch + web dev server
```

Consumers import the built `dist/` of the workspace packages, so engine/skills/enemies must be built before running web/simulator.

NixOS dev shell via `flake.nix` (`nodejs_22`, `pnpm`). TypeScript strict, ES2022, ESNext modules, bundler resolution. GitHub Pages deploy via `.github/workflows/pages.yml`.
