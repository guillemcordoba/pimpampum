# Balance audit — 2026-08-03

What a 100-encounter audit of the solver found, what got fixed, and what is
left to do. Written as the hand-off for the next session.

---

## 1. What was done

100 encounters were requested exactly the way a GM requests them in the
creator — a real equipped party (4 heroes, 4 main kits, Σ19 levels, shield +
leather + axe), a composition, and a difficulty preset — letting the balancer
supply the only thing it owns, the PV per body. Every solved encounter was then
**replayed under an independent seed**, so its promised winrate was checked
against a fresh measurement rather than the sample the search steered on.

Harnesses (all under `packages/simulator/src/`, run with
`pnpm --filter @pimpampum/simulator exec tsx src/<file>.ts`):

| file | question |
|---|---|
| `experiment-gm-encounters.ts` | 100 GM-shaped requests, solved + replayed |
| `experiment-long-fights.ts` | what actually decides a long fight? |
| `experiment-pv-curve.ts` | winrate vs PV for one composition |
| `experiment-kit-threat.ts` | **the kit scoreboard** — see §5 |

## 2. What the audit found

**Calibration was never the problem.** Mean error 2.5pp, median 1.9pp, 90/100
within ±5pp, 99/100 within ±10pp. When the solver says 65%, an independent
500-game replay says 65%. The v3 machinery works.

**The answers were unusable anyway.** PV per body: median 48, max **432** —
against heroes with 12. Fight length: median **12 rounds** against a ≤5-round
design target; only 17/100 hit it, 56/100 ran past 10 rounds.

**Why: PV is a duration lever being used as a difficulty lever.** Same species,
same difficulty, only the body count changing:

| | PV/body | total enemy PV | rounds |
|---|---|---|---|
| 1× Goblin, fàcil | 320 | 320 | 21.2 |
| 3× Goblin, fàcil | 60 | 180 | 15.9 |
| 6× Goblin, fàcil | 15 | 90 | 7.8 |

More bodies gives the same difficulty for **less** total PV and a **shorter**
fight. Danger scales with how many things act each round; PV only scales how
long they soak.

**And the difficulty numbers measured the wrong thing.** A 29-round fight runs
past the daily fatigue budget (`FATIGUE_CONFIG.max = 20`), after which the only
playable card is Cop desesperat — 1d4, and **1 PV of self-damage per swing**,
on a 12 PV hero. Re-measuring with the fatigue ceiling lifted:

| solved encounter | asked | with fatigue | without |
|---|---|---|---|
| 1× wolf @432 PV | 50% | 48% | **100%** |
| 1× spined devil @415 PV | 50% | 52% | **100%** |
| 6× wolf @63 PV | 50% | 51% | 86% |
| 3× basilisk @10 PV (short, control) | 50% | 54% | 54% |

The sponge fights were never even: the party wins them outright and was dragged
to a coin flip by exhausting itself. The short-fight control does not move,
which is what makes this causal rather than correlational.

This conflicts with `intentions.md` directly — 20 fatigue is meant to pace 2-3
combats *per day*, and these single encounters consumed 1.5× the whole day.

## 3. What was changed

**Duration is now a constraint** (`solveEncounter`, `maxAvgRounds`, default
`DEFAULT_MAX_AVG_ROUNDS = 6`). Rounds rise monotonically with PV, so the budget
is a ceiling on scale: after solving for winrate, if the fight is too long the
solver bisects **down** to the largest scale that fits and returns that, setting
`durationCapped`. The winrate then comes out easier than requested, honestly so
— the fix is a different composition, never more hit points. The duration
bisection runs on the search seed, so common random numbers still hold.

Result over the same 100 encounters: median **5.7** rounds (was 12), max 6.2
(was 28.9), **0/100** over 10 rounds (was 56). PV median 22 (was 48), max 100
(was 432). Where the budget does not bind (21/100) calibration is unchanged at
4.1pp mean error; where it binds (79/100) the encounter comes out ~27pp easier
and says so.

**Two UI bugs found via a real-world report** (the creator solving 6 goblins to
1 PV each):

- The party roster only rendered a gear line when there *was* gear, so an
  unequipped party looked normal. An unequipped party is catastrophically weak —
  no shield means no defense card, and a weapon kit with no weapon **cannot play
  its cards at all** — and the solver correctly clamped to the PV floor. The
  roster now always shows equipment, flags `sense equipament`, and warns per
  hero when a weapon kit has no weapon. New heroes get default kit on first
  skill pick.
- The creator ignored `solved.clamped`, computing its own warning from
  `|predicted − target| > 2σ`; a floor clamp reading "79% vs 80% asked" showed
  as a clean hit. It now honours the flag and distinguishes clamped-too-strong
  from clamped-too-weak.

## 4. The reframing (the important bit)

**The scoreboard tests the player kits as much as the enemy kits.** Every number
below is *this creature against that reference party*. A kit that cannot reach
an even fight might have weak cards — or the player kits it is measured against
might be too strong. The measurement cannot tell those apart, and nothing yet
tests the player side.

So the same criterion needs inverting: fix a reference encounter and sweep the
PARTY, ranking which player kits over- and under-perform. That is the missing
half and probably the first thing to build next (§6).

## 5. Kit scoreboard (current state)

Cheapest composition reaching an even fight within 6 rounds, against the
reference party. Fewer bodies = more dangerous kit.

| creature | bodies to draw | ceiling | kit verdict |
|---|---|---|---|
| Basilisc | **1×** | 47% | flat — cards need teeth, not more of them |
| Goblin Xaman | 3× | 47% | **still improving at max level → more cards would pay** |
| Diable Banyut | 3× | 46% | flat |
| Diable d'Os | 4× | 46% | flat (level 1 never draws) |
| Gòlem de Pedra | 4× | 49% | flat — **level is inert, 4 bodies at every level** |
| Goblin | 16× | 0% | needs a horde; lethal in numbers |
| **Llop** | **never** | 99% | no composition ever threatens the party |
| **Diable Espinós** | **never** | 96% | no composition ever threatens the party |

Anomalies worth chasing:

- **Llop and Diable Espinós cannot produce an even fight at any count or
  level.** These two kits need real work, and they are the clearest starting
  point.
- **Gòlem de Pedra: level does nothing** — 4 bodies at levels 1, 2, 3 and 4
  alike. Its higher cards add no danger.
- **Diable Banyut gets WORSE with level** — 3 bodies at levels 1-2, but 6 at
  levels 3-5. Either a higher-level card is actively worse than what it
  replaces, or this is sampling noise. Verify before acting.
- **Goblin Xaman is the one truncated kit** — bodies needed fall 6 → 6 → 4 → 3
  as level rises, i.e. it is still gaining when it runs out of cards. This is
  the case where the answer really is "write more cards for the higher levels".
- **Goblin at level 4, 16 bodies** solves to 1 PV each (clamped at the floor):
  in that many, level-4 goblins are lethal regardless of PV.

## 6. Next steps

1. **Build the kit analyzer** (§7) — the per-kit regression harness: fix the
   kit, throw a large seeded sample at it, get a pass/fail report card. It
   subsumes the player-side scoreboard (§4), since the player and enemy modes
   differ only in which side is the subject. Requirements 1-3 first (level
   monotonicity, fight length, attack-spam must lose).
2. **Fix `Llop` and `Diable Espinós`** — the two kits that can never carry a
   fight. Re-run `experiment-kit-threat.ts` after each change; the number moves
   iff the danger did.
3. **Decide what `Gòlem de Pedra`'s levels are for**, given they currently buy
   nothing.
4. **Verify the `Diable Banyut` level regression** before treating it as real.
5. **Extend `Goblin Xaman`** — the one kit where more high-level cards is the
   demonstrated answer.
6. **Revisit the round budget** once kits have teeth. 79/100 requests are
   currently refused, which makes the creator's warning the norm rather than the
   signal. `DEFAULT_MAX_AVG_ROUNDS` is exported and `SolveOptions.maxAvgRounds`
   overrides per solve, so measuring the refusal rate at 7/8/10 rounds is cheap
   — but the intended fix is content, not a looser budget.
7. **Open rules question**: exhausted heroes currently kill themselves on Cop
   desesperat (1 PV per swing, 12 PV heroes). That is per the rules, but it
   means long fights are decided by self-inflicted damage. Worth a design
   conversation before any further balance work.

## 7. The kit analyzer (to build)

The scoreboard in §5 answers one question — *can this creature carry a fight* —
and nothing else. What is actually needed is a **regression harness you run
after every kit edit**: fix the kit, throw a large number of seeded random games
at it, and get back a pass/fail report card. Same tool for player skills and
enemy kits; only the reference opposition differs.

### 7.1 Requirements a kit must satisfy

Each one is a measurable predicate, not a vibe. Ordered by how load-bearing it
is for the design.

1. **Higher level is a better kit.** Level N+1 knows a *superset* of level N's
   cards, so a rational player can never do worse — any measured regression
   means either a **trap card** (its fatigue costs more than it returns) or an
   AI that overvalues the new card. Require `w(L+1) ≥ w(L) − noise` for every
   L, and a meaningful total gain from level 1 to full kit. Flat steps are
   nearly as bad as negative ones: a level that buys nothing is a level the GM
   and the player are both paying for.
2. **Fights do not drag out.** Median rounds within the design target, a
   bounded p90, and draws rare (heal-stall draws are a known failure mode —
   `experiment-heal.ts`). A kit that wins by outlasting rather than by acting is
   the same pathology the duration constraint was added for.
3. **Attack-spam is not the right answer.** The strategy triangle in
   `intentions.md` only exists if mixed play beats mashing the biggest attack.
   Run the identical matchup with a policy restricted to "always play the
   highest-expected-damage attack" and require the full policy to beat it by a
   clear margin. If spam ties, the kit's Defensa and Focus cards are decoration.
4. **No dead cards.** Every card should be chosen sometimes by a competent
   policy. A card never played when legal is dominated or mispriced. Measure
   play-rate per card conditioned on *legality*, not on turns.
5. **No auto-include.** The inverse: a card played nearly every time it is legal
   removes the decision. Both tails are failures; the target is a spread.
6. **Fatigue stays inside its budget.** A single combat should cost roughly a
   third of `FATIGUE_CONFIG.max`, since the budget is meant to pace 2-3 combats
   per day. A kit that exhausts the day in one fight breaks the pacing knob (§2).
7. **No card correlates with losing.** Per-card win correlation, as `main.ts`
   already does per skill and per action. A negative correlate is a trap card
   that requirement 1 may miss when it is only situationally bad.
8. **No kit dominates the field.** At equal skill-level budget, kit vs kit
   should sit near 50/50. Require no kit to exceed ~65% against the field
   average — the balance principle is stated in ordinal budgets, so this is the
   direct test of it.
9. **Outcomes are not decided in round 1.** Swinginess: how often the eventual
   winner was already ahead on total PV after the first round. A previous AI
   audit flagged this and it was never resolved.
10. **Counterplay exists.** A kit should not beat *every* opposing kit; some
    rock-paper-scissors is the point. Report the per-matchup spread, and flag a
    kit that is uniformly strong or uniformly weak.

Requirements 1-3 are the ones the user named and the ones to implement first;
4-10 are cheap once the instrumentation exists.

### 7.2 How to build it

**Shape.** `packages/simulator/src/kit-analyzer.ts` as a library plus a thin
CLI, so it can be called per kit (`… kit-analyzer.ts goblin`) or swept over all
of them for a scoreboard. One code path, two modes:

- *player kit*: subject skill at each level, on a hero with default gear, in an
  otherwise-fixed reference party, against a fixed reference encounter.
- *enemy kit*: subject creature at each level, against the fixed reference
  party (the §5 setup).

**Reuse, don't rebuild.** `main.ts` already collects per-skill and per-action
win correlation and action-type play mix via `runCombat(stats)`; that stats
collection is the backbone. `withSeed` gives common random numbers so two
configurations differ by their merits, exactly as the solver relies on. The
`CombatEngineOptions.actionChooser` seam is how the spam policy gets injected —
no engine change needed.

**New instrumentation likely required** (all additive, all generic):

- A **spam chooser** alongside `leanChooser` — picks the highest-expected-damage
  legal attack, falling back to anything legal. Needed by requirement 3.
- **Legality-conditioned play counters**: today's play mix counts what was
  played; requirements 4 and 5 need "played / times it was legal to play".
- A **round-1 PV snapshot** per combat for requirement 9.
- Per-combat **fatigue spent** for requirement 6.

**Output.** A report card per kit — one line per requirement with the measured
number, its threshold, and PASS/FAIL — plus a one-screen matrix across all kits
so a regression anywhere is visible at a glance. Thresholds live in one
exported constants block so they are arguable in one place rather than scattered
through assertions.

**Sample sizes.** Requirement 1 compares winrates across levels, so it needs the
tightest error bars: ~2000 games per level at ±1.1pp. Requirements 4-5 are
frequency counts and converge much faster. Budget the run so a full single-kit
report is under a minute and a full sweep is a coffee break; anything slower
will not actually get run after each edit, which is the whole point.

**Then wire it into the suite.** Once thresholds are settled, the pass/fail
predicates become a vitest file next to `enemy-threat.test.ts`, so a kit edit
that breaks a requirement fails CI rather than waiting to be noticed.

## 8. Caveats

- Every number is the winrate of **AI play** (`ai.ts` + `ai-policy.ts`). The
  bias is visible rather than laundered, but it is there.
- The reference party is Σ19 levels, below the ~24-28 the balance principle
  suggests. A stronger party pushes every PV figure up and every kit verdict
  down.
- Solves in §5 used `{ games: 400, searchGames: 100 }` for speed; the reported
  winrates carry roughly ±2.5pp.
