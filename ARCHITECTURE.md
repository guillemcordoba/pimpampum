# Architecture & measured findings

Reference detail that does **not** need to be in context for every prompt.
`CLAUDE.md` holds the rules an agent must always obey; this file holds the
"why", the exhaustive catalogues and the measurements behind the numbers.
Read the relevant section before touching the subsystem it describes.

---

## Package layout, file by file

```
packages/
├── engine/                    # @pimpampum/engine — generic combat system, NO game content
│   └── src/
│       ├── index.ts           # Public API
│       ├── dice.ts            # DiceRoll
│       ├── types.ts           # ActionType, ActionDefinition (dice, unlockLevel, fatigueCost), SkillInstance, EquipmentDefinition, TargetRequirement
│       ├── resolution.ts      # resolveAttack (margin), resolveDamage, checkSkillUp, SKILL_UP_MARGIN
│       ├── fatigue.ts         # FATIGUE_CONFIG — the daily stamina budget
│       ├── effects.ts         # EffectRegistry, EffectHandler, EffectContext, EngineApi, AttackModifiers, AIContext
│       ├── status.ts          # StatusBehavior, StatusRef, StatusHookContext, AttackStatusMods, ContestKind
│       ├── action.ts          # ActionInstance, getActionTargetRequirement/Count
│       ├── modifier.ts        # CombatModifier, ModifierDuration
│       ├── character.ts       # Character (PV + skills Map + statuses + guards + blockedBy + fatigue), createCharacter
│       ├── combat.ts          # CombatEngine — step-by-step state machine + AI driver
│       ├── ai.ts              # selectAction (weighted pick) + pickResolveTargets (resolution-time targeting), AIView
│       ├── strategy.ts        # AIStrategy enum
│       └── display.ts         # ACTION_TYPE_*, STAT_ICONS, SLOT_LABELS, RULES_SUMMARY
├── skills/                    # @pimpampum/skills — PLAYER game content
│   └── src/
│       ├── types.ts           # SkillDefinition + the action() / d() helpers
│       ├── setup.ts           # registerSkills(registry), createRegistry()
│       ├── catalog.ts         # ALL_SKILLS / ALL_ACTIONS / unlockedActions
│       ├── build.ts           # buildCharacter(spec) — resolve skill/action/equipment ids → Character
│       ├── party.ts           # PartySpec (explicit | drawn), buildReferenceParty, isExplicitParty
│       ├── effects/           # GENERIC parameterised handlers only + shared DOT/REGEN behaviours
│       ├── skills/            # One file per skill: SkillDefinition + its own effects/StatusBehaviors
│       ├── equipment/         # ALL_EQUIPMENT (armour + weapons)
│       └── potions/           # ALL_POTIONS (consumable, skill-less cards)
├── enemies/                   # @pimpampum/enemies — enemy content + encounter balancer
│   └── src/
│       ├── index.ts           # buildSolvedEncounter(), re-exports
│       ├── types.ts           # EnemyDefinition (name, icon, kit, bulk) + fullKitLevel
│       ├── catalog.ts         # ENEMY_DEFINITIONS, ENEMY_SKILLS, registerEnemySkills(registry)
│       ├── factory.ts         # createEnemyFrom(def, { pv, level?, name?, equipment? })
│       ├── simulate.ts        # Encounter balancer v3 (SIMULATED)
│       ├── ai-policy.ts       # leanChooser() — the policy the balancer plays with
│       └── enemies/           # One EnemyDefinition per creature
├── simulator/                 # @pimpampum/simulator — balance testing (tsx + vitest)
│   └── src/
│       ├── main.ts            # Mirror-match balance + parametric balancer check
│       ├── play.ts            # MANUAL play harness (seeded; play a fight by hand)
│       ├── sanity.ts          # Quick smoke run + step-API demo
│       ├── experiment-*.ts    # one-off experiment harnesses
│       └── tests/             # helpers.ts, balance.test.ts, seams.test.ts, enemy-threat.test.ts
└── web/                       # @pimpampum/web — Vue 3 SPA
    └── src/
        ├── composables/       # useGame.ts, party.ts, combatTracker.ts, pendingEncounter.ts, useActionDisplay.ts
        ├── components/party/  # PartyRoster.vue (compact) + HeroEditor.vue (modal builder)
        ├── components/cards/  # PrintableCard.vue, CharacterSheet.vue, …
        └── views/             # one per route
```

---

## Engine seams (the full hook list)

A status gets ALL its mechanics from a `StatusBehavior` attached to the status
instance by whoever sets it (`setStatus(key, value, turns, data, BEHAVIOR)` —
no registration). The engine invokes behaviour hooks at fixed seams:

**Query hooks** — `modifySpeed`, `rollMode` (advantage/disadvantage rolls the
whole pool twice), `modifyOutgoingDamage`, `modifyIncomingDamage`,
`modifyContestTotal` (clutch adjust of a contested total seeing both sides;
content-side save contests route through `EngineApi.adjustContestTotal`),
`clampPvLoss`, `attackRollAgainstHolder`, `preventsGuard`, `blocksActionType`,
`untargetable`, `ignoresConcealment`, `preventsGuardBypass`, `absorbsGuard`,
`cardSwapCharges`/`spendCardSwapCharge`, `adjustActionWeight`.

**Engine hooks** — `onAttackAction`, `redirectAttackTarget`,
`onEnemyAttackAction` (hazards/traps), `attackRepeats`,
`standingGuard`/`onStandingGuardBroken` (persistent walls), `onRoundEnd`
(dots/regen tick here).

**Combat history** — `EngineApi.history` records every RESOLVED action as an
`ActionEvent` `{round, actor, action, targets}` (targets = the final list after
redirects; interrupted focuses excluded). Content queries it: the generic
`flanking` effect makes an attack undefendable when an ally already attacked
that target this round.

### How an action resolves

1. `prepareRound()` — advance round, apply stun/skip.
2. `planActions(humanSelections)` — build the pending queue (humans supply
   action ids; AI fills the rest via `selectAction`), **shuffle it, then sort by
   speed** (tie fairness); returns `RevealedAction[]`. Between plan and resolve,
   `flowSwapRefs()`/`flowSwap()` let card-swap statuses (Estat de flux) replace
   a revealed card.
3. `resolveNextAction()` — returns `{kind:'target'|'resolved'|'done'}`. On
   `'target'` the UI prompts and calls `setResolveTarget(targets)`. Speed ties
   resolve simultaneously (per-tier alive/interrupt snapshots). Blocked
   attackers have every chosen slot forced onto their blocker. Attacks roll once
   per pass; each target defends against that roll; `attackRepeats` statuses
   grant extra full passes (re-rolled).
4. `finishRound()` — postRound effect hooks, status `onRoundEnd` (dots/regen
   tick), fatigue accrual for every acted character, `advanceTurn`.
5. The simulator drives all of this via `runRound()` / `runCombat(stats)`.

### Effect handler catalogue

Handlers implement: `modifyAttack`, `onAttackHit`, `onAttackMiss`, `onDefend`,
`onBlockFail`, `onResolve`, `postRound`, `getTargetRequirement`, `aiWeight`,
`onCombatStart`, `canPlay`, `onPlay`. They touch the engine only through
`EngineApi`.

Generic parameterised handlers (`packages/skills/src/effects`, authoritative
list in `EFFECT_TYPES`): `weapon_damage`, `piercing`, `bonus_damage`,
`extra_dice`, `pack`, `crossfire`, `reckless`, `frenzy`, `lifedrain`,
`debuff_on_hit`, `poison_on_hit`, `stun_on_hit`, `mark_on_hit`,
`silence_on_hit`, `second_attack`, `self_stun`, `undefendable_on_hit`,
`buff_on_hit`, `skill_bonus_from`, `spell_leech_on_hit`, `self_damage`,
`double_wound`, `counter`, `retaliate_wound`, `debuff_on_block`,
`buff_on_block`, `buff_on_block_fail`, `self_armor`, `heal`, `skill_mod`,
`stun`, `evasion`, `nimble_escape`, `mark_target`, `weapon_buff`,
`wound_wounded`, `regen`, `dot`, `wild_shape`, `summon`, `sacrifice`,
`detonate`, `cleanse`, `flanking`.

Skill-specific handlers (`enter_rage`, `chain_attack`/`flow_state`,
`charge_cost`, `adrenaline`, `condemn`/`reap`, `carve_rune`,
`shadow_melt`/`shadow_bind`, `seismic_sense`/`earth_wall`/`bury`,
`pressure_gain`/`eruption`) live on their skill's `SkillDefinition.effects`; the
`StatusBehavior` consts they attach (`FURIA_ESTAT`, `CADENA`, `FLUX`, `ENCEGAT`,
`CAMP_MINAT`, `CONDEMNAT`, `PUTREFACCIO`, `ADRENALINA`,
`RUNA_FULLA/CONFUSIO/ESCUT`, `FOS`, `LLIGAT`, `SENTIT`, `MUR`, `ENTERRAT`,
`RIU_DE_LAVA`…) are defined alongside them in the same file.

---

## Mechanics detail

**Defense (dual target).** At resolution the defender picks an **ally** (guard:
attacks on that ally also resolve against the defender's defense; penetrating
damage hits the **defender**, not the ally) **or an enemy** (block: "els enemics
bloquejats fan totes les seves tirades d'atac contra el defensor" — the blocked
enemy loses target choice; attacks that don't choose targets, i.e. full-coverage
AoE, are unaffected).

Defenses covering the same attack **sum** (*defensa conjunta*): 2+ blockers on
the same enemy, or 2+ guards on the same target (the target's own self-defense
included), form a wall that contests with the **sum** of their defense rolls; a
breach damages the lowest individual roller (the weak link), and on a close
breach (≤ `SKILL_UP_MARGIN`) **all** wall members learn. Extra attacks
(counters) respect walls too. Either way the defender **always also defends
themselves**, rolling their defense dice separately against each incoming
attack. Engine: `Character.guards` + `Character.blockers`, round-scoped,
resolved at resolution time in speed order; `TargetRequirement 'defense'` drives
the dual prompt.

**Focus interrupts.** Cancelled if the actor takes DAMAGE before it resolves; a
hit fully absorbed by armour does NOT interrupt (rule changed 2026-07-18).

**Speed ties** resolve simultaneously (per-tier alive/interrupt snapshots); the
engine shuffles the queue before the speed sort so no seat holds tie priority —
this fixed a measured seat bias.

**Fatigue.** `FATIGUE_CONFIG.max = 20` is THE pacing knob (~2-3 combats/day). It
NEVER touches rolls — roll penalties were measured to freeze fights into draws
and are permanently rejected (see `intentions.md`). Nobody is ever action-less:
every combatant holds **Cop desesperat** (universal, 0 fatigue, 1d4 slow attack,
1 PV self-damage hit or miss — `skills/src/desperation.ts`), playable ONLY when
nothing else is (the generic `ActionDefinition.lastResort` flag), so exhausted
fights end through desperate play.

**Equipment** (simplified 2026-07-19 to three slots, one item each — no
body-part inventory, no main/off/two-hand). An item gives passive armour, a
speed penalty, roll bonuses, a **weapon attack modifier** (`attackBonus`;
present = the item is a weapon: bastó +0, destral +2, gran destral +4) and/or
**granted action cards** while equipped (`grantsActions`, `unlockLevel: 0` —
e.g. the shield grants the «Escut de fusta» 2d4 defense card). Weapon-tagged
actions (the `weapon_damage` effect) roll their OWN dice plus the wielded
modifier and REQUIRE a weapon.

**Armour is a small bounded lever** (`intentions.md`: ≤15% of outcome). Only two
armours, cuir (+1) and ferro (+2), worn one at a time. Flat per-hit armour
negates small hits, so keeping it small is what stops it hard-countering
many-small-hits swarms (2026-07-19: it had been secretly assumed to be +2.5, and
was worth +75pp vs hordes).

---

## The encounter balancer (v3, SIMULATED — `simulate.ts`, 2026-08-01)

The balancer does not predict difficulty from constants, it **plays the
encounter**. A full 4v6 combat runs in ~0.8 ms, so a few hundred real combats
price a fight exactly — for the real party, the real armour, the real counts and
the real cards. v2's chain of fitted scalars (a measured `threat` per body, a
count exponent β, a party-strength exponent α, an armour factor, a logistic) is
deleted.

**How a solve works.** It brackets the PV scale by bisection (geometric,
progressive sample sizes), then **fits** the crossing rather than trusting the
last bracket: every evaluation the search made is kept, and a games-weighted
least-squares line through `logit(winrate)` vs scale is inverted at the target.
Bisection alone decides each step from a ±4pp sample, so near the crossing it
decides on noise and its answer random-walks — measured at up to ±4.6pp of
placement error on a lone basilisk, down to ≤1.4pp with the fit. The reported
winrate is then measured over `SOLVE_REPORT_GAMES` (1000, ±1.7pp) because that
one number is what the GM trusts. Below 12 PV a body's integer rounding is worth
more than the noise, so the neighbouring integers are tried too — but ONLY
there: doing it at 43 PV picks lucky samples and added ~10pp of error. A solve
costs ~1-4 s.

**Invariants — do not break these.**
- Every candidate in a solve shares one seed (COMMON RANDOM NUMBERS, via the
  engine's `withSeed`). This is what makes bisecting a stochastic function
  stable.
- The reported winrate is an INDEPENDENT measurement, never the sample the
  search steered on. Selecting the best of several noisy candidates and
  reporting that sample is winner's curse, ~4pp optimistic.
- `stderr` is inflated ×1.25 over binomial ONLY for a **drawn** party, because
  the redraw per game is what makes games non-iid (measured on the basilisk:
  4.4pp observed vs 3.5pp predicted). An **explicit** party is the same
  characters every game, so it quotes the honest binomial figure.
- PV is an integer lever, so some targets are genuinely unreachable; the solver
  reports what it achieved (`clamped`).

**The AI defines difficulty.** Every number is the winrate of AI play, so
`ai.ts` quality is balance quality. The balancer plays with the distilled lean
policy in `ai-policy.ts`.

**`bulk`** is how much flesh a creature is relative to a 70 kg human:
`bulk = ∛(kg / 70)`, taken from the weight it has in the fantasies it comes from
(goblin 20 kg → 0.66, stone golem 907 kg → 2.35, a Rowling basilisk 3.2 t →
3.57). The solver searches ONE scale and every body gets `scale × bulk`, so a
goblin beside a basilisk is no longer equally durable. It **redistributes only**:
a single-species encounter solves to the same PV whatever its bulk, so bulk can
never make a creature secretly harder. The cube root is deliberate — raw mass
spans 82× and would leave mixed fights as one boss plus confetti.

**API.** `solveEncounter(pool, party, targetWinrate)` takes the composition the
GM wants and solves the PV that hits the target; `generateEncounter` is the
single-creature convenience; `simulateEncounter` scores any composition;
`buildSolvedEncounter` instantiates the result.

### The AI

Players are human-controlled when `aiStrategy === null`. Enemies get their
strategy from `EnemyDefinition.aiStrategy` (stamped by `createEnemyFrom`;
default Aggro) — pick it to match how a GM would play the kit, since calibration
runs with it. `assignStrategies` is only for simulated *player* teams (it
downgrades a strategy the character can't cash in — Protect without a Defensa
action, Power without a Focus — to Aggro).

The AI models human play. Actions are chosen at plan time by weighted sampling
sharpened by `CombatEngineOptions.aiSharpness` (weights^τ, default 2; 1 = soft
play), with attacks weighted by **expected PV removed** (projected margin damage
blended over defended/undefended outcomes and armour). **Targets** are chosen at
resolution time (`pickResolveTargets`), seeing what a human sees after the
reveal: take lethal kills, interrupt enemies whose slower focus is still
pending, prefer dangerous and wounded targets, avoid active guards. Defenses use
a **guard-vs-block heuristic** (guard wounded allies, else block the scariest
enemy whose attack is still pending, else self-guard). Calibration counts draws
as ½.

---

## Simulator harnesses

- `main.ts` — mirror-match balance (equal-budget random teams should win ~50/50,
  draws included), per-skill and per-action win correlation, action-type play
  mix, combat length, and a parametric balancer check.
- `play.ts` — the MANUAL play harness: a seeded RNG plus a per-round script, so
  you can play a fight by hand (cards chosen blind, targets after the reveal)
  and read what actually happens. This is how the 6-goblin diagnosis was done.
- `experiment-level.ts` — sweeps enemy LEVEL against solved PV at a fixed target
  winrate, reporting the fight length each choice buys. It established that
  level is a real length lever (6 goblins at 65%: 20.5 rounds at level 1, 9.1 at
  level 4) but that the long fights come from compositions that cannot threaten
  the party at all (4 wolves need 91 PV each, 22 rounds, because a level-2 wolf
  attacks with 1d2).
- Other one-offs: `experiment-tuning.ts` (PV/armour sweeps), `experiment-heal.ts`
  (heal-stall draws), `experiment-berserk.ts` (component attribution),
  `experiment-seat.ts` (seat bias), `experiment-day.ts` (fatigue budget across a
  2-3-combat day). Run any with
  `pnpm --filter @pimpampum/simulator exec tsx src/<file>.ts`.
- `tests/balance.test.ts` — resolution math (`checkSkillUp`, `resolveAttack`,
  `resolveDamage`), engine sanity (terminates, valid winner, PV in range),
  mirror balance ~50%, combat length.
- `tests/seams.test.ts` — every generic StatusBehavior seam, deterministically,
  with inline behaviours (1d1 dice → exact-PV assertions).
- `tests/enemy-threat.test.ts` — the balancer guard: every solved encounter is
  REPLAYED with an independent seed and must land near the winrate it reported,
  plus determinism, arbitrary body counts and mixed comps.
- `tests/helpers.ts` models INTENDED play: `randomPlayer` picks a main skill
  first (complementary kits — metge/runes/ombres/gel — only ever appear as
  second skills), guarantees weapon kits a mid weapon (destral), uses
  `PLAYER_PV` 12 and ordinal budgets of ~6-7. `REGISTRY` is a shared registry
  with player + enemy handlers.

---

## Web app detail

Vue 3 + Vue Router SPA. Combat uses the engine's **step-by-step** API via
`composables/useGame.ts`: setup → card-selection → reveal (with Estat-de-flux
card swaps) → resolving (one action at a time, with mid-resolution target
prompts) → victory. `TargetSelector.vue` supports the defense **dual prompt**
(ally to guard OR enemy to block).

`composables/useActionDisplay.ts` converts actions/equipment to printable-card
props: contest dice under the crossed-swords icon (Atac) or shield icon
(Defensa), an auto-appended "Necessita arma equipada." on weapon cards, and
corner stats for above-default fatigue costs and resource costs (càrregues,
pressió). An item whose only mechanics are one granted card renders AS that card
(the shield).

### Routes

`/` (home), `/skills` (printable skill cards), `/objects` (equipment cards),
`/enemies` (creatures + their cards), `/fitxa` (printable character sheet),
`/rules`, plus **two top-level tabs** for fights: **«Grups de jugadors»**
(`/combats/jugadors`) and **«Creador de combats»** (`/combats/creador`).

There is no sub-tab strip and no «Combat contra la IA» tab. The AI fight is not
a destination of its own — it is something the creator *starts* — so it lights
the creator's tab and leaving it returns there. `CombatsView.vue` survives only
as the layout host that hands its height down to the active section (which is
what lets those screens size to the window rather than the viewport); the
`/combats` route tree is kept so existing URLs and redirects still resolve.

- `/combats/creador` — the encounter creator (Jugadors | Enemics | Encontre
  columns). The Jugadors column is the stored party, not abstract knobs.
  Difficulty sits at the top of the Encontre column, above the answer it aims
  at. Each species carries **how many** and at **what level** — level is a LORE
  input (a green scout vs a war-leader), not something the solver optimises. The
  result panel reads back the two numbers the GM tunes against: measured winrate
  and average rounds, with a warning past 6 rounds. Two start buttons: **Combat
  contra la IA** and **Combat contra els jugadors**.
- `/combats/jugadors` — the parties, not the fights. Combats are filed under the
  party that fought them, so this is one level up. Each row shows the heroes,
  how many combats and when they last played, plus a way to create a party.
- `/combats/jugadors/grup/:partyId` — one party's page: **its heroes (edited in
  place, the same `<PartyRoster>`) beside its combat history**, with rename and
  delete for the party itself. Opening it **makes that party active**, so the
  creator immediately prices against the table you were just looking at.
  `sense-grup` is the catch-all for combats saved before they were filed, or
  whose party has since been deleted — they stay reachable instead of stranded
  in localStorage, and that view shows no roster. The roster is gated on the
  party actually existing, not merely on the id differing from `sense-grup`, or
  an unknown id would show whichever party happened to be active. A literal
  `grup/` segment keeps this clear of `jugadors/:id`; tracker URLs predate the
  screen and are read aloud at tables, so they do not move.
- `/combats/jugadors/:id` — one combat: a focused screen with its own sticky bar
  and a `← Combats` link back to **its party's** page.
- `/combats/ia` — field the party against an enemy roster and play in browser.
  Arriving from the creator's «Combat contra la IA» the setup screen is
  **skipped**: the creator settled both sides, so `useGame` starts the fight
  immediately (`if (handoff && canStart()) startCombat()`). The setup screen
  still appears when the party is empty, which is where that gets fixed.

`/combats/jugadors/:id/pantalla` (the players' read-only screen) is declared
top-level with `meta.bare` so it gets no chrome at all despite the nested-looking
path. The old `/combat`, `/encounters` and `/tracker/:id` paths redirect into the
new ones.

**Height, not viewport math.** The creator and the AI-combat setup screen fill
the height their host hands down (`main` → `CombatsView` → section) and scroll
only *inside* their columns; nothing measures `100vh` any more (`SetupScreen`'s
old `calc(100vh - 7rem)` broke the moment anything was added above it — which is
precisely what happened, twice). Below 760px each releases the cap
(`height: auto`) and the page scrolls normally.

### The party (entered once, used everywhere)

The GM's players are **one stored thing**, not a form re-filled per screen.
`composables/party.ts` keeps a keyed list of named parties in localStorage under
`pimpampum.party.<id>` (the key scan IS the index, as in `combatTracker.ts`),
with the active one pointed at by `pimpampum.activeParty` — a separate key, or
the prefix scan would swallow it. The store is a **module-level singleton**, so a
hero edited in the creator is already edited in the AI setup.

On the very first visit it seeds a default 4-hero party so the creator works
before anything is typed; everything in it is meant to be overwritten. That seed
fires **once ever**, guarded by `pimpampum.partySeeded` — without the flag,
deleting every party and reloading would conjure the default back, which reads
as the delete having silently failed. **Having no party at all is a valid
state**: `active` is null, and every screen that shows a roster offers to create
one. Deleting a party does NOT delete its combats (they live in
`combatTracker.ts` and are the table's history); they resurface under
«Combats sense grup», and the confirm dialog says so.

**PV is edited inline on the roster row**, not in the modal — it changes every
session and opening the whole character builder to nudge a number was the
cumbersome part. Everything else about a hero (skills, gear, potions) still goes
through `HeroEditor`.

A hero is a `HeroSpec` (name, classCss, iconPath, PV, `skills{id:level}`,
equipment, potions) — the same shape `buildCharacter` takes, converted by
`heroBuildSpec()`. That is what makes the whole thing work: the creator hands
`{ characters: heroes.map(heroBuildSpec) }` to the balancer as an explicit
`PartySpec`, and `useGame` builds the fight from the very same specs, so **the
fight played is the fight priced**.

`components/party/PartyRoster.vue` (party picker + compact hero list +
add/edit/remove) is mounted in BOTH the creator's Jugadors column and the
AI-combat setup's left panel. The full character builder is
`components/party/HeroEditor.vue`, a **modal** — the roster has to fit a narrow
column, so the builder cannot live inline. `useGame` has no
`addPlayer`/`removePlayer`: `playerSpecs` is a computed over the store, and the
handoff from the creator (`pendingEncounter.ts`) carries only the enemies.

### Combat tracker (running a fight at a real table)

**Combat contra els jugadors** mints a random id and opens `/combats/jugadors/:id`
— the GM's screen for a fight played with real dice and printed cards. It shows,
per creature, the **names** of the cards that creature's level unlocks (plus the
cards its gear grants) as a checklist, since the GM plays from the printed deck,
and a **PV tracker per body** (bar, ±1 steppers, editable number). ONLY the
enemies are tracked — the players keep their own sheets at the table — and there
is no round counter.

**Both levels of enemy name are editable.** Each body is renameable, and each
group carries an optional `TrackedGroup.name` the GM sets on the panel heading —
«Els guàrdies del pont» rather than «Goblin», which matters when two groups of
the same creature are in one fight. It is an **override, not a copy**: blank
falls back to the creature's own name through `groupName()`, so renaming a
creature in the catalog still shows through on old sessions. `sessionLabel()`
uses `groupName()`, so the combats list reads back the GM's names. Both inputs
carry a standing dotted underline and a faint fill — the body-name field used to
be fully transparent until hover, which is why nobody could tell it was
editable.

**A body's display name is DERIVED, never stored.** `TrackedBody.name` is
optional and holds only a name the GM typed themselves; absent means "follow the
group", and every screen resolves it through the single `bodyName(group, index)`
helper. That is what makes the GM's tracker and the players' screen incapable of
disagreeing.

The first cut stored the derived name on each body and pushed a group rename
down into the ones "still matching the default". That is exactly the bug class
to avoid: any body whose stored string had drifted from the expected default was
silently skipped, so a rename half-propagated and the players' screen kept the
old name. `loadTrackerSession` now migrates old sessions by deleting body names
that equal the default under either the creature's name or the group's current
name — anything that does not look auto-generated was typed by the GM and is
kept.

The GM's PV steppers are **±5 as well as ±1** (`PvTracker`): one margin
routinely removes 5-8 PV, and clicking − six times per hit is the slow way to
run a table. The ±5 pair is styled as the secondary action so ±1 stays the
default target. The players' screen passes `readonly`, so it shows no steppers
at all.

State lives in `composables/combatTracker.ts`: one `TrackerSession` per id in
localStorage under `pimpampum.tracker.<id>`, written on every edit, so a refresh
never loses a fight. `listTrackerSessions()` key-scans the prefix (no separate
index to drift); `listTrackerSessionsFor(partyId)` narrows to one table.

A session carries `partyId` + a `partyName` snapshot (the name AT THE TIME, so a
renamed or deleted party still reads sensibly). Both are **optional** and the
storage `VERSION` was deliberately NOT bumped: bumping it makes
`loadTrackerSession` reject every existing session, which would delete fights in
progress. Sessions without a `partyId` surface under `sense-grup` instead.

`/combats/jugadors/:id/pantalla` is the same session **read-only** for a second
screen the players watch: `meta.bare` skips the app chrome, and it follows the
GM's tab through the `storage` event (same browser only — there is no backend).
The GM's `revealPV` switch decides what it shows: PV bars with numbers when on,
and when off **only the damage each enemy has taken**, which never leaks how much
it can still absorb.

### Card design / theming

Printable cards are 63×88mm (`components/cards/PrintableCard.vue`, parchment
style in `assets/cards.css`). Each card has a class CSS theme keyed by
`SkillDefinition.classCss` (one `--class-<name>` colour var in `assets/style.css`
plus `.portrait.<name>`/`.mini-card.<name>` rules there, and `.print-card.<name>`
rules in `assets/cards.css` — grep `--class-` for the current set), and an
action-type header colour (`atac-fisic`, `defensa`, `focus`). Icons come from
`packages/web/public/icons/` (game-icons.net, CC BY 3.0), served at `/icons/`.
