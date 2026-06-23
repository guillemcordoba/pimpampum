Design and implement a new Pim Pam Pum player skill end-to-end: first research real myth/fiction/history for inspiration, then clarify the character's lore, design its ~5 actions one at a time (lore-first), lock each, and finally implement, verify, and balance-test the whole kit. Use when the user wants to add a new skill / character / class to the game.

This skill encodes a deliberate, collaborative process. **Do not rush to code.** The order is sacred: **research → lore → per-action design (one by one, locked) → implement → verify**. The user drives the creative decisions; you ground them in the system and do the building.

## Guiding principles

- **Lore first, mechanics second.** Read the design principle in `CLAUDE.md` ("Adding or changing content"). When *designing* actions, disregard the current mechanics entirely — do not let existing effect handlers or ease of implementation shape the design. Design the action the character *should* have; build whatever new mechanic that requires. Originality + faithfulness to the character beat implementation effort every time.
- **Don't duplicate.** Skim the existing skills (`packages/skills/src/skills/*.ts`) so the new skill carves out unclaimed fantasy and doesn't re-tread another skill's mechanics. Name the overlaps explicitly to the user.
- **Card descriptions are authoritative and in Catalan.** Each action's `description` defines what it does; the handler must match it.
- **Use the d20-native idiom.** Express chances as d20 rolls (e.g. "d20 ≤ 10"), not "50%", to match the rest of the game.
- **The user iterates a lot.** Expect them to add/remove/retype actions and tweak speeds/numbers repeatedly. Stay nimble: after every change, update the memory file and re-state the current locked table.

## Phase 0 — Frame & ground (read before talking)

1. Read `CLAUDE.md` (architecture + the lore-first design principle), `intentions.md` (balance goals), and `rules.md` if any new mechanic touches combat resolution.
2. Skim `packages/skills/src/skills/*.ts` to calibrate the power curve (damage dice, speeds, fatigue, unlock levels) and to spot adjacent skills the new one must not duplicate.

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
- **Crafted or channeled?** Physical gear/inventory they carry (finite, deploy-style) vs. magic conjured on demand (fatigue-gated). This shapes how every action *feels*.
- **Emotional core / playstyle?** Reckless, cold-precise, control, burst, attrition…

From the answers, propose: a **thematic identity** (skill name + `classCss` theme), a **candidate list of ~5–7 actions** spanning a low→high arc, the **overlaps** with existing skills, and a **recommended cut of ~5**. Then hand the one real identity decision back to the user (e.g. a signature resource or capstone).

## Phase 3 — Design the actions, one by one

Go through the actions **individually, in order**. For each action:

1. State its **lore hook** in one line.
2. Propose **concrete stats**, grounded by citing comparable existing actions: `actionType` (Atac/Defensa/Focus), `speed`, damage `d(n, sides, mod)`, `targetCount` (1, N, or 99 = all), any **resource cost**, `fatigueCost` (default 1; 2 = heavy).
3. Surface the **single real design fork** with `AskUserQuestion` (2–4 options, recommend one, "(Recommended)" first). Keep other knobs as proposed-but-tunable. If the user rejects to clarify, ask what they want to clarify and reshape.
4. **Lock it** before moving on. Write the locked design into a memory file (`memory/project_<skill>_skill.md`) as you go, so it survives context compaction. Re-state the running locked table after each change.

At the end, confirm the **unlock-level curve** (1–100) and the **card theme**. A skill of 1–7 actions is normal.

## Phase 4 — Implement (auto mode)

Build the whole kit. Default to the registry pattern; touch the engine only when a mechanic genuinely needs it.

- **Effect handlers** live in `packages/skills/src/effects/*.ts` (new file per skill is fine, e.g. `<skill>-effects.ts`). Register by spreading into `ALL_EFFECTS` in `effects/index.ts`. Content handlers MAY hardcode the skill's own id.
- **Reuse existing handlers** where they already fit (`piercing`, `bonus_damage`, `extra_dice`, `heal`, `stun`, `skill_mod`, `lifedrain`, `dot`, `debuff_on_hit`, etc. — see the list in CLAUDE.md). Only write a new handler when none fits.
- **Resource/cost mechanics** use the generic engine hooks that already exist: `onCombatStart` (init pool), `canPlay(actor, params)` (availability gate), `onPlay(ctx)` (spend, fires only when the action actually goes off — an interrupted focus does NOT spend). Pattern: store the pool as a rest-of-combat status; a content handler computes max from skill level. See `charge_cost` / the bandolier in `explosive-effects.ts` for the reference implementation.
- **New named-status mechanics in the engine** are the established pattern, not a violation: `combat.ts` already reads content status keys inline in `resolveAttackOnTarget` / `resolveOne` / `activeGuard` (`condemnat`, `marca-objectiu`, `arma-enverinada`, `indefensable`, `encegat`, `camp-minat`). Add new ones there the same way (e.g. attack redirection, on-attack triggers, damage absorption).
- **Skill definition:** new `packages/skills/src/skills/<theme>-skills.ts` using the `action()` and `d()` helpers; export an array; add it to `ALL_SKILLS` in `skills/index.ts` (this auto-wires it into the simulator's random teams).
- **Web gate:** if there's a resource, gate human play in `useGame.ts:selectCard` via `engine.canPlayActionIdx(c, actionIdx)`.
- **Icons:** search `packages/web/public/icons` (`find ... -iname '*term*'`) for fitting game-icons; pass the tail after `ICON_PREFIX`.
- **Display polish** (do unless told otherwise): a dedicated `classCss` theme — add `--class-<x>` in `assets/style.css`, plus `.portrait.<x>` and `.print-card.<x>` border rules in `assets/cards.css`, and add the name to the theme list in `CLAUDE.md`; a resource badge on cards via a `STAT_ICONS` entry consumed in `actionStats()` (`useActionDisplay.ts`); a resource counter on `CharacterPortrait.vue` (exclude the resource status from the generic badges and render it properly).

## Phase 5 — Verify (always)

1. `pnpm build` — topological (engine → skills → enemies → web) must be clean. **The skills package imports the engine's built `dist/`,** so rebuild the engine before trusting any skills-side type error; stale "property does not exist" errors clear after the engine builds.
2. **Targeted smoke-test:** write a throwaway `tsx` script in `packages/simulator/src/` that builds the character and drives each action, asserting the mechanic fires (bandolier-style resource scales/spends/gates; AoE hits the right set; new statuses apply). For slow Focus payoffs that keep getting interrupted, give the actor a guarding ally or set `foe.skipTurns = 1` on the payoff round to isolate it. **Delete the script when done.**
3. `pnpm --filter @pimpampum/simulator test` (11 balance tests must pass) and `pnpm simulate`. Report the new skill's **win-correlation** (mid-pack ≈ balanced; the field roughly spans 15–42%) and that mirror balance stays ~50/50. Flag any conflict with `intentions.md`.
4. Update the memory file to **IMPLEMENTED & VERIFIED** with the file list, and note any lightly-tested edges (e.g. high-unlock capstones rarely reached at sim budgets) plus buff/nerf levers.

## Reference: the Enginyer d'Explosius (built with this process)

A worked example lives in `packages/skills/src/skills/explosive-skills.ts` + `effects/explosive-effects.ts`: a finite **bandolier** resource (generic hooks), a frag AoE, a smoke screen that redirects blinded enemy attacks (engine `encegat`), an armour-ignoring shaped charge (reused `piercing`), a persistent minefield (engine `camp-minat`), and a resource-scaled capstone blast. Read it for the patterns before building a new one.
