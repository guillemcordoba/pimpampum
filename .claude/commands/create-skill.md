Design and implement a new Pim Pam Pum player skill end-to-end: first research real myth/fiction/history for inspiration, clarify the character's lore, agree on the full action list (lore + distribution) up front, then design each action one at a time (lore-first), lock each, and finally implement, verify, and balance-test the whole kit. Use when the user wants to add a new skill / character / class to the game.

This skill encodes a deliberate, collaborative process. **Do not rush to code.** The order is sacred — do not start a phase until the previous one is explicitly approved:

1. **Research** — gather real myth/fiction/history for inspiration.
2. **Lore** — pin down the character/fantasy and thematic identity.
3. **Agree the full action list** — names, one-line lore each, type (Atac/Defensa/Focus), and rough unlock level for *every* action. Get explicit approval of the whole slate (lore + type distribution + arc) before any per-action numbers.
4. **Per-action design** — design each action one by one, lock each.
5. **Implement.**
6. **Verify** (build + smoke-test + balance).

The user drives the creative decisions; you ground them in the system and do the building.

## Guiding principles

- **Lore first, mechanics second.** Read the design principle in `CLAUDE.md` ("Adding or changing content"). When *designing* actions, disregard the current mechanics entirely — do not let existing effect handlers or ease of implementation shape the design. Design the action the character *should* have; build whatever new mechanic that requires. Originality + faithfulness to the character beat implementation effort every time.
- **Don't duplicate.** Skim the existing skills (`packages/sets/fantasy/src/players/skills/*.ts`) so the new skill carves out unclaimed fantasy and doesn't re-tread another skill's mechanics. Name the overlaps explicitly to the user.
- **Card descriptions are authoritative and in Catalan.** Each action's `description` defines what it does; the handler must match it.
- **Descriptions are brief, mechanical, non-standard effects only — no lore.** State *only* what deviates from a vanilla action (AoE, dots, debuffs, drains, armour-ignore…). Never restate what the card already shows: the d20+skill roll, damage dice, speed, or the resource/charge cost (shown in the card corner). Drop all flavour prose — the lore drives the *design*, not the card text.
- **Use the d20-native idiom.** Express chances as d20 rolls (e.g. "d20 ≤ 10"), not "50%", to match the rest of the game.
- **The user iterates a lot.** Expect them to add/remove/retype actions and tweak speeds/numbers repeatedly. Stay nimble: after every change, update the memory file and re-state the current locked table.

## Phase 0 — Frame & ground (read before talking)

1. Read `CLAUDE.md` (architecture + the lore-first design principle), `intentions.md` (balance goals), and `rules.md` if any new mechanic touches combat resolution.
2. Skim `packages/sets/fantasy/src/players/skills/*.ts` to calibrate the power curve (damage dice, speeds, resource costs, unlock levels) and to spot adjacent skills the new one must not duplicate.

## Phase 1 — Research for inspiration

Before inventing anything, gather raw material. The point is to spark *original, distinctive* actions grounded in real myth/fiction/history — not to copy. Get a sense of what the user already has in mind, then research around it:

1. Identify the seed — the user's concept, archetype, era, culture, or named inspiration (e.g. "Norse berserker", "WWI sapper", "Prometheus", "a kitsune"). If they only have a vague vibe, propose a few directions first.
2. Run a focused web sweep with `WebSearch` / `WebFetch` (or `/deep-research` for a deeper, cited dive) across:
   - **Fiction & myth** — iconic characters/archetypes with this fantasy: their signature abilities, iconic moments, recurring motifs, limitations.
   - **History & real craft** — real practitioners, techniques, tools, terminology (period-accurate names read great on cards).
   - **Stories & lore** — legends, set-pieces, "the famous thing they did" — these become signature actions and capstones.
3. Distill a short **inspiration digest** for the user: 5–8 evocative hooks (each a one-liner — an ability, a motif, a real term, a famous feat) that could each seed a distinctive action. Flag the ones that are *mechanically novel* for this game.
4. Let the user react and pick the threads that resonate. Those carry into Phase 2.

Keep it tight and inspirational — a digest, not a dissertation. Skip or shorten only if the user already arrives with a fully-formed concept and explicitly wants to go straight to lore.

## Phase 2 — Clarify the lore (the character)

Before any numbers, pin down the fantasy. Lead with questions, conversationally (use `AskUserQuestion` only for clean forks, always with a recommended default):

- **Who are they?** The archetype / role / fantasy.
- **Crafted or channeled?** Physical gear/inventory they carry (finite, deploy-style) vs. magic conjured on demand (charge- or cooldown-gated). This shapes how every action *feels*.
- **Emotional core / playstyle?** Reckless, cold-precise, control, burst, attrition…

From the answers, propose: a **thematic identity** (skill name + `classCss` theme), the **overlaps** with existing skills, and the **one real identity decision** for the user (e.g. a signature resource or capstone). The concrete action slate is settled in the next phase, not here.

## Phase 3 — Agree on the full action list (before any numbers)

Lock the *shape* of the kit before detailing a single action. The user wants to like the overall lore **and** the distribution of action types and the unlock arc up front.

1. Propose the **full slate** as a compact table — one row per action with: **name** (Catalan), **one-line lore hook**, **type** (Atac/Defensa/Focus), and **rough unlock level** (the low→high arc). A skill of 1–7 actions is normal; recommend a cut of ~5.
2. Show the **type distribution** explicitly (e.g. "3 Atac / 1 Defensa / 1 Focus") so the spread is a deliberate, visible choice that fits the identity.
3. Name the **signature action(s)** and any **new mechanics** the slate will require, and call out **overlaps** with existing skills.
4. Iterate with the user — add/cut/rename/retype/reorder — until they **explicitly approve the whole list**. Expect several rounds; this is where the creative shape is set.
5. Write the approved slate into the memory file (`memory/project_<skill>_skill.md`) before moving on.

Do **not** propose per-action stats (speed, damage dice, costs, design forks) in this phase. Only once the full list is approved do you proceed to Phase 4.

## Phase 4 — Design the actions, one by one

Go through the **approved** actions **individually, in order**. For each action:

1. State its **lore hook** in one line.
2. Propose **concrete stats**, grounded by citing comparable existing actions: `actionType` (Atac/Defensa/Focus), `speed`, damage `d(n, sides, mod)`, `targetCount` (1, N, or 99 = all), any **resource cost** (càrregues, pressió, a fatigue level for a true ultimate).
3. Surface the **single real design fork** with `AskUserQuestion` (2–4 options, recommend one, "(Recommended)" first). Keep other knobs as proposed-but-tunable. If the user rejects to clarify, ask what they want to clarify and reshape.
4. **Lock it — but ONLY when the user explicitly says it's good.** Never mark a card locked/approved on your own, and never move to the next card, until the user gives an explicit go-ahead (e.g. "good", "locked", "yes"). Proposing stats is not locking; expect back-and-forth on a single card before approval. In the memory file, track each card's status (`proposed` vs `LOCKED`) and only flip to `LOCKED` after the user's explicit approval. Re-state the running table after each change.

At the end, confirm the **unlock-level curve** (1–100) and the **card theme**.

## Phase 5 — Implement (auto mode)

Build the whole kit. Default to the registry pattern; touch the engine only when a mechanic genuinely needs it.

- **Effect handlers** live on the skill's own `SkillDefinition.effects`, in its own file, with the `StatusBehavior` consts they attach (co-location — CLAUDE.md). Only genuinely generic, parameterised handlers reused by several skills go in `packages/sets/fantasy/src/players/effects/`. Content handlers MAY hardcode the skill's own id.
- **Reuse existing handlers** where they already fit (`piercing`, `bonus_damage`, `extra_dice`, `heal`, `stun`, `skill_mod`, `lifedrain`, `dot`, `debuff_on_hit`, etc. — see the list in CLAUDE.md). Only write a new handler when none fits.
- **Resource/cost mechanics** use the generic engine hooks that already exist: `onCombatStart` (init pool), `canPlay(actor, params)` (availability gate), `onPlay(ctx)` (spend, fires only when the action actually goes off — an interrupted focus does NOT spend). Pattern: store the pool as a rest-of-combat status; a content handler computes max from skill level. See `charge_cost` / the bandolier in `explosive-effects.ts` for the reference implementation.
- **The engine never names content.** A new mechanic that no seam supports gets a *generic, parameterised* seam in the engine (a `StatusBehavior` hook, an `EffectHandler` hook), and the content itself stays in the set. Never read a status key or card id inside `combat.ts`.
- **Skill definition:** new `packages/sets/fantasy/src/players/skills/<skill>.ts` using the `action()` and `d()` helpers; export the `SkillDefinition`; add it to `ALL_SKILLS` in `players/catalog.ts` (this wires it into drawn parties, the web app and every sweep). A MAIN kit also gets `packages/sets/fantasy/test/kits/<skill>.slow.test.ts` — one `kitSuite(...)` call; the coverage test fails until it exists.
- **Web gate:** if there's a resource, gate human play in `useGame.ts:selectCard` via `engine.canPlayActionIdx(c, actionIdx)`.
- **Icons:** search `packages/web/public/icons` (`find ... -iname '*term*'`) for fitting game-icons; pass the tail after `ICON_PREFIX`.
- **Display polish** (do unless told otherwise): a dedicated `classCss` theme — add `--class-<x>` in `assets/style.css`, plus `.portrait.<x>` and `.print-card.<x>` border rules in `assets/cards.css`, and add the name to the theme list in `CLAUDE.md`; a resource badge on cards via a `STAT_ICONS` entry consumed in `actionStats()` (`useActionDisplay.ts`); a resource counter on `CharacterPortrait.vue` (exclude the resource status from the generic badges and render it properly).

## Phase 6 — Verify (always)

1. `pnpm build` — topological (engine → skills → enemies → web) must be clean. **The skills package imports the engine's built `dist/`,** so rebuild the engine before trusting any skills-side type error; stale "property does not exist" errors clear after the engine builds.
2. **Exact card tests:** add cases to `packages/sets/fantasy/test/cards.test.ts` — hand-built one-round positions with `1d1` dice and scripted choices (`@pimpampum/engine/testing`), asserting each card does what its description says, to the PV. For slow Focus payoffs, give the actor a guarding ally or set `foe.skipTurns = 1` on the payoff round to isolate it.
3. `pnpm test` (the fast tier must stay green), then the new kit's own suite: `SLOW=1 npx vitest run packages/sets/fantasy/test/kits/<skill>.slow.test.ts`, and `pnpm --filter @pimpampum/tools exec tsx src/kit-analyzer.ts --player <skill>` for the report card. Report every requirement verdict, and flag any conflict with `intentions.md`.
4. Update the memory file to **IMPLEMENTED & VERIFIED** with the file list, and note any lightly-tested edges (e.g. high-unlock capstones rarely reached at sim budgets) plus buff/nerf levers.

## Reference: the Enginyer d'Explosius (built with this process)

A worked example lives in `packages/sets/fantasy/src/players/skills/explosives-engineer.ts`: a finite **bandolier** resource (generic hooks), a frag AoE, a smoke screen that redirects blinded enemy attacks (a `redirectAttackTarget` status), an armour-ignoring shaped charge (reused `piercing`), a persistent minefield (an `onEnemyAttackAction` hazard status), and a resource-scaled capstone blast. Read it for the patterns before building a new one.
