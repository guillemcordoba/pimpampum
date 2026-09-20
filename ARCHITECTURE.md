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
│       ├── types.ts           # ActionType, ActionDefinition (dice, unlockLevel), SkillInstance, EquipmentDefinition, TargetRequirement
│       ├── resolution.ts      # resolveAttack (margin), resolveDamage, checkSkillUp, SKILL_UP_MARGIN
│       ├── fatigue.ts         # FATIGUE_MAX_LEVEL, level names, the −1/level roll penalty
│       ├── effects.ts         # EffectRegistry, EffectHandler, EffectContext, EngineApi, AttackModifiers, AIContext
│       ├── status.ts          # StatusBehavior, StatusRef, StatusHookContext, AttackStatusMods, ContestKind
│       ├── action.ts          # ActionInstance, getActionTargetRequirement/Count
│       ├── modifier.ts        # CombatModifier, ModifierDuration
│       ├── character.ts       # Character (PV + skills Map + statuses + guards + blockedBy + fatigue), createCharacter
│       ├── combat.ts          # CombatEngine — step-by-step state machine + AI driver
│       ├── ai.ts              # depth 0: selectAction (weighted pick) + pickResolveTargets, AIView
│       ├── lookahead.ts       # depth ≥1: positionScore + iterated best response (the depth knob)
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
│       └── enemies/           # One EnemyDefinition per creature
├── simulator/                 # @pimpampum/simulator — balance testing (tsx + vitest)
│   ├── README.md              # THE FIVE RULES a harness here has to obey
│   └── src/
│       ├── bench/             # THE FOUNDATION — import it, never re-derive it
│       │   ├── reference.ts   # the ONE reference party (named kits, asserted Σ)
│       │   ├── arena.ts       # shared REGISTRY, SEEDED team generation, runMatch
│       │   ├── shapes.ts      # solved fight SHAPES + what "a fair cell" means
│       │   └── report.ts      # pct/deltaPP/share/exact + the sampling maths
│       ├── main.ts            # Mirror-match balance + parametric balancer check
│       ├── kit-analyzer.ts    # the kit report card (run after every kit edit)
│       ├── probe-shapes.ts    # which body counts make a fair cell
│       ├── play.ts            # MANUAL play harness (seeded; play a fight by hand)
│       ├── sanity.ts          # Quick smoke run + step-API demo
│       ├── experiment-*.ts    # one-off experiment harnesses
│       └── tests/             # bench.test.ts (ANTI-DRIFT GUARD), balance, seams, enemy-threat
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
`cardSwapCharges`/`spendCardSwapCharge`, `adjustActionWeight`, `positionValue`.

**`positionValue` (2026-09-20)** deserves its own note: it is what a status is
WORTH to its holder, in the same unit as `positionScore`'s PV term, and it
exists because the lookahead's leaf evaluator could only see PV, bodies and
fatigue. Anything that did not immediately move one of those — a wall not yet
breached, an enemy who cannot act, a set-up being held, rot that has not ticked
— scored exactly zero, so the search never chose it. Measured: eleven cards
across six kits under 3% of the turns they were legal, nearly all of them
control, prevention or set-up. Keep estimates CONSERVATIVE; a status that
over-values itself gets played to the exclusion of everything else, which is
the same failure in the other direction (a first pass at double the value had
Presó de terra correlating with losing).

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
   tick), `advanceTurn`.
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
`dot_on_block`, `heal_on_block`,
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

### The roll (2026-09-20)

**A roll is the card's dice plus the actor's level in that card's skill.**
`skillLevelBonus` in `resolution.ts` is the only place a level enters a roll,
and all four contest sites in `combat.ts` go through it.

Both sides add their own, so equal levels cancel exactly and a same-level
contest is arithmetically identical to one with no bonus. It only speaks when
the two sides are unevenly trained — which is what makes an enemy's level a real
danger dial rather than a count of how many cards it holds, and it raises damage
per round WITHOUT adding PV, which is the property the duration constraint needs.

It replaced **mestratge**, which added `level − the card's unlock level`: old
cards stayed relevant because what they gained in mastery offset their smaller
dice. Removed by design decision, not by measurement. `unlockLevel` still gates
which cards a level unlocks — it simply no longer enters a roll. Note
`Rugit de guerra` always rolled the FULL level for its own contest, so the
engine is now consistent with the one card that said so on its face.

**This re-bases every balance number in the repo** — every roll moved, by more
on late-unlock cards than early ones.

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

**Every defense card pays off when it blocks** (`intentions.md`: the premium is
what keeps Protect ahead of Aggro). The rider rides `onDefend`, which fires once
per blocked attack for a guard and for every member of a joint wall:
`counter` (riposte, `weapon: true` adds the wielded weapon's flat bonus),
`retaliate_wound` (flat `amount` or rolled `dice`, ignores armour),
`debuff_on_block`, `dot_on_block`, `heal_on_block`, `buff_on_block`;
`onBlockFail` is the mirror seam for cards that pay when the blow gets through
(`buff_on_block_fail`, Berserk's `rage_from_pain`).

**Mur de pedra has LIFE** (`cards/standing-wall.ts`). The wall rolls its `life`
dice when it goes up (its own knob, separate from the dice it defends with —
2d10 of life behind a 4d6 guard) and stores the result in `data.life`; a breach no longer
shatters it — `onStandingGuardBroken` flags `data.breaching` and the status's
own `modifyIncomingDamage` charges that damage to the wall, passing only the
excess to the protected and clearing the status when the stone runs out. Note
`performExtraAttack` consults ACTIVE guards only, so counters and other extra
attacks fly past a standing wall.

**Focus interrupts.** Cancelled if the actor takes DAMAGE before it resolves; a
hit fully absorbed by armour does NOT interrupt (rule changed 2026-07-18).

**Speed ties** resolve simultaneously (per-tier alive/interrupt snapshots); the
engine shuffles the queue before the speed sort so no seat holds tie priority —
this fixed a measured seat bias.

**Fatigue.** `Character.fatigue` is a LEVEL 0-5 (`fatigue.ts`: Fresc, Cansat,
Fatigat, Extenuat, Exhaust, Esgotat), set by the DM — `setFatigue()` from a
`CharacterBuildSpec.fatigue` / `DrawnPartySpec.fatigue`, never by the engine.
The whole mechanic is one line: `getRollBonus()` adds `fatigueRollPenalty()`
(−1 per level), and every attack, defense, extra-attack and heal roll already
routes through it. Cards cost none; `rest()` (a 4h+ rest) clears it. Measured
2026-09-13 (`simulator/src/experiment-fatigue-tiers.ts`, `-penalty.ts`): one
level ≈ one difficulty tier, one-sided penalties SHORTEN fights, symmetric ones
double them — so enemies never carry fatigue (see `intentions.md`). The
balancer prices the party at its fatigue level like any other party input.
The cards the old budget priced above 1 are listed in `NEXT-STEPS.md` §11 and
carry no cost at all until that is decided. Nobody is ever
action-less: every combatant holds **Cop desesperat** (universal, 1d4 slow
attack, 1 PV self-damage hit or miss — `skills/src/desperation.ts`), playable
ONLY when nothing else is (the generic `ActionDefinition.lastResort` flag).

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

### Duration is a constraint, not a report (2026-08-03)

PV is the solver's only lever, and PV buys **durability, not danger**. So when
a composition cannot threaten the party per round, the only way to reach a hard
winrate is to turn the enemies into sponges. Measured over 100 GM-shaped
requests, unconstrained solving produced a median 12-round fight, single-creature
encounters averaging 19 rounds and 235 PV per body, and a peak of **one wolf with
432 PV over 29 rounds**.

Worse, the difficulty those numbers reported was not the creature's. Under the
daily fatigue budget of the time (max 20, since replaced by the DM-assigned
level), a 29-round fight ran past it, after which the only playable card was
Cop desesperat — 1d4, and **1 PV of self-damage per swing**, on a 12 PV hero.
Re-measuring with the fatigue ceiling lifted:

| solved encounter | asked | with fatigue | without |
|---|---|---|---|
| 1× wolf @432 PV | 50% | 48% | **100%** |
| 1× spined devil @415 PV | 50% | 52% | **100%** |
| 6× wolf @63 PV | 50% | 51% | 86% |
| 3× basilisk @10 PV (short) | 50% | 54% | 54% |

The sponge fights were never 50/50: the party wins them outright and was being
dragged to a coin flip by exhausting itself. The short-fight control does not
move, which is what makes this causal. (The budget is gone now, so this
particular artifact cannot recur — but a 29-round fight is still not the fight
the number promises, so the duration constraint stays.)

So `solveEncounter` holds `maxAvgRounds` (default `DEFAULT_MAX_AVG_ROUNDS = 6`)
as a hard constraint. Rounds rise monotonically with PV, so the budget is a
ceiling on scale: after solving for winrate, if the fight is too long the solver
bisects **down** to the largest scale that fits and returns that, setting
`durationCapped`. The winrate then comes out EASIER than requested, and honestly
so — the fix is a different composition, never more hit points. The duration
bisection runs on the search seed, so common random numbers still hold.

Consequence worth knowing: within 6 rounds, plain melee bodies cannot be made
dangerous to a competent party at all — every solo creature solves to ~100%
player win. The compositions that still reach a 50% fight are the ones with real
per-round threat (3× basilisk at 10 PV / 3.5 rounds; 6× goblin shaman at 10 PV /
4 rounds). That is a content signal, not a solver defect.

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

**The AI defines difficulty.** Every number is the winrate of AI play, so AI
quality is balance quality. The balancer plays the one AI at `aiDepth` 1 (see
The AI, below).

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

**There is exactly one AI, with a depth knob.** It lives in the engine
(`ai.ts` + `lookahead.ts`), carries no learned weights and no per-card table, so
adding a card never requires retraining anything — the property an instrument
that prices encounters has to have.

`CombatEngineOptions.aiDepth` is the knob:

- **Depth 0** — score the cards as they stand. Attacks are weighted by
  **expected PV removed** (projected margin damage blended over
  defended/undefended outcomes and armour); content adds its own judgement
  through per-effect `aiWeight` hints and `StatusBehavior.adjustActionWeight`.
  Choice is weighted sampling sharpened by `aiSharpness` (weights^τ, default 2).
  Fast (~4 ms/combat) and blind to what the rest of the round commits.
- **Depth 1** — play the round forward and score the position it leaves
  (`positionScore`: PV differential, bodies standing, fatigue level — hand-written,
  readable weights). The team is solved JOINTLY by iterated best response, which
  is the only way a defense can be valued next to the focus it protects.
  `topK` prunes candidates by the depth-0 opinion. ~6× the cost, and it beats
  depth 0 head-to-head **70/30** (`ai-benchmark.ts`, 2026-08-08).
- **Depth ≥2** — measured at ~500× depth 1. Offline study only.

`LookaheadOptions.restrictTo` limits the AI to a subset of card types, which is
how "is attack-spam actually optimal?" gets asked fairly: both sides think
equally hard, one merely has a smaller strategy space.

**The balancer prices at depth 1** (`BALANCER_DEPTH` in `simulate.ts`), and the
web app's enemies run at depth 1 too, so a fight plays out at the strength it
was priced for. **The AI's play strength IS the unit of difficulty**: price
against a party that blunders and the encounter feels trivial at a table that
doesn't.

`Character.aiControlled` decides who the engine plays: false for the web app's
human seats (they get prompted for cards and targets), true for enemies (set by
`createEnemyFrom`) and for simulated player teams (`setAIControlled`).
**Targets** are chosen at resolution time (`pickResolveTargets`), seeing what a
human sees after the reveal: take lethal kills, interrupt enemies whose slower
focus is still pending, prefer dangerous and wounded targets, avoid active
guards. Defenses use a guard-vs-block heuristic (guard wounded allies, else
block the scariest enemy whose attack is still pending, else self-guard).
Calibration counts draws as ½.

**Deleted 2026-08-08, deliberately:** the distilled lean policy
(`enemies/ai-policy.ts` + its generated `CARD_BIAS`), the learned value model
and its self-play training pipeline (`simulator/ai/`, `train-ai.ts`,
`distil-ai.ts`), and the Aggro/Power/Protect strategy biases. The lean policy
was measured playing no better than random card selection while pricing every
encounter in the game; the strategies were a thumb on the scale pushing
characters toward a card TYPE regardless of position. A creature now differs
from another because its CARDS differ.

---

## The measurement layer (`simulator/src/bench/`, 2026-09-20)

Everything in the simulator package produces a number someone makes a content
decision on, so the package has a FOUNDATION that every harness imports rather
than re-deriving. Full rules in `packages/simulator/README.md`; the load-bearing
ones:

- **`bench/reference.ts` — one reference party, named and asserted.** Four kits
  by id, built at FULL KIT, and a `REFERENCE_SIGMA` that THROWS AT IMPORT if the
  catalogue moves. "Full kit" rather than a fixed level because a level is an
  ordinal here: the old flat `5` had already stopped meaning "fully learnt" for
  nigromant and berserk (6 cards each), so the party was a card short of what
  every comment claimed. Σ therefore MOVES when a kit gains a card — the guard
  is what makes that loud rather than silent. It was `MAINS.slice(0, 4)` copy-pasted into seven files:
  positional, so adding or reordering a kit in `catalog.ts` silently re-based
  every number in the package, and the level sum was emergent rather than chosen
  (Σ20 only because those four kits happen to have ≥5 cards each — earthbender
  has 4, which is where the docs’ long-standing "Σ19" came from).
- **`bench/arena.ts` — seeded team generation.** The shared `REGISTRY`,
  `randomTeam`, `runMatch`, `runMatchup`, and `sweep()` for common random
  numbers across arms. It drew from bare `Math.random()` before, so `withSeed`
  did not bind and no mirror sweep shared random numbers with the arm it was
  compared against.
- **`bench/cells.ts` — running one cell.** The impoverished policies, the ONE
  legality-conditioned play-rate instrument (it had three independent
  implementations), and `runMatrix`, which sweeps the usable cells and subtracts
  the baseline.
- **`bench/shapes.ts` — the fight matrix, and what a cell has to be.**
  `SHAPES` carry no written-down PV: each is SOLVED to `FAIR` (60%) so it
  re-prices itself when the cards or the AI move. It is solved against a
  CELL-SHAPED calibration party (a neutral stand-in in seat 1 plus a real
  `COMPANY` row) and then MEASURED against every row. Previously it was priced
  against four mains at full kit while the cells were fought by a subject plus
  two mains and a complementary kit — different parties, so the 60% never
  transferred, worst at level 1 where it mattered most, and the report printed
  "fair by construction" regardless. A CAPPED solve is out of band even when its
  number lands near 60%: its difficulty came from the body count and the PV
  floor, not from the target — reported, but not disqualifying.

  **EVERY SCORE IS A DELTA FROM THE CELL'S NEUTRAL BASELINE.** That removes the
  cell's own difficulty (so a shape drifting as content is added no longer moves
  any kit's score) and the SEATING (worth up to 66pp between company rows).
  Which is why a cell no longer has to be *fair*, only UNSATURATED: demanding
  ±8pp of 60% excluded three of four shapes and could not be fixed by
  re-probing, yet nothing was ever compared to 60% — every requirement was
  already a delta. 4 usable cells became 15. **An empty matrix throws**, because
  the averages would otherwise report 0% at every level, which reads exactly
  like a catastrophic kit rather than a broken harness.
- **`bench/cache.ts` / `bench/parallel.ts` — why a run is fast.** A full sweep
  went from eleven minutes to ninety seconds. The cache key is a hash of exactly
  what a CELL depends on — the cards in it, the enemies in its shape, and the
  engine's own SOURCE — so editing one kit invalidates the rows that seat it and
  nothing else. The parallel layer only ever WARMS that cache: children take no
  part in a measurement, the run stays single-threaded, and the output is
  bit-identical to a serial one (verified by diffing against
  `BENCH_NO_CACHE=1`). A failed child costs time, never correctness.
- **`bench/report.ts` — no percentage is formatted by hand.** `pct(rate, n)`,
  `deltaPP(...)`, `share(n, total)`, and `exact(rate)` for a number that is
  KNOWN rather than sampled. Plus `gamesFor(pp)` (what a threshold costs),
  `significant(...)`, and `maxOfKBias(k)` for winner’s curse.

**`tests/bench.test.ts` enforces four of these by scanning the source**, because
every defect they prevent was silent — the harnesses kept printing numbers, the
numbers were simply about something else. One reference party (never
`.slice(0, 4)`); no bare `Math.random()`; every `new CombatEngine` states its
`aiDepth` or supplies an `actionChooser`; every percentage goes through
`bench/report.ts`. A file may opt out with `// bench-exempt(<rule>): <reason>`,
and the reason’s length is asserted so the hatch cannot become a silent disable.

**Two statistical rules the thresholds now follow.** Every verdict is a
difference of two samples, so a fixed constant alone is not a threshold — the
kit analyzer’s flat 3pp level check read a genuinely flat level as a regression
about one time in four at its old default, which is most of what the first
report card’s wall of ❌ was. And picking the best of *k* noisy candidates and
reporting that same sample is winner’s curse (`maxOfKBias`, ~1.7σ at k=14), so
requirement 3 screens cheap and re-measures the winner on a fresh seed — the
same select-then-verify shape `simulate.ts` uses.

**AI depth is never implicit.** The engine defaults `aiDepth` to 0 and the
balancer prices at 1, so a harness that omits it grades strong play with weak
play. That was live in `main.ts`’s parametric check until 2026-09-20.

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
- `ai-benchmark.ts` — the POLICY BENCHMARK: how strong is the AI we measure the
  game with? Runs every policy (the engine's heuristic at depth 0, the same AI
  at depth 1 at two budgets, `spam`, `uniform`) over one fixed encounter and
  reports strength, cost per combat, a mirrored head-to-head matrix, the share
  of decisions spent per action type, and per-card play rate conditioned on
  legality. **Its 2026-08-08 run is what killed the lean policy** (no better
  than a random legal card — NEXT-STEPS §9); the staleness section now asserts
  there is nothing left to go stale, since the one AI carries no per-card table.
- `kit-analyzer.ts` — the KIT REGRESSION HARNESS (NEXT-STEPS §7): library +
  CLI, one code path, two modes (`--player <skill>` / `--enemy <id>`; no flag
  sweeps every main kit). Per kit it reports level monotonicity under common
  random numbers, fight length (median/p90/draws), the attack-spam comparison
  (the subject side replayed with a "biggest attack always" chooser), per-card
  value by **leave-one-out ablation**, and per-card win correlation. Its
  scenarios are the SOLVED shapes in `bench/shapes.ts`, so they re-price
  themselves rather than needing hand-calibration — and an out-of-band shape is
  dropped from the headline and reported loudly instead of averaged over.
  **The dead-card verdict is an ABLATION, not a play rate**: the kit is played
  again with one card physically absent from the hand (`heroWithout`, and
  `EnemySpec.without` on the enemy side) and the winrates are subtracted, so
  `value(C) = winrate(kit) − winrate(kit without C)`. Asking instead "did the AI
  choose it" made the hand-written evaluator the judge of the content it exists
  to serve — a play rate moves to whatever you like when one `aiWeight` moves,
  and the same eleven cards read dead, then alive, then dead again across three
  sessions in which no die changed. **The sign is asymmetric**: `value > 0` is a
  LOWER BOUND that survives a better player (a bigger choice set never hurts
  optimal play) and is the ONLY thing the harness can certify; `value < 0` means
  the AI plays worse for holding the card, a finding about the AI rather than the
  card. **It cannot certify a card DEAD**, and requirement 4/5 therefore reports
  `➖` rather than `✅`: the noise floor was measured at ±3pp against a whole
  seat worth only ~11pp, so an evenly balanced 5-card kit (~2.2pp a card) is
  indistinguishable from a kit of nothings. NEXT-STEPS §17.5 has both control
  runs; `DETECTION_FLOOR` carries the numbers. The known
  weakness is sub-additivity: two cards doing one job cover for each other and
  both ablate to nothing, so a dead verdict means "nothing needs THIS card",
  never "this card does nothing" — the level sweep, which removes cards in
  prefixes, is the complement.
- `probe-shapes.ts` — which body counts make a fair cell. Judges a count exactly
  the way the analyzer will (solve against one company, measure against all), so
  the tool that CHOOSES the counts cannot disagree with the tool the counts are
  FOR. Re-run after any content or AI change.
- `measure-verdict.ts` and `measure-mix.ts` were DELETED (2026-09-20): both asked
  a question the kit analyzer already answers — "does restricting a strong player
  to attacks cost anything" is requirement 3's `onlyAttacks` arm, and the action
  mix / per-card legality table is `ai-benchmark` §1 and §3. Three
  implementations of one metric is three numbers that can disagree. The
  party-level verdict is now the analyzer's roll-up; `--shape` on the benchmark
  is what the mix harness was for.
- `experiment-defense-vs-attack.ts` — the DEFENSE PREMIUM check: exact (convolved,
  not sampled) probability that each defense card holds against every attack card
  of the same level, plus the minimum dice each defense needs to hit the 80%
  target in `intentions.md`. It found the premium was only 72% on average with
  52% of pairs below target (2026-08-08), which drove the defense dice up to
  3d4 / 3d6 / 4d6 by level. Re-run after touching any contest dice.
- Standing one-offs: `experiment-seat.ts` (seat bias),
  `experiment-fatigue-penalty.ts` / `experiment-fatigue-tiers.ts` (the fatigue
  ladder's numbers), `experiment-level.ts` (level as a length lever). Run any
  with `pnpm --filter @pimpampum/simulator exec tsx src/<file>.ts`.
- **Eight one-offs were DELETED on 2026-09-20** — `experiment-berserk`,
  `-balance-pass`, `-tuning`, `-objects`, `-heal`, `-horde-armour`,
  `-armour-absorption`, `-pv-curve`. Each had answered its question, and the
  answer already lives in this file or NEXT-STEPS; the scripts were scaffolding
  kept past its use. Two of them had been *crashing* on a renamed berserk card
  for an unknown length of time, unnoticed, because checking them cost
  thousands of combats. See NEXT-STEPS §14 and the three rules in CLAUDE.md.
- `tests/harnesses.test.ts` — THE SMOKE TEST: runs every script in `src/` at
  `GAMES=2`. It asserts nothing about the numbers, only that each harness still
  executes against today's content, so a renamed card, a deleted skill or a
  moved log format breaks the build the day it happens. The list is discovered
  from the directory, so a new harness is covered the moment it is added.
- `bench/games.ts` — the sample-size reader every harness uses (`--games`,
  `GAMES`, then its own default). A hardcoded sample size is what made the two
  dead harnesses impossible to check cheaply.
- `bench/combatlog.ts` — ONE combat-log parser. Two harnesses held their own
  near-identical regexes, and a regex that stops matching prints an empty table
  rather than an error; `assertParsed` throws when a run played combats and read
  nothing out of them.
- `tests/balance.test.ts` — resolution math (`checkSkillUp`, `resolveAttack`,
  `resolveDamage`), engine sanity (terminates, valid winner, PV in range),
  mirror balance ~50%, combat length.
- `tests/seams.test.ts` — every generic StatusBehavior seam, deterministically,
  with inline behaviours (1d1 dice → exact-PV assertions).
- `tests/enemy-threat.test.ts` — the balancer guard: every solved encounter is
  REPLAYED with an independent seed and must land near the winrate it reported,
  plus determinism, arbitrary body counts and mixed comps.
- `tests/bench.test.ts` — the ANTI-DRIFT GUARD: the four structural rules above,
  enforced by scanning the source, plus the sampling maths in `bench/report.ts`.
- `bench/arena.ts` models INTENDED play: `randomPlayer` picks a main skill first
  (complementary kits — metge/runes/ombres/gel — only ever appear as second
  skills), guarantees weapon kits a mid weapon (destral), uses `PLAYER_PV` 12
  and ordinal budgets of ~6-7, and draws through the engine's SEEDED `random()`.
  `tests/helpers.ts` is now a thin alias for it.

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
corner stats for resource costs (càrregues,
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
