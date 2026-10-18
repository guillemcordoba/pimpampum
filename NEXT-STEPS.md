# Balance audit — 2026-08-03

What a 100-encounter audit of the solver found, what got fixed, and what is
left to do. Written as the hand-off for the next session.

---

## Backlog — the ONLY open list (updated 2026-10-05)

Every open item lives here; the sections below are history. Nothing here
blocks the build: each one is either a design decision or recorded as a known
failure that its test asserts still fails.

Empty. The last two decisions were settled on 2026-10-05: no card multiplies
damage any more (§40), and armour stays as it is (§41).

---

## 1. What was done

100 encounters were requested exactly the way a GM requests them in the
creator — a real equipped party (4 heroes, 4 main kits, Σ19 levels, shield +
leather + axe), a composition, and a difficulty preset — letting the balancer
supply the only thing it owns, the PV per body. Every solved encounter was then
**replayed under an independent seed**, so its promised winrate was checked
against a fresh measurement rather than the sample the search steered on.

Harnesses (then under `packages/simulator/src/`, now `packages/tools/src/`; of
these only `experiment-kit-threat.ts` survives — the others answered their
question and were deleted, their findings are below):

| file | question |
|---|---|
| `experiment-gm-encounters.ts` | 100 GM-shaped requests, solved + replayed |
| `experiment-pv-curve.ts` | winrate vs PV for one composition |
| `experiment-kit-threat.ts` | **the kit scoreboard** — see §5 |
| `experiment-kit-levels.ts` | **is a higher level a better kit?** — see §5.1 |

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

**And the difficulty numbers measured the wrong thing.** Under the daily
fatigue budget of the time (max 20 — since replaced by the DM-assigned fatigue
level, which no card spends), a 29-round fight ran past it, after which the only
playable card was Cop desesperat — 1d4, and **1 PV of self-damage per swing**,
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

This conflicted with the `intentions.md` of the time — 20 fatigue was meant to
pace 2-3 combats *per day*, and these single encounters consumed 1.5× the whole
day. (2026-09-13: the budget is gone, so the artifact cannot recur; the
duration constraint below stays because a sponge fight is still not the fight
the number promises.)

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

## 5.1 Level regressions — verified (2026-08-04)

Two of those anomalies were checked directly rather than through the solver:
`experiment-kit-levels.ts` fixes the composition AND the PV, sweeps only the
level, and reads the winrate under common random numbers (2000 games/cell,
±1.1pp). It then breaks the pivotal cell down per card — plays per combat per
body, and how often the creature won when it played that card.

**Diable Banyut: the regression is real, and the whole kit above level 1 is
negative.** Player winrate, 3 bodies:

| PV | L1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|
| 20 | **45.5%** | 53.2% | 51.1% | 54.3% | 53.4% |
| 30 | **10.3%** | 14.4% | 15.8% | 13.9% | 12.9% |

A level-1 horned devil is the most dangerous horned devil there is. Same shape
at 6 bodies (33% → 49% for the players from L2 to L4). Per card, at 3×/20 PV:

| card | level | plays/combat/body | won when played |
|---|---|---|---|
| Forquilla del diable | 1 | 3.48 → 1.80 | 63% → 57% |
| Alè de l'infern | 2 | 0.39 | 52% |
| Defensa diabòlica | 3 | **2.74** | **42%** |
| Pilar de foc | 4 | 1.54 | 57% |
| Flames de l'avern | 5 | **0.00** | never played |

- **Defensa diabòlica** is the biggest single cost: it is played constantly —
  more than a third of all turns — and those turns are not spent attacking.
- **Pilar de foc** carries the same 2d6 as Forquilla but at speed −2 and
  without the undefendable rider; it displaces the better card (3.05 → 1.80).
- **Flames de l'avern** is literally never played: speed −5, Focus (and, at the
  time, 4 fatigue).
- **Alè de l'infern** is nearly dead (0.39) — 1d6 against defended heroes is
  ~0 damage (and cost 2 fatigue at the time).

(Win-when-played is confounded — a defense is played when already losing — so
the causal evidence is the level sweep, not that column. The sweep is causal:
supersets, same seed, only the level moving.)

**Gòlem de Pedra: levels are inert, and the reason is that its higher cards are
never played.** Creature winrate at 4×/20 PV: 76.1 / 76.9 / 76.2 / 76.1 across
levels 1-4 — flat inside noise, matching the scoreboard's "4 bodies at every
level". Plays per combat per body: Cop de pedra **4.59**, Mur de pedra 0.10,
Terratrèmol 0.49, Enduriment 0.08. Levels 2-4 add three cards that together
account for under 15% of its turns.

The common thread in both kits: **the expensive card (then 3-4 fatigue) or the
defensive card is either never played or played instead of the attack that was
already better.** Neither kit needs *more* cards; the cards above level 1 need
to be worth a turn.

1. ~~**Build the kit analyzer**~~ **BUILT (2026-08-08)** —
   `packages/simulator/src/kit-analyzer.ts`, library + CLI, both modes
   (`--player <skill>` / `--enemy <id>`, no flag sweeps every main kit).
   Requirements 1, 2, 3, 4/5 and 7 are implemented; the first report card is in
   §8 below. Requirements 6, 8, 9, 10 are still open. Original brief:
   the per-kit regression harness: fix the
   kit, throw a large seeded sample at it, get a pass/fail report card. It
   subsumes the player-side scoreboard (§4), since the player and enemy modes
   differ only in which side is the subject. Requirements 1-3 first (level
   monotonicity, fight length, attack-spam must lose). **Requirement 1 already
   has a working single-kit implementation** in `experiment-kit-levels.ts`
   (§5.1) — level sweep at fixed composition and PV, plus the per-card
   breakdown; fold it in rather than rewriting it.
2. **Fix `Llop` and `Diable Espinós`** — the two kits that can never carry a
   fight. Re-run `experiment-kit-threat.ts` after each change; the number moves
   iff the danger did.
3. **Decide what `Gòlem de Pedra`'s levels are for**, given they currently buy
   nothing. ~~Verify~~ **verified** (§5.1): flat 76% at every level, because
   Mur de pedra / Terratrèmol / Enduriment are almost never played.
4. ~~**Verify the `Diable Banyut` level regression**~~ **verified and real**
   (§5.1) — up to 10.8pp, far outside noise. Level 1 is its most dangerous
   level. Culprits named per card; the redesign is the open item.
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

> **Superseded 2026-10-03 by §27.3** — four requirements, one intention each.
> The list below is the history the code comments still cite by number.

Each one is a measurable predicate, not a vibe. Ordered by how load-bearing it
is for the design.

1. **Higher level is a better kit.** Level N+1 knows a *superset* of level N's
   cards, so a rational player can never do worse — any measured regression
   means either a **trap card** (it costs more than it returns) or an
   AI that overvalues the new card. Require `w(L+1) ≥ w(L) − noise` for every
   L, and a meaningful total gain from level 1 to full kit. Flat steps are
   nearly as bad as negative ones: a level that buys nothing is a level the GM
   and the player are both paying for.
2. **Fights do not drag out.** Median rounds within the design target, a
   bounded p90, and draws rare (heal-stall draws are a known failure mode —
   `experiment-heal.ts`). A kit that wins by outlasting rather than by acting is
   the same pathology the duration constraint was added for.
3. **Thinking must beat not thinking, BY A LOT.** The strategy triangle in
   `intentions.md` only exists if playing the kit properly beats every mindless
   strategy by a wide margin. Run the identical matchup restricted, in turn, to:
   random legal cards, "always the highest-expected-damage attack", and "only
   ever card X" for every card in the kit. The best of those is the bar, and the
   real policy must clear it by ≥20pp (`MINDLESS_MARGIN`). A kit whose winrate
   barely moves when you stop choosing is a kit whose Defensa and Focus cards
   are decoration.
4. **No dead cards.** Every card should be chosen sometimes by a competent
   policy. A card never played when legal is dominated or mispriced. Measure
   play-rate per card conditioned on *legality*, not on turns.
5. **No auto-include.** The inverse: a card played nearly every time it is legal
   removes the decision. Both tails are failures; the target is a spread.
6. **The kit holds up tired.** Fatigue is a DM-assigned level now (−1 on every
   roll per level, one level ≈ one difficulty tier), so the day's pacing is no
   longer a card budget. What remains to check is that a kit's cards keep
   working at Fatigat — a kit whose whole plan is one big roll degrades faster
   than one built on many small dice.
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
- A **fatigue-level sweep** (0, 2, 4) for requirement 6.

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

---

## 8. First report card (2026-08-08) — every main player kit

Run: `pnpm --filter @pimpampum/simulator exec tsx src/kit-analyzer.ts --games 300`.
Reference encounter (hand-calibrated so the party lands mid-band, and **fixed**
from here on): 6× goblin N3 @15 PV + 1× diable d'os N3 @28 PV, against the
reference party with the subject kit in seat 1.

| kit | L1 → full | 1. level ramps | 2. duration | 3. beats spam | 4/5. card use |
|---|---|---|---|---|---|
| Mestre d'Armes | 64 → 53% | ❌ 2→3 −14.7pp | ❌ med 6 / p90 12 | ✅ +50pp | ❌ Contraatac 1.2%, Flux 0%, Cadena 0% |
| Nigromant | 28 → 47% | ✅ +19.3pp | ❌ med 6 / p90 12 | ✅ +43.7pp | ❌ Xuclar 96%, four cards ~0% |
| Berserk | 42 → 52% | ✅ +9.7pp (4 flat steps) | ❌ med 6 / p90 12 | ✅ +50pp | ❌ everything above L3 at 0% |
| Earthbender | 50 → 50% | ❌ +0.0pp, every step flat | ❌ med 6 / p90 11 | ✅ +47.7pp | ❌ Cop de roca 92%, wall & prison 0% |
| Màgia volcànica | 50 → 42% | ❌ −3.0, −4.7pp | ❌ med 5 / p90 11 | ✅ +41.3pp | ❌ Obsidiana 0%, Riu 0%, Erupció 1.8% |

**The one unambiguous pass is requirement 3**: the full policy beats pure
attack-spam by 41-50pp everywhere. Mixed play is worth a great deal; the
triangle is not decoration.

**Everything else fails, and mostly for ONE reason.** Look at the card-use
column: the distilled lean policy plays almost nothing but attacks. Contraatac
sits at 1.2% of the turns it is legal *despite* a learned CARD_BIAS of +2.19;
Mur de pedra, Pell d'obsidiana, Cop d'espatlla and Sudari de tomba are all at
0.0%. Requirement 1 then fails downstream: if the cards a level adds are never
chosen, the level cannot buy anything, so ramps read flat (Earthbender: 50% at
every level) or negative.

**So the "dead card" verdicts are not yet trustworthy as content verdicts.**
Two hypotheses, and they need separating before any card is redesigned:

- *The policy is wrong.* `distil-ai.ts` was re-run after the 2026-08-08 defense
  pass, but the VALUE MODEL it distils from (`src/ai/weights.json`, via
  `train-ai.ts`) was **not** retrained, and it is what teaches the search AI
  what a good position looks like. A value model that never learned that a
  standing wall or a riposte is worth a turn will generate demonstrations that
  never take one. **Retrain the value model, then re-distil, then re-run this
  table.** That is the first thing to do.
- *The cards really are traps.* Possible, and the mirror sweep in `main.ts`
  disagrees loudly — the BUILT-IN AI plays 7.7k defenses per 3000 mirror games
  and Barricada/Pell d'obsidiana win 56-64% when played. Two AIs disagreeing
  this hard about the same cards is itself the finding.

Duration also fails across the board (median 6, p90 11-16 rounds against the
≤5 target) — but this reference encounter is deliberately near 50%, i.e. the
hardest shape a party faces, so read it as an upper bound rather than the
typical table experience. Re-read it after the policy question is settled.

---

## 9. The policy benchmark (2026-08-08) — the balancer's AI plays near-randomly

`ai-benchmark.ts`, 500 combats per cell, one fixed encounter (6× goblin N3 @15
PV + 1× diable d'os N3 @28 PV) against the reference party. Every policy drives
the party in turn; the enemy side is held on the heuristic AI throughout.

| policy | winrate | rounds | ms/combat | Atac | Defensa | Focus |
|---|---|---|---|---|---|---|
| **heuristic** (engine, what the web app's enemies use) | **61.5%** | 9.8 | 1.73 | 50% | 29% | 21% |
| **lean** (what `simulate.ts` prices every encounter with) | **45.6%** | 9.2 | 1.07 | 68% | 10% | 23% |
| spam (biggest attack always) | 0.6% | 5.1 | 0.58 | 97% | 3% | 0% |
| uniform (random legal card) | 41.0% | 10.6 | 1.17 | 27% | 40% | 33% |

Mirrored head-to-head, both seats, agrees: **heuristic beats lean 60.2 / 39.8**.

Three conclusions, in order of consequence:

1. **The lean policy is 16pp weaker than the heuristic AI and only ~4.6pp above
   picking a random legal card** (±2.2pp at n=500). It is the policy every
   encounter the creator has ever priced was simulated with. Difficulty numbers
   are therefore calibrated against a party that plays barely better than
   randomly, and specifically one that almost never defends (10% of decisions vs
   the heuristic's 29%).
2. **Speed does not justify it.** The whole reason a distilled policy exists is
   that the balancer cannot afford lookahead — but the heuristic AI costs
   **1.73 ms/combat against the lean policy's 1.07**. That is 1.6×, not the
   10-100× that would force the trade. A solve that takes 2 s would take ~3.2 s,
   in a worker, once.
3. **The kit analyzer's "dead card" verdicts (§8) were largely an artefact of
   the policy**, not of the cards. Sudari de tomba: 0.0% under lean, 19.5% under
   the heuristic AI. Barricada: 14.5% vs 19.3%. Both were measured on identical
   positions.

**Recommended next step: make the heuristic AI the balancer's policy** and drop
the lean policy from the production path (`BALANCER_CHOOSER` in `simulate.ts`).
That also deletes the retraining treadmill — `CARD_BIAS` is keyed by card id, so
every new or homebrew card scores 0 until someone re-runs `train-ai.ts` and
`distil-ai.ts` — which is the thing that silently invalidated §8. Then re-run
the balancer guards, the kit report card and the mirror sweeps, since every
balance number in this document was measured with the weaker policy.

The heuristic AI is not above suspicion either: it plays Contraatac on 2.2% of
the turns it is legal and Cop d'espatlla on 2.7%, so some defense cards are
underplayed by BOTH policies. That is the next question after the swap, and it
is a much smaller one.

---

## 10. The AI rebuild (2026-08-08) — three AIs became one, with a depth knob

§9 killed the lean policy on the evidence. The replacement is not a fourth
system: it is the engine's own heuristic AI with a **depth** parameter.

**What the depth knob is.** Depth 0 scores CARDS (what `ai.ts` always did) and
cannot see what the rest of the round commits — which is the whole game, since
guarding the ally walking into a slow focus is either the play of the round or a
wasted turn. Depth ≥1 (`engine/src/lookahead.ts`) clones the combat, commits a
candidate, lets everyone else answer at depth 0, resolves the round and scores
the position with a **hand-written** `positionScore` (PV differential, bodies
standing, fatigue). The team is solved jointly by iterated best response, so a
defense is finally evaluated next to the focus it protects. `topK` prunes
candidates by the depth-0 opinion.

**Measured** (`ai-benchmark.ts`, 4v7 reference fight):

| setting | ms/combat | vs depth 0 head-to-head |
|---|---|---|
| depth 0 | 4.0 | — |
| depth 1, 2 samples, 1 pass | 23.2 (5.7×) | **70.0 / 30.0** |
| depth 1, 4 samples, 2 passes | 52.9 (13×) | **81.7 / 18.3** |
| depth 2 | 19,130 (4,340×) | offline study only |

Monotone in budget, as a depth knob should be. **The balancer now prices at
depth 1** (`BALANCER_DEPTH`), and the web app's enemies play at depth 1 too, so
a fight runs at the strength it was priced for.

**Deleted, deliberately:** `enemies/ai-policy.ts` + its generated `CARD_BIAS`,
the learned value model and the whole self-play training pipeline
(`simulator/ai/`, `train-ai.ts`, `distil-ai.ts`), `engine/policy.ts`, and the
Aggro/Power/Protect strategy biases (`engine/strategy.ts`,
`EnemyDefinition.aiStrategy`, `assignStrategies`). ~1,400 lines across three AI
systems became one file plus a lookahead module. **Nothing needs retraining when
a card is added** — the staleness failure that invalidated §8 cannot recur.

`Character.aiStrategy` had a second, hidden job — `!== null` meant "AI-controlled"
— now an explicit `Character.aiControlled` flag (`setAIControlled`).

`LookaheadOptions.restrictTo` limits the AI to a subset of card types, which is
how requirement 3 gets asked fairly: both sides think equally hard, one merely
has a smaller strategy space. `measure-verdict.ts` and `measure-mix.ts` ran on
it; both were folded into the kit analyzer and the AI benchmark on 2026-09-20.

### What this invalidates

**Every difficulty number in this document was measured with the old, weaker
policy.** A depth-1 party beat the §8 reference encounter far more often than
the lean policy did, so encounters priced before today are easier than they say.
Re-derive, in order:

1. The balancer guards (`tests/enemy-threat.test.ts`) — they replay at depth 1
   now, so the solve and its check agree, but the PV they solve to will move.
2. The kit scoreboard (§5) and the level sweeps (§5.1) — `experiment-kit-threat.ts`
   and `experiment-kit-levels.ts`.
3. The §8 report card — re-run `kit-analyzer.ts`; its "dead card" verdicts were
   the old policy's opinion, and requirement 3 now demands ≥20pp over every
   mindless strategy including per-card spam.
4. The mirror sweeps in `main.ts` and the defense-premium work of 2026-08-08,
   which were all measured at depth 0 with strategy biases on.

### Still open

- **Duration.** Fights ran 9-10 rounds in the benchmark's reference encounter
  against a ≤5 target. Stronger play shortens fights (depth 1: 8.1-8.8 rounds vs
  depth 0's 9.9), but not enough. Re-measure after the re-baseline.
- **The depth-0 fallback still shapes depth 1** — it seeds the assignment, ranks
  the top-K candidates and plays every rollout. Its hand-tuned constants (several
  marked `TODO(balance)`) therefore still matter, and now they matter through a
  longer chain. Worth a tuning pass with the benchmark as the judge.
- **`positionScore` is the new leaf evaluator and has never been tuned.** The old
  learned value model reached a higher winrate with the same search machinery,
  which points at the evaluator rather than the search. Its weights (10 × PV
  differential, 6 × bodies, 0.5 × fatigue) are a first guess.

### 10.1 Re-baselined at depth 1 (2026-08-08)

**Balancer guards: 63/63 pass.** Every solved encounter for all 8 creatures
lands near its independently replayed winrate — solve and replay now think at
the same depth, so they agree. The solver still hits the requested difficulty
across 3-6 player parties, all three armour loadouts, elite squads, lone bosses
and mixed compositions; determinism holds. Suite runtime 622s (was 122s).

**Mirror sweeps, re-measured at depth 1 with the strategy biases deleted:**

| | Team A / B | rounds | Atac / Defensa / Focus |
|---|---|---|---|
| 2v2 @ budget 6 | 49.8 / 49.9 | **4.74** | 30222 / 8049 / 5434 |
| 3v3 @ budget 6 | 51.5 / 48.4 | **5.05** | 29067 / 7419 / 5237 |

Two results worth keeping:

- **Mirrors stayed symmetric** (49.8/49.9) with strategies removed, which is the
  check that mattered — a rotating Aggro/Power/Protect assignment could have
  been holding team balance together, and it wasn't.
- **Fights got SHORTER, back inside the target.** 5.00 → 4.74 (2v2) and 5.40 →
  5.05 (3v3). Stronger play ends fights sooner, which partly pays back the
  duration cost of the defense buffs.

Kit spread (2v2 / 3v3), against the depth-0 figures measured before the AI
rebuild:

| kit | now | before |
|---|---|---|
| Mestre d'Armes | 58.2 / 52.6 | 54.8 / 51.6 |
| Berserk | 54.3 / 51.2 | 57.0 / 54.3 |
| Màgia volcànica | 51.6 / 50.9 | 48.8 / 49.9 |
| Enginyer | 47.3 / 52.9 | 48.6 / 53.8 |
| **Earthbender** | **45.3 / 45.3** | 51.0 / 50.0 |
| **Nigromant** | **43.0 / 44.8** | 41.5 / 44.8 |

- **Earthbender lost ~6pp** and is now second-worst. The Protect strategy bias
  was propping it up: its wall used to be played because the AI was TOLD to
  prefer defenses, not because the position called for one. Worth a real look —
  this is the first honest reading of that kit.
- **Nigromant is still last, on every measurement ever taken** (41.5 → 43.0).
  The Sudari did not fix it; its damage cards are the problem.
- Barricada's win-correlation splits hard by party size (34.8% in 2v2, 56.2% in
  3v3) — cover is worth little when there is only one ally to stand behind.

## 11. Unpriced "esgotadora" cards (2026-09-13)

The daily fatigue budget is gone (fatigue is a DM-assigned level now; playing
cards costs none — `rules.md`). Every card is therefore free to play as often
as it is legal, including the ones the budget used to price above 1. They keep
working; they are simply unpriced until a replacement cost is chosen per card
(càrregues per rest, self-damage, a fatigue level for a true ultimate…). The
cost they carried, for the record:

| kit | card | was |
|---|---|---|
| enginyer-explosius | Barricada, Camp minat, Traca final | 2 |
| volcanic | Riu de lava, Erupció | 2 |
| nigromant | Invocar l'ombra de l'infern | 3 |
| berserk | Entrar en Fúria | 3 |
| ombres | Lligam d'ombres | 2 |
| mestre-armes | Atac encadenat | 2 |
| earthbender | Columna de terra 2, Presó de terra 3 | |
| gel | Paisatge congelat | 3 |
| horned-devil | Alè de l'infern 2, Flames de l'avern 4 | |
| bone-devil | Udol de terror | 2 |
| goblin-shaman | Possessió demoníaca 4, Pluja de flames 2 | |
| stone-golem | Terratrèmol, Enduriment | 2 |
| basilisk | Mirada petrificant, Cop de cua | 2 |
| goblin | Allau de la horda | 2 |
| wolf | Udol | 2 |

The 2026-09-13 mirror and balancer runs moved nothing measurable when these
went free (both within noise of `main`), so there is no urgency from balance —
the reason to price them is design: a card that was meant to be heroic should
cost something. Injecció d'adrenalina already made the move (its target gains a
fatigue level) because fatigue *was* its effect, not its price.

---

## 12. The measurement layer was cleaned up (2026-09-20)

Before any of §10's re-runs could mean anything, the instruments had to be
checked. They were not honest. The full account is in
`packages/simulator/README.md` and ARCHITECTURE "The measurement layer"; the
findings that change what earlier numbers MEAN:

**Every mirror sweep in the package was unseeded and shared no random numbers
between its arms.** `randomTeam` drew from bare `Math.random()`, so `withSeed`
did not bind. `experiment-berserk`, `-heal`, `-objects`, `-tuning`,
`-balance-pass` and the fatigue harnesses all compare content mutations, several
of them reading 1-2pp differences, off arms that were independent ±2pp samples.
**Any conclusion drawn from those scripts at 1-2pp is unsupported.** They now run
under common random numbers.

**`main.ts` graded depth-1 solves with depth-0 play.** Its parametric balancer
check built its replay engine without an `aiDepth`, which the engine defaults to
0 while the balancer prices at 1. Every cell it ever printed measured the gap
between two AI settings rather than anything about the solver.

**The kit analyzer's report card (§8) failed kits for statistical reasons.**
Three separate defects, all pushing the same way:

- requirement 1 compared level steps to a flat 3pp with no noise floor. At
  `--games 300` over a 12-cell matrix a level carried σ≈2.9pp and a step σ≈4.1pp,
  so a GENUINELY FLAT level read as a regression about one time in four — over
  four or five steps, a false ❌ on most kits. That is most of §8's table.
- requirement 3 subtracted a one-company baseline average from a three-company
  policy average (two different populations), and took its bar as the MAX of
  10-16 noisy samples, which inflates the bar by ~1.7σ (~5pp at that default)
  and takes it straight off the margin.
- the cells were calibrated against the WRONG PARTY: shapes were priced to 60%
  against four mains at full kit, then fought by a subject plus two mains and a
  complementary kit. The header printed "fair by construction" anyway.

All three are fixed; the default sample is now sized by the tightest claim on
the card (`gamesFor(3pp)` ≈ 2,200 per level).

**Six harnesses carried claims that had become false** — `ai-benchmark`'s header
still described three AIs and the deleted lean policy's learned table;
`experiment-heal` asserted "roll penalties are permanently gone" while the
fatigue ladder IS a flat roll penalty; `experiment-horde-armour` PRINTED a stale
solver promise as fact; `measure-verdict`/`measure-mix`/`measure-swing` (the
first two since deleted, §12.5) ran on
hand-written PVs from before the duration constraint (a 118-PV lone devil — the
exact sponge the budget now refuses). The measure-* harnesses run on solved
shapes now.

**The reference party was seven copies of `MAINS.slice(0, 4)`** — positional, so
adding or reordering a kit in `catalog.ts` silently re-based every number in the
package. Its Σ was emergent, not chosen: Σ20, and the docs' long-standing "Σ19"
is what you get if earthbender (4 cards) is in the slice.

**`tests/balance.test.ts` had a test that could not fail** (`expect(avg).toBeLessThan(40)`
against a 40-round cap, dressed as the duration guard), and the balancer's
difficulty block silently asserts nothing on any case that comes back
`durationCapped` — which the audit measured at 79/100. Both now report what they
actually checked.

### 12.1 What the corrected instruments immediately found

**The fight matrix does not have usable counts.** `probe-shapes.ts`, re-run
against the corrected calibration party, found only 2 of 17 candidates in band:

| shape | counts (player winrate) |
|---|---|
| horda (goblin) | 4× 82% · 5× 73% · 6× 87% · 8× **55%** (PV floor) · 10× 29% · 12× 20% |
| escamot (bone-devil) | 3× 92% · 4× 50% · **5× 61% ✓** · 6× 65% (PV floor) · 8× 36% |
| cap (basilisk) | **1× 66% ✓** · 2× 42% |
| mixt | 2× 49% · 3× 50% · 4× 73% · 6× 78% (PV floor) |

`horda` and `mixt` have NO count that lands near 60%: the winrate steps 32pp and
23pp between ADJACENT counts, straight over the band, because PV is an integer
lever and a goblin bottoms out at 1 PV. The analyzer now excludes them and says
so rather than averaging a free win into the headline. **This is a content
question** — the shapes need different species or a mixed-PV composition, not a
different count.

**The ally row is worth more than the kit.** The per-company spread reaches
**66pp** (8× goblin: 31% / 38% / 97%) and **78pp** (8× bone-devil). The three
`COMPANY` rows are not three seatings of one fight, they are three different
fights. Any kit verdict averaged over them is averaging a near-certain loss with
a free win, which is exactly the failure `FAIR_TOLERANCE` was added to stop —
one dimension down. Worth resolving before the §10 re-runs.

**`solveEncounter` can miss its target by ~20pp and set no flag.** 6× goblin
against an explicit party solved to pv7 and reported **79.7%** for a 60% request,
with neither `clamped` nor `durationCapped`. An independent re-measurement on a
fresh seed agrees with the solver (75.7%±1.1), so this is not a reporting bug —
the SEARCH lands in the wrong place, and the flags do not cover "the search
missed". The depth-1 verification pass is bounded to ±60% of the depth-0 answer
(`VERIFY_BRACKET`), so a bad depth-0 answer cannot be recovered. The web creator
warns on `|predicted − target| > 2σ` so a GM would see it; nothing else does.
Not touched — it is a balancer change, not a measurement one.

### 12.2 What this means for the rest of this document

Every number in §5, §5.1, §8 and §10.1 was produced by one or more of the
instruments above, before they were fixed. §10 already listed them for re-running
after the AI rebuild; they now need it for a second, independent reason. Take
§8's report card in particular as retracted rather than stale: its verdicts were
substantially statistical artefacts.

The re-runs should wait on §12.1 — a scoreboard built on a matrix where two of
four shapes are unusable and the ally row swings 66pp would just produce another
table to retract.

### 12.3 Hardened against content growth (2026-09-20)

Asked what would go stale as enemies and skills are added, and fixed the five
answers that fail SILENTLY. Each was verified against today's content first, and
four of the five were **already broken** before anything new was added:

| | found | now |
|---|---|---|
| **Empty matrix** | if every shape drifts out of band, `runCell` divides by `max(1, 0)` and reports **0% at every level** plus regressions everywhere — indistinguishable from a catastrophic kit. Two of four shapes are already out of band. | throws, naming each shape's gap and pointing at `probe-shapes.ts` |
| **Kits measured only as subjects** | `ombres` appeared in no `COMPANY` row — scored as a subject, never once as an ally | a fourth company row covers every kit; `bench.test.ts` fails if one falls out. Costs nothing: `runCell` splits a fixed budget across the matrix |
| **Creatures nothing is tested against** | 4 of 8 enemies (goblin-shaman, wolf, spined-devil, stone-golem) appear in no `SHAPE`, so no player kit ever faces them | `UNFIELDED_ENEMIES` requires a written reason per creature, asserted. Two are blocked on content (wolf, spined-devil can't reach an even fight at any count); two are real matrix gaps — **no caster-horde shape and no armoured-elite shape exist** |
| **`REFERENCE_LEVEL = 5`** | an absolute number in an ordinal system. nigromant and berserk have 6 cards and were fielded with 5, while every comment said "at full kit" | heroes build at FULL KIT; Σ20 → **Σ22**, and Σ now moves when a kit gains a card, loudly |
| **`DEAD_CARD = 0.02`** | flat, against a `1/N` neutral rate — 20% at 5 cards, 3.3% at 30, i.e. by ~30 cards the dead line sits at neutral and every card reads dead | a fraction of neutral (lands at 2.5-3.8% for today's kits, so it changes how the test AGES, not what it says now). The legality gate was also comparing per-decision counts against a combat count; it is now derived from the threshold |

**And the runtime constraint I had broken.** Measured 19.8 ms/combat at depth 1:
`DEFAULT_GAMES = 2400` put a kit at ~8 minutes and a full sweep at **~55 min**,
against §7.2's "under a minute per kit, a coffee break for a sweep, or it will
not get run after each edit". The thresholds differ by an order of magnitude
(requirement 1 needs ~2,200 combats for 3pp; requirement 3 needs ~50 for 20pp),
so `--games` now sizes the LEVEL SWEEP only and everything else is sized by its
own threshold or rides the sweep's combats — roughly half the cost for identical
verdicts. A sweep is still minutes rather than seconds; that is inherent to
depth-1 play and linear in both kit count and cards per kit.

**Σ20 → Σ22 re-bases everything again**, and the first re-probe shows how much
two cards are worth: 4× goblin priced at pv17 against the Σ20 party and **pv22**
against the Σ22 one.

**Still stale by design, named so it gets chosen rather than discovered:** the
`SHAPES` species and counts (hand-picked, re-priced by every content change);
the `FIELDED` maps in `main.ts` and `enemy-threat.test.ts`, which silently give
an unlisted creature 3 bodies; `kit-analyzer --all`, which gives one `3 @ 20 PV`;
and **enemy mode, which is not FAIR-calibrated at all** — its cells use whatever
`--count`/`--pv` say, so enemy-mode and player-mode numbers are not comparable.

### 12.4 The band is narrower than the step (2026-09-20)

Re-probing against the full-kit Σ22 party, **1 of 18 candidate counts lands
inside ±8pp of 60%** — and the two that landed against the Σ20 party no longer
do, which is itself the point: two extra cards moved every shape.

```
horda    4× 52%  5× 70%  6× 87%  8× 58%(PV floor)  10× 33%  12× 20%
escamot  3× 95%  4× 50%  5× 79%  6× 75%(PV floor)
cap      1× 49%  2× 42%
mixt     2× 44%  3× 66% ✓  4× 72%  6× 79%(PV floor)
```

**This is arithmetic, not bad luck.** Adjacent body counts sit **20-35pp apart**
and the band is 16pp wide; a step that size cannot reliably land in a target
that size. PV is meant to be the fine lever between counts, but it is an integer
that bottoms out at 1, so for small creatures the counts above the floor and
below it are two regimes with nothing between them. No amount of re-probing
fixes that.

Three ways out, all design decisions:

1. **Widen `FAIR_TOLERANCE`** to ~15pp so a step can land in it. One line,
   and it weakens what "a fair cell" claims.
2. **Give the solver a finer lever** — mixed PV within a group, so a shape can
   be "5 goblins, three at 8 PV and two at 7". Turns a 25pp step into a smooth
   one; a real balancer change.
3. **Stop requiring fairness at all** (probably the right answer). The analyzer
   exists to COMPARE kits, not to produce absolute winrates. If each shape's
   baseline is measured with the neutral stand-in and a subject's score is
   reported as a DELTA from that baseline, the shape never needs to sit at 60%
   — it only needs to be unsaturated (say 15-85%) and stable. That dissolves the
   in-band problem entirely and makes every shape usable, at the cost of one
   extra calibration measurement per shape (already computed — it is
   `SolvedShape.byCompany`).

Option 3 also fixes the companion problem: the per-company spread reaches
**66pp**, so even an "in band" shape is three or four different fights averaged
together. A per-(shape, company) baseline normalises that away as well.

### 12.5 The fairness requirement was never load-bearing (2026-09-20)

§12.4 framed the matrix problem as "the band is narrower than the step" and
listed three ways out. The third turned out to be the right one AND a
simplification: **nothing was ever compared to 60%.**

Walk the report card. Requirement 1 compares a level to the level below it.
Requirement 3 compares a policy to a restricted policy on the same cells.
Requirements 4/5 are plays over legality. Requirement 7 is per-card win
correlation. **Every verdict was already a delta**, and a delta does not care
where its cell sits — only that it is not pinned against an edge, where every
arm reads the same and differences compress to nothing.

So the ±8pp band is gone, replaced by a SATURATION test (20-80%) applied per
CELL rather than per shape — because a shape can average 58% while one of its
company rows sits at 96%, and that row measures nothing however good the average
looks. **4 usable cells became 15**, and all four shapes are back in the matrix:

```
horda    8× goblin pv1              baselines 30/36/95/71  → 3/4 cells (c3 saturated)
escamot  4× bone-devil pv14         baselines 60/40/51/47  → 4/4
cap      1× basilisk pv58           baselines 50/54/47/40  → 4/4
mixt     3× goblin + 1× horned-devil baselines 66/54/79/67 → 4/4
```

**And every score is now a delta from the cell's neutral baseline**, which also
kills the companion problem: the seating was worth up to 66pp, and it cancels in
both terms. A kit's headline reads "−11.4pp±1.8 vs a neutral kit in the same
seats" instead of "41.4%, of what?".

### 12.6 Three harnesses became one measurement (2026-09-20)

- **`measure-verdict.ts` deleted.** It asked "does restricting a strong player to
  attacks cost anything" with the same `restrictTo` mechanism, the same solved
  shapes and both sides at depth 1 — i.e. requirement 3's `onlyAttacks` arm,
  which is one of the five the analyzer already runs. It also hand-rolled the
  round loop instead of using `runCombat`. Its party-level verdict is now the
  analyzer's roll-up.
- **`measure-mix.ts` deleted.** Action-type mix and per-card legality rates on
  one shape; `ai-benchmark` §1 and §3 report both across every policy. Its one
  unique feature, picking which shape to measure on, is now `--shape` there.
- **`bench/cells.ts` extracted** from the analyzer. "Played out of the times it
  was LEGAL" had THREE independent implementations — three numbers that can
  disagree about one measurement, which is the failure mode this whole cleanup
  exists to prevent. There is one now, and the AI benchmark uses it.

**`ai-benchmark` was also still running on a hand-written encounter** (`6×
goblin N3 @15 PV + 1× diable d'os N3 @28`) from before the duration constraint.
It runs on solved shapes now, against the calibration party, so a number there
and a number on a report card mean the same thing.

**`FIELDED`** was a verbatim duplicate in `main.ts` and `enemy-threat.test.ts`
with a silent fallback of 3 bodies for any unlisted creature; it lives in
`bench/shapes.ts` and the guard fails if a creature is missing from it.

**Enemy mode is calibrated now.** Its PV is solved once at full kit against the
calibration party and then HELD FIXED while the level sweeps — re-solving per
level would absorb the level's effect into the hit points and make requirement 1
read flat for every creature. `--pv` is an override rather than a requirement.

### 12.7 Requirement 3 was scoring a one-seat handicap against a four-seat bar

Found by running the rebuilt analyzer: on both kits tried, the "toughest
mindless strategy" came back as a REPEATED CARD and the margin sat at
**−0.5pp** (berserk) and **−1.0pp** (earthbender) — i.e. thinking appeared to be
worth nothing, which contradicts every other measurement ever taken (§9 has
attack-spam at 0.6% winrate against the heuristic's 61.5%).

It was structural. `uniform` and the `onlyX` restrictions impoverish the WHOLE
SIDE — all four seats. `oneCard` is written against the team too, but a
companion does not own the subject's card, so `legal.find` misses and the
companion falls back to playing properly. **One seat of four is handicapped**,
three quarters of the party still plays well, the winrate barely moves — so that
family can never lose much, ALWAYS wins a max taken across both families, and
pins the reported margin near zero by construction.

The families are scored apart now: requirement 3 takes the whole-side bar
(≥20pp), and a new 3b reports the one-trick bar (≥5pp, roughly a quarter of the
side impoverished) as a FLAG, which is what §7.1 always called it.

Berserk's verdict with the split:

```
before  ❌ 3. política 58.3% vs (només Entrar en Fúria) 58.8%  → −0.5pp
after   ✅ 3. política 58.3% vs (només atacs)          40.3%  → +18.0pp ±4.0
        ❌ 3b. millor carta repetida (Entrar en Fúria) 58.8%  → −0.5pp [cal ≥5pp]
```

3b failing is a real finding rather than an artefact: one berserk seat spamming
Entrar en Fúria does as well as one playing properly. Whether that is a berserk
problem or a "one seat of four barely matters" problem is the next question, and
it needs the same treatment — a bar derived from how much a single seat CAN
move a fight, rather than a guessed 5pp.

## 13. Mestratge removed (2026-09-20)

**A roll is now the card's dice plus your level in its skill.** Mestratge added
`level − the card's unlock level` instead; it is gone by design decision.

What changed, mechanically: the first card of a skill used to add `level − 1`
and the newest card added `0`. Now every card of that skill adds the full
level. So late-unlock cards gained the most (`+level` instead of `+0`) and
early cards gained `+1`. What mestratge bought — old cards staying relevant as
their dice fell behind — is no longer bought by the roll; if that property is
wanted it has to come from the cards.

What did NOT change: both sides still add their own, so equal levels cancel
exactly and a same-level contest is arithmetically identical to one with no
bonus at all. Level remains a danger dial that raises damage per round without
adding PV, which is what the duration constraint relies on.

Touched: `resolution.ts` (`masteryBonus` → `skillLevelBonus`), the four contest
sites in `combat.ts`, the `Character.getSkillLevel` doc, `rules.md`'s
«Mestratge» section (now «El nivell entra a la tirada»), the in-app
`RULES_SUMMARY` (which never stated the roll's composition and does now), a
stale qualifier on Berserk's `Rugit de guerra` — that card already rolled the
full level, so the engine is now consistent with it — and two seam fixtures that
had used `unlockLevel: 10` to cancel the old bonus.

**Every balance number in this document is re-based again.** The 2026-08-08
measurement that justified mestratge (the Gòlem's level going from inert to a
+51.7pp ramp) was about level entering the roll AT ALL, which still holds; the
magnitudes do not. Re-run in the order §10 gives.

## 14. Why the harnesses kept rotting, and what now stops it (2026-09-20)

Two harnesses were found **crashing**, not merely stale: `experiment-berserk`
and `experiment-balance-pass` both mutate `furia-implacable`, a berserk card
that no longer exists (the level-6 card is `rugit-de-guerra`). They had been
dead since that rename and nothing noticed.

The root cause is not comment rot, it is cost:

```
13 of 19 harnesses had NO sample-size knob — GAMES was a hardcoded const
  experiment-objects  6000     experiment-seat   8000
  experiment-balance-pass 4000 experiment-heal   3000
  experiment-berserk  2500     …
```

Checking that `experiment-berserk` still compiled cost 2,500 combats, so nobody
ran it, so nobody saw it die. The three harnesses that stayed honest —
`kit-analyzer`, `ai-benchmark`, `measure-swing` — are exactly the ones that had
a `GAMES` override. **A harness nobody can run cheaply is one nobody runs, and
one nobody runs rots in silence.**

Three rules now, written into `CLAUDE.md`:

1. **Every harness reads its sample size through `bench/games.ts`**, and
   `tests/harnesses.test.ts` executes all of them at `GAMES=2` on every run. It
   checks no numbers — it checks that each still runs against today's content,
   so a renamed card or a moved log format breaks the build the day it happens.
   The harness list is DISCOVERED from `src/`, so a new script is covered the
   moment it exists rather than when someone remembers to register it.
2. **A one-off experiment is deleted once its conclusion is written down.**
   Eight were: `experiment-berserk`, `-balance-pass`, `-tuning`, `-objects`,
   `-heal`, `-horde-armour`, `-armour-absorption`, `-pv-curve`. Their findings
   are already in ARCHITECTURE/NEXT-STEPS; the scripts were scaffolding kept
   past its use. Repairing them, which is what this session did first, was the
   wrong instinct.
3. **A claim that can go stale must be executable** — asserted
   (`REFERENCE_SIGMA` throws), computed at print time (`gamesFor`), or dated in
   a doc. Never a measured number in a comment. "Measured: +51.7pp", "the
   balancer's hard solve promises 65%", "roll penalties are permanently gone"
   were each true once and silently became false.

## 15. Content pass (2026-09-20)

With the harness fast and honest, the open content items were worked through.
Every number below is from `kit-analyzer.ts` at 2,400 combats/level against the
neutral baseline, or `experiment-kit-threat.ts`.

### 15.1 The root cause of eleven "dead cards"

Eleven cards across six kits sat under 3% of the turns they were legal, and
almost all were walls, buries, marks and set-ups. They were not weak: the LEAF
EVALUATOR could not see them. `positionScore` read PV, bodies and fatigue, so
anything that did not immediately move one of those scored exactly zero and the
search never chose it.

Fixed with a new generic seam, `StatusBehavior.positionValue` — a status says
what holding it is worth to its holder, in the same unit as the PV term, and the
engine sums it without ever interpreting `data`. Priced conservatively: a first
pass at double the current value had Presó de terra correlating with LOSING.

**Dead cards: 11 → 0.**

### 15.2 A NEGATIVE result worth keeping: topK

`DEFAULT_LOOKAHEAD.topK = 3` prunes roughly half a six-card hand before the
search sees it, which looked like the obvious cause of "thinking ≈ attacking".
It is not. At `topK: 5`: draws 2% → **17.8%**, p90 rounds at the 40-round cap,
every Mestre d'Armes card correlating with losing. A wider search does not find
better cards, it finds STALLING LINES. The narrow pruning is load-bearing and
the comment in `lookahead.ts` now says so.

### 15.3 Card and creature changes

| what | why | result |
|---|---|---|
| **Llop**: claw 1d2 → 1d4, new L3 `Caça en manada` (defense −1 per living packmate) | the only creature that could NEVER reach an even fight at any count or level; 1d2 is below the floor flat armour sets | reaches an even fight at **4 bodies, L3** |
| **Goblin Xaman**: new L5 `Maledicció de sang` (cursed target takes +2 from every wound) | the only TRUNCATED kit — bodies needed still falling (12→4→3→2) when it ran out of cards; a shaman should multiply a horde, not be a fourth attacker | extends the ramp |
| **Nigromant**: `Xuclar la vida` → L1 and 1d6 → 2d6; mark/reap to L2-3 | its L1 was a Focus that only marks — a level-1 necromancer could not attack at all, at **−25.7pp**, the worst opening level in the game | **−11.5pp → −2.3pp** |
| **Mestre d'Armes**: `Estat de flux` and `Atac encadenat` speed −4/−2 → +1 | a Focus is cancelled if its actor takes damage first, so a Focus at −4 almost never resolves | both playable |
| **Mestre d'Armes**: `Atac encadenat` arms at ×2, not ×1 | arming cost a turn and bought nothing; the ladder only started paying on the turn after | 2.0% → in band |
| **Berserk**: `Aguantar el cop` aiWeight 0.6 → 1.1 | its payoff is a permanent attack buff the evaluator cannot see, while its cost is plainly visible; at 0.6 it was ranked out before the search considered it | in band |

### 15.4 Resolved by the roll change, not by content

- **Gòlem de Pedra's levels are no longer inert** — 12/12/4/4 bodies by level
  (§5.1 measured 4 at every level).
- **Diable Banyut's level regression is gone** — 3/4/3/3/3 bodies, no monotone
  worsening (§5.1 measured level 1 as its most dangerous).
- **Diable Espinós** reaches an even fight at 8 bodies (was "never").

### 15.5 Where the kits stand

```
Enginyer d'Explosius  +6.4pp      Berserk         -0.3pp
Mestre d'Armes        -1.2pp      Nigromant       -2.3pp
Earthbender           -6.7pp      Màgia volcànica -7.5pp
```

Spread 13.9pp, down from 19.1pp. Requirements 1, 2 and 4/5 pass for all six;
requirement 7 fails only for Enginyer's `Barricada` (24.7% win-when-played,
confounded as always).

### 15.6 STILL OPEN, and it is systemic

**Requirement 3 fails 6/6: restricting a side to attacks costs it nothing.**
Measured fairly — both sides thinking equally hard at depth 1, one merely with a
smaller strategy space — `onlyAttacks` scores within a few points of the full
policy on every kit. Random play (20.5%) and focus-only (6.6%) are far worse, so
the triangle is not wholly decoration; it is specifically ATTACK that is as good
as thought.

And the turtle is worse than that: a side restricted to DEFENSES beats free play
on two of four shapes (horda 61 vs 46, cap 68 vs 56) with a 0.8% draw rate, so
it is genuinely winning, not stalling — defenses in this game deal damage
through ripostes.

That is not a card problem and it is not a harness problem. It is either the
evaluator still mispricing a turn, or attack being too strong relative to
defense and focus at the level of the rules. It needs a design decision, so it
is left for one.

## 16. The AI policy bug hunt (2026-09-20)

§15.6 said "either the evaluator still misprices a turn, or attack is too strong
at the level of the rules". Before touching a die, the evaluator was audited for
places where it DISAGREES WITH THE RULES — which is a bug, and is fixable
without a design decision. Three were found.

| bug | what it did | fix |
|---|---|---|
| **`restrictTo` leaked through the topK pruner** | `bestResponse` pruned candidates by sampling `selectAction`, which knows nothing about the restriction, so a search restricted to attacks evaluated and played defenses — the "attacks only" arm was only ~74% attacks | every sample filtered through `allowed`, topped up from the allowed list |
| **The roll estimate ignored the actor's skill** | `expectedAttackTotal` and `bestDefenseTotal` summed the card's dice and forgot `skillLevelBonus`, so the AI priced every contest as if both sides were level 0 | both add it |
| **AoE was priced as single-target** | `estimateExpectedDamage` averaged damage over the enemies but never multiplied by how many the card actually hits | `(acc / enemies.length) * min(targetCount, enemies.length)` |

Requirement 3 failures went **5/6 → 1/6**, and 3b (the strategy-space margin)
from 1/6 passing to **6/6**.

### 16.1 The fix that was reverted, and why that is the interesting one

A fourth "bug" was found and fixed and then **deliberately reverted**: the
Defensa action weight is a FLAT constant sitting beside an attack weight that
scales with expected damage. Three action types priced in three different
currencies cannot all be right, and that is knowably wrong on inspection.

The fix — estimating prevented damage the way attack damage is estimated —
moved requirement 3 from **1/6 failing to 6/6**, then a different constant moved
it back, with the dice, the cards and the rules untouched throughout.

That is the whole problem, and it is why the weight is still there with a
comment on it: there is no ground truth to tune it against, so "fixing" it means
turning a knob until the tests go green, and a test that can be turned green by
a knob was not measuring the game. **The AI may be corrected where it disagrees
with the RULES. It may not be tuned until the tests pass.**

## 17. The circularity, and what replaced the part of it that could be

Requirement 3 asks "does thinking beat not thinking", and the thinking is done
by a hand-written evaluator. Requirement 4/5 asked "does the AI choose this
card", and the choosing was done by the same one. So both requirements judged
the game through the instrument being tuned, and the verdicts moved when the
instrument moved: the same eleven cards read DEAD (§15.1), then ALIVE, then dead
again, across three sessions in which not one die changed.

Not all of that is fixable. Requirement 3 is IRREDUCIBLY about a policy — "a
good player beats a bad one" has no meaning without a player — and the honest
response there is the one taken in §16.1: correct the AI where it contradicts
the rules, never where it contradicts a test.

Requirement 4/5 is not like that, and it has been replaced.

### 17.1 Leave-one-out ablation

> Stop asking "did the AI pick this card?" and ask "does the kit get worse
> without it?"

Play the kit. Play it again with the card **physically absent from the hand** —
`heroWithout` on the player side, `EnemySpec.without` on the enemy side — over
the same cells, from the same seeds. Subtract.

```
value(C) = winrate(kit) − winrate(kit without C)
```

**What this buys.** A play rate is a function of the EVALUATOR'S RANKING — edit
one `aiWeight` and it moves to whatever you like, which is exactly how
`Aguantar el cop` went from dead to alive at 0.6 → 1.1. An ablation is a
function of GAME OUTCOMES: if the AI plays a card more and the winrate does not
move, the card is doing nothing *when played*, and no constant can fake that.

**But the AI still plays both arms**, so the sign matters and only one direction
is safe:

- `value > 0` → a **lower bound** on what the card is worth, and the one claim
  that survives a better player. A larger choice set can never hurt someone who
  plays it optimally, so anyone playing at least this well gets at least this
  much from the card.
- `value ≈ 0` → **nothing is shown**, in either direction. This was first
  written as "dead: *this* AI gains nothing from it", and §17.5 then measured
  the noise floor and took that reading away — see there.
- `value < 0` → the AI plays **worse** for holding the card, which an optimal
  player never would. That is evidence about the AI, not the card (or a genuine
  trap option, tempting and bad, that a human would fall for too — the harness
  cannot tell them apart). So it is **flagged, not failed**, like requirement 7.

The first draft of this called a negative value a "trap" and failed the kit on
it. That was the circularity walking back in through the other door: it would
have failed content on an evaluator's mistake.

The skill LEVEL is held fixed, so the hero keeps every point of skill and loses
exactly one option; dropping the level too would remove the card and the +1 on
every roll that comes with it, and the difference would be mostly the bonus.
Cop desesperat is never removable — it is a rule, not a kit card.

No AI seam is involved. A first attempt added a `banned` list to the lookahead's
`legal()`; it was reverted, because a ban only binds the searcher (`spam` and
`uniform` would still play the card) and it is a second mechanism for one
concept. Removing the card from the hand binds everything, including a human.

### 17.2 What it costs, and what it cannot see

**SUB-ADDITIVITY.** Two cards that do the same job cover for each other, so each
ablates to nearly nothing while the function they share is load-bearing. Read a
dead verdict as *"nothing here needs THIS card"*, never *"this card does
nothing"*. The level sweep (requirement 1) removes cards in prefixes and is the
complement.

**POWER.** One card, in one seat of four, is a small intervention, and its
winrate effect is correspondingly small — the same limit requirement 1 already
lives with, which is why three of Mestre d'Armes' four level steps report "flat
(within noise)". Treating the two arms as independent samples put a **±2.9pp**
bar at 2σ around effects of ±3pp, so every verdict would have been decided by
noise. They are not independent: both met the same cells from the same seeds, so
the estimator is **paired per cell** (`pairedMatrixDelta`) and the enormous
between-cell spread cancels instead of being counted twice.

That buys precision from the PAIRING, not from the sample — the degrees of
freedom are `cells − 1`, about eleven — and it is honest in both directions: for
cards whose value genuinely swings between matchups the paired bar comes back
*wider* than the independent one, because the heterogeneity is real and the
binomial estimate was hiding it. The report therefore prints every card's value
with its worst and best cell, not just the average.

Cards the harness still cannot judge keep their declared exemption
(`AI_BLIND_CARDS`), but on a narrower claim than before: not "the AI undervalues
it" — which is no longer an excuse for anything — but "neither arm can use it,
so the subtraction is 0 − 0". Today that list holds one card, `Estat de flux`,
whose whole value is post-reveal card swaps.

### 17.3 What the first ablation sweep found (2026-09-20)

29 cards across the six main player kits, at 2,400 combats an arm.

**The play rate and the ablation are not measuring the same thing.** Mestre
d'Armes' `Atac llampec` is the most-played card in its kit — 40% of the turns
it is legal, the highest figure in the game — and ablates to **−2.0pp ± 5.0**.

Read that interval, not the point estimate: [−7.0, +3.0] contains zero and
contains the +2pp line, so the finding is **"this harness cannot tell what the
most-played card in the kit is worth"**, not "the kit is no better without it".
Those are different claims and only the first is supported. (An earlier draft of
this section stated the −2.0 as a result. It was not one.)

The width is not noise to be bought off with more combats — it is the card. It
is worth **−16pp against hordes and +12pp against the bone-devil squad**, a
28-point swing, and an average is a poor summary of a number shaped like that.
What the play rate never had any way to say is precisely this: that the card the
AI reaches for most is the one whose value the measurement is least sure of.

**The strong cards are burst and area, and their value is matchup-shaped:**

| card | value | worst cell | best cell |
|---|---|---|---|
| Traca final (Enginyer) | +10.4pp±9.6 | horda −16pp | mixt **+35pp** |
| Columna de terra (Earthbender) | +9.1pp±6.4 | horda −6pp | cap **+31pp** |
| Granada de fragmentació (Enginyer) | +8.1pp±10.2 | cap −13pp | horda **+44pp** |
| Pell d'obsidiana (Volcànica) | +6.7pp±3.0 | horda −1pp | horda +17pp |
| Xuclar la vida (Nigromant) | +5.3pp±6.3 | escamot −9pp | mixt +23pp |

A ±10pp error bar on a +8pp card is not a failure of the harness — it is the
card. Granada swings 57 points between its best and worst matchup, and an
average is the wrong summary of it. This is why the report prints worst and best
cells beside every value.

**A SYSTEMATIC CONFOUND: kit size.** Per-card values fall as kits grow, because
a bigger kit has more substitutes for whatever the removed card did.

```
Earthbender  4 cards   +9.1 +4.6 +4.1 +0.3      all positive
Enginyer     5 cards  +10.4 +8.1 -1.1 -1.4 -1.4
Volcànica    5 cards   +6.7 -0.1 -1.2 -2.4 -2.6
Nigromant    6 cards   +5.3 +0.5 -0.4 -1.2 -2.1 -2.9
Berserk      6 cards   +0.7 -0.0 -0.6 -0.7 -1.1 -1.7   nothing above noise
```

Earthbender is the only kit to pass 4/5 outright — and it is also the WEAKEST
kit in the game at −8.6pp. A kit can be internally coherent, every card pulling,
and still be badly under-powered. The old metric could not separate those two
questions; this one does, and the separation is the point.

**Berserk is the finding.** Six cards, not one distinguishable from zero, and it
is also the one kit failing 3b — restricting it to attacks costs it nothing.
Those are the same fact seen twice: a kit whose cards are interchangeable is a
kit where the strategy space does not matter. It is the next thing to design.

### 17.4 The defense buff was reverted, and did not need to come back

The triangle protocol (`intentions.md`: when a corner dominates, buff the corner
that beats it) had been applied in `bd70451` — six defense cards up a die step —
because attacks-only was tying free play. **It was the AI bugs, not the dice.**
With `bd70451` reverted and the §16 fixes in, free play beats attacks-only on
6/6 kits (+0.0 to +14.5pp) and clears the 10pp bar on 5/6.

So the buff is reverted and stays reverted. The one kit still failing 3b is
Berserk, at +0.0pp, which §17.3 says is a kit-design problem rather than a
system-wide one — and buffing every defense in the game to fix one kit is how
the dice drift away from the design.

### 17.5 The ablation was CALIBRATED, and it is underpowered (2026-09-20)

§17.3 was written on the assumption that the method works. It was never
checked. Two controls, both through the same `runMatrix` the analyzer uses:

**POSITIVE CONTROL — what is a seat even worth?** Strip the subject's whole kit;
he keeps his level, his gear and Cop desesperat and holds nothing else.

| kit | full | no cards | the whole seat |
|---|---|---|---|
| Mestre d'Armes | 55.5% | 43.6% | **+11.8pp ±8.9** |
| Berserk | 54.0% | 43.6% | **+10.3pp ±8.6** |
| Earthbender | 47.9% | 43.4% | **+4.5pp ±7.4** |

Everything a 5-6 card kit does, in one seat of four, is worth about **11 points
of party winrate**. That is the ceiling every card value lives under.

**NEGATIVE CONTROL — what does the instrument say when nothing is there?** The
same kit against itself on fresh dice, true difference zero by construction,
nine times:

```
-3.0  -1.2  +0.1  |  +0.5  +1.3  +0.1  |  -0.6  -0.6  -0.5
```

The honest noise floor is **±3pp**, and one of the nine excluded zero at 2σ
where 1-in-20 was expected — the paired estimator's eleven degrees of freedom
make its bars slightly optimistic, as advertised.

**So the typical card is below the detection threshold by construction.** ~11pp
of budget over 5 cards is ~2pp each against a ±3pp floor. The method sees a
kit's top one or two cards and nothing else.

Consequences, all of which invalidate part of §17.3 as first written:

- **Every "dead" verdict in the first sweep is unsupportable.** `DEAD_VALUE` was
  set at 2pp from two soft arguments, below a floor that had not been measured.
- **Every negative value in the sweep (−0.0 to −3.3pp) lies inside the null's
  own range.** "The AI plays worse for holding this card" has no support at any
  of those magnitudes. Demoting it from a failure to a flag was not enough.
- **What clears the floor is real, and it is a short list**: Traca final +10.4,
  Columna de terra +9.1, Granada +8.1, Pell d'obsidiana +6.7, Xuclar la vida
  +5.3, Mur de pedra +4.6, Cop de roca +4.1. Seven of 29 cards.

### 17.6 Four seats buys power and changes the question

The one lever that multiplies the intervention without buying combats: put the
subject in ALL FOUR seats. The noise floor is unchanged (±2-3pp) and the effects
grow several times over.

| card | 1 seat | 4 seats |
|---|---|---|
| Contraatac (M. d'Armes) | +0.5pp ±3.3 | **+17.8pp ±7.8** |
| Mur de pedra (Earthbender) | +4.6pp ±3.9 | **+8.0pp ±2.4** |
| Columna de terra | +9.1pp ±6.4 | +17.5pp ±12.1 |
| Tall precís | +0.1pp ±4.7 | +0.2pp ±4.4 |

**But it is not the same question, and Contraatac shows why.** Four seats is not
four times one seat: a ×4 scaling of the 1-seat interval tops out at +3.8pp,
and +17.8 is far outside it. Defenses covering the same attack SUM into a wall,
so four copies of a defense card are worth much more than four times one copy.
The mirror party systematically inflates cards that stack with themselves and
says nothing about how a card performs in the mixed party the game actually
has.

Also note the positive control saturates there — four kitless heroes win 0.1%,
so the seat-budget measurement is unusable in this design.

Useful as a SENSITIVITY probe ("does this card do anything at all, anywhere");
not a substitute for the 1-seat number.

**OPEN, and it is the requirement's own shape:** with ~11pp of budget and a 3pp
floor, an evenly balanced 5-card kit — 2.2pp a card, exactly what good design
would produce — is indistinguishable from a kit of nothings. Requirement 4/5
cannot both be an ablation on one seat and certify a card as dead. What IS
measurable is the seat budget (+11.8 vs +4.5 separates Mestre d'Armes from
Earthbender cleanly) and the list of cards certified above the floor. Needs a
design decision, so it is left for one.

## 18. Per-decision card value (2026-09-20)

§17.5 established that a leave-one-out ablation on one seat cannot resolve what
a card is worth, and named four compounding reasons. This is the instrument
that removes all four, in `bench/regret.ts` + `card-value.ts`.

> At a position where card C is legal, CLONE the position once per legal card,
> force that card, play the fight out, and score the end state.

|  | ablation (§17) | per-decision (this) |
|---|---|---|
| unit of observation | one fight | one **decision** |
| dilution | 1 seat of 4 | none — the question is about this play |
| pairing | same seed; arms are independent games by round 2 | the **identical position** |
| outcome | win/loss, 1 bit | PV differential, continuous |
| **cards resolved at 2σ** | **7 of 29** | **29 of 29** |
| cost | ~5 matrix runs/kit | ~10s/kit |

### 18.1 The outcome is not a weighting I invented

`positionScore` prices PV against bodies against fatigue with coefficients
somebody chose; scoring a card with it is the circularity this whole exercise
exists to escape. The outcome here is **my PV minus theirs**, and nothing else.
The rules make that one currency — damage IS the margin, and the margin is
applied to PV — so nobody weighted anything. It also encodes the win condition
for free: a side at 0 has lost, so a won fight scores the winner's surviving PV.

It is a SURROGATE, so every run prints **Spearman ρ against the same value
computed on win probability**: 0.70–1.00 across the six kits. Where it
disagrees is exactly where predicted — `Erupció` is −2.8 PV but +2.3pp win,
because AoE spreads damage that never becomes a kill.

### 18.2 Two statistics, and only one of them can say "dead"

**`value` is a RANKING, never a verdict.** It is a card's score minus the mean
of its alternatives, so across one hand the values **sum to ~zero by
arithmetic** — a kit of five superb cards still shows two or three negative,
because half a hand is always below its own average. Negative means "worse than
the other things you could do right now", and nothing else. (Writing this down
because the obvious misreading — "negative card, cut it" — would be the third
time today a relative number got reported as an absolute one.)

**`millor opció` is the absolute one**: how often the card was the best play
available. Its null is 1/k, not 0 — with k noisy candidates one wins by luck
about one time in k. A card well under its own null is one the game never wants
played. `Camp minat` is best **9%** of the time against a ~29% null.

### 18.3 The measurement is quoted AT A DEPTH

It was assumed the rollout policy's bias would difference away, since both
branches use it. Measured, and only half true: it cancels the LEVEL and not the
ORDERING. Mestre d'Armes at depth 0 ranks `Atac llampec` first and `Contraatac`
second; at depth 1 they swap, significantly. The bottom of the ranking is stable
at both.

That is not purely an artefact — a riposte pays off exactly to the extent that
the continuation keeps defending sensibly, so "worth more under better play" is
a real property of a card. But the number is quoted at a depth, and the default
is `CELL_AI`'s depth 1, the same the balancer prices encounters at.

**What is still AI-dependent, plainly:** the positions are reached by AI play
and the rollouts are continued by it. A card whose moment never arrives under
this policy will not be valued here. That is far weaker than "the AI declined to
pick it" — both branches are continued by the same policy, so its bias is
differenced away — but it is not zero, and no instrument that plays the game can
make it zero.

### 18.4 The first full run, 600 fights a kit

```
Enginyer   Granada +11.7  Traca +9.1  Barricada +1.2  Bomba -6.4  Camp minat -12.1
M. d'Armes Contraatac +7.1  Llampec +3.6  Tall -0.8  Encadenat -4.8  Flux -5.7
Nigromant  Xuclar +3.5  Sudari +2.4  Marca +1.1  Ombra -0.6  Putrefacció -2.6  Mà -3.0
Berserk    Fúria +7.0  Rugit +3.4  Espatlla +1.2  Temerari -0.8  Embat -3.7  Aguantar -4.9
Earthbender Columna +4.6  Mur +2.7  Roca +1.3  Presó -8.1
Volcànica  Obsidiana +5.0  Roca fosa +1.1  Guèiser -0.4  Erupció -2.8  Riu -5.3
```

Read as a ranking (§18.2). The two findings that are absolute:

- **`Camp minat` is the right play 9% of the time against a ~29% null.** The
  only card in the game clearly under its own null. It is also the card §15.1's
  `positionValue` pass was meant to rescue.
- **`Estat de flux` is −5.7 PV**, which CONFIRMS its `AI_BLIND_CARDS` exemption
  empirically rather than by assertion: for this AI, playing it is a wasted
  turn. The exemption says the harness cannot see its value, and now there is a
  number showing the harness sees a cost.

**Not yet done:** nothing has been changed on the strength of this. The
instrument is new, §17 was wrong twice before it was calibrated, and this one
has had exactly one calibration (the ρ check) rather than the two §17.5 got. A
positive control — force a card known to be worthless and confirm it prices
near the bottom — is still owed before any card is redesigned on these numbers.

### 18.5 Wired in, and the ablation deleted (2026-09-20)

Requirement 4/5 now READS the per-decision measure and can pass or fail again —
it spent one session reporting `➖` because the ablation could not support any
verdict. The ablation machinery is deleted outright, not merely unwired:
`heroWithout`, `pairedMatrixDelta`, `EnemySpec.without`, `FieldedGroup.without`
and the `without` plumbing through `setupFor` / `subjectPrintFor` / `warmJobsFor`
/ `WarmJob` all existed for it and nothing else. §17.5 and §17.6 are the durable
artifact; the machinery was scaffolding (CLAUDE.md).

**Its exit contribution was the independent cross-check** — the second
validation §18.4 said was owed, and the only thing that could provide it:

```
Enginyer ρ=0.80   M.Armes ρ=0.80   Nigromant ρ=0.49
Berserk  ρ=0.60   Earthbender ρ=1.00   Volcànica ρ=0.10     mean 0.63
```

**The top card agrees on 5 of 6 kits.** Enginyer's exception is Granada/Traca —
the top two under both, merely swapped, and the ablation never resolved Granada.
The low ρ sit exactly where the ablation had no power: below its floor its
ordering *is* noise, so disagreement there is the ablation being random. Where
it had its clearest signal, Earthbender, ρ=1.00.

### 18.6 The two-sided control (`tests/card-value.test.ts`)

Not a script — a TEST, because "is the instrument still calibrated?" is a
standing question and an executable claim is what CLAUDE.md asks for. Two cards
whose value is known without measuring anything are injected into a real hand:

- **NO-OP** — a Focus with no dice and no effects. Forfeits the turn.
- **OVERWHELMING** — 20d6 against every enemy, at speed 9. Ends the fight.

If the no-op is not last and the 20d6 not first, every number the instrument has
printed is worthless.

**Both near-misses were worth more than a passing test.**

1. `unlockLevel: 1` on a skill nobody has a level in made both controls silently
   ILLEGAL (`actionPlayable` gates on `skills.get(skillId) >= unlockLevel`). The
   first run happily priced the real kit and never mentioned the controls were
   absent — hence the "prices every card it was given" assertion.
2. With `targetCount` left at 1, the 20d6 priced **SECOND**, behind Contraatac.
   **The instrument was right and the control was wrong**: the solved horde is
   eight goblins at ONE PV, so a 70-point swing at one of them throws 69 points
   away, while a defense that guards against eight attackers is worth a lot.
   *Overkill is not power.*

### 18.7 Verdict shape, and two statistics that are not redundant

The verdict is the ABSOLUTE statistic only: `bestShare + 2σ < nullShare`.

`value` cannot be a verdict — it is a card's score minus the mean of its
alternatives, so across a hand the values **sum to ~zero by arithmetic** and
failing on it would flag half of every kit however well designed. The null for
`bestShare` is each card's **own**, summed as `mean(1/k)` over the positions it
actually faced, because k moves position to position as cards gate on targets
and statuses; ties are **shared**, so the shares sum to 1 rather than inflating
to ~127%.

They are not redundant. Earthbender's `Mur de pedra` is rarely the single best
play (19.4% against a 20% null) yet clearly above its hand's average (+2.7 PV):
a solid default that is seldom the sharpest choice. `Presó de terra` is both
below its null (10.9% ±0.8 vs 20%) and far below the hand average (−8.1 PV),
which is what a dead card looks like on both axes.

## 19. Harness bug sweep (2026-09-20)

Every claim below was CONFIRMED BY EXPERIMENT before anything was changed. Two
of the four suspicions were wrong, which is the point of running them.

### 19.1 CONFIRMED — requirement 3c's verdict was a report on the seed

3c compared a point estimate against its 5pp bar with no error term at all:
`trickMargin >= ONE_TRICK_MARGIN`. That is exactly what this file's own header
forbids — "a ❌ means go look, so the checks fail only on what is CLEARLY past
the line" — and requirements 3 and 3b both carry the `+ 2σ` that 3c lacked.

Re-run on five seeds with the game unchanged and only the dice moving:

```
Enginyer     PASSA  FALLA  PASSA  FALLA  PASSA    margin -3.7 … +7.1  (10.8pp wide)
Earthbender  PASSA  FALLA  PASSA  FALLA  FALLA    margin -5.8 … +8.5  (14.4pp wide)
```

**The experiment then found a second, larger fault the code reading had missed.**
Even with the error bar, the bars ran ±8-9pp against a 5pp bar. `gamesFor` says
why:

| req | bar | combats needed | combats run | |
|---|---|---|---|---|
| 3 | 20pp | 50 | 300 | ✅ 6× headroom |
| 3b | 10pp | 200 | 300 | ✅ 1.5× |
| **3c** | **5pp** | **800** | **300** | ❌ **2.7× short** |

This is the `DEAD_VALUE` mistake (§17.5) again, in a different requirement: a
threshold set finer than the instrument reading it. Fixed with `ONE_TRICK_GAMES
= gamesFor(ONE_TRICK_MARGIN)`, and the policy arm it subtracts raised to match —
otherwise the margin's error is dominated by whichever side was cheaper.

**Result: 3c 5/6 failing → 4/6, and the bars fell from ±4.0 to ±2.1-2.5.** The
under-powered version had been overstating every margin about twofold
(−7.5 → −3.4, −6.2 → −3.6, −6.2 → −3.2, −5.3 → −2.3).

A guard test now enforces `games >= gamesFor(bar)` for every requirement, and it
was verified to FAIL on the old constant before being kept.

### 19.2 The finding 3c was making all along, and it is about the AI

Four kits still fail, all with NEGATIVE margins: repeating ONE card in ONE seat
of four **beats** the AI playing freely. And it converges with the per-decision
measure — the winning one-trick is that kit's top-valued card on five of six:

| kit | 3c's winning one-trick | best card by per-decision value |
|---|---|---|
| Enginyer | Granada | Granada **+11.7** |
| Mestre d'Armes | Contraatac | Contraatac **+7.1** |
| Nigromant | Xuclar la vida | Xuclar la vida **+3.5** |
| Earthbender | Columna de terra | Columna de terra **+4.6** |
| Volcànica | Pell d'obsidiana | Pell d'obsidiana **+5.0** |
| Berserk | Atac temerari | Entrar en Fúria +7.0 (Temerari −0.8) |

Two independent instruments agreeing that **the AI under-plays its best card**.
That is a policy finding, not a content one, and it belongs with §16's bug hunt
rather than in any kit's design.

### 19.3 NOT A BUG — requirement 2's draws are real stalemates

Suspected: `winner()` returns null both at the round cap AND on mutual
annihilation (speed ties resolve simultaneously), so requirement 2 might be
counting mutual kills as "fights drag". With a median of 3 rounds and p90 of 6,
a 3% stalemate rate looked implausible.

Measured — draws classified by cause:

```
mestre-armes  4.2%   mutual 1   round cap 24
berserk       2.5%   mutual 1   round cap 14
earthbender   2.8%   mutual 0   round cap 17
```

**Overwhelmingly the round cap.** Requirement 2 measures what it claims, and its
6/6 failure is a real finding: fights are bimodal — they end in about three
rounds, or they never end at all. ~3% never end. That is a game problem to
chase, not a harness one.

### 19.4 NOT A BUG — the screen/verify cache keys

Suspected: `screen()` and the verify pass both key on `subjectPrintFor(subject,
level)`, which names neither the policy nor the seed offset, so different
policies looked like they would collide in the cache. They do not: `runMatrix`
builds the real key with `cellKey(subjectPrint, cell, perCell, policy,
seedOffset)`, which carries both.

### 19.5 A control harness for the requirements (`bench/control-kits.ts`)

Unit-testing a decision rule is not enough: a rule can be perfect and still be
fed the wrong number, and the wiring between "what was measured" and "what was
judged" is where 3c lost its error bar. So there are now two layers.

- **`tests/requirements.test.ts`** — the rules as pure functions
  (`marginVerdict`, `classifyStep`, `durationVerdict`), on synthetic numbers.
  Requirements 3, 3b and 3c now SHARE one margin rule with three bars; they used
  to compute it three times in three places, which is precisely how 3c came to
  be missing the error term its two neighbours had.
- **`tests/requirement-controls.test.ts`** — the whole pipeline, on subjects
  whose verdict follows from their CONSTRUCTION: a kit of identical cards, a kit
  holding a card that does nothing, a ladder kit that only improves.

**The harness found four faults in its first run, three of them real.**

1. **It found itself first.** `ALL_SKILLS` is an array but the lookups are Maps
   built from it at module load, so pushing a control kit satisfied `cardsOf`
   while leaving `unlockedActions` blind. Every control hero was built holding
   nothing but Cop desesperat, and the suite dutifully reported that a 1d6→7d6
   ladder buys no gain. Plausible numbers, every one about an empty hand. Fixed
   with a real `registerSkill` seam, and the harness now asserts its own premise
   before measuring anything.
2. **Overkill is not power, again.** The ladder scaled dice only, and the solved
   horde is eight goblins at ONE PV — so a bigger die is 69 points thrown away.
   Same trap as the 20d6 control card in §18.6. It scales targets too now.
3. **Decided positions were dragging every card toward its own null.** Once a
   fight's outcome is settled every branch plays to the same board and all
   candidates tie, contributing credit from a position that carried no
   information. ~17% of positions. They are dropped as the non-decisions they
   are.
4. **Splitting a tie punished duplicates.** Two IDENTICAL attacks each took half
   of every tie, landing both at 19.7% against a 25% null and reading DEAD while
   the no-op beside them escaped. The question is "is this card ever a right
   play", and a card tying for best is — so ties are credited in full. (Full
   credit had been tried first and inflated the total to 127%; that inflation
   was fault 3, not the ties.)

### 19.6 KNOWN GAP — requirements 3 and 3b measure the SIDE, not the subject

Both impoverish all four seats while the subject occupies one. On a kit with
exactly one distinct card — where thinking cannot possibly matter to the subject
— requirement 3 still measured **+13.5pp**, because the three companions are
calibration heroes with real kits.

That is not a bug: `cells.ts` documents the side-wide scope, and it is the only
fair form of "does thinking matter". But it means 3 and 3b are largely measuring
the FIXED COMPANY, which is identical for every subject, and that is why their
verdicts cluster. **Controlling them end-to-end needs a party of four control
kits, which the analyzer cannot field today.** Their shared rule is controlled;
this gap is not.

### 19.7 Two constants now set by control rather than by argument

- **`DEFAULT_REGRET.samples` 2 → 6.** `wasBest` needs the ranking within a
  position to be reliable, and a noisy score lets a worthless card top it by
  luck, dragging its share toward the null. At 2 samples the no-op scored 21.2%
  against a 25% null and escaped; at 6 it scored 17.7% and was caught.
- **The null is now self-calibrating**: `mean(topCount / candidates)` rather than
  `mean(1 / candidates)`. If m of k cards reach the top, a card picked at random
  is among them with probability m/k. With ties credited in full and m averaging
  ~1.5 on a four-card hand, a flat 1/k understated chance by half again and the
  line was too low to catch anything.

With all four corrections, the statistic discriminates sharply — Mestre d'Armes
against an 18% null: Contraatac **53.4%**, Atac llampec 28.8%, Tall precís
12.1% ❌, Atac encadenat 3.3% ❌, Estat de flux 2.3% ❌. Spearman ρ against win
probability is 1.00.

### 19.8 Control coverage, honestly (2026-09-20)

| requirement | rule control | pipeline: must FIRE | pipeline: must STAY SILENT |
|---|---|---|---|
| 1 monotonicity | ✅ 5 | ✅ ladder finds the gain | ✅ flat claims none · ✅ no false regression |
| 2 duration | ✅ 4 + ✅ 5 on the percentiles | ✅ turtle draws every fight | ✅ blitz ends on round one |
| 3 thinking | ✅ shared | ❌ §19.6 — buildable now, §19.11 | ❌ §19.6 — buildable now, §19.11 |
| 3b space | ✅ shared | ❌ §19.6 — buildable now, §19.11 | ❌ §19.6 — buildable now, §19.11 |
| 3c one-trick | ✅ shared | ✅ situational kit | ✅ flat kit |
| 4/5 dead cards | n/a | ✅ names the no-op | ✅ spares the real attacks |
| 7 correlation | ✅ 5 | ✅ flags the gated card | ✅ spares the ungated one |

Requirements 3, 3b and 3c share ONE `marginVerdict`, so the five controls on it
cover all three rules. Requirement 7 had no test of any kind before this and now
has five, including the one that matters: the same rate must NOT be flagged on a
sample too small to show it.

Requirements 2 and 7 were written on 2026-09-21 and left UNVERIFIED (the commit
that carried them says so in its own subject line). They were verified on
2026-09-22, and one of them had been passing for the wrong reason — §19.11.

### 19.9 Requirement 1's regression branch cannot be controlled, and why that matters

Two attempts to build a kit that gets WORSE at level 2, both instructive:

```
4d6 costing 6 PV    → level 2 measured +8.7pp  BETTER
8d6 costing 20 PV   → +10.4pp better still, and the AI plays it 37% of the time
```

A level adds an OPTION and a +1 on every roll. Both are pure gain, so under any
reasonable policy level N+1 is at least level N — **a regression is not
something a kit can be built to have.** Even a card that kills its own user is
net positive when it trades a 12-PV hero for 28 damage to a 41-PV boss. That is
a kamikaze, not a trap.

So the branch only ever fires on POLICY ERROR, and manufacturing a reliable one
needs a cost the depth-1 lookahead cannot see — damage arriving two or more
rounds later.

**This retro-explains the project's own history.** Every level regression this
harness ever reported (§5.1's Diable Banyut, §15.4's Gòlem de Pedra) was closed
by fixing the ROLL RULES or the AI, never by changing a card. That was read at
the time as luck. It was structural.

### 19.10 Still open

- **4/5 now fails 6/6**, naming 14 dead cards. First verdict from a controlled
  instrument — a CONTENT finding, not acted on.
- **Requirements 3 and 3b still have no pipeline control**, but the reason given
  in §19.6 expired the moment `allSeats` was built — see §19.11.

(The requirement 2 and requirement 7 entries that stood here were closed on
2026-09-22; §19.11.)

### 19.11 The two controls landed, and one had been green for the wrong reason (2026-09-22)

Both constructions from the 2026-09-21 WIP commit work, and the file is green at
17/17:

- **Requirement 2, the turtle.** Four seats of nothing-but-defence at **speed
  9**. The speed is the whole trick and it took three wrong diagnoses to find:
  a defence always self-guards, but guards register when the action RESOLVES
  and higher speed resolves first, so at speed 0 the goblins struck before the
  wall existed and a party behind 10d6 died in two rounds. Targeting was a red
  herring — `getActionTargetRequirement` hard-codes `'defense'` for any
  Defensa, so a handler cannot self-target anyway.
- **Requirement 7, the gated card.** 400 combats for that block, because the
  card is only legal from a losing position and therefore appears in roughly a
  fifth of fights, against an absolute 60-play gate.

**The req 2 control had been passing on a string that is always printed.** The
"fails for the RIGHT reason" assertion was `expect(duration.detail).toMatch(/taules/)`,
and `duration.detail` ALWAYS opens with `mediana N · p90 N · taules N%`. The
assertion was true of every kit ever measured, passing or failing; it could not
fail. It now reads only the section after `falla per:`, where the reasons that
actually tripped are named, and with that tightening the control still passes —
so the draw rate genuinely is what fires.

That is the same shape as the duration guard §12 found in `balance.test.ts`
(`expect(avg).toBeLessThan(40)` against a 40-round cap), and it is the second
time it has been found in this package. **A verdict's detail string is a
report, not an assertion surface**: match the part that only appears when the
thing being claimed happened.

What is NOT asserted, deliberately: that the length bars stayed silent. A fight
that runs to the 40-round cap every time is also, truthfully, the longest fight
the harness can measure, so the median and p90 bars fire too. The draw rate is
the reason that DISTINGUISHES "never ends" from "drags", and that is all the
control needs to show.

**One more assertion in the same file cannot fail**, and it is left standing on
purpose until it can be replaced by a real control rather than a weaker one:
`expect(spam.detail).toMatch(/COSTAT SENCER/)`, under the name "3 and 3b measure
the SIDE, so a flat subject does not zero their margin". That phrase is printed
unconditionally too, so the claim in the name is not checked by anything.

**And the reason §19.6 gives for that gap has expired.** It says controlling 3
and 3b end-to-end "needs a party of four control kits, which the analyzer cannot
field today" — but `allSeats` is exactly that party, and it was built one commit
ago for requirement 2. Running `flatKit` under `allSeats` puts four seats of
identical cards on the field, and then thinking cannot matter for the WHOLE
side, which is the scope requirements 3 and 3b are measured at. Two outcomes,
both worth having:

- the margin collapses → the must-FIRE control 3 and 3b have never had;
- the margin stays large → then with one distinct card in every seat, what
  remains is TARGET SELECTION, and that would be a sharper statement of §15.6's
  open problem than anything measured so far.

## 20. The AI was reviewed, and given a ladder to stand on (2026-09-22)

The AI is this package's instrument — every report card, every solved encounter
and every dead-card verdict is a number it produced by playing — and it had no
test of any kind. `ai-benchmark.ts` printed a table nobody asserted on.

### 20.1 How it actually works, in three layers

- **Depth 0 (`ai.ts`)** scores each card in isolation: an attack is worth
  `1 + 1.5 × expected damage` plus riders, a defence a **flat 1.5**, a focus a
  **flat 1.2**. `selectAction` then samples weighted-random with the weights
  raised to `aiSharpness` (**2** by default, so the gap between currencies is
  squared).
- **Depth 1 (`lookahead.ts`)** clones the combat per candidate card, resolves
  the round with everyone else at depth 0, and scores the leaf with
  `positionScore`. `samples: 2`, `passes: 1`, `topK: 3`; the team is coordinated
  by iterated best response.
- **Targeting (`pickResolveTargets`)** is a SEPARATE hand-written heuristic run
  at resolution time. **The search never chooses targets** — "this attack at X"
  and "this attack at Y" are not different plays to the AI.

Everything is measured at `MIRROR_DEPTH = 1` with `DEFAULT_LOOKAHEAD`.

### 20.2 The ladder (`bench/policies.ts`, `tests/ai-strength.test.ts`)

There is no ground truth for good play, and §16.1 forbids tuning until tests go
green. Two families of claim survive that, and they are what the new test
asserts:

- **Fixed stupidity.** `firstLegal`, `feeble` (always the weakest attack),
  `uniform`, `spam`. All defined from the CARDS, never from the AI — a baseline
  derived from the heuristic would drift every time the heuristic moved, and
  "the AI beats it" would stop meaning anything.
- **The compute ladder.** The same AI at more compute is a usable ground truth
  for the same AI at less, and no weight can move one rung without moving the
  other. Monotone (more search never plays worse) and CONVERGED (the next rung
  up cannot be shown to beat it) — the second is what makes a measurement a fact
  about the game rather than about a search budget.

Mirror matches, both seats, common random numbers. The convergence test carries
a sample-size guard: "we could not show a gap" is only admissible if the sample
could have SEEN the gap, which is §19.8's discipline for requirement 7 and the
trap §19.11's vacuous assertions fell into.

### 20.3 What the ladder says today

Measured 2026-09-22, 800 mirror combats a cell:

```
✅ depth1 beats firstLegal · feeble · uniform          (the floor)
✅ depth1 is NOT beaten by spam                        (not dominated by a one-liner)
✅ depth1 beats the raw heuristic                      (the search earns its 6× cost)
✅ depth1x does not play worse than depth1             (monotone)
❌ depth1x BEATS depth1 by +8.1pp (58.1%±1.7)          (NOT CONVERGED)
```

**Production is not converged, by 8 points.** Every number in this package is
therefore a fact about `samples: 2, passes: 1` and not only about the game.

(The `spam` row was ❌ before the pairing fix of §20.5 — production was losing
to "always the biggest attack" 45.3/54.7. The convergence row read 59.0%±1.7
then, and the 0.9pp it moved is noise: see §20.5b for how that nearly got
reported as a fix.)

Note this is measured in MIRROR play. The `ai-benchmark` strength column, which
drives the party against a solved shape, is confounded: the shape is solved
against a depth-1 party, so a depth-0 party is priced against a bar set for
someone else. Mirror is the honest comparison, and the two disagree — at 150
combats spam appeared to beat depth1 54.7/45.3, and at 800 it does not.

### 20.4 CONFIRMED BUG — the lookahead simulates the wrong round

`lookahead.playRound()` opens with `engine.prepareRound()`, but the search runs
from inside `planActions`, which the real engine only reaches AFTER its own
`prepareRound()`. Probed directly:

```
REAL    round=1  actors queued: Hero
ROLLOUT round=2  actors queued: Hero, Villain    ← Villain is stunned this round
```

So every rollout runs the round counter one ahead, discards
`skippingThisRound`, and rebuilds it from an ALREADY-DECREMENTED `skipTurns`.
**A character who is skipping the real round acts in every rollout.** The AI
cannot see the turn it just took away, and it plans against enemies who cannot
act. Prime suspect for §17.5's eleven control/prevention/set-up cards measuring
dead — `positionValue` fixed the evaluator's blindness to statuses, but a skip's
immediate effect is still invisible because the rollout undoes it.

This is a disagreement with the RULES, not a knob, so §16.1 permits fixing it.

**FIXED 2026-09-22** with a `roundPrepared` flag on `CombatEngine` (set by
`prepareRound`, cleared by `finishRound`, carried across `clone()`). The
lookahead now prepares only a round that has NOT begun — deeper recursions
still need it, since they run after `finishRound`. Locked by
`tests/ai-rules.test.ts`.

**And it moved the ladder by NOTHING: bit-identical, +9.0pp before and after.**
That is not the fix failing, it is the FIXTURE NOT EXERCISING IT. None of the
four kits in the mirror party — berserk, mestre-armes, volcanic, metge —
inflicts a stun, and `prepareRound` consumes no randomness, so removing the
duplicate call leaves the dice stream untouched. The bug only bites where
`skipTurns` is set: `ombres`, the basilisk, `stun_on_hit`, `self_stun`, and the
focus stun.

Two things follow, and both are worth more than the fix was.

- **A winrate could not have found this, and could not confirm it either.**
  That is the case for keeping a deterministic rules layer (§20.2's first
  family) rather than judging the AI only by how often it wins.
- **The ladder's mirror party does not exercise control effects at all**, so it
  is silent about exactly the cards §17.5 found measuring dead. A second
  fixture that fields stuns, silences and buries is worth building before
  reading much into a single mirror.

### 20.5 The search compares noisy estimates, unpaired

`samples: 2`, and `bestResponse` tests each candidate's 2-rollout average
against an incumbent `value` drawn from DIFFERENT randomness and never
refreshed. That is selection bias — the winner is often the luckiest candidate,
not the best — and there are no common random numbers across candidates.

It is the same error §12 and §19.7 fixed in the measurement layer ("screen
cheaply, then re-measure the winner on FRESH numbers"; "every arm runs on the
same seed"), still sitting inside the AI that produces the measurements.

The fix is not a knob: evaluate every candidate under the SAME seeds, so the
comparison is paired.

**DONE 2026-09-22.** One `pairSeed` per `bestResponse` call, shared by the
incumbent and every candidate on every pass, applied with `withSeed` inside
`evaluate`. Held FIXED across passes on purpose, so iterated best response
hill-climbs one fixed sampled objective rather than a surface that reshuffles
under it between passes.

**It made the AI markedly stronger, and it did NOT make it converged.** Those
are two different claims and it was easy to confuse them:

| mirror cell | before | after |
|---|---|---|
| depth1 vs `spam` | 45.3%±4.1 — **LOSING** | 53.0%±2.9 |
| depth1x vs `spam` | 51.3%±4.1 | 65.3%±2.7 |
| depth1 vs heuristic | 68.0%±3.8 | 78.7%±2.4 |
| depth1 vs `uniform` | 82.3%±3.1 | 89.0%±1.8 |
| **depth1x vs depth1** | **59.0%±1.7** | **58.1%±1.7** |

(Before at 150 combats a cell, after at 300; the depth1x-vs-depth1 row at 800
both times.)

Production stopped LOSING to a one-line strategy, which it had been doing. But
both rungs gained about equally, so the gap between them barely moved: the next
rung up still beats production by **~8pp**. Pairing was a real fix to a real
defect. It was not the explanation for §20.3, and §20.3 is still open.

### 20.5b The convergence test was itself too weak, and flipped on noise

Worth recording because it is the THIRD instance of the class, after §19.11's
two: an assertion that a noisy measurement passes by default.

The first draft asserted `margin − 2σ < bar` — "we cannot SHOW a gap of `bar`
or more". A wide interval passes that for free, and a sample-size guard does
not save it, because the guard checks `n` while the weakness is in the
DIRECTION of the inequality. It cost a false green immediately: across the
pairing change the gap went 59.0%±1.7 → 58.1%±1.7, the 2σ lower bound crossed
from 7.2pp to 4.6pp against a 5pp bar, and the test flipped red → green on
0.9pp of noise while an 8pp gap sat there untouched. It was briefly reported as
"pairing closed the convergence gap". It had not.

It is now an equivalence test — `margin + 2σ < bar`, the gap is clearly SMALLER
than the bar — which a wide interval fails, which is the right way round for a
calibration claim.

**The general rule, now three times learned: when a test asserts the ABSENCE of
a problem, check which way the error bar pushes it.** If noise makes it pass,
it is not a test.

### 20.6 Still open, from the review

- **The depth-0 heuristic prices three action types in three currencies**
  (damage-scaled attack, flat 1.5 defence, flat 1.2 focus) and then squares the
  gap via `aiSharpness`. Measured on the solved `horda` shape (150 combats,
  2026-09-22): it plays `Contraatac` on **0.6%** of the turns it is legal while
  the deep search plays it **50.8%**; defence is 14.2% of its decisions against
  the deep search's 50.5%. §16.1 rightly forbids tuning the constant — but the
  heuristic is the search's SEED, its `topK` PRUNER and the opponent model
  inside every rollout, so its opinion gates what the search is even allowed to
  consider.
- **`positionScore` never reads the round clock.** The engine ends at
  `maxRounds` with `winner: null` — a draw — but the evaluator short-circuits
  only on a wipeout, so a stalled board at round 39 with a PV lead scores like a
  win. This is exactly the gap the `topK: 3` comment names as the blocker for
  widening the search ("needs the leaf evaluator to price an unfinished fight
  first").
- **`topK`'s top-up walks the hand in INDEX ORDER.** When the heuristic's
  sampling does not fill `topK`, the remaining candidates are simply the
  lowest-indexed legal cards — so which cards the search considers depends in
  part on the order they are listed in the kit definition.
- **Targeting is unsearched** (§20.1). On a kit of identical cards, targeting is
  the only decision left, which is worth remembering when reading §19.6.

### 20.7 The strength bar, and the `topK` pruner that was costing 36 points (2026-09-22)

A bar was set on the AI's own strength, because "does it play well" had never
been asked with a number attached: **the engine's AI must beat every fixed
baseline at least 70% of the time** in mirror play (`STRENGTH_BAR`,
`tests/ai-strength.test.ts`). It was deliberately set ABOVE where the AI stood
— it beat `spam` 53.0%±2.9, a coin flip against a one-line strategy — and it is
allowed to come down only with a measurement saying where the ceiling is.

It did not need to come down. A budget sweep found the ceiling was not a ceiling
at all; it was the pruner.

```
config                    vs spam      vs uniform   vs heuristic   ms/combat
s2 p1 k3  (was default)    53.0%±2.9    89.0%±1.8    78.7%±2.4      2.2
s4 p2 k3                   65.3%±2.7    89.7%±1.8    81.3%±2.2      5.2
s8 p3 k3                   73.7%±2.5    90.0%±1.7    82.7%±2.2     11.1
s4 p2 k0  (no pruning)     94.0%±1.4    99.0%±0.6    97.3%±0.9     10.1
s8 p3 k0  (no pruning)     96.3%±1.1    98.7%±0.7    98.0%±0.8     22.3
```

**Removing the pruner is worth +36pp where tripling the sample is worth +9pp**,
and `s4 p1 k0` beats `s8 p3 k3` at half the cost. The mechanism is exactly the
one §20.6 flagged and did not connect: `topK` ranked candidates by SAMPLING
`selectAction` — the depth-0 heuristic, which plays `Contraatac` on 0.6% of the
turns it is legal against the full search's ~50%. A policy measured worse than
uniform random was deciding what the good policy could look at, and it was
excluding the defences.

Second sweep, to price the trade and to check the thing the old comment feared:

```
config                   winrate vs spam   taules   rondes   ms/combat
s2 p1 k3 (was default)    53.0%±2.9         0.0%      3.7      2.3
s2 p1 k0                  88.7%±1.8         0.0%      3.3      3.2
s4 p1 k0                  94.7%±1.3         0.0%      3.1      6.0
s4 p2 k0                  94.0%±1.4         0.0%      3.0     10.2
s2 p1 k6                  87.0%±1.9         0.0%      3.2      3.0
```

**`DEFAULT_LOOKAHEAD` and `CELL_AI` are now `{ depth: 1, samples: 4, passes: 1,
topK: 0 }`** — where the curve flattens; a second pass buys nothing once the
first can see the whole hand. Cost 6.0 ms against 2.3.

**The old comment's fear was real, and it has been paid for.** It recorded that
`topK: 5` once took draws from ~2% to 17.8% with p90 at the round cap, and said
the fix was "the leaf evaluator [pricing] an unfinished fight first". That is
the terminal check §20.6 added: a board at `maxRounds` is a DRAW, worth 0,
because that is what `winner()` returns. With it, **draws measure 0.0% at every
budget above, and fights get SHORTER** (3.7 → 3.1 rounds), not longer. The
pruning was not protecting the game from stalling lines; the evaluator's blind
spot was, and badly.

**Every number measured before this is a number about a crippled search.** The
report cards, the dead-card verdicts, the solved encounter PVs — all of it.

#### Two controls broke, and both broke because the AI got better

Not regressions; the premises expired.

- **Requirement 1 on the flat kit** now reports a gain (+13.8pp±6.2) where the
  control asserts it cannot have one. The control's reasoning was that four
  IDENTICAL cards leave only the +1-per-level roll bonus, and that requirement 1
  asks for more than that. With a search that converts the bonus into wins, it
  does not: **requirement 1 is satisfiable by the roll bonus alone, with zero
  card variety.** That is a real limitation of the requirement, not of the kit,
  and it wants saying out loud.
- **Requirement 7's gated card** is no longer flagged. `Desperate` is only legal
  once its holder is at a third of their PV, and the control relies on that
  correlating with losing — but a stronger party now wins those fights often
  enough that the rate is no longer clearly under 40%. The confound the control
  was built on got weaker.

Both need rebuilding against the new AI.

### 20.8 Iterating on the AI's LOGIC — what the search actually wants (2026-09-22)

With `topK` gone (§20.7) the production AI sits at ~93% against `spam`, so the
next gains have to come from logic rather than budget. Two changes tried, each
measured on fixed baselines the AI cannot influence, at 300-400 mirror combats a
cell.

**1. Exact contest expectations, replacing a linear stand-in. KEPT.**

`estimateExpectedDamage` blended `pWin × (meanA − meanD − armour)` with
`pWin = 0.5 + 0.08 × gap`, a slope its own comment called uncalibrated. Damage
is the MARGIN, so the honest quantity is `E[max(0, A − D − armour)]` over the
two totals' real distributions, and the dice are small enough to convolve
exactly and cache (`diceDistribution`, `expectedExcess` in `dice.ts`).
Evaluating at the means is wrong in the direction that matters: 2d6 against
1d12 and 2d6 against a flat 6.5 share an average gap and not their odds.

Strength: **unchanged within noise** (heuristic vs spam 28.3% → 24.3%,
production vs spam 94.7% → 93.3%). Kept on correctness grounds — it removes a
free parameter rather than adding one — but it bought nothing measurable, and
that is worth saying rather than implying otherwise. If anything it nudges
attacks UP, since `E[max(0, ·)]` exceeds the max of the means.

**2. Pricing a defense in expected PV prevented. TRIED AND REVERTED.**

This is §17's reverted fix, attempted again now that there is a non-circular
way to judge it: `w = 1 + 1.5 × estimatePreventedDamage(...)`, the exact mirror
of what an attack is worth, judged against baselines rather than against a
content requirement.

```
                               vs spam        vs firstLegal
depth-0 heuristic, before       24.3%±2.5      47.7%±2.9
depth-0 heuristic, after        18.8%±2.0      72.8%±2.2     ← much better alone
depth-1 PRODUCTION, before      93.3%±1.4      95.7%±1.2
depth-1 PRODUCTION, after       78.0%±2.1      91.3%±1.4     ← 15pp WORSE
```

**The heuristic played visibly better and the search that consumes it played
visibly worse**, and that is the finding worth keeping:

> Since `topK` was removed, `actionWeight` no longer chooses production's cards.
> Its remaining job is to be the OPPONENT MODEL inside every rollout — and a
> model that defends like a good player is a worse PREDICTOR of the field than
> one that mostly swings. What that function owes the search is accuracy, not
> quality.

§17 was right that the flat 1.5 could not be fixed by argument, and right to
revert it. It was wrong about why: the problem is not that there is no ground
truth, it is that "plays better" and "models the opponent better" are different
objectives and this function serves the second.

**Consequence for anyone reading `ai.ts`:** do not "fix" the defense weight
without measuring the SEARCH. Improving the heuristic in isolation is not
evidence, and here it was actively misleading.

### 20.9 Two controls repaired, both broken BY the AI getting better (2026-09-22)

Neither was a regression. In both cases the control's premise had quietly
depended on the AI being weak, and §20.7 took that away.

**Requirement 1's flat kit — the assertion now runs the other way.** It
asserted requirement 1 must find NO gain on four identical cards, reasoning
that a level only adds an option already held. That forgot the other half of
what a level is: `resolution.ts` says a roll is the card's dice PLUS your level
in its skill, so four identical cards at level 4 hit far harder than at level 1.
The old assertion passed only because the AI could not convert the bonus into
wins; once it could, the kit measured +13.8pp±6.2 and the control failed.

The honest version is a LIMITATION, now asserted so it cannot be forgotten:
**requirement 1 cannot separate "the cards get better" from "every roll gets
+1", and a kit of four identical cards passes it.** A ✅ on requirement 1 is not
evidence that a kit's levels buy any VARIETY, and every green in §5's scoreboard
should be read with that in mind.

**Requirement 7's gated card — the gate moved from a third of PV to a fifth.**
`Desperate` is legal only once its holder is nearly dead, and the control needs
that to correlate with losing. A party that now wins most of its fights wins
plenty of them after one hero dips to 4 PV out of 12, so the card's
win-when-played no longer sat clearly under the 40% floor. At 12 PV a fifth is
2 — a hero about to die. The gates stay complementary (leave a band where
neither card is legal and the hero falls through to `Cop desesperat`), and that
block runs 800 fights to clear the absolute 60-play floor.

**The general lesson, and it will recur:** a control whose subject is defined by
a THRESHOLD ON THE GAME STATE ("nearly dead", "behind on PV") is calibrated
against how well the AI plays, and will drift every time the AI changes.
Controls defined by CONSTRUCTION — identical cards, a card that does nothing, a
ladder that only improves — did not move at all through any of this.

### 20.10 The AI is at the ceiling of its own design (2026-09-22)

After §20.7 the question was whether anything was left. The answer, measured
three ways, is: **not from budget, and not from weights.**

**Budget is exhausted.** Production played against much bigger searches of the
same design, 300 mirror combats a cell:

```
production vs s8  p2 k0   45.7%±2.9    (8× the cost)
production vs s16 p3 k0   50.3%±2.9   (32× the cost)
production vs s32 p3 k0   47.7%±2.9   (85× the cost)
```

All within ~1σ of even, and NON-MONOTONIC — s8 reads below s16, which is the
signature of noise rather than a gap. An 85× search cannot beat `s4 p1 k0`.

**Weights are exhausted.** Every variant played directly against current
production, 400 mirror combats a cell. The `unchanged` cell is the control and
it landed on exactly 50.0%, so "level" here means tested-and-level rather than
untested:

```
bodies 12 (was 6)                   47.4%±2.5   level
bodies 18                           47.0%±2.5   level
bodies 3                            51.6%±2.5   level
rollout opponent sharpness 1        48.4%±2.5   level
rollout opponent sharpness 0.5      46.1%±2.5   level
rollout opponent sharpness 4        50.0%±2.5   level
pv 25 (terminal relatively bigger)  49.6%±2.5   level
pv 5  (terminal relatively smaller) 51.5%±2.5   level
status 20                           51.8%±2.5   level
unchanged (CONTROL)                 50.0%±2.5   level
```

Note `bodies` moved the WRONG WAY from the theory: the argument for raising it
was action economy (finishing a 1-PV enemy scores ~1.1 where chipping 12 PV off
a healthy one scores ~2.5, so the evaluator prefers spreading damage to
killing), and 12 and 18 both measured slightly worse while 3 measured slightly
better. `pickResolveTargets` already prioritises kills, so the evaluator does
not need to.

#### Why none of it mattered, and what that implies

**Fights last about three rounds, and the lookahead is depth 1.** A large share
of rollouts therefore END the fight, where `positionScore` returns ±100 and
every positional term is irrelevant. The leaf evaluator is mostly reading
terminal outcomes, not positions — so it is close to a win-probability
estimate already, which is why rescaling its terms by 3× changes nothing, and
why more samples of the same estimate change nothing either.

That is also exactly why `topK` was worth **+36pp** while every scoring weight
is worth **zero**: what the search is short of is not a better ranking, it is
CANDIDATES. Removing the pruner restored the missing half of the card space.

**The one part of the candidate space still unexplored is TARGETS.**
`pickResolveTargets` is a fixed heuristic run at resolution time, so "this
attack at X" and "this attack at Y" are the same play to the search. That is
the remaining structural lever, and the only hypothesis left with a mechanism
behind it. A cheap form exists — optimise cards first, then run a second pass
over targets for the chosen cards, which costs additively rather than
multiplicatively.

**Until then: no more gains. The parameter space is closed.**

### 20.11 THE BIAS IS IN THE OPPONENT MODEL, NOT THE WEIGHTS (2026-09-22)

Strength and bias are different questions, and §20.10 only answered the first.
Every weight variant measured LEVEL on winrate — but an instrument can be
exactly as strong while systematically under-playing a whole class of card, and
every content verdict here is downstream of what the AI PLAYS. So: sweep the
modelling choices and watch the play mix, not the winrate. Measured with
`bench/cells.ts`'s instrument (play rate conditioned on LEGALITY, the package's
one canonical definition), 250 combats a variant.

**The evaluator weights are clean.** A 7× swing in `status`, a 6× swing in
`bodies`, a 5× swing in `pv`:

```
variant           Atac    Defensa     Focus
baseline    64.1%±0.5  18.4%±0.4  17.5%±0.4
status 3    64.3%±0.5  19.5%±0.4  16.3%±0.4
status 20   62.2%±0.5  20.5%±0.4  17.4%±0.4
bodies 3    65.4%±0.4  18.0%±0.4  16.6%±0.3
bodies 18   64.2%±0.5  19.4%±0.4  16.4%±0.4
pv 5        62.7%±0.5  19.1%±0.4  18.2%±0.4
pv 25       64.5%±0.4  18.4%±0.4  17.2%±0.3
```

No card's usage moves more than **4.2pp**. No verdict in this package rests on
an evaluator weight — which is also why they all measured strength-level.

**The rollout opponent model is NOT clean.**

```
variant                  Atac    Defensa     Focus
rollout opp sharp 0.5  59.2%±0.6  20.3%±0.5  20.5%±0.5
rollout opp sharp 1    62.8%±0.5  18.0%±0.4  19.2%±0.4
baseline (sharp 2)     64.1%±0.5  18.4%±0.4  17.5%±0.4
rollout opp sharp 4    64.4%±0.4  18.9%±0.3  16.8%±0.3
rollout opp sharp 8    65.9%±0.4  17.5%±0.3  16.6%±0.3

per card, spread across opponent models:
  Tall precís       41.9% → 53.1%   11.2pp
  Entrar en Fúria    1.1% →  9.2%    8.1pp    (8× relative)
  Estat de flux      0.8% →  7.2%    6.3pp    (9× relative)
  Contraatac        10.2% → 15.9%    5.7pp
  Pell d'obsidiana   9.7% → 15.2%    5.5pp
  Atac encadenat     1.7% →  7.2%    5.5pp    (4× relative)
```

Attack share moves MONOTONICALLY with how greedy the imagined enemy is, and
individual cards move 4–9× in relative terms on a choice nobody can justify
from the rules. `aiSharpness: 2` was picked to make the AI PLAY like a human;
a rollout's job is not to play, it is to INTEGRATE over the card the enemy has
face down. Those are different jobs — §20.8's lesson, arriving a second time.

**And look at WHICH cards.** `Entrar en Fúria`, `Estat de flux` and
`Atac encadenat` are among the ones requirement 4/5 calls DEAD (§19.10: "4/5 now
fails 6/6, naming 14 dead cards"). A set-up card pays off against a RANGE of
enemy replies; a greedy model collapses every rollout onto one line, so the
payoff either never appears or is always punished. Soften the model and the
value comes back.

> **The 14 dead cards are not safe to act on.** Their verdict is partly a
> property of the instrument, and the instrument's most biased knob is pointed
> straight at them.

#### What to do about it

- **A verdict that flips with the opponent model is not a verdict.** Requirement
  4/5 should measure each card under SEVERAL opponent models and call a card
  dead only if it is dead under all of them — the robustness check is the fix,
  not a better guess at the one true sharpness.
- A softer rollout opponent is the better default on principle (a face-down
  card is a distribution, not a line), and `rolloutSharpness` 1 measured level
  on strength (48.4%±2.5). But changing it only MOVES the bias unless the
  robustness check goes in too.
- Note what this does NOT say: it does not say those cards are fine. It says we
  have not measured them with an instrument that can tell.

## 21. Mutation testing: can these tests actually FAIL? (2026-09-22)

Three assertions have now been found in this package that could not fail at
all — `/taules/` matched against a string that always contains it, `COSTAT
SENCER` likewise (§19.11), and a convergence check written as `margin − 2σ <
bar`, which any noisy sample passes for free (§20.5b). All three were found by
READING them. Reading does not scale, and the suite is the thing every content
decision rests on.

Mutation testing is the standard answer for this and it is cheap here:
`src/mutation.ts` injects a fault, runs the fast tests, and reports the mutant
as KILLED or SURVIVED. A survivor is a direct indictment of a missing test.

**The mutants are faults this project has actually shipped, in the lines they
shipped in** — not random operator flips, which would score well and protect
nothing. Dropping `marginVerdict`'s error term (§19.1), removing
`classifyStep`'s noise floor (§12), judging a card on a sample too small to
judge it (§19), calling a card dead on the point estimate (§17.5), zeroing
`stderr`, making `gamesFor` return 1.

**Affordable by construction.** Mutants land in the DECISION RULES, which are
pure functions over synthetic numbers, so the kill set is the five millisecond
files. No sweep runs per mutant; the whole sweep is seconds. The expensive
pipeline controls are deliberately NOT in the kill set — a mutation harness
nobody can afford to run is one nobody runs.

It asserts its own premise: if the kill set does not pass UNMUTATED it refuses
to score, because every mutant would otherwise read as killed by a failure that
was already there.

### 21.1 What the first run found

**Before producing a single score, the premise guard caught a real breakage.**
`bench.test.ts`'s "4/5 fails on the ABSOLUTE statistic" scans the SOURCE for
`if (<expr>) dead.push` and required `<expr>` to name `bestShare` and
`nullShare`. The §20.11 robustness refactor moved the statistic one line up
into `deadIn`, so the test failed on a change that preserved the property
exactly — a test asserting code SHAPE rather than behaviour. It now expands the
guard's identifiers one level, and gained the half that was missing: an
explicit check that the verdict never reaches `.value` (a within-hand ranking
summing to ~zero, which is what the original comment was about).

**Then one mutant survived, and it was the one that mattered.**

```
💀 SURVIVED  dead cards: call a card dead on the point estimate (§17.5)
```

Deleting the error term from requirement 4/5's deadness rule passed every fast
test. The cause was structural: `marginVerdict`, `classifyStep`,
`durationVerdict` and `correlatesWithLosing` are all pure exported functions
with rule tests — deadness was the one decision still INLINE in `analyze`, so
no unit test could reach it.

Fixed by extracting `isDeadCard(bestShare, bestStderr, nullShare)` and giving
it four tests, including the mutant itself (a card with the same point estimate
and null as a dead one, but an interval wide enough to reach it, must NOT be
flagged) and a monotonicity property: a noisier measurement must never flag
MORE cards. **Score now 9/9.**

### 21.2 Why this matters for the card verdicts

The "14 dead cards" of §19.10 were resting on a rule that had **no unit test**
— one edit from silently losing its error bar — while §20.11 shows those same
cards swing 4–9× with the opponent model. Two independent reasons the verdicts
were not safe to act on, neither of which was visible from the report card.

### 21.3 Where to take it next

- **Extend the kill set upward.** Mutants in `bench/cells.ts` and
  `bench/regret.ts` (the measurement layer, not just the judgement layer) need
  a control that is cheap enough to be in the kill set.
- **Engine mutants need a rebuild per mutant** — the simulator consumes built
  `dist/`. Worth it for `resolution.ts`, which is where the rules themselves
  live.
- **Make the score a test** once it is stable, so a new requirement cannot ship
  with an unfailable assertion.

### 21.4 Extended to the measurement layer and the engine (2026-09-22)

Nine mutants became fifteen. The new ones leave the JUDGEMENT layer, which is
where the easy wins were, for the two places a fault would be most expensive:

- **`bench/regret.ts`** — the measurement itself. Decided positions no longer
  dropped (§19.5 fault 3, which dragged every card toward its own null), a tie
  for best split instead of credited (fault 4, which made two identical attacks
  both read dead), and the null losing its self-calibration (§19.7, where a
  flat `1/k` understated chance by half again).
- **`engine/src/resolution.ts`** — where the RULES live. A tie going to the
  attacker instead of holding for the defense; armour ceasing to reduce damage;
  every contest teaching instead of only close ones. A suite that cannot notice
  "a tie now goes to the attacker" is not guarding the game at all.

Engine mutants are marked `rebuild`: the simulator consumes the engine as built
`dist/`, so each costs a ~10s rebuild. That is the price of covering the rules,
and it is worth paying.

### 21.5 Why the score is a SCRIPT and not a test

`pnpm --filter @pimpampum/simulator mutation`, deliberately outside the suite.

The harness edits the package's own source in place, and the suite now runs
files in PARALLEL FORKS (§20.7's cost work). A mutation test would therefore be
rewriting the instrument while sibling workers import it — producing numbers
nobody could explain, which is precisely the failure this whole layer exists to
prevent. `src/mutation.ts` refuses to run when `VITEST` is set, so
`harnesses.test.ts` still proves it executes and nothing more.

Making it a test safely means mutating a COPY, and a copy outside the workspace
cannot resolve the package's `node_modules`. That is the real blocker, and it is
recorded here rather than worked around badly.

**So the discipline is procedural, not enforced:** run the mutation script when
adding or changing a REQUIREMENT, the same way `/analyze` is run when changing
content. If it ever becomes enforceable cheaply, it should be.

## 22. Exploitability and the strategy triangle (2026-09-22)

Two standard evaluations this package has never done, both about whether the
INSTRUMENT can be trusted rather than whether the game is good.
`src/exploitability.ts`, `pnpm --filter @pimpampum/simulator exploitability`.

**Exploitability.** Beating fixed stupidity (`ai-strength.test.ts`) is a floor.
The standard measure of a game agent is the strength of a BEST RESPONSE — a
counter-strategy chosen knowing the agent. A true one needs training; what is
affordable is a best response over a SIMPLE POLICY CLASS: every "repeat one
card" policy plus every action-type restriction, maximised over the class. A
weak bound, but a real one, and cheap because `bench/cells.ts` already builds
that class. A policy nobody can exploit measures the game; one with a hole
measures its own hole, and every card verdict downstream inherits it.

**The triangle.** `intentions.md` claims Power > Protect > Aggro — a CYCLE, and
a single strength number cannot express one. (The Elo literature is explicit
that ratings collapse exactly the intransitivity that makes such a design
interesting.) So it is read off the pairwise matrix of the three restricted
policies, which are precisely those three strategies.

(Since 2026-10-03 it IS asserted — set-level requirement 4, on LEANING
styles rather than hard restrictions; see §27.3.) It was REPORTED, not asserted. §15.6 already measured that the triangle does not
hold — restricting a side to attacks costs it nothing — and a test insisting on
it would be arguing with its own measurement. The harness prints which of the
three relations exist and whether they close into a cycle, so the design's
central claim stops being a thing that is remembered and becomes a thing that
is measured.

### 22.1 First results: not exploitable, and the triangle is not a triangle (2026-09-22)

200 mirror combats a cell, against the post-§20.7 AI.

**Exploitability: none found.** The best response over the whole simple class —
21 policies, every single-card repeat plus every type restriction — scores
**49.5%±3.5** against production. Nothing in that class beats it. A weak bound
by construction (a trained best response could do better), but the obvious
holes are not there, and that is what the bound was for.

**The triangle is a strict ORDER, not a cycle.**

```
row vs column, row's winrate      Aggro      Protect      Power
   Aggro   (només atacs)            —       57.3%±3.5   30.3%±3.2
   Protect (només defenses)     43.3%±3.5       —       24.3%±3.0
   Power   (només focus)        70.0%±3.2   74.0%±3.1       —
```

**Power > Aggro > Protect**, every relation outside its error bar, no cycle.
`intentions.md` asks for Power > Protect > Aggro > Power. What is measured is
Power beating BOTH others decisively and Protect coming last — the opposite of
the design's middle term.

This also overturns §15.6, which had it the other way round ("a side restricted
to DEFENSES beats free play on two of four shapes"). That was measured through
the `topK: 3` AI, which almost never defended and therefore never found out
what defending was worth; with the pruner gone the ordering reverses. One more
number that was really about the instrument.

**Two things follow, and they are different.**

- For the INSTRUMENT: this is now a standing measurement rather than a
  remembered claim, and it is not exploitable, so it can be trusted to report
  the ordering honestly.
- For the GAME: the central design intention of `intentions.md` does not hold.
  Focus-only play dominates, defence-only play is dominated by everything. That
  is a CONTENT finding and a big one — and, unlike the dead-card verdicts, it
  does not depend on a knob nobody can justify: it is three restricted policies
  playing each other, measured at 200 combats a cell with every gap far outside
  its interval.

Not acted on. It wants a design decision, and `intentions.md` is the document
that has to move first.

## 23. The package refactor, and how each requirement gets upheld (plan, 2026-09-22)

### 23.1 Why: sets

This is not one game. It is an engine, a measurement framework, and N CONTENT
SETS (fantasy now; a Star Wars set, a hard-SF set later). Every set must satisfy
the same requirements on its own cards, so the framework has to be a LIBRARY a
set calls, not a program that sweeps "the" content.

**The blocker, measured:** 9 of 13 `bench/` modules import `@pimpampum/skills`
or `@pimpampum/enemies` directly — `reference.ts` names the calibration kits,
`shapes.ts` names the enemies, `arena.ts` builds parties, `cache.ts`
fingerprints content. The measurement layer is welded to one set.

### 23.2 The `GameSet` contract

The linchpin. A set implements it; bench and playtest take it as a parameter.

```ts
interface GameSet {
  id: string;
  registry(): EffectRegistry;        // createRegistry + registerEnemySkills
  kits(): SkillDefinition[];
  enemies(): EnemyDefinition[];
  buildParty(spec: PartySpec): Character[];
  buildEncounter(groups: FieldedGroup[]): Character[];
  /** SET-SPECIFIC CALIBRATION — not framework, content. */
  referenceParty(): PartySpec;
  shapes(): Shape[];
  print(): string;                   // fingerprint, for the bench cache
}
```

Note what moves OUT of bench and into the set: `reference.ts` and `shapes.ts`.
Which kits form the reference party and which creatures form a fair fight are
properties of a SET, not of measurement. That they lived in bench is why bench
could never have served a second set.

### 23.3 Packages

```
engine        rules only. no AI, no content.                  (no deps)
ai            selectAction, lookahead, positionScore          → engine
bench         set-AGNOSTIC measurement: arena, cells, regret,
              report, games, cache, parallel, combatlog       → engine, ai
playtest      requirement verdicts + the assertion API,
              + synthetic control kits                        → engine, ai, bench
balancer      encounter solver                                → engine, ai
sets/fantasy  content + its own calibration + its own tests   → engine (+ playtest dev)
web           the app                                         → engine, ai, set, balancer
```

`simulator` dissolves: `bench/` → bench, `kit-analyzer-lib` → playtest, the
harnesses and dev tools stay behind as `tools` (ai-benchmark, exploitability,
mutation, profile-lookahead, play, probe-shapes).

### 23.4 Tests, per layer

**engine** — fast, deterministic, NO content and NO AI.
resolution math · status seams · combat flow (guards, interrupts, rounds) ·
legality (`availableActionIndices`, `canPlayAction`). Mutation-verified.

**ai** — fast + statistical, on SYNTHETIC kits, never on a real set.
fast: predictions match what the engine rolls · the search simulates the round
it is choosing for · a restricted search obeys its restriction · terminal
values agree with `winner()`.
statistical: beats fixed baselines ≥70% · monotone in compute · converged ·
not exploitable.
*Using synthetic kits matters: the AI must be verifiable without any set, or
every set inherits the fantasy set's quirks in its instrument.*

**bench** — fast, on synthetic numbers.
report maths (error bars, `gamesFor`, significance) · the sample-size seam ·
regret's statistical rules (tie credit, decided positions, self-calibrating
null) · source conventions.

**playtest** — fast + statistical, on SYNTHETIC content.
fast: the requirement RULES (`marginVerdict`, `isDeadCard`, `durationVerdict`,
`classifyStep`, `correlatesWithLosing`).
statistical: the PIPELINE controls — flat kit, ladder kit, dead-card kit,
situational kit, turtle, blitz, losing-only — subjects whose verdict follows
from construction.

**sets/fantasy** — THE CONTENT VERDICTS. See below.

### 23.5 How per-card, per-kit and per-set requirements are upheld

A set's test files are short and declarative. The framework supplies the
assertions; the set supplies the content and the calibration.

```ts
// sets/fantasy/src/tests/kits/berserk.slow.test.ts     ← ONE FILE PER KIT
import { playtest } from '@pimpampum/playtest';
import { FANTASY } from '../../index.js';

const pt = playtest(FANTASY, { kit: 'berserk' });   // one measured sweep

describe('berserk', () => {
  // PER CARD — both tails. Power tiers are fine (intentions.md); what is not
  // fine is a card that is never the right play, or one that is so often the
  // right play that the decision disappears.
  it.each(pt.cards)('$name is ever the right play', c => pt.expectNotDead(c));
  it.each(pt.cards)('$name does not erase the decision', c => pt.expectNotAutoInclude(c));

  // PER KIT
  it('sits inside the power band vs a neutral kit', () => pt.expectKitInBand());
  it('gets stronger with level', () => pt.expectLevelRamp());
});
```

```ts
// sets/fantasy/src/tests/set.slow.test.ts             ← PER SET
const pt = playtest(FANTASY);
it('the strategy triangle is a cycle', () => pt.expectTriangle());
it('fights run to length', () => pt.expectDuration());
it('armour stays a small lever (≤15pp, even across enemies)', () => pt.expectArmourSwing());
it('encounters solve to the difficulty requested', () => pt.expectBalancerAccuracy());
it('equal-budget mirrors land near 50/50', () => pt.expectMirrorParity());
```

**Why one file per kit.** Each kit needs ONE measured sweep, and that sweep
yields every card verdict in it — the per-decision value is amortised across
the kit, so per-card checks cost nothing extra. vitest parallelises by FILE, so
a file per kit runs every kit concurrently. Adding a kit adds a file and a core,
not a longer wait.

**Design intentions are ADVISORY, not assertions.** Speed bands, the dice
curve, the power ramp, type diversity by level 2-3 — `intentions.md` says
"exceptions are allowed and interesting" and "deliberate power tiers are fine",
so a defense weaker than an attack is legitimate when it buys an upside.
Asserting these would manufacture failures and be deleted the first time they
were inconvenient. They become a design-time REPORT — "these cards sit outside
the usual bands, deliberate?" — printed by `pnpm --filter set-fantasy design`,
never failed on. The verdicts stay with measurement.

### 23.6 Order

1. `ai` out of `engine` (breaks the engine↔AI cycle: the engine takes an
   injected chooser, `aiDepth` moves to callers).
2. `bench` package, with `GameSet` threaded through it.
3. `playtest` package: verdicts + assertion API + control kits.
4. `balancer` out of `enemies`.
5. `sets/fantasy`: merge skills + enemies, move `reference`/`shapes` in, write
   the per-kit and per-set test files.
6. `tools`: what is left of simulator.

---

## 24. Step 2–3 landed: the instrument no longer knows the game

Done, green: `pnpm build` clean across the workspace, 119 fast tests in 0.6 s,
mutation score 15/15.

`@pimpampum/bench` now takes its content as a parameter. `GameSet` (in
`bench/src/gameset.ts`) is the contract; `FANTASY` (in
`packages/sets/fantasy/src/index.ts`) is the only implementation and is pure
adapter — delete it and bench still compiles, still runs its own tests, and
simply has no content installed. That is the property that makes a second set
possible, and it is the one thing the old layout could never have.

Installed once per process: `useSet(FANTASY)`. Bench **throws** when it is
missing rather than defaulting, and the error names the fix. A measurement
layer that silently measures default content is the failure this whole section
exists to prevent.

### 24.1 What the move deleted

- **A second party generator.** `bench/arena.ts` carried its own
  `randomPlayer` — its own equipment distribution, its own weapon rule —
  alongside `skills/party.ts`, which is what the balancer prices with. Two
  generators that disagree about what a typical party looks like is two answers
  to every question asked of "a typical party". The draw is `GameSet.randomParty`
  now, and there is one of it.
- **`tests/helpers.ts`**, a pure re-export alias left behind by an earlier move.
- **`REGISTRY` as a module-level constant.** It is `theRegistry()` now, memoised
  per set: a constant would be built at import time, before any `useSet()`, and
  would have thrown on every import of the package.
- **`MIRROR_PARTY` as a constant**, for the same reason → `mirrorParty()`.

### 24.2 The cache had to learn about sets

`key()` mixes `theSet().id` in alongside `enginePrint()`. Two sets ask
structurally identical questions — "the neutral baseline of company row 0 on
shape 0" — and without the id the second set to run would be served the first
set's answer. `skillPrint`/`enemyPrint` delegate to the set (only it knows which
actions hang off an id) and memoise under `setId:kind:id`.

### 24.3 The convention suite was scanning the wrong tree

`tests/bench.test.ts` walked `simulator/src`, which used to be the repo's entire
measurement layer. After the move it was watching the leftovers. It now scans
`simulator`, `bench`, `ai` and every `sets/*`, with package-qualified paths in
the failure messages — and passes, which is the useful part: the moved code
already obeyed the rules.

This is the convention suite's own failure mode, applied to itself. Worth
remembering the next time code moves.

### 24.4 TWO LIVE BUGS, both found by moving the code

**1. Every regret rollout would have thrown.** `regret.ts:rollout` did:

```ts
Object.assign(sim, aiPolicy({ depth: opts.rolloutDepth }));
sim.actionChooser = undefined;   // the clone's own policy, not the harness's
```

The second line cleared the policy the first line had just installed. The clone
then reached `planActions` with no chooser and the engine threw for the first
unforced seat — which it does *by design*, since §23 removed the silent
fallback. Introduced when `aiDepth`/`lookaheadPick` left the engine; invisible
because per-decision card value only runs in the slow tier, which has been
unverified since the split.

**The slow tier being unverified is not a scheduling detail. It is how a total
break in the card-value pipeline survived a week.** Fixing that is the next
item after the refactor.

**2. The `wasBest` tie mutant had been scored as a kill it never earned.**
While `regret.ts` lived in the simulator it ran through `tsx`, which transpiles
without typechecking. The mutant patched `isBest` to reference `topCount`, a
`const` declared on the *next* line; the kill set died of a TDZ
`ReferenceError`, and a crash read as a kill. Moving the module to a package
consumed as built `dist/` turned the crash into a compile error. Rewritten to
compile (both lines, swapped), the mutant **survived**: nothing in the fast tier
checked the tie rule at all.

Fixed by the duplicate-invariance tests now in `ai-rules.test.ts` — the first
metamorphic relation in the suite, and an exact one rather than a statistical
one: under common random numbers two identical cards replay the identical
rollout, so the tie is guaranteed rather than probable. Score is 15/15 again,
this time earned.

**The general lesson: a mutant that crashes is not a mutant that was caught.**
Every mutant should be checked to COMPILE, not merely to produce a red suite.
`build()` now does this for free for cross-package mutants — it runs `tsc` —
which is why moving the code exposed it. The mutants that still live inside
`simulator/src` do not get that check, and should.

### 24.5 Seeds must be pinned in tests that call `valuePosition`

It draws its per-position seed from the global stream, so three tests in one
file get three different positions depending on what ran before them. Roughly
one position in eight comes back **decided** (every branch scores the same),
which `valuePosition` correctly returns `null` for — and which reads as a flaky
test rather than as the non-decision it is. Wrap in `withSeed`, and assert the
premise (the position is a decision) rather than assuming it.


---

## 25. The refactor finished, every layer tested, and what testing it found (2026-09-23)

Steps 3–6 of §23.6 landed in one pass, and then each layer got its own tests,
built bottom-up so that every layer is verified on the layer beneath it before
anything is asked of the content. Doing that found **twenty-three** faults — most
of them silent, several in the measurement layer itself. They are listed in
§25.3; read that before trusting any number measured before today.

### 25.1 The layout

```
engine            rules only, no AI, no content                    → —
ai                the policy                                       → engine
combat-balancer   the PV solver, over EncounterContent<P>          → engine, ai
bench             set-agnostic measurement (+ /testing: SYNTHETIC)  → engine, ai, combat-balancer
playtest          requirement rules, analyze, control kits,
                  /vitest: the assertion API (kitSuite)            → engine, bench
sets/fantasy      the content; ./bench is its GameSet + calibration → engine, ai, bench, combat-balancer
tools             the harnesses, conventions, mutation              → everything
web               the app                                          → engine, ai, set-fantasy, combat-balancer
```

The direction is enforced (`tools/test/conventions.test.ts`): each package's
declared dependencies, every import in its source, and the fantasy root entry
staying browser-safe. Decisions that shaped it, and why:

- **`skills` + `enemies` merged into `sets/fantasy`.** One content package, so
  one `createRegistry()` registers player AND enemy handlers — the old
  two-call registry (and the CLAUDE.md non-negotiable warning about it) is gone.
  Two entry points: `.` is browser-safe (the web app bundles it); `./bench` is
  the `GameSet` adapter, which pulls in Node-only bench.
- **The balancer is content-agnostic** (`EncounterContent<P>`: registry, build
  party, is it fixed, build encounter, creature bulk/level). The set binds it
  (`encounters.ts`), so `solveEncounter(pool, party, target)` kept its
  signature for the app.
- **Calibration is DATA in the set, MACHINERY in bench.** Fantasy's `shapes.ts`
  was 380 lines, most of it framework (solve each shape, measure each baseline,
  drop saturated cells). A set now declares `GameSet.calibration` (reference
  kits, shapes, company rows, stand-ins, fair, saturation band, main kits, AI-
  blind cards) and bench's `positions.ts` does the rest — which is what made a
  second set cheap enough to exist.
- **A second set exists: `@pimpampum/bench/testing` (SYNTHETIC).** Plain-dice
  kits (brawler, duelist, medic, neutral) and creatures (grunt, brute), three
  shapes. The instrument is verified on it: the requirement controls, the
  pipeline A/A test, the card-value control. A control whose verdict "follows
  from its construction" used to follow from its construction PLUS the fantasy
  set's goblin counts; it no longer can. It lives in bench rather than its own
  package because it needs the balancer and bench needs it, and a package cycle
  is the wrong price for a test fixture.
- **Tests live in each package's `test/`**, import their own package from
  `../src`, run as one root suite (vitest projects), and are typechecked by a
  `tsconfig.test.json` per package (vitest never typechecks).
- **Anything that measures for more than a minute runs in a child process**
  (`bench` `isolated()`, `playtest` `analyzeIsolated()`). This is the fix for
  the `Timeout calling "onTaskUpdate"` red in every full slow run (§24): the RPC
  timeout is 60 s, hard-coded, and a vitest worker blocked by a synchronous
  measurement misses it whatever the assertions say. No config fixes it.

### 25.2 What each layer is tested for

| layer | fast (`pnpm test`) | slow (`pnpm test:slow`) |
|---|---|---|
| engine | resolution checked against one-line oracles; dice/distributions against brute enumeration; fast-check fights: invariants (PV range, termination, fatigue untouched, levels never fall), determinism, name invariance, CLONE FIDELITY; metamorphic relations: seat A/A (a mirror is a coin flip), armour/dice/level/numbers help, fatigue hurts, equal training cancels; legality; flow (speed, simultaneity, interruption, learning, AoE one roll) | — |
| ai | every choice legal and every target in the pool (fast-check, depth 0 and 1); pure given the seed; a solve leaves the fight untouched; known-answer positions (take the kill, guard to live, don't idle); evaluator zero-sum; `positionValue` reaches the score; the round-model checks from §16/§20 | — (strength lives with the set it measures) |
| combat-balancer | the contract on tiny inline content: inputs, bulk sharing, PV bounds, clamping honesty, duration budget, `searchMissed` exactness, the reported winrate is its own sample | calibration on held-out dice across 4 compositions × 4 targets (no lean), metamorphic (harder target ⇒ tougher; stronger party ⇒ tougher), a production-depth solve |
| bench | report maths vs closed forms (binomial σ, quadrature, `gamesFor` exact, E[max of k normals]); cache fingerprints as metamorphic relations (every behavioural field changes the print, presentation never does, set id separates keys, the fingerprint covers ai+bench+balancer); the log parser against the engine that writes the log; the sample-size seam; the set seam; positions on a stubbed solve | the DELTA PIPELINE A/A (the neutral stand-in scores zero) plus a positive and a negative control; the card-value control (20d6 first, no-op last) |
| playtest | every verdict rule on inputs whose answer is known, both tails, the null and the under-powered case; the analyzer's source shape (what statistic 4/5 reads, the null, clustering) | the pipeline CONTROLS on SYNTHETIC, one file each: flat (1, 3c), side (3, 3b), cards (4), ladder/trap (1), duration (2 both ways), losing (7), combo (3c must-pass), dominant (5), band (8, both sides + A/A) |
| fantasy | cards played exactly; calibration data (reference party, shapes, company rows, every kit an ally, every creature fielded or declared) | **the balance tests**: `test/kits/<kit>.slow.test.ts` — every requirement for every main kit (§25.5); the balancer on this set's creatures; AI strength on this set |
| tools | the conventions (seeded, depth explicit, error bars, sample seam, layering, browser-safe content) | every harness still executes at `GAMES=2` |
| web | a whole game played through `useGame` exactly as the screen does (every prompt answered), the creator→combat handoff, hero gear and builds | — |
| fantasy (also) | content invariants: every effect type resolvable, unique ids, unlock levels 1..N, descriptions on non-vanilla cards, builds hold exactly their unlocked cards; set-level: mirror A/A, duration ceiling, all three action types played | the armour lever (§25.3 F18) |

Smoke: `pnpm test:smoke` (`SLOW=1 BENCH_SMOKE=1 GAMES=2 SEARCH_GAMES=2 CALIBRATION_GAMES=4`).
Every slow file has at least one assertion that runs under smoke (was it
measured at all); the statistical ones `skipIf(SMOKE)` rather than fail on two
combats — the old smoke could not tell a crash from a sample size.

Mutation (`tools/src/mutation.ts`, reworked for the monorepo): **23/23 killed, 0 invalid**. The kill set is the whole fast tier; every mutant is rebuilt with its package and dependents, and a mutant that does not COMPILE is reported INVALID and scores nothing — closing §24.4's "a mutant that crashes is not a mutant that was caught". Eight of the mutants are tonight's faults (F4, F8, F9, F10, F11, F12, and the error terms of the two new requirements).

### 25.3 What the testing found

Numbered as found. **Bold** = a measurement (or the game) was wrong, not just code.

1. **F1 — the balancer's duration search ran at the wrong depth.** The AI split
   spread `...aiPolicy()` into `SimOptions`, which ignores it, so the duration
   bisection fell through to depth 1 (~6× the cost) instead of the documented
   depth 0; and `solveEncounter` ignored a caller's `aiDepth` altogether, though
   its doc promised it. Both fixed; `aiDepth` is now honoured (search at
   `min(0, depth)`).
2. F2 — the control budgets were hard-coded, so `GAMES=2` did not reach them and
   a "smoke" run of the controls took as long as a real one.
3. F3 — `withControlKit` built the registry AFTER installing the kit; a set that
   builds its registry from its catalogue then registered the control's handlers
   twice and threw — but only for the FIRST control in a process.
4. **F4 — the AI's damage distributions ignored the contest floors.** The engine
   floors dice+modifier at 0 and roll+bonus at 0 again; `diceDistribution` did
   neither, so a fatigued defender (negative flat) could "total" below zero and
   the AI priced every blow against a tired hero as landing harder than it can.
   Found by a fast-check property (shrunk to: attack 0 vs defense flat −1 priced
   at 1 damage). An AI disagreement with the rules — §16.1 allows the fix.
5. F5 — the parallel cache warmer spawned `warm-one.ts`, deleted in the package
   move; every child failed at launch and every failure was swallowed as "a
   cache miss", so every "parallel" kit sweep had run serially. The worker is
   now the caller's (`tools/src/warm-one.ts`), a missing worker throws, and
   failed batches are reported.
6. F6 — `play.ts` patched `Math.random`, which the engine had already captured,
   so "the same script replays the same game" was false.
7. F7 — `solve-cost.ts` measured nothing (the same ignored-depth spread as F1).
   Deleted.
8. **F8 — speed ties were not simultaneous.** `rules.md:72`: on a speed tie both
   blows land. A hazard check (`if (!actor.isAlive()) break`) also stopped an
   attacker already felled by someone of its own speed, since `ad4f0d8` — every
   same-speed trade was first-come-first-served. Only a death caused by the
   hazard itself cancels the blow now. Found by the flow test.
9. **F9 — the cache fingerprint had lost the AI.** It hashed `engine/src`, which
   was complete while the AI lived there; after the split an AI (or bench, or
   balancer) change served baselines measured with the previous code.
10. F10 — the AI's defense targeting could name the actor when the actor was no
    longer in the pool (felled in its own speed tier). Harmless in effect;
    wrong by contract. Found by the legality property.
11. **F11 — the combat-log parser dropped every line with a negative bonus** (the
    engine prints `7−2=5` with U+2212) — every fatigued attacker — and read the
    defense ROLL instead of the defense total. `assertParsed` could not see it:
    it only fires when nothing parses. 4 of 8 attack lines in one sample fight.
12. **F12 — the card fingerprint missed fields.** It read `dice.bonus` (the field
    is `modifier`) and omitted `targetCount`, `rollPerTarget`, `isConsumable`
    and `canReviveTarget`: turning a card into a sweep served the single-target
    card's cached numbers. Handler CODE was never fingerprinted at all, nor enemy
    equipment/natural armour. `actionPrint` now prints every field but the
    presentational ones; fantasy's kit prints add the hash of the kit's own
    source file plus all shared content.
13. **F13 — every kit's delta carried a targeting bias.** Baselines were measured
    with `aiPolicy` (the AI's target chooser); subject arms with an
    `actionChooser` only, so the engine's non-policy default (first eligible
    targets) chose their targets. Sized on the fantasy calibration party, N=400
    per arm, first-in-line vs AI targeting: horde 42.9% / 35.5%, escamot 92.4 /
    96.4, cap 82.3 / 71.0, mixt 57.5 / 60.5 — a cell-dependent bias of up to
    11pp in every headline delta measured before today. Every arm now uses the
    production target chooser, and baselines are measured by the same cell
    runner as the arms they are subtracted from (so `GameSet.simulateEncounter`
    had no caller left, and was removed). The pipeline A/A test guards it.
    The per-decision card-value fights (`measureKit`) had the same omission and
    now use the same chooser — and are cached per cell like every other seeded
    measurement, which a kit sweep had been re-paying in full on every run.
    Side finding, OPEN: against the one-PV horde the AI's own target chooser
    does WORSE than first-in-line (35.5% vs 42.9%) — worth a look at
    `pickResolveTargets` (spreading blows over 1-PV bodies?).
14. F14 — the analyzer's screening floor was a hard-coded 40 games per arm; a
    two-combat smoke still screened nine arms at forty fights each.
15. F15 — the `onTaskUpdate` RPC timeout (§25.1): measurement now runs in
    children.
16. **F16 — `BENCH_NO_CACHE=1` recomputed every cached value on every call.**
    Callers ask for the same solved shape once per cell per arm per level, so a
    run with the disk cache off re-solved the same encounter hundreds of times
    (98 s → 4 s on a smoke analysis). Values are now memoised in-process under
    the disk cache.
17. **F17 (CONTENT, open) — goblins can stall any fight.** `Amagar-se` is a
    speed-2 focus that makes the goblin untargetable until the round ends ("Esquives
    tots els atacs aquest torn" — the handler does what the card says). At depth 1
    the goblins learn to hide EVERY round: 6 goblins at 1 PV, level 4, against a
    drawn 4×6-level party in leather won 11/20 fights over 293 rounds (14.7 a
    fight); all seven "65% for a realistic party" requests in the fantasy
    balancer test came back duration-capped (6 goblins solve to 1 PV at 45%,
    21.7 rounds). **Pre-existing** — on `af533c1` the same request solves to 1 PV
    at 37.5% in 18.6 rounds. The `horda` calibration shape is 8 goblins at full
    kit, so its cells are fights the goblins can refuse. A design decision, not
    a code fix: counterplay faster than speed 2, a cost to hiding, or a limit on
    how often it can be played.
18. **F18 (CONTENT, open) — armour is not a small lever; it is often a large
    NEGATIVE one.** Armour comes with a speed penalty (cuir +1/−1, ferro +2/−2),
    and a slower party raises its guards after the blows they were for. Fights
    solved at 65% for a drawn 4×6-level party WITHOUT armour, replayed with the
    same draw (800 games, seed 31337) bare / leather / iron: 4 bone devils
    82.6 / 66.8 / 50.6%; 1 basilisk 70.6 / 50.3 / 51.1%; 3 stone golems
    63.4 / 70.7 / 71.1%; 3 goblins + a horned devil 74.4 / 48.3 / 49.4%. Only
    against the slow golems does armour help. CLAUDE.md calls armour "a small
    bounded lever (≤15% of outcome)"; it is neither small nor, mostly, a help.
    The reference and calibration heroes all wear leather, so every benchmark
    party carries this. Superseded by the armour sweet-spot requirement (§25.8),
    which is where this is now asserted. A design decision.
19. F19 — the standing wall's player and creature instances shared one id
    (`mur-de-pedra`, earthbender and stone golem). Separate catalogues, so
    lookups worked, but play statistics and card values are keyed by id; the
    golem's instance is `mur-de-pedra-golem` now. Found by the content test.
20. F20 — the fantasy set fingerprinted each kit's source by ABSOLUTE path, so
    the same content keyed differently in every clone or worktree and a cache
    could never be shared. Relative paths now.
21. **F21 — `measure-swing`'s "value of a read" was measured against a
    scripted enemy.** Its crude oracle/blind choosers answer only for the
    players and return `null` for the enemies, and the engine turns a `null`
    into the first legal card — so since the engine lost its silent default
    policy, every enemy in that table played its first card. The oracle's
    probe cleared the chooser outright and crashed. Found by the smoke tier;
    the enemies are now driven by `aiPolicy(CELL_AI)`, targeting too. Any
    read-value number quoted from before 2026-09-23 is void.
22. F22 — the smoke tier was not cheap. `card-value` exceeded its 10-minute
    harness timeout at `GAMES=2`: the fight floor is one per cell, but each
    decision is still priced by 6 rollout samples per legal card, and nothing
    scaled that down. `measureKit` takes one sample under `BENCH_SMOKE` now:
    the whole smoke tier went from 15.5 min (red) to ~4 min (green), measured
    2026-09-23.
23. F23 — `calibrationGames`' test assumed smoke was off, so it failed only
    under `test:smoke` — the tier the fast suite never runs. It states the
    smoke rule now.

### 25.4 The two requirements that were never built

Both from §7.1, both now rules + verdicts + controls:

- **Requirement 5 — no auto-include.** A card clearly the best play in more
  than 85% of the decisions it is legal in, under EVERY opponent model, erases
  the decision. Judged on the same per-decision statistic as dead cards, never
  on play rate. 85 rather than 90: a card built to be the only answer measured
  94%±1.6 on SYNTHETIC — the rest are positions where any card wins — so a 90%
  bar sat two sigma from a dominant-by-construction card and its control
  flapped.
- **Requirement 8 — the power band.** The full-kit delta against the neutral
  stand-in must not be CLEARLY outside ±15pp (§7.1's "no kit above ~65% against
  the field"). Controls: an overwhelming kit (clearly above), a feeble one
  (clearly below), and the set's own stand-in relabelled (in band, delta zero —
  the analyzer's A/A test).

Verdicts now carry structured data (`margin`, `cards`, `sensitive`, `reasons`,
`regressions`, `gain`, `band`). The controls used to regex the Catalan
`detail` — one slice cut inside a card's own text and passed for the wrong
reason.

Control-kit changes: `situationalKit` was only situational in a set with a
one-PV horde (on SYNTHETIC, repeating its heavy card played as well as the kit)
and is replaced by `comboKit` (Aim readies a heavy shot; either card alone is
weak) — situations from the CARDS, not the host set. `trapKit` carries its own
self-damage handler instead of borrowing the host set's. The flat-kit 3c
control needed 5,000 games an arm: its true margin is zero, the arms
desynchronise into near-independent samples, and at 800 and 2,000 it read
+1.4±2.5 and +2.5±1.6 — both "passing" a 5pp bar a zero margin cannot clear.

### 25.5 The balance tests — the fantasy kits, measured

Every main kit, measured at the analyzer's default budget (2,400 combats per
level; card value over 594 fights and three opponent models), on the code of
this section. Each failing verdict is a KNOWN entry in
`sets/fantasy/test/kits/known.ts` — asserted to still fail, so fixing one turns
its test red. A cold sweep takes hours; with the cache warm the whole ratchet
replays in seconds.

| kit | 1 levels | 2 duration | 3 thinking | 3b space | 3c one card | 4 dead cards | 5 auto | 8 band |
|---|---|---|---|---|---|---|---|---|
| berserk | ❌ 2→3 −3.8±1.4 (total +14.2) | ❌ | ✅ +22.2 | ✅ +18.2 | ✅ +11.4 | ❌ 5 cards | ✅ | ✅ +4.5 |
| earthbender | ❌ 3→4 −9.1±1.4 (total −5.4) | ❌ | ❌ +5.7 | ❌ −6.2 | ❌ −10.7 (the card WINS) | ❌ 2 | ✅ | ❌ −18.5±1.2 |
| enginyer-explosius | ✅ +14.0 | ❌ | ✅ +16.3 (just) | ✅ +10.4 | ✅ +1.7 | ❌ 2 | ✅ | ✅ −10.8 |
| mestre-armes | ✅ +7.5 | ❌ | ✅ +24.2 | ✅ +3.7 | ✅ +0.7 | ❌ 1 | ✅ | ✅ −1.5 |
| nigromant | ✅ +5.7 | ❌ | ❌ +8.1 | ✅ +5.6 | ✅ +1.9 | ❌ 4 | ✅ | ✅ −4.0 |
| volcanic | ❌ total +4.8 | ❌ | ✅ +20.4 | ❌ −4.2 | ❌ −3.2 | ❌ 2 | ✅ | ✅ −8.4 |

(Margins in pp; 3/3b/3c pass unless CLEARLY under their bar, per `marginVerdict`.)

Dead under every opponent model: berserk — Embat sagnant, Cop d'espatlla, Atac
temerari, Aguantar el cop, Rugit de guerra; earthbender — Cop de roca, Presó de
terra; enginyer — Barricada, Bomba de fum; mestre-armes — Atac encadenat;
nigromant — Marca de la perdició, Mà de la tomba, Putrefacció, Invocar l'ombra
de l'infern; volcanic — Riu de lava, Erupció. The §20.11 caution still applies
to the evaluator, but these now survive three opponent models, production
targeting and structured verdicts.

What stands out:

- **Duration fails for EVERY kit, the same way**: medians of 5–9 are near
  the bar, but p90 is the 40-round cap and 19–36% of fights are draws. A shared
  cause, not six kit problems — F17 (goblins hiding in the `horda` cells) is
  the leading suspect; fix it and re-measure before touching any kit for this.
- **Earthbender is the outlier**: below the band (−18.5pp), its level 4 is a
  regression, and repeating Columna de terra BEATS playing the kit (−10.7pp) —
  §7.1's "look at the policy, not the kit" warning fires there.
- **No card is auto-include**, and requirement 5's control shows the check can
  fire; the kits' problem is the other tail.
- Full numbers per requirement: `PLAYTEST_RECORD_DIR=<dir>` on a kit run
  writes each kit's verdicts and card values as JSON.

### 25.6 Chaff removed

- Eight one-off scripts (`experiment-kit-levels`, `-gm-encounters`, `-level`,
  `-seat`, `-fatigue-penalty`, `-fatigue-tiers`, `solve-cost`, `sanity`) — each
  finding already written down; `solve-cost` was measuring nothing (F7).
- bench's mirror-sweep cluster (`runMatchup`, `mirrorSweep`, `mutate`,
  `restoreAll`), `SIDE_POLICIES`, `matrixKey`, `matrixDeltaStderr`; cell
  internals un-exported.
- Duplicate implementations folded into one: the party/build spec types (bench's
  `gameset.ts` is the one declaration), `Cell`, composition building
  (`buildComposition`/`buildSolvedEncounter`), `duel` → `headToHead`, a private
  dice pmf → the engine's `diceDistribution`, `probe-shapes`' private baseline →
  the cell runner, the `node-shims.d.ts` files → `@types/node`.
- `.claude/commands/calibrate.md` (difficulty factors, removed 2026-08-01);
  `analyze.md` and `create-skill.md` rewritten for today's layout.

### 25.7 What next

1. **Decide F17** (goblin hide-stall) and **F18** (armour speed penalty) —
   both contaminate the calibration every kit is measured in (`horda` cells;
   leather on every benchmark hero).
2. Work through the known findings in `sets/fantasy/test/kits/known.ts` —
   each one is a failing requirement with its numbers in §25.5.
3. The F13 side finding: `pickResolveTargets` loses to first-in-line against
   a one-PV horde.
4. §23's still-open items: the metamorphic relations on the fantasy set itself
   (mirror parity, armour swing ≤15pp, the triangle as a set-level test).

### 25.8 Armour has a sweet spot — the requirement, and where each armour stands (2026-09-23)

The design intention (now in `intentions.md`): armour is right on **a few**
members of a party and wrong on **all** of them. Tuned through the armour value
against its speed penalty, once the requirement exists — so it exists first.

**The rule** (`sweetSpotVerdict`, `playtest/src/rules.ts`): a fight is solved
for an unarmoured party, then replayed on the same seed with 0, 1, …, 4 members
in the armour (the first k seats; seats are drawn independently, so a random
k). Some interior count must CLEARLY (2σ) beat both nobody and everybody, per
armour, on the curve pooled over the three fights of the old armour test
(bone devils, basilisk, golems; the goblin horde stays out, F17). Controls in
`rules.test.ts`: hump passes; monotone up, monotone down, flat and
under-sampled humps fail; a sampled flat null passes <5% despite looking at
three interior counts. Two mutants added, both killed. Asserted in
`sets/fantasy/test/set.slow.test.ts`, which prints both curves every run.

**Measured** (800 games per point, seed 31337, win% by wearers 0/1/2/3/4):

| | pooled | bone devils | basilisk | golems |
|---|---|---|---|---|
| cuir (+1 armour, −1 speed) | 72.2 / 71.5 / 67.0 / 65.0 / 62.6 ❌ | 82.6 / 79.3 / 74.9 / 71.6 / 66.8 | 70.6 / 69.8 / 59.9 / 56.1 / 50.3 | 63.4 / 65.4 / 66.1 / 67.3 / 70.7 |
| ferro (+2, −2) | 72.2 / **75.5** / 71.7 / 64.1 / 57.6 ✅ | 82.6 / 81.3 / 69.0 / 60.3 / 50.6 | 70.6 / 77.6 / 73.9 / 65.3 / 51.1 | 63.4 / 67.8 / 72.2 / 66.6 / 71.1 |

- **Ferro passes, narrowly**: one wearer is best (+3.3pp over bare against a
  ~2.6pp 2σ bar); a whole party in iron is clearly worst (−14.6pp). The shape
  asked for, but on a thin edge — a small nudge either way can lose it.
- **Cuir fails**: every wearer added costs the party, except against the slow
  golems, where armour is monotone GOOD — the per-fight curves disagree in
  sign, so "even across enemy types" (intentions.md) is not met either, for
  either armour. Cuir is a KNOWN failure in the test (it turns red when fixed).
- Curious and unexplained: one wearer of ferro beats one wearer of cuir by
  ~8pp against the basilisk (≈2.5σ). Worth a look when tuning — a −1 vs −2
  speed step can cross different speed ties.
- Side observation, not armour: every "65%" solve here plays at 63–83% for the
  bare party it was solved for. The solve is duration-capped (F17 territory),
  so the curves are around those points, not around 65%.

**Next**: tune cuir's (+armour, −speed) until it passes without losing ferro's
pass; the test is the loop — ~3 min per run.



---

## 26. A still ruler, a fast loop, and the stall that was one card (2026-09-23, day)

### 26.1 The calibration is a snapshot

Every baseline (reference party, stand-ins, company rows) was measured with the
LIVE kits, and `COMPANY` names every player kit — so editing any kit re-solved
the shapes and re-measured every baseline, and the next analysis of ANY kit
recalibrated from scratch. It also meant an edit moved the ruler it was being
measured with.

The calibration now fields PINNED copies (`sets/fantasy/src/bench/calibration-kits/`,
generated by `pnpm calibration:refresh`, ids suffixed `@cal`). A live edit
re-measures that kit's own rows and nothing else — checked end to end: editing
live berserk changed berserk's fingerprint and left the calibration's and
earthbender's identical. Choices, and why:

- **Renamed at the source, not at runtime.** Handlers look ids up by literal
  (`EXPLOSIVE_SKILL_ID`); a runtime rename would have fielded a pinned
  enginyer with a 2-charge bandolier. Effect maps' bare keys are renamed too.
  Anything the rename cannot reach (a shared factory's default id — the
  earthbender wall's, now passed explicitly) throws at import.
- **Registered UNLISTED** (`registerSkill(def, false)`): they resolve by id but
  are not in `ALL_SKILLS`, or the drawn party would field them.
- **Drift is compared forward**: re-pin the live file with the same function
  and compare bytes. Reported by the analyzer and the fast tier, never failed;
  a kit missing from the snapshot does fail (the calibration cannot field it).

### 26.2 The feedback loop

Measured on this machine (8 cores, ~78% of a core per worker):

- `pnpm test` ~19 s → ~15 s: builds the libraries only (it built the web app,
  running vue-tsc twice). `pnpm test:watch` for edit-and-rerun.
- **The kit test suites had no parallelism at all** — `runIsolated` called
  `analyze` on one core. The CLI warmed only the matrix, and computed the
  whole calibration serially BEFORE its parallel warm (a table printed first),
  so on a cold cache the warm found nothing to do.
- Now one `prepare` (playtest) warms every cell `analyze` reads — calibration,
  level sweep, screens, card value, then the verify arms the screens pick —
  through the same per-cell entry points `analyze` uses (`matrixCell`,
  `measureKitCell`, `screenArms`). Used by the CLI and every isolated analysis.
  `tools/src/warm-one.ts` is gone; playtest owns the worker.
- Guarded by `playtest/test/prepare.slow.test.ts`: after `prepare`, `analyze`
  computes NOTHING (a set kit, and a control kit under `allSeats`), and a
  warmed report equals a serial one. Checked that it fails: skipping the verify
  wave → 20 misses.
- Found on the way: warm batches were dealt one per lane, round-robin — a lane
  that drew cheap cells idled — and killed after 30 min, after which the main
  process recomputed them serially (4 of 6 batches, on the first timing run).
  Now a pool of small batches, most expensive first, 4 h guard.
- The control suites ran with the cache OFF (so no stale numbers), which also
  switched the warm off. They now get a fresh empty cache per file
  (`BENCH_CACHE_DIR`): same guarantee, all cores.

Measured (2026-09-23, this 8-core machine): the old path had not finished ONE
kit after 69 min cold (it had spent 45 of them single-threaded in the verify
arms and card value). The new path: a full cold sweep — six kits plus the
whole calibration — in **26.6 min**; one kit against cached baselines in
**3–5 min**; the report itself then computes nothing (2653 cache hits, 0
computations).

### 26.3 F17 closed: the stall was one goblin card

Every kit failed requirement 2 the same way (p90 = the 40-round cap, 19–36%
draws). Diagnosed on the calibration fights themselves:

| calibration fight (as solved) | with Amagar-se | without it |
|---|---|---|
| horde (8 goblins, PV 1), company rows 1–4 | draws 0–68%, median to 40 rounds, hiding 16–79% of goblin plays | draws 0%, median 1–3 rounds |
| mixed (3 goblins + horned devil, all PV 1) | draws 20–65%, p90 40, hiding 74–90% | draws 0–6%, p90 2–15 |

(200 fights per arm, 2026-09-23, before the fix.) After the fix: hiding 1–39%
of goblin plays, draws 0–7%, p90 ≤ 9 — and the mixed shape solved to goblins
at PV 8 and the devil at PV 20 instead of 1 and 1.

Every drawn board was healthy heroes against ONE goblin at 1 PV, hiding every
round: `Amagar-se` made it untargetable, cost nothing, and a lone goblin's
best play was always to hide again. With draws counting half, the solver could
not raise the party above ~50% at ANY PV and pinned the goblins at 1.

Fix, from the fiction — goblins hide IN THE HORDE (moved from the generic
effects into `goblin.ts`, its only user):

- no ally in view → nothing to hide behind; the card does nothing;
- not two rounds running (a `descobert` status gates `canPlay`).

Card text: "Cal un aliat a la vista; no dos torns seguits."

### 26.4 The solver's unchecked clamp (a measurement fault)

The solver steers with the depth-0 AI and reports at depth 1. When the depth-0
search found that no PV reached the target, it CLAMPED — and the depth-1
verify skipped clamped solves, so the proxy's verdict went out unchecked.
Bone devils showed it: four of them clamped at PV 1 while the depth-1 party
won 96–100% of those fights (the depth-0 party wins ~31% of a fight the
depth-1 party wins ~72%). Every clamped solve before 2026-09-23 — including
the old PV-1 goblin shapes — was decided this way.

Fix: a clamp is re-checked at the real depth; if the real AI disagrees, the
whole bracket is bisected at the real depth (costlier, only where the proxy is
wrong). Regression test `combat-balancer/test/solver-depth.test.ts` (fast
tier): a party holding BAIT — a do-nothing card with a huge AI hint — loses at
any PV under depth 0 and wins under depth 1; without the fix it reports PV 1
at 100%. Also a mutation-harness mutant.

### 26.5 The shapes, re-chosen

Probe (`probe-shapes.ts`, now `--family` to run families in parallel), after
the goblin and solver fixes:

- horde: 4× PV14 74% (3/4 cells) · **5× PV10 55% (4/4, spread 10pp)** · 6×+ back at PV 1.
- mixed: 2× 65% (3/4) · **3× PV8 + devil PV20, 67% (4/4)** · 4× 62% · 6× PV 1.
- basilisk: **1× PV68 60% (4/4)** · 2× PV 1.
- bone devils (Fibló 3d6, self-only defense): 3× PV17 83% (2/4) · **4× PV16 65% (2/4)** · 5× PV14 · 6× PV13.

Chosen: horde 5, bone devils 4, basilisk 1, mixed 3+1.

Bone devils: their only attack (Fibló, 2d6) was small for their bulk and
their defense heals on every block, so at a fair PV the fight outran the round
budget. Fibló is 3d6 now; Defensa esquelètica guards only its holder (a new
generic engine seam: a defense effect may narrow the card to 'self' — and
explicit selections are now held to a card's target rule, which they never
were). The self-guard alone changed nothing measurable; the solver fix is what
unlocked the shape.

A finding for the kit pass: against bone devils the company rows split
90–96% (rows 1, 2) vs 23–43% (rows 3, 4 — both hold nigromant).

### 26.6 Armour, after the enemy changes

F18 (armour a net loss) was measured before today's bone-devil and solver
changes, and it no longer holds against the current bone devils. Direct experiment (300 fights, 4 bone devils at PV 16, drawn level-6 party,
cuir with NO speed penalty): armour helps at both AI depths — +7pp at depth 0,
+6pp at depth 1, less damage taken. The balancer's simulator agrees (68.8% →
77.5% all in cuir). An earlier set of variant runs said armour cost 31pp; they
were a launch-script bug (zsh does not word-split `set -- $v`), which fed NaN
into the speed penalty. The content test now requires whole, non-negative
equipment numbers — the engine plays a NaN speed silently.

Variants (3 fights, 800 games a point, win % by wearers 0/1/2/3/4, pooled):

| cuir / ferro (armour, speed) | cuir | ferro |
|---|---|---|
| 1,1 / 2,2 (old) | 67.5 / 66.4 / 61.8 / 60.1 / 58.0 ❌ | 67.5 / 67.7 / 68.8 / 61.7 / 56.1 ❌ |
| 1,0 / 2,1 | 67.5 / 70.6 / 72.1 / 72.4 / 73.3 ❌ (no cost) | 67.5 / 68.7 / 69.1 / 70.6 / 64.4 ✅ |
| **2,1 / 3,2** | **67.5 / 68.7 / 69.1 / 70.6 / 64.4 ✅** | **67.5 / 70.3 / 70.5 / 68.3 / 63.0 ✅** |
| 2,2 / 3,3 | 67.5 / 67.7 / 68.8 / 61.7 / 56.1 ❌ | 67.5 / 69.4 / 69.5 / 62.3 / 44.3 ❌ |

Chosen: **cuir +2 armour −1 speed, ferro +3 −2.** Both have a sweet spot, and
they differ the way the fiction wants: light armour is right on most of a
party (best at 3 of 4), heavy on a tank or two (best at 1–2); a whole party in
either is clearly worst. Four in iron moves a fight 4.5pp (the ≤15pp lever
holds). The speed penalty is the lever that makes the sweet spot: with no cost
armour is simply best on everyone. rules.md, CLAUDE.md and the equipment
comment are updated; the reference heroes' leather changed with it.

### 26.7 The second stall: Ombres

After the goblin fix, draws were still 2–4% for every kit (the bar is 2%), and
per cell they sat almost entirely in company row 4 (volcanic, nigromant,
ombres): 14–25% draws, p90 at the cap, against bone devils and the basilisk.
`Desaparèixer en l'ombra` hid its target for two rounds, recastable at will —
the goblin stall on the players' side (its own comment warned "overplaying this
stalls fights into draws"). Same fix from the fiction: shadows hide you only
while the enemy has someone else to look at (another ally in view), and a
vanished character is exposed for a round before vanishing again. Snapshot
refreshed (a rules fix, not polish). Draws fell to 0.5–1.2%; mestre-armes and
volcanic pass requirement 2 outright.

### 26.8 The sweep before tuning (snapshot of 2026-09-23 after both stall fixes)

Full cold sweep, all six kits, calibration included: **26.6 min**, every cell
warmed in parallel — the report computed nothing itself (2653 cache hits, 0
computations).

| kit | vs neutral | failing |
|---|---|---|
| enginyer | −5.8 | 1 (4→5), 2 (p90 10), 3 (+11 vs 20), 4 (Bomba de fum, Camp minat), 7 |
| mestre-armes | +0.8 | 3c, 4 (Atac encadenat) |
| nigromant | +4.8 | 2 (p90 9), 3b, 3c, 4 (Marca, Mà de la tomba, Putrefacció, Invocar), 7 |
| berserk | +13.7 | 2 (p90 9), 4 (Aguantar el cop, Rugit de guerra) |
| earthbender | −15.6 | 1 (3→4 −8.3), 2 (median 6, p90 14), 3, 3b, 3c, 4 (Presó de terra), 7 |
| volcanic | −5.6 | 4 (Riu de lava) |

### 26.9 Tuning, iteration 1

Card-value rollouts play the fight OUT, so "dead" there means never the best
play even when played to the end — a verdict on the card, not on the
evaluator. So these are content changes:

- berserk: Entrar en Fúria 3 → 2 turns (it alone was +25pp at level 5);
  Aguantar el cop raises a real 2d6 guard and converts what gets through (it
  took every blow in full); Rugit de guerra speed 2 → 5 (a war cry that lands
  after the enemy acted cancels nothing).
- earthbender: Presó de terra pins (Focus only, 2 turns) and leaves the enemy
  THERE to be hit (it swallowed them out of reach for 3 — unwinnable rounds,
  long fights); Cop de roca 2d4 → 2d6.
- nigromant: Mà de la tomba 1d6 → 2d6 (the mark → reap combo paid a turn for
  1d6); Putrefacció 2 → 3 per turn.
- enginyer: Granada 1d4 → 1d6; Traca final 1d6 per charge (was 1d4); Camp
  minat mines 1d10 (was 1d6); Bomba de fum lasts this turn and the next.
- mestre-armes: Atac encadenat is an ATTACK that starts the chain (1d6 +
  weapon, ×1 now, ×2 next) — as a Focus it spent a turn on a stance.
- volcanic: Riu de lava 2d6 (was 1d10).

### 26.10 Iteration 1 → 2 → 3

Iteration 1 (sweep 3): earthbender −15.6 → +0.7 and passes everything but p90
(levels, thinking, space, one-card, no dead cards); enginyer's levels and
thinking pass; Atac encadenat alive but now carries mestre-armes on its own
(3c); **berserk +23.9 with 14% draws at level 5** — a third stall: Entrar en
Fúria could be re-entered, and a berserker already at 1 PV lost nothing by
going again, so he stayed indestructible. Rugit de guerra at speed 5
cancelled most enemy actions every round (repeating it alone won 83%).

Iteration 2 (sweep 4): Entrar en Fúria once per combat (consumable); Rugit
speed 3; the chain climbs by halves; Xuclar la vida heals half (it outclassed
every other nigromant card); Invocar l'ombra −5 → −1 and Putrefacció −1 → 1
(slow focuses are interrupted); Camp minat costs 1 charge (was 3); Bomba de
fum blinds on 14 or less (was 10); Riu de lava arrives this round, speed −1.
Result: berserk +8.9 and passes all but p90; earthbender all but p90;
mestre-armes 3c still; enginyer thinking +11, Bomba de fum / Camp minat dead;
nigromant four dead; volcanic −9.0, Riu de lava still dead.

**The p90 failures were the calibration's.** The solver lets a fight average 6
rounds; requirement 2 wants median ≤ 5 and p90 ≤ 8. Per cell, the long tail
sat in the basilisk (median 6–8, p90 10–14 — one body at PV 84) and one horde
row. The shapes are now solved to `calibration.maxAvgRounds` = 5, the same
standard the kits are held to (`calibration.test.ts` ties the two together).

Iteration 3 (sweep 5): chain capped at ×2; Marca de la perdició is an ATTACK
(1d6) that condemns what it hits; Mà de la tomba 3d6; Camp minat trips on every
enemy attack; Bomba de fum speed 4 (smoke after the attack is no smoke); Riu de
lava 3d6.

Sweep 5 (calibration at 5 rounds + iteration 3): **mestre-armes (−0.3) and
volcanic (−8.7) pass every requirement.** Berserk +9.9: only Cop d'espatlla
(−1.1) and Aguantar el cop (−1.4) dead. Earthbender −1.6: only p90 10.
Enginyer +4.6: p90 11, Camp minat dead. Nigromant +4.3: p90 9, Mà de la
tomba / Putrefacció / Invocar dead (Marca, now an attack, is alive).

Iteration 4 (sweep 6): the engineer's bandolier RELOADS one charge after a
round without spending one (it ran dry in long fights, which then ran longer
— p90 11); Mà de la tomba strikes every enemy for 2d6 and the condemned cannot
defend or armour against it (skipping the unmarked made it a card that did
nothing in most positions); Putrefacció spreads on d20 < 9 (was < 5); Cop
d'espatlla +4 on a block (was +2); Aguantar el cop guards with 3d6; Columna
de terra 3d6.

Sweep 6 (iteration 4): **enginyer and nigromant pass requirement 2** (the
reload and the new reap shortened their fights); mestre-armes and volcanic
still pass everything. Left: enginyer Camp minat dead (−3.8); nigromant
Putrefacció dead (−3.4); berserk Aguantar el cop dead (−1.2); earthbender —
Columna at 3d6 overshot (repeating it alone beats the kit, −4.3), Presó dead
again, p90 9.

Iteration 5 (sweep 7) — the common thread was slow focuses, interrupted
before they land: Columna de terra keeps 3d6 at speed −1; Presó de terra speed
2 (the earth grabs before they move); Camp minat speed 1 and 4 mines;
Putrefacció 4 a turn at speed 2; Aguantar el cop guards at speed 3 and converts
3× the damage.

Sweep 7 (iteration 5): **enginyer passes everything** (with mestre-armes and
volcanic). Nigromant now fails 3 (+10.7 vs 20: the new AoE reap made "always
the biggest attack" nearly as good as thinking) and Putrefacció is still dead
(−2.3); berserk's Cop d'espatlla reads dead (−0.9 — Aguantar el cop displaced
it); earthbender only p90 9.

Iteration 6 (sweep 8): Mà de la tomba strikes the unmarked at {A}−3 (the
doomed still cannot resist it) — marking matters again; Putrefacció also
condemns its target (rot feeds the reap); Cop d'espatlla guards with 3d6; the
earthbender's wall has 1d6 life (a wall that outlasts everything is what
stretched its fights).

Sweep 8 (iteration 6): **enginyer, mestre-armes, earthbender and volcanic pass
every requirement.** Nigromant (+12.3): Invocar l'ombra dead (−4.0 —
Putrefacció now condemns, so a slow condemn-all lost its job). Berserk
(+10.4): Cop d'espatlla dead (−0.8).

Iteration 7: Invocar l'ombra speed 2 and 3 turns; Cop d'espatlla speed 4 (the
QUICK guard, apart from Aguantar el cop's heavy one). Both came alive — and
each kit's next-weakest card took their place at the bottom (nigromant: Marca
de la perdició −1.8, Sudari de tomba −0.6; berserk: Aguantar el cop at +0.2).
Tuning stopped there, on purpose: these are cards worth about nothing, not
cards that cost anything, in six-card hands where one is always last; lifting
them further means adding power to the two kits already highest in the band.
They are recorded as known (below) rather than chased.

### 26.11 The confirming sweep, and a fourth stall

Snapshot refreshed so the calibration fields the tuned kits; full cold sweep.
Fights got SHORT (median 4, p90 6–7 for every kit) but four kits drew 2.0–2.6%
(the bar is 2%), in the bone-devil and mixed cells. The drawn boards (200
fights, earthbender in the bone-devil cell, 12 drawn) were all healthy heroes
against ONE bone devil, and after round 30 the plays were Presó de terra ×108
and Udol de terror ×120: the earthbender companion re-pinned the last enemy
every round (the pin prices itself, so the AI kept renewing it), the pinned
devil could only howl, and nobody attacked. I made this one — iteration 1 made
Presó de terra a pin instead of a swallow. Fix from the fiction: the earth
cannot grip the same foe again at once — freed, a target stands on cracked
ground for two rounds. (The mixed-cell "draws" were mostly mutual wipes, a
legitimate draw.)

The four stalls of the day share one shape — a card that lets one side make
itself or its target permanently unable to be hit or to act, recastable at no
cost: goblin hide, shadow vanish, fury re-entry, earth pin. Each is now
bounded (needs an ally in view / cannot repeat at once / once per combat).
A requirement worth adding later: a per-card stall probe that flags any card
dominating the plays of fights past round 30.

### 26.12 Two measurement faults the confirming sweeps found

- **Requirement 2 counted mutual wipes as stalls.** After the pin fix, the
  last "draws" (2.0–2.6% for four kits, just over the 2% bar) had no stalled
  fights behind them at all: 300 fights in each drawing cell, 0 stalls, 14–15
  mutual wipes (both sides fall in one simultaneous speed tier — a draw that
  ENDED). The bar exists for "combats que no acaben MAI". Cells now count
  `stallRate` — unresolved at the round cap — and requirement 2 judges that;
  the draw rate is still reported beside it.
- **A cell's cache key did not say what the cell was.** It held the subject,
  the cell's label and its baseline NUMBER — nothing about the company's kits
  or the enemies fielded. A companion or creature changed, and a re-measured
  baseline that landed on the same value to four decimals, would have served
  the old cell silently. Cells now carry a `context` fingerprint (company row +
  fielded enemies) in every cell and card-value key.

### 26.13 Where the set stands (confirming sweep, 2026-09-23 evening)

Snapshot refreshed to the tuned kits; all cache keys new; full cold sweep in
19 min (six kits + calibration; the report computed nothing itself). Shapes as
solved: horde 5 goblins PV 11, bone devils 4 at PV 37, basilisk PV 87, mixed 3
goblins PV 12 + horned devil PV 30; 12 usable cells.

| kit | vs neutral | 1 | 2 (median / p90 / stalls) | 3 margin | 3b | 3c | 4 dead | 5 | 8 | 7 |
|---|---|---|---|---|---|---|---|---|---|---|
| berserk | +15.8 ±1.0 | ✅ | ✅ 4 / 6 / 0.0% | +59.7 | ✅ | ✅ | ✅ | ✅ | ✅ (edge) | ✅ |
| mestre-armes | −1.1 | ✅ | ✅ 4 / 6 / 0.0% | +48.7 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| earthbender | −1.8 | ✅ | ✅ 4 / 7 / 0.0% | +43.2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| volcanic | −7.7 | ✅ | ✅ 4 / 6 / 0.0% | +41.5 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| nigromant | +3.6 | ✅ | ✅ 4 / 6 / 0.0% | +43.7 | ✅ | ✅ | ❌ Marca de la perdició | ✅ | ✅ | ✅ |
| enginyer | −2.1 | ✅ | ✅ 4 / 7 / 0.0% | +26.7 | ✅ | ✅ | ❌ Camp minat (−0.6) | ✅ | ✅ | ✅ |

(At the start of the day every kit failed requirement 2 — p90 at the 40-round
cap, 19–36% drawn — and five of six failed dead cards.) The two remaining dead
cards are `known.ts` entries; the kit suites replay the sweep and pass.

Armour on the final content: **ferro keeps its sweet spot** (pooled
72.9 / 74.7 / **76.5** / 75.1 / 73.6); **cuir lost it narrowly** — it still
peaks at three wearers (72.9 / 74.3 / 77.0 / **78.0** / 76.7) but a whole
party in cuir is not CLEARLY worse (−1.3pp, inside the noise). It had one when
tuned; the bone-devil changes after moved it. Recorded as known in
`set.slow.test.ts`. The basilisk armour fight is solved far off target (95%
bare) — its solve hits the round budget; worth a look with the armour retune.

Verification at the end of the day: fast tier 313/313; slow tier green
(controls, balancer calibration, AI strength, harnesses, the six kit suites
replaying the sweep); mutation 26/26 (three new mutants: the unchecked clamp
and the two sweet-spot rule faults). Two card-value controls had gone
under-powered since F13 put production targeting into card-value fights (the
do-nothing card read dead under 2 of 3 models at 240 fights) — ruled out, in
order: the solver fix (synthetic shapes identical), the parallel warm (warm =
serial), the cache (uncached = cached); their sample is tripled, and with the
parallel warm they now run in 40 s.

### 26.14 What next

> Replaced by the Backlog at the top (2026-10-03): items 2 and 3 are closed
> (berserk sits at +10.9 inside the band; the dead-card verdict they named was
> replaced, §27.3), the rest moved there.

1. **Cuir's sweet spot** — one armour exploration (the variant harness was
   deleted as a one-off; the method is in §26.6) and a recalibration.
2. **Berserk sits on the band edge** (+15.8 ±1.0, passing only because the
   band verdict needs it CLEARLY out). Entrar en Fúria at level 5 is still the
   big step.
3. The two marginal dead cards (Camp minat, Marca de la perdició). Each
   nigromant retune moved the bottom card rather than removing it; the next
   step is a design look at the condemn loop, not another number.
4. **A stall probe as a requirement**: all four of today's stalls had the same
   signature — one card dominating the plays of fights past round 30. Cheap to
   measure from the cells, and it would have named each culprit at once.
5. Wider shapes: bone devils' company rows still split 93% vs 41%, so row 1
   is saturated and drops out of every kit's measurement.

---

## 27. Card-by-card review of the §26 tuning (in progress, started 2026-10-03)

The user is reviewing each of the 26 content changes of §26 one at a time —
approve, revert or tweak — with the kit re-measured after every tweak
(`kit-analyzer.ts --player X`, ~3 min against the cached baselines). Enemy and
armour changes (22–26) move the calibration, so they are batched; the review
ends with a `pnpm calibration:refresh` and a full sweep (tweaked kits also sit
in the other kits' company rows).

Order: berserk 1–4 (Cop d'espatlla, Aguantar el cop, Entrar en Fúria, Rugit de
guerra); earthbender 5–8 (Cop de roca, Mur de pedra, Columna de terra, Presó
de terra); enginyer 9–13 (Granada, Bomba de fum, Camp minat, Traca final, the
bandolier reload); nigromant 14–18 (Marca, Mà de la tomba, Putrefacció,
Xuclar la vida, Invocar l'ombra); 19 Desaparèixer en l'ombra; 20 Riu de lava;
21 Atac encadenat; 22 Amagar-se; 23 Defensa esquelètica; 24 Fibló verinós;
25–26 cuir and ferro.

### 27.1 Cop d'espatlla — REMOVED (user's call)

Berserk is a 5-card kit now: Atac temerari, Aguantar el cop, Entrar en Fúria
and Rugit de guerra each unlock one level earlier (Fúria at 4). Re-measured:
berserk passes every requirement, +15.4 vs neutral. **At the next
`calibration:refresh` the reference party drops from Σ22 to Σ21** (berserk is
in it at full kit) — `REFERENCE_SIGMA` will throw at import and must be
updated, with the docs that quote it.

### 27.2 Aguantar el cop — UNDER REVIEW

The user wants the original gamble back ("take the hit, get angrier"), with a
payoff that makes it worth it. Every shape measured (berserk, card value vs
the rest of the hand; "best" = share of its decisions it was the best play,
chance ≈ 21%):

| version | value | best | verdict |
|---|---|---|---|
| §26: guard 3d6, permanent {A} = 3× damage through | +0.6 | 24% | alive |
| original gamble (no guard, all damage), permanent 3× | −8.1 | 8% | dead |
| no guard, all damage, next attack only +3× ("Descàrrega") | −8.7 | 7% | dead |
| … plus provocation (enemies must attack him) | −8.1 | 11% | dead |
| no guard, HALF damage, next attack only +2× | −5.0 | 5% | dead |
| guard 2d6, next attack only +2× | −2.6 | 14% | dead |
| no guard, half damage, permanent +1× | −4.1 | 8% | dead |
| **no guard, half damage, permanent +2× (in the tree now)** | **−3.9** | **8%** | dead |
| no guard, −3 per blow, permanent +2× | −5.8 | 10% | dead |

What the measurements say:
- With provocation, the berserker charged 56 times and released 9: taking
  several full blows killed him before the payoff. Survivability, not the size
  of the payoff, was the binding constraint.
- **Every no-guard-roll version is dead, and the reason is structural**: every
  hero also carries the shield card (Escut de fusta), which ROLLS and often
  blocks a blow outright. An uncontested defense — even at half damage — is
  dominated by it whenever defending is right, and attacking is better when it
  is not. Only the versions with their own guard roll came alive.
- Berserk itself is healthy in every version: +10 to +11 vs neutral (off the
  band edge now), all other requirements pass.

Open question for the user: keep the no-roll identity (then it needs something
the shield cannot do — e.g. reacting AFTER the roll, or guarding allies the
shield does not reach), or let it roll a guard (the alive shape). Berserk's
known.ts entry marks it under review.

Next in the review: 3 Entrar en Fúria (the card that keeps berserk strongest:
+17 PV, the kit's best one-card strategy).

### 27.3 The requirements cut to four, and two measurement faults (2026-10-03)

The card review stopped at Aguantar el cop because the requirement judging it
was wrong: "dead" meant "clearly less often the best play than chance", and
since exactly one card is best at each decision the shares AVERAGE to chance —
any kit with a star card had to push another card under the line. Aguantar el
cop at 13% sat beside Rugit de guerra at 38%. Reviewing that rule turned into
reviewing all of them against `intentions.md`. They overlapped (three were
anti-spam from different angles), one was a tautology (level N+1 holds a
superset of level N's cards; the anti-spam requirements already catch a trap
card) and the level sweep was most of the cost.

**The four requirements, one intention each** (`playtest/src/rules.ts`):

| # | requirement | bar | measured on |
|---|---|---|---|
| 1 | fights end | median ≤ 5, p90 ≤ 8, stalls < 2% | the full-kit run |
| 2 | inside the power band | within ±15pp of the neutral stand-in | the full-kit run |
| 3 | choosing matters | a random legal pick costs ≥ 1 PV per decision against the best, cross-fitted | per-decision card value |
| 4 | the strategy triangle | Power > Protect > Aggro > Power, every edge clearly above 50% | set-level mirror fights, leaning styles |

Removed: the level sweep (1), thinking vs mindless (3), strategy space (3b),
one card (3c), the win-correlation flag (7), the dead/automatic card tails
(4/5) — with the screens, verify passes, winner's-curse correction, the
impoverished cell policies, `exploitability.ts` (its triangle half is
requirement 4; its exploitability finding is §22.1) and the ladder, trap,
losing-only, flat-side, dead-card and dominant-card controls.

**Why no per-card verdict.** Re-based on a fixed floor (5% best, 85% ceiling),
the tails failed their own controls: a card that does NOTHING was the best
play in 25% of its control's decisions at six rollouts, 30% at twenty-four.
Not noise — the control's fight barely depends on one seat's choice (a random
pick there costs 1–2 PV), and when nothing matters much every card, even an
empty one, is sometimes best. A best-share cannot tell useless from harmless.
Each card's value and share are printed on the report card; the kit is judged
on whether choosing matters at all.

**Two faults found on the way:**

- **The cache fingerprint was blind from the package refactor (af533c1) until
  today.** It resolved the repo one directory too high, found no source, and
  hashed four "missing" markers: no engine, AI, bench or balancer change
  invalidated a cached number. Fixed, a missing package now throws, and a test
  names a file from each package. Recalibrating from scratch reproduced the
  sweep's full-kit numbers exactly, so the six kits had not in fact been
  served stale cells — but nothing guaranteed it.
- **The random-pick cost took a max over noisy rollouts.** "Top minus mean"
  reads a choice between cards worth the same; the first sweep put every kit
  at 10–14 PV. Cross-fitted (choose on half the samples, price on the other):

| | random pick costs (PV / decision) |
|---|---|
| control: identical cards (must fail) | 0.00 |
| control: twins differing by noise only (must fail) | −0.11 ±0.13 |
| control: two-card combo (must pass) | 1.57 ±0.23 |
| berserk | 8.55 ±0.51 |
| nigromant | 5.90 ±0.40 |
| enginyer | 4.99 ±0.36 |
| earthbender | 4.40 ±0.33 |
| volcanic | 4.30 ±0.31 |
| mestre-armes | 4.24 ±0.30 |

The bar is 1 PV — a point of health per decision, between the controls.

**Sweep (2026-10-03, calibration recomputed from scratch, 8 min for six kits
plus the triangle):** every kit passes 1–3. Deltas: berserk +10.9, nigromant
+4.5, mestre-armes −1.9, enginyer −2.0, earthbender −3.1, volcanic −9.6.

**The triangle (requirement 4), first assertion:**

| edge | winner's winrate |
|---|---|
| Power > Protect | 79.8% ±1.4 ✅ |
| Protect > Aggro | 58.0% ±1.7 ✅ |
| Aggro > Power | 24.1% ±1.5 ❌ |

Power beats both other corners — §22.1's finding, now on leaning styles. On
the leaning styles Protect > Aggro HOLDS (it was reversed under hard
restrictions). Aggro > Power is `KNOWN_BROKEN` in `triangle.slow.test.ts`. Per
`intentions.md`, the answer is to buff the corner that beats the winner:
make Aggro punish slow focuses harder, not nerf Power.

**Cost:** a kit's plain combats went from ~16,000 to 800; the card value is
now nearly all of a sweep.

**Back to the card review.** Aguantar el cop measured −3.9 PV with the best
play in 8% of decisions; under the new requirements it fails nothing, and
berserk passes all three. The open design question from §27.2 stands on its
own merits (no-roll identity vs a guard roll). Its parameters are now
`divisor` / `multiplier` / `duration` / `fromBlow` (the tree holds divisor 2,
×2, permanent: the §27.2 shape). The user's last direction: less damage taken
(a third or less) and a buff on the next attacks — the sweep in progress
(divisor 3–5, ×2–4, 2 turns or permanent) moved value from −3.9 to about 0
only through the divisor; buff size and duration changed nothing. Next in the
review after it: 3 Entrar en Fúria.

**The card ranking (report card, 2026-10-03).** Each kit now prints its cards
ranked, four numbers off the same rollouts: value against the rest of the hand,
share of moments as the best play, the lead over the runner-up WHEN it is the
best play (cross-fitted — a naive lead is the winner's own luck), and how often
the AI plays it. The third column is what finds a card that is rarely right but
decisive. Berserk:

| card | vs. the hand | best play | when best, gains | AI plays it |
|---|---|---|---|---|
| Entrar en Fúria | +17.0 | 30% | +6.6 | 22% |
| Rugit de guerra | +10.3 | 38% | +2.9 | 20% |
| Atac temerari | −3.3 | 22% | +0.0 | 31% |
| Aguantar el cop | −3.9 | 8% | **−2.8** | 3.5% |
| Embat sagnant | −4.5 | 21% | +0.3 | 26% |

**Retracted the same day:** the −2.8 was a bias. The lead was averaged per
fight, and a card picked as the best on both halves of a position's samples
adds two (winning) observations where a lucky pick adds one (losing) — twin
cards worth exactly the same read −2 PV. Averaged per observation (a clustered
ratio), the twins read zero. The noisy-twins control caught it.

**Requirement 3 gains a per-card half: a card is NEVER THE RIGHT PLAY** when its
lead over the runner-up, in the moments it looks best, is clearly below zero
(2σ), under every opponent model; never picked at all, after 30 decisions,
counts too. Workhorses tied with the alternative read ~0 and pass; twins pass.
Its must-fail control had to be rebuilt: beside two 2d6 attacks in one seat of
four, doing nothing really was about as good as attacking (gain −0.5, +0.5,
−0.2 ±0.8 across the models) — the choice barely moved that fight. Beside two
heavy, fastest, every-target attacks it is flagged, and the attacks are not.

**Sweep with the per-card half (2026-10-03):** every kit passes requirements
1–3; no card is never-right under all three opponent models. Lowest leads when
best: Marca de la perdició −2.4, Aguantar el cop −1.7 (both negative, neither
clearly so under every model). The column also shows the pattern it was added
for — Erupció is −3.0 against its hand but leads by +5.1 when it is the right
play; Presó de terra −0.4 / +4.6. Controls 28/28, fast tier 305/305, kit and
triangle suites 30/30, mutation 26/26.

**Calibration refreshed (2026-10-03, end of day).** Snapshot re-pinned to the
live kits (berserk without Cop d'espatlla): the reference party is Σ21
(`REFERENCE_SIGMA`). Re-measured from scratch: every kit passes 1–3; deltas
berserk +14.8 (near the band edge again), nigromant +8.2, enginyer +0.4,
mestre-armes −0.2, earthbender −2.9, volcanic −4.0. The triangle lost Protect >
Aggro (58% → 47%); now known-broken with Aggro > Power.

### 27.4 The September tuning, reverted and redone card by card (2026-10-04)

The user's call: revert the 22 remaining §26 changes and see which cards the
new requirements fail. Done on a branch, squashed into one commit.

**What was kept, and why.** Changes that repaired a broken game rather than
tuned a number stay: Amagar-se's "needs a goblin in view, not two rounds
running" (a lone goblin hid forever), the stone wall's life (default 2d6 —
the pre-September value, the 1d6 was balance), the bandolier reload (reverted
at first; the enginyer's p90 went back to 10 — it is a fight-length fix) and
September's bone devil (reverted, its fights saturated at 94–99% and four of
twelve cells dropped out of every kit's measurement). Ombres, whose
Desaparèixer had the same stall fix, was deleted outright.

**The 18 balance reverts, measured alone: no card failed a requirement.**
Several were weak — Atac encadenat 0% played, Putrefacció 0.7%, Riu de lava
2.9% — but none "never right". The user asked for lore-keeping buffs.

**Reading the combat logs found the cause** (48 fights per kit, the weak
cards' rounds): the caster kits die in round 2–3 to a few fast goblin stabs,
slow Focus cards are interrupted or never resolve (Riu de lava 1 of 3,
Mà de la tomba 8 of 13), and delayed payoffs (rot over 3 turns, lava next
turn, mines waiting for attacks, a reap needing a mark first) rarely arrive in
4-round fights. Bigger numbers did nothing; the fixes target the cause.

**The cards as merged** (pre-September → now):

| card | change | why |
|---|---|---|
| Entrar en Fúria | re-enterable, 3 turns, but every rage costs a fatigue level and it cannot be played Esgotat | the berserkergang's crash; bounds the re-entry stall (rules.md/intentions.md/CLAUDE.md now allow a card whose text says so to cost fatigue) |
| Rugit de guerra | speed 2 (reverted) | |
| Presó de terra | September's grip (2 turns, Focus only, cracked ground) and **nobody can guard the held enemy** | every swallow variant read −9 to −10 (out of the party's reach too); a swallow that crushes 1d4/turn read −6.6; the grip +0.9 |
| Cop de roca | 2d4, speed 2 | a thrown stone is quick |
| Columna de terra | 2d6, speed 0 (reverted) | |
| Mà de la tomba | 2d6, condemned only | an every-enemy version made the AI spam it and the nigromant fell from +9 to −4 |
| Putrefacció | speed 1, 3/turn, first tick on infection, spreads on d20 < 7 | the rot bites at once |
| Invocar l'ombra | speed 1, 3 turns | at −5 it was interrupted almost every time |
| Marca, Xuclar la vida, Sudari | reverted | |
| Riu de lava | 2d6, speed 0, arrives at the end of this round | delayed and slow, it never landed |
| Granada | 1d6 | |
| Traca final | 1d6 per charge | |
| Bomba de fum | speed 3, this turn and the next, d20 ≤ 12 | smoke after the blow is no smoke |
| Camp minat | 1 charge, 4 mines of 1d8, every attack trips one, speed 0 | its cost was the bandolier |
| Atac encadenat | September's attack that starts the chain | as a Focus it was never played (rollouts agree: −3.5) |

**AI change (instrument):** a non-attack card aimed at an enemy — a swallow, a
curse, a plague — now goes to the healthy, dangerous enemy; the attack
heuristic ("focus the wounded") wasted them on enemies about to die. Tested,
with a mutant.

**Final sweep (calibration re-pinned):** every kit passes 1–3 — berserk +17.0
(inside only within its noise), nigromant +7.3, enginyer +1.3, mestre-armes
+1.3, earthbender +0.8, volcanic −5.8. Triangle unchanged: Power > Protect
80%, Protect > Aggro 51%, Aggro > Power 24% (both still known-broken).

Still weak, by choice or open: Mà de la tomba (the price of a strong
nigromant), Marca de la perdició, Aguantar el cop (its own review), Erupció.

### 27.5 Ferro lost its sweet spot with the berserk review (2026-10-04)

The merged retune failed the armour test on ferro. Bisected with the cache
off (the old commits still have the blind fingerprint, so cached numbers there
mean nothing):

| commit | ferro, pooled over 0–4 wearers | verdict |
|---|---|---|
| 4745e6c (September tuning) | 72.9 / 74.7 / **76.5** / 75.1 / 73.6 | ✅ peaks at two |
| a5012ea (berserk review: Cop d'espatlla removed, Aguantar el cop without a guard roll) | 75.5 / 74.9 / 74.0 / 71.4 / 67.3 | ❌ falls with every wearer |
| main before the retune, and after it | 74.6 → 67.4, 84.5 → 72.6 | ❌ |

So it is the berserk review, not the retune: the berserker is common in the
drawn parties, and with his guard card gone and Aguantar taking every blow
uncontested, iron's speed cost outweighs its armour. Ferro is now
\`KNOWN_WITHOUT_SWEET_SPOT\` beside cuir. It moves with backlog item 1
(Aguantar el cop's open design) and item 3 (the armour pass).

### 27.6 Overnight findings, for decision (2026-10-04)

Measurements only — nothing here is merged; every option is a decision.

**The strategy triangle (backlog 2).** Read from 60 mirror fights per pairing:

- The triangle is measured on ONE table: `mirrorParty()` is company row 0 —
  berserk (the row's stand-in), mestre-armes, volcanic, metge. Its verdict is
  a fact about that party. Option: pool the three duels over every company
  row, as the kit cells do.
- Power does not win the way `intentions.md` assumes (slow focuses that fast
  attacks interrupt). Its most played focuses are fast or protective: Cures de
  camp (195 plays in 60 fights), Entrar en Fúria (176), Riu de lava (158) and
  **Rugit de guerra (144)** — the roar, at speed 2, cancels every enemy who
  loses its d20 and has not acted. Against Aggro, Aggro's actions were
  cancelled 182 times, Power's 42. "Buff Aggro against slow focuses" would
  miss: the corner that needs an answer is the roar's mass cancel (and the
  heal), not slowness.
- Protect vs Aggro is even (48–51%): Protect blocks, but deals almost nothing.

**The remaining weak cards (backlog 1)**, from their combat logs:

- Marca de la perdició → Mà de la tomba is a two-turn combo in four-round
  fights, and the nigromant often dies before it completes. September's
  "Marca is an ATTACK (1d6) that condemns what it hits" measured alive.
- Erupció works as designed: it hits allies too ("la muntanya no distingeix"),
  so it averages −2.4 but leads by +8.3 when it is the right play.
- Aguantar el cop is chosen rarely (7 times in 96 fights) and its rage works
  when played. Possible bug for its review: used to BLOCK, it adds 4 to a
  defense wall although it never rolls a defense.

**Armour (backlog 3)** — curves depend only on the (armour, speed) pair:

| armour / speed | sweet spot | inside ±15pp |
|---|---|---|
| +2 / −1 (cuir now) | ❌ falls | ✅ |
| +3 / −2 (ferro now) | ❌ falls | ✅ |
| **+3 / −1** | **✅ peaks at 3 wearers** | ✅ |
| +4 / −2 | ❌ borderline (peak at 2, not clear) | ✅ |
| +5 / −2 | ✅ peaks at 2 | ❌ one fight moves > 15pp |
| +4 / −1 | ❌ keeps rising | ❌ |
| +5 / −3 | ❌ falls | ✅ |

Cuir at +3/−1 works cleanly; ferro has no clean point at whole-number speeds.
**Caution:** the armour fights are solved to 65% but now replay at 84.5% bare
(72–75% before the AI's non-attack targeting change) — near the 80%
saturation line the kit cells already refuse, where differences compress.
Checked: the solver is honest and the armour test ignores it. Solving the
three armour fights for a bare drawn party at 65%:

| fight | solver's own report | replay |
|---|---|---|
| escamot (4 bone devils) | `searchMissed`, predicted 85.7%, PV 17 | 85.9% |
| cap (basilisk) | `searchMissed`, predicted 94.0%, PV 61 | 92.1% |
| elit (3 golems) | `durationCapped`, predicted 76.3%, PV 22 | 75.6% |

`set.work.ts` skips only `clamped` solves, so the armour verdicts are read in
fights the solver says it could not price. Decision needed: skip or flag
missed solves (two of three fights would drop out), or pick armour fights the
solver can hit. Until then the armour sweet-spot verdicts — and the variant
table above — are measured near saturation.

## 28. The encounter creator answers in under 3 seconds (2026-10-04)

The user's bar: a GM runs three or four iterations per encounter and must not
wait more than ~10 s in total, so one solve gets **3 s**. That is now a test,
`sets/fantasy/test/encounter-speed.test.ts`: four realistic requests (a goblin
horde, three bone devils, a lone basilisk, goblins with a horned devil) at a
65% target against a four-hero explicit party, each under 3 s, plus an
assertion that the parallel answer equals the serial one.

Measured on this machine (8 cores), seconds per solve:

| request | before | one thread, after | 8 workers |
|---|---|---|---|
| 5 goblins | 22.5 | 15.1 | 2.6–2.75 |
| 3 goblins + horned devil | 12.4 | 8.9 | ~1.9 |
| 3 bone devils | 6.8 | 4.4 | ~1.0 |
| basilisk | 3.4 | 2.2 | ~0.44 |

Where the time went: depth-1 fights are 97% of a solve, and a `Set` built per
roll in `getRollBonus` was 17% of all CPU. Three changes, see ARCHITECTURE
"Speed": the roll-bonus sum no longer allocates; accept/reject checks stop
early once the answer is three standard errors clear; and every simulation is
split into seeded chunks that a worker pool plays in parallel, with answers
identical to the serial ones.

Open: the horde is the tightest request (≈2.7 s against 3 s), and a machine
with fewer cores is proportionally slower. The reserve lever, if it is needed,
is fewer final-verification fights. The web creator was type-checked and
bundled but not exercised in a real browser.

## 29. Berserk retune, and the AI decisions that were mostly noise (2026-10-04)

### 29.1 Content

Tuned with the user card by card, numbers before mechanics:

| card | now | was |
|---|---|---|
| Rugit de guerra | each enemy rolls a d20, under 10 loses its pending action | a contest the berserker's level dominated |
| Entrar en Fúria | 2 turns, costs a fatigue level, **speed 0** | 3 turns, free, speed 2 |
| Aguantar el cop | takes **a quarter** of the blow; adds nothing to a wall and takes its breach | half; lent its level to a wall |
| Marca de la perdició / Mà de la tomba | speed 3, 3 turns / 3d6 | |
| Camp minat | 3d4, speed 1 | |
| Riu de lava | **2d4**, speed 1 | 2d6, speed 0 |

Riu de lava at speed 1 with 2d6 was the strongest volcanic card and broke two
calibration tests through the pinned copy; 2d4 keeps the speed and passes.
Entrar en Fúria at speed 2 dominated every berserk decision (+12 PV against the
hand) and held the kit at +14pp; at speed 0 the rage can be broken by a blow
that lands first, the kit sits near neutral and every card passes. Its fatigue
cost and bonus barely mattered — the speed did. With it, **the strategy triangle
holds on all three edges** (`KNOWN_BROKEN` emptied).

### 29.2 The AI compared cards on unpaired luck

Fúria at speed 0 broke two AI-quality checks: a bigger search beat production
by 8.1pp, and production beat "always play your smallest attack" only 62.7%.
Forbidding any berserk card did not help — the AI was not misjudging a card.

**Root cause: the pairing did not pair.** The lookahead compares candidates on
common random numbers, but a whole round draws from ONE stream, so the first
card that rolls a different number of dice shifts every later roll and the
candidates meet independent dice. Production disagreed with a 32-rollout
reference on ~50% of decisions, for every hero. Fixes:

- **Per-seat random streams** (`CombatEngine.seatStreamSeed`, set only inside
  rollouts; real fights are untouched): bigger search's lead 8.1 → 4.2pp, +2.9pp
  at equal budget. Engine test `seat-streams.test.ts`, plus a mutant.
- **Six rollouts per card, not four**: against the smallest-attack baseline,
  s4 65.6% · s6 70.0% · s8 71.9% · s16p2 78.0% — the AI had more to give, at
  ~+40% cost per depth-1 fight.
- **Card-value rollouts** (`bench/regret.ts`) carry the same streams: the
  "choosing matters" error bar tightens (berserk 3.31±0.32 → 3.86±0.28 PV).

Tried and NOT kept, because they measured as no gain: a paired racing cutoff
(agreement with the reference 55.5% → 55.7%), streams in the AI head-to-heads,
and streams in the solver's own fights (answer spread across seeds unchanged).

### 29.3 The solver, for the new AI's speed and strength

The stronger AI made every solve ~40% slower and exposed three solver faults:

- The real-depth refinement climbed PV past the duration budget and the
  duration walk then bisected back from the bottom of the range. Now one check
  per step reads both (`judgeAt`), and a repeated seeded chunk is never replayed
  (`decideChunk`; two midpoints can round to the same PV).
- The refinement only searched ×1.6 around the depth-0 answer; the stronger AI
  crosses outside it, so it pinned to the edge and reported misses. Its bracket
  now moves (`VERIFY_MOVES`).
- The depth-0 duration cap was a hard ceiling, but the depth-0 AI plays longer
  fights: a synthetic boss was "capped" at 2.7 rounds of a 6-round budget. It is
  now only where the refinement starts, and the final length walk starts from
  the largest PV already shown to fit, not from the bottom of the range.

The synthetic fixture's `maxAvgRounds` went 6 → 8: at 6 its shapes came out
capped near saturation and the pipeline's positive control failed.

Speed test (8 cores), seconds per solve at 65%: horde ~2.4, bone devils ~1.9,
basilisk ~1.6, mixed ~1.7.

## 30. An AI test suite, kept only where it measured useful (2026-10-04)

Four candidate layers were built and each was run against nine injected AI
faults (two rollouts, streams off, an evaluator blind to statuses or to
bodies, opponents playing their first card, area priced as one body, attacks
aimed at the healthiest, no search pass, racing that cuts on no evidence). A
layer stayed only if it caught something the existing tests did not.

| layer | caught | kept |
|---|---|---|
| metamorphic (a strictly worse twin, an exact duplicate) | nothing | no |
| puzzle bank, fast (`ai/test/puzzles.test.ts`) | blind to bodies (no other fast test did), no search pass | **yes** |
| decision quality against a 32-rollout reference | two rollouts only, which the strength suite also catches; blind to anything that breaks the reference too | no |
| blind-spot check per kit (`isBlindSpot`, in `kitSuite`) | the status-blind AI (flags Invocar l'ombra and Marca on nigromant) | **yes** |

The existing slow strength suite (`ai-strength.slow.test.ts`) caught seven of
the nine; the old fast tests caught four. Two mutants now guard the kept layers.

**What the kept layers found on today's AI:**

- **Targets are never searched.** `pickResolveTargets` gives "interrupt a
  pending focus" the same bonus whatever the focus does, so beside a harmless
  focus it can hit the wrong foe and let a deadly one resolve. Recorded as a
  known failure (the `aim` puzzle, `it.fails`).
- **Two cards are blind spots:** Presó de terra (best play 21% of the time,
  played 2.6%) and Camp minat (24%, 3.4%). Both pay off in later rounds, which
  a one-round evaluator cannot see unless their statuses price themselves
  (`StatusBehavior.positionValue`). Recorded in `KNOWN_BLIND`; every number
  measured through the AI undervalues them until fixed.

## 31. The AI searches its targets (2026-10-04)

Targets used to come from `pickResolveTargets`, a fixed rule, while only the
card was searched. The rule gives "interrupt a pending focus" the same bonus
whatever the focus does, so beside a harmless focus it could hit the wrong foe
and let a deadly one resolve (the `aim` puzzle, §30).

Now a single-target choice is searched at resolution (`searchTargets`): the
rest of the round is played out per candidate on paired rollouts, and a
candidate must beat the rule's pick outright. Measured in mirror fights against
the same AI with the rule:

| rollouts per target | win rate vs the rule | cost per fight |
|---|---|---|
| 6 | 79.3% ±1.4 | +37% |
| 3 | 76.3% ±1.5 | +19% |
| **2 (production)** | **76.9% ±1.5** | **+13%** |

The largest gain the AI has had. Solves stay under 3 s (horde ~2.5 s, mixed
~2.5 s on 8 cores). Also fixed on the way: a target choice draws from the
acting seat's own stream (on the shared one each search shifted every later
search's seed in a paired branch), and the kit cells now play exactly the
production AI (`CELL_AI = DEFAULT_LOOKAHEAD`; it had stayed at four rollouts).

**What moved:** Presó de terra is no longer a blind spot. Four synthetic
controls failed the same way — differences between kits SHRANK, because both
sides now focus whoever threatens most: a giant draws all the fire, a weakling
is left alone, and a slow heavy blow tends to get its wielder killed before it
lands. Confirmed without the card-value instrument: swapping the synthetic
brawler's slow Smash for a do-nothing card leaves its winrate unchanged. The
controls were rebuilt so their premises hold: a far bigger giant (6d6/6d6/8d6),
a weakling at 1d1 and speed 0, a combo whose aimed shot adds 12d6, and the
do-nothing card asserted below the kit's average card rather than last.

**A flaky red slow tier, fixed.** Cold full runs ended with vitest's
"Timeout calling onTaskUpdate" though every test passed. The one slow file
measuring in-process (`combat-balancer/test/calibration.slow.test.ts`) ran
sixteen solves synchronously at collection time and a depth-1 solve in one
block; the slower AI pushed those blocks past vitest's one-minute RPC deadline.
They now run in hooks that yield between requests and chunks.

## 32. Ten games by hand against the AI (2026-10-04)

Claude played one side of the mirror party (berserk, mestre-armes, volcanic,
metge) by hand, seeing every legal card and the reveal before choosing
targets; the production AI (depth 1, six rollouts, searched targets) played
the other. **The AI won 7–3.** Its play was strong, not merely legal:

- it killed an adrenaline-boosted attacker before its second strike, and hit
  lava casters to break their focus;
- it blocked my main attacker with Aguantar el cop round after round, walled
  that berserker with two guards, entered fury, then struck for 45;
- its medic revived the fallen, every game.

Where it was weak: it used Injecció d'adrenalina offensively once in ten
games (it is the strongest opener: a doubled Atac llampec killed a 12 PV hero
on round one five times), and a hopeless berserker chained fury to stall
(one game ran 12 rounds).

**Game findings, for decision:**

1. **Healing revives the dead, and the revived act that round.** Healing cards
   may target downed allies (`canReviveTarget` for heal effects); a hero
   killed early in a round and healed at speed −1 still takes a slower
   pending action. It decided five of the AI's seven wins. `rules.md` never
   mentions revival.
2. **Aguantar el cop's bonus stacks without limit when used as a block.** Each
   quartered blow banks +2×damage for the rest of the combat; one berserker
   banked over +20 and hit for 45.
3. **The weapon master's chain multiplies any attack**, so Tall precís (3d4,
   slow) lands for 26–28, and damage goes fractional (13.5 dealt, 0.5 PV
   left) because the ×1.5 is never rounded.
4. **Entrar en Fúria at speed −1 loses a turn**: cast at the end of a round,
   that round counts as one of its two.

## 33. Camp minat priced for the AI (2026-10-04)

The last blind spot (§30). Its minefield status priced itself at a flat 0.15
a mine, capped at 0.6 — about a quarter of the blasts' worth — so the card was
the best play in 24% of its decisions and played on 3.4% of the turns it was
legal. Now each mine is its average blast against a body's health, discounted
to 0.8. Measured on the explosives kit:

| mine value | AI plays it | best play | kit |
|---|---|---|---|
| flat 0.15, cap 0.6 (was) | 3.4% | 24% | — |
| 0.3 × blast | 3.0% | 29% | +2.5pp |
| 0.5 × blast | 3.7% | 26% | +3.5pp |
| **0.8 × blast** | **6.1%** | **27%** | **+1.9pp** |
| 1.2 × blast | 6.5% | 26% | +3.0pp |

The play rate stops responding past 0.8, so something else holds the card
back (likely the shared charges Granada and Traca final spend); 0.8 clears the
blind-spot bar and keeps the estimate conservative. `KNOWN_BLIND` is empty.

## 34. Entrar en Fúria lasts its two turns (2026-10-05)

The user's call on §32 finding 4. A status counts down at the end of the round
it was set in, so the rage's two statuses (`furia`, `indestructible`), set to
2, protected for one round after the rage resolved, while its +5 (a modifier
that skips its first tick) ran for both. They now start one tick higher;
`cards.test.ts` plays it exactly (untouchable in rounds 2 and 3, felled in
round 4), and a mutant guards it.

Measured: berserk +3.7pp, every requirement passes. The strategy triangle's
Aggro > Power edge went from ~57% to 52.4%±1.8 (a stronger rage strengthens the
focus corner) and is recorded in `KNOWN_BROKEN`.

The asymmetry is general: any status set mid-round loses its first round, while
`NextNTurns` modifiers do not. Only the rage was changed.

## 35. Decisions waiting, with measured options (2026-10-05)

Everything else is done. Each item below is a design call; the measurements
are on today's main (fury fix included), one kit report each, ~800 combats.

### 35.1 Revival by healing (§32 finding 1)

Healing cards may target downed allies and the revived act that round. With
heals limited to the living, the six main kits measure (delta vs neutral):

| kit | revival on | revival off |
|---|---|---|
| berserk | +5.1 | −0.3 |
| earthbender | +3.7 | +5.0 |
| enginyer-explosius | +4.3 | +4.6 |
| mestre-armes | +5.5 | +5.9 |
| nigromant | +15.8 | +16.8 |
| volcanic | +0.2 | +2.4 |

All stay inside the band. **Recommendation: heals heal the living only** — the
rules never mention revival, and it decided five of the AI's seven hand-played
wins. (Alternative not measured: revive allowed, but the revived lose their
action that round.)

### 35.2 Aguantar el cop's unbounded bonus (§32 finding 2)

| variant | berserk | Aguantar el cop value |
|---|---|---|
| bonus for the rest of combat (now) | +5.1 | −0.6 |
| **bonus lasts 2 turns** | +3.6 | −0.5 |
| bonus lasts 3 turns | +4.1 | −0.6 |
| bonus equal to the damage, not double | +4.3 | −0.7 |

The kit cells barely see the exploit (it needs a mirror that keeps attacking
the blocker); every cap costs the card nothing measurable. **Recommendation:
2 turns** — pain fuels the rage for a moment, and it caps the 45-point blow.

### 35.3 Fractional damage from multipliers (§32 finding 3)

Rounding a multiplied attack total down changes nothing measurable (mestre-
armes +5.5 either way). **Recommendation: round down**, so PV stay whole.

### 35.4 Armour has no sweet spot under today's AI

The curves depend only on the (armour, speed) pair. Pooled player winrate by
wearers (0 → 4):

| armour / speed | curve | shape |
|---|---|---|
| +2 / 0 | 75 → 78 → 80 → 81 → 83 | always better |
| +2 / −1 (cuir now) | 75 → 72 → 69 → 66 → 64 | always worse |
| +3 / −1 | 75 → 74 → 72 → 70 → 70 | always worse |
| +3 / −2 (ferro now) | 75 → 70 → 65 → 56 → 49 | always worse |

With target search the AI punishes slowness hard enough that one point of
speed outweighs every armour value tried; without a speed cost armour is free
value. Options: relax the requirement (armour is a bounded lever with no
dominant choice — none of these move more than 15pp), or redesign armour so its
cost is not speed. **Recommendation: relax it**, and revisit if armour becomes a
design focus.

### 35.5 The free "esgotadora" cards (§11)

Making them free moved nothing measurable in 2026-09; Entrar en Fúria is priced
since §27.4. **Recommendation: they stay free**, and the item closes.

### 35.6 Strategy triangle: Aggro > Power is even (§34)

52.4%±1.8 since the rage lasts its full two turns. **Recommendation: accept
for now** (recorded in `KNOWN_BROKEN`); if Power should lose to Aggro, the lever
is the rage, not Aggro.

### 35.7 For information, no decision needed

- **Weak cards:** with today's AI every kit passes every requirement. The
  nigromant sits at +15.8pp, at the band's edge but inside its noise.
- **The encounter creator works in a real browser** (headless Chromium via
  DevTools): a solve answers ~3.3 s after a click, of which 350 ms is the
  deliberate debounce, with no console errors.
- **Closed without action:** the stall probe and the wider fight shapes (§26).
  Every kit passes "fights end", and the one stall seen by hand (a hopeless
  berserker chaining fury, §32) ends by exhaustion.

## 36. Aguantar el cop, Rugit de guerra, and failing checks that name their culprits (2026-10-05)

**Decided by the user on §35:**

- **Aguantar el cop's bonus lasts the next turn only** (was the rest of combat;
  it stacked to +20 and a 45-point blow). Berserk +3.9pp, every requirement
  passes; an exact card test and a mutant guard it.
- **The free esgotadora cards stay free.** The item is closed.
- **Rugit de guerra cancels on a d20 under 7** (was 10). The triangle's
  Aggro > Power edge had gone even (52–56%). Taking each Power card out of hand
  in turn showed what held it up — Rugit de guerra (Aggro 55.8% → 70.9%
  without it) and Cures de camp (→ 68.4%); Entrar en Fúria barely mattered
  (57.5%). The roar is a FAST focus that cancels attacks, the reverse of the
  slow, interruptible focus the triangle assumes. Measured fixes:

  | roar | Aggro vs Power | triangle | berserk | roar |
  |---|---|---|---|---|
  | speed 0 | 68.5% | holds | +3.2pp | ❌ never the right play |
  | **under 7** | **65.1%** | **holds** | **+1.2pp, all pass** | best play 19% |

  `KNOWN_BROKEN` is empty again.

**Failing checks name their culprits** (the user's option 2). That search is
now automatic (`playtest/src/blame.ts`):

- `blameEdge(winner, loser)`: each of the losing style's cards out of every
  hand on its side, the edge re-measured, ranked by the winner's gain. The
  triangle test attaches the top three to a broken edge's failure. On the
  pre-fix content it named Rugit de guerra (+17.0pp) and Cures de camp
  (+14.9pp) of 18 cards, in 89 s.
- `blameKit(subject, 'strength' | 'duration')`: each of the kit's cards out of
  hand (`CellSetup.withoutCard`, keyed into the cache), the kit re-measured,
  ranked by how far the failing number moves back. The kit suite attaches it
  to a failing power band or fights-end verdict.
- Control: `controls-blame.slow.test.ts` plants one overwhelming card in a
  plain synthetic kit; the search must rank it first, by a margin.

## 37. Armour bumped until it was worth wearing — and reverted (2026-10-05)

The user's call on §35.4. With targets searched, acting later cost more than
armour bought back. Swept upward with the speed costs kept (pooled player
winrate by wearers, 0 → 4, in the armour test's fights only):

| armour / speed | curve |
|---|---|
| +2 / −1 (cuir was) | 75 → 72 → 69 → 66 → 64 |
| +4 / −1 | 75 → 73 → 75 → 72 → 75 |
| **+5 / −1 (cuir now)** | **75.1 → 75.2 → 77.1 → 77.6 → 78.0** |
| +6 / −1 | 75 → 76 → 81 → 80 → 84 |
| +3 / −2 (ferro was) | 75 → 70 → 65 → 56 → 49 |
| +7 / −2 | 75 → 72 → 76 → 72 → 72 |
| **+8 / −2 (ferro now)** | **75.1 → 75.9 → 79.5 → 78.6 → 78.7** |
| +9 / −2 | 75 → 76 → 83 → 87 → 89 |

Cuir +5/−1 and ferro +8/−2 were the smallest values worth wearing, and were
applied. **The rest of the game broke**, and was not in the sweep: the
nigromant went to +42.3pp (culprit search: Invocar l'ombra de l'infern),
Power > Protect fell to 46.1% (held up by Pell d'obsidiana and Erupció), both
AI-quality checks failed, Bomba de fum read as a blind spot, and two
encounter solves passed 3 s. **Reverted.**

Why: damage is the margin minus armour, so armour is not linear. Five or eight
points erase a weakened blow entirely — a condemned enemy (disadvantage, −3
speed) or an attack into Pell d'obsidiana does nothing at all. Armour cannot
be made worth wearing by its points; its COST has to change (the speed).

## 38. The AI thinks harder within the 3 s budget; Mà de la tomba back to 2d6; armour's cost (2026-10-05)

**A second pass** (the user approved eight rollouts; two passes did the job
better and cheaper — below). With today's cards
both AI-quality checks sat just under their bars (65.8% against "always play
your smallest attack", bar 70%; a bigger search +5.0±1.8pp ahead, bar 8 with
noise), and a bigger search measurably plays better. Paid for first:

- Profiling depth-1 fights: the opponent model recomputed the actor's facts
  (who is wounded, which enemies hold an interruptible focus, each enemy's best
  defence) once per CARD, and the targeting rule re-scored both candidates on
  every sort comparison. Both now compute once per decision. Hot read-only
  status queries (visibility, speed, the evaluator's status prices) no longer
  build a snapshot array per call. A seeded fight fingerprint is identical
  before and after; ~38% less time per fight.
- The solve's single most expensive step is its final, reported measurement:
  300 → 200 fights (±3.4pp at a 65% target instead of ±2.8).
- Then the search itself, against "always play your smallest attack" with
  today's cards (800 mirror fights each):

  | search | vs the baseline | time per fight |
  |---|---|---|
  | 6 rollouts, 1 pass (was) | ~66% | — |
  | 8 rollouts, 1 pass | 66.1% | 7.2 ms |
  | 4 rollouts, 2 passes | 62.7% | 5.8 ms |
  | **6 rollouts, 2 passes** | **69.7%** | **8.4 ms** |
  | 8 rollouts, 2 passes | 74.4% | 11.3 ms |
  | 16 rollouts, 1 pass | 72.4% | 13.0 ms |

  More rollouts barely helped; a second pass — each hero reconsidering once
  its teammates have chosen — did, since today's cards reward coordination.
  Production is now 6 rollouts and 2 passes; every AI-strength check passes
  (the bigger rung is now 12 rollouts and 3 passes), and the nigromant is back
  inside its band with it.
- The creator's four test solves: horde ~2.7–2.8 s, mixed ~2.7–2.9, basilisk
  ~1.8, bone devils ~1.3 — inside 3 s, though the margin is thin.

**Mà de la tomba back to 2d6** (was 3d6), the user's call: after the berserk
retune the nigromant read +18.7pp; the culprit search named Mà de la tomba
first. At 2d6 it reads +16.2pp±1.6 — inside the band within its noise.

**Armour by its cost, not its points** (the user's call after §37), each
variant against the whole slow tier:

| variant | cuir by wearers 0→4 | ferro by wearers 0→4 | other failures |
|---|---|---|---|
| cuir +2/0, ferro +3/−2 | 75 → 77 → 79 → 81 → 84 | 75 → 70 → 65 → 58 → 49 | Rugit de guerra and Bomba de fum read blind; berserk p90 9 rounds |
| cuir +2/0, ferro +3/−1 | as above | 75 → 72 → 72 → 70 → 70 | the same |

Cuir with no speed cost is worth wearing (always, so no sweet spot) but tips
three other checks; ferro at −1 is still not worth it. Armour stays as it was
pending a decision.

**What the two-pass AI moved, and the margin it needed.** Five checks sat a
hair past their bars once the AI coordinated better; each got margin from the
cause, not a looser bar:

- The pipeline's bigger kit read *lower* with bigger dice (5.8pp at 8d6 vs
  6.8 at 6d6): enemies focus the biggest threat, and a slow giant dies before
  its dice speak. It is now also faster (+4 speed) on 6d6/6d6/8d6.
- The band's smaller kit is two 1d1 attacks acting last, fielded in all four
  seats: alone in one seat a kit that barely acts costs its party only ~18pp
  now (teammates cover, enemies ignore it), never CLEARLY past a 15pp band.
- The combo's unaimed shot is 1d2 (was 1d6): the cost of playing the pair out
  of order is what the control reads, and extra aimed dice were overkill.
- Camp minat's mines are priced undiscounted (was 0.8 of their blast).
- `harnesses.slow.test.ts` now gives scripts `CALIBRATION_GAMES=4`, as
  `pnpm test:smoke` does: right after a re-pin, scripts that take 13 s alone
  recomputed every baseline at full size and ran past ten minutes.

## 39. Revival by healing stays (2026-10-05)

The user's call on §35.1: it fits the lore, and a revived hero does not lose
the turn. Nothing changes in the engine; `rules.md` now says it (Resolució de
combat, step 6): a fallen hero's pending action does not resolve, a heal may
target a fallen ally, and one revived before their turn comes plays it.

## 40. No arithmetic at the table beyond adding (2026-10-05)

The user's call: no card may ask a player to multiply or divide. Every card was
read; only two did, Atac encadenat and Aguantar el cop. Every other "per" or
"twice" is counting, or copying a number already on the table. This also
closes §35.3: with no multiplied damage there is nothing to round.

**An engine bug found on the way.** The engine combined a status's multipliers
for the next attack but dropped its flat bonuses (`attackRollBonus`), so
Estat de flux's "+6 to your next attack" had never done anything. A flat chain
that measured the same at +3 and at +50 gave it away. Now fixed, with a seam
test ("a status that adds a flat bonus to the next attack adds it to the
total") and a mutant. With it, the weapon master measured +8.9pp, against
+6.2 before, well inside the band.

**Atac encadenat: ×1.5 then ×2 became +5 then +10.** On a typical attack of
about 10 that adds what the multipliers did. Measured with the fix, the
weapon master's kit, in wins per 100 fights over a plain kit:

| chain | kit | card vs the hand | best play | AI plays it |
|---|---|---|---|---|
| ×1.5, then ×2 (old) | +8.9 | +1.1 PV | | |
| +3, then +6 | +8.0 | +1.1 PV | | |
| +5, then +10 (chosen) | +8.3 ± 1.6 | +1.2 PV | 19% | 21.8% |
| ×2, then ×3 | +9.6 ± 1.6 | +1.7 PV | 21% | 22.2% |

×2/×3 was rejected for the table, not for the number: its third link landed 30
to 45 in one blow, a wipe card that the report card hides because the solver
pads enemy PV (see the "judge table feel" principle).

**Aguantar el cop: "a quarter of the damage" became "the full blow, but you
can't fall below 1 PV this turn; next turn {A} = twice the damage taken".**
The card's lore is that the berserker always takes the blow. Five versions
were measured first, each in one seat of a full party:

| version | kit | right choice | AI uses it |
|---|---|---|---|
| full blow; next turn + the damage taken | +0.7 | 1 in 11 | 1 in 60 |
| full blow; next turn +6 if hit | +0.7 | 1 in 10 | 1 in 60 |
| full blow; +2 per blow taken | +0.7 | 1 in 11 | 1 in 60 |
| full blow; next turn + twice the damage | +0.7 | 1 in 11 | 1 in 60 |
| full blow, can't fall this turn; next turn +6 | +0.4 | 1 in 7 | 1 in 4 |

The size of the reward made no difference; what killed a version was eating a
full blow with nothing protecting you. Only refusing to fall (D&D 5e's
Relentless Rage; Pathfinder's damage reduction, Daggerheart's armour slots and
Slay the Spire's Rupture were also considered) made it worth playing. The user
chose to combine that with the doubled damage. Measured on the full berserk
kit:

| | kit | card vs the hand | right choice | AI uses it |
|---|---|---|---|---|
| can't fall; next turn twice the damage taken | +1.9 ± 1.7 | −1.5 PV | 15% | 21.1% |

Alive: chosen as often as Embat sagnant, right about one decision in seven. Its
"vs the hand" is negative, like every situational card's. Doubling is the one
multiplication left in the game, and it is doubling a number the player has just
written down, so it was kept. The bonus lasts one turn and never stacks
(§36). The card's test checks the full 8 taken and the 16 banked, and that a
50-point blow leaves him at 1 PV; a mutant checks that the floor holds.

Both kits were re-pinned (`pnpm calibration:refresh`).

## 41. Armour stays as it is; the sweet spot is no longer a requirement (2026-10-05)

The user's call on the last open decision (§35.4, §37, §38): cuir stays +2
armour / −1 speed and ferro +3 / −2. Armour need not pay off — whether to wear
it is the player's call — so the requirement that it be "right on a few, wrong
on all" is dropped: `sweetSpotVerdict`, its unit tests and mutants, and the two
known-failing checks in `set.slow.test.ts` are gone. The small-lever check
(the whole party in ferro moves a fight by at most fifteen points) stays, and
still prints both curves.

What the sweep found first, under the two-pass AI (party wins per 100 fights
by number of wearers, pooled over the bone devils, the basilisk and the golems,
in the armour test's fights):

| armour / speed | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| cuir +2 / −1 (kept) | 77 | 77 | 72 | 68 | 66 |
| cuir +4 / −1 | 77 | 77 | 77 | 78 | 78 |
| cuir +6 / −1 | 77 | 81 | 83 | 85 | 87 |
| ferro +3 / −2 (kept) | 77 | 74 | 69 | 59 | 50 |
| ferro +7 / −2 | 77 | 78 | 79 | 77 | 73 |
| ferro +8 / −3 | 77 | 77 | 80 | 81 | 78 |
| ferro +10 / −3 | 77 | 81 | 91 | 94 | 96 |

At −1 speed each wearer adds or costs about the same, so cuir's curve never
bends: always wrong, neutral at +4, always right from +5. A steeper speed cost
bends it, and ferro +8 / −3 was the one setting that passed the sweet-spot rule
(and depended on the enemy: wrong against the bone devils, right against the
basilisk). It was not adopted — the user prefers the armour as it is — and its
whole-game run was stopped unfinished, so whether +8 again broke the rest of
the game as in §37 is unknown.

## 42. A second set: Els Quatre Elements (2026-10-06, on branch `elements-set`)

> **Superseded the same day.** Every card and creature described below was
> deleted (2026-10-06) to be redesigned from scratch: the complementary kits
> (Chakres, Enginy) are gone for good, every hero carries one skill, and the
> `card-taste` agent now designs each card's concept before it gets numbers
> (`packages/sets/elements/DESIGN.md`). What follows is the history of the
> first version — its measurements describe cards that no longer exist.

The user's brief: a new set in a world like *Avatar*, where water, earth, fire
and air have benders; its enemies researched from that world; its ultimate
villain the Master of Fear, modelled on Pain (*Naruto*), who uses fear to
divide the party and shut down what it can do, and who is secretly the fallen
disciple of an air master — with Easter eggs that let players work it out. The
earthbender moves from the fantasy set to this one. Concepts first, numbers
second. **Not merged into main until the user accepts it.**

The lore and the why of every card are in `packages/sets/elements/DESIGN.md`.
What follows is what was built and measured.

### 42.1 What it is

- `packages/sets/elements` (`@pimpampum/set-elements`), the same shape as the
  fantasy set: content root, a `./bench` `GameSet` adapter, pinned calibration
  copies, its own tests (content, cards, calibration, snapshot, mirrors, the
  triangle, one kit suite per main kit).
- Five main kits (aigua, terra, foc, aire, bloquejador de chi), two
  complementary (chakres, enginy); nine creatures; the villain as six bodies and
  the Mestre himself.
- Engine: one generic seam — a defense's `onDefend` now receives the margin it
  won by (Desviar el corrent returns it). Seam test and mutant added.
- Tools: `src/sets.ts` and `--set elements` for the kit analyzer and the shape
  probe; the conventions test allows the new layer.
- The fantasy set loses the earthbender: its company row 2 seats the weapon
  master instead, the encounter-speed party fields the engineer, and the
  calibration was re-pinned.

### 42.2 Probes that changed the content

- **Stalls.** Stone agents and the sea serpent made themselves unreachable
  every round ("nobody can attack you this turn") and fights ran to the
  40-round cap even at 1 PV a body. The effect now has a one-turn cooldown.
- **Block walls.** Blocks sum, and Desviar el corrent returned the WHOLE wall's
  margin: 25-34 back per blocked sweep. Capped (now 4).
- **Lone monsters.** Against a block wall a lone creature never landed a blow;
  the serpent's spout and the puppeteer's needles now hit every enemy (an attack
  on everyone is not redirected by blocks, per the rules), and Koh punishes
  everyone who struck him LAST turn — reading this turn made it a slow Focus
  that the very blows it punished cancelled. Koh alone: from 97% for the heroes
  to 56% at 28 PV.
- **The villain.** All seven bodies solved to 4 PV each: a five-round fight
  holds only so much enemy health. The standard encounter is the Mestre plus
  three bodies (70% at 27 PV a body); all six is `NIGHTMARE`. Ablation at a
  fixed 15 PV named the Míssil (3d6 → 2d6) and the Palmell del buit's
  Defense-lock (now an isolation) as the lethal pieces.

Shapes (probed against the calibration party, each solved inside the round
budget): patrol 5 soldiers · ambush 2 stone agents + 2 archers · boss 2 sea
serpents · mixed 1 artillerist + 4 soldiers. Unfielded with reasons: the chi
acrobat (fair at 5, not needed), the shirshu and the puppeteer (still no threat
alone), Koh (fixed late), and the villain's bodies.

### 42.3 Four rounds of the kit analyzer

Fights here last a median of 3-4 rounds, and every dead card was one that paid
later. Changes, round by round:

1. Respiració de foc +3 for the combat → +6 next turn → became **Alè de drac**
   (2d4 at every enemy): a buff lost to attacking either way. Escúter d'aire
   became a hit-and-run attack. The chi-blocker's locks got bigger dice. Domini
   de la sang's price became 2 PV instead of a fatigue level.
2. The locks were dominated by the stun: they now last two turns (long and
   partial vs short and total). Llamp faster (−3 → 2). Presó de terra one turn.
3. Bloqueig de chi cannot be defended (it breaks a wall — a job no other chi
   card has). The earth wall's life 2d6 → 2d4 (earth's p90 was 9-10 rounds).
4. The protective Focus cards slowed (Obrir el chakra del cor 2 → 0, Aigua
   sanadora 1 → −1): the triangle's Aggro > Power edge was a coin flip (50.7%)
   and the culprit search named them first.

Round 4 (before step 4's re-timing), wins per 100 fights over a neutral kit:

| kit | vs neutral | fights end | band | choosing matters |
|---|---|---|---|---|
| aigua | +8.4 | ✅ | ✅ | ✅ |
| terra | −4.0 | ✅ | ✅ | ✅ |
| foc | −6.0 | ✅ | ✅ | ✅ |
| aire | +8.6 | ✅ | ✅ | ✅ |
| bloquejador de chi | +4.1 | ✅ | ✅ | ✅ |

After step 4 the heal's AI gate was softened too (the search wrote off a slow
heal until someone was under 60% PV: the right play in 22% of its decisions,
played on 4%). Final triangle: Power > Protect 58.6%, Protect > Aggro 68.6%,
Aggro > Power 54.5-55.4% — all three hold.

The villain, solved for the reference party at 65%: 22 PV a body and 18 for
the Mestre, about 4.7 rounds. A logged fight reads as designed: Palmell del
buit isolates a hero and the bodies focus him down, Atracció pulls one out of
formation, Desconfiança turns another on his friends; the heroes win by
killing the Rostre de l'Infern first and catching the Mestre once he is
exposed.

Verified on the branch: fast 377/377; slow green (the new set 79/79 and the
fantasy set without its earthbender, re-pinned; `main.ts` and `probe-shapes.ts`
pass alone — `main.ts` again ran past 600 s beside a cold recalibration, as on
main); smoke 421 (one vitest RPC timeout under load, gone on rerun); mutation
36/36. The encounter-speed party seats the nigromant where the earthbender sat
(the engineer took 3.5 s on the goblin horde, the nigromant 2.7).

Known blind spots (`test/kits/known.ts`): Esquivar en espiral (its payoff is a
speed modifier the evaluator cannot see) and Presó de terra (as in the fantasy
set before its pricing).

### 42.4 Open, for the user

- **Accept or reshape the set**, then merge.
- The calibration matrix keeps only 9 of 16 cells: the company rows are
  lopsided — the rows with the chi-blocker crush the soldiers (93-98%), whose
  whole kit is attacks it locks out, while earth + air + enginy sits ~45%. A
  matchup, which intentions.md allows; harder-hitting soldiers did not close it
  (the solver lowered their PV instead) and were reverted. Reshuffling the
  company rows is the lever left.
- The shirshu and the blood puppeteer still cannot threaten a party alone.
- The web app imports the fantasy set directly (19 files); playing this set
  there needs a set switch.

## 43. Els Quatre Elements, redesigned: four kits, four creatures, and a calibration that cannot yet be made fair (2026-10-07, branch `elements-set`)

What landed (designed by the `card-taste` agent, picked by the user, mechanics
reviewed by the agent; see `packages/sets/elements/DESIGN.md`): the water,
earth, fire and air kits (ten cards each), four creatures (Soldat del foc,
Shirshu, Unagi, Arquer yuyan), 59 exact card tests, and eight generic engine
seams with seam tests and mutants (ignoreAllyGuards, excludesAllyGuards,
status-granted ignoreDefense, choosesAfterReveal + revealedPlanFor,
delayPendingAction, plannedThisRound, onReveal, onRoundStart). Fatigue costs
are paid at the END of the round, so a card is not charged for its own price.

### 43.1 The calibration does not solve at full kit

Shapes probed against the reference party (the four benders at full kit,
Σ40), creatures fielded at the heroes' level (10 — the analyzer fields enemies
at the subject's level, `analyze.ts`):

| shape | heroes win | PV/body | |
|---|---|---|---|
| 5 soldiers | 89-98% | 330-450 | duration-capped |
| 2 shirshus | 81-88% | 330-350 | duration-capped |
| 1 unagi | 100% | 570-600 | — |
| 4 soldiers + archer | 94-96% | 330-420 | duration-capped |

No count and no PV reaches 60%: PV buys durability, not danger, and the
5-round budget caps it (ARCHITECTURE "Duration is a constraint").

Probes, each changing one thing:
- **Creatures at their kit size (level 3-4)** instead of 10: 98-100% everywhere
  — a 6-7 point level gap makes every hero defense hold.
- **Lower levels, matched (4/6/8)**: still 77-100%. Not a level-10 artefact.
- **Heroes at 10 holding only cards 1-7** (no finishers): the shirshus become
  fair (61%), the soldiers 87%, the unagi 100%.
- **+1, +2, +3 dice on every creature attack**: no change (82-100%). Creature
  damage is not the bottleneck — their blows do not LAND.
- A logged fight: Esquivar-los a tots pulls every attack onto the airbender,
  water guards him, and every blow meets a summed wall of 30-40 (each member
  adds its level); the finishers then end round 1 (Ira de l'oceà swallowed 68
  and returned 90 to every soldier).

Creature dice were raised to the fantasy creatures' range (2d6-4d6 attacks,
3d6-4d6 defenses) as the one numbers-only change; it moved level 4, not 10.

### 43.2 The cause: four finishers decide the fight on their own

Card ablation (patrol, level 10, one card removed at a time): no SINGLE card
makes the shape fair (90-100% without any of the 40). Removing four together
does:

| party | patrol | 2 shirshus | mixed line | unagi |
|---|---|---|---|---|
| full kit | 89-98% | 81-88% | 94-96% | 100% |
| without Ira de l'oceà, Ull de l'huracà, Partir la terra, Caiguda de cometa | **62%** | **54%** | **56%** | 100% |

- **Ira de l'oceà scales with the enemy count squared.** It swallows every
  blow aimed at the party and hits EACH enemy with the sum: one cast swallowed
  112 and dealt 127 to each of five soldiers (635 damage). Stronger creatures
  feed it more, so raising the creature level (12, 14, 16, 18) never helped.
- **Ull de l'huracà, Partir la terra and Caiguda de cometa lock the whole enemy
  side out of its turn** (every enemy, "lose its action"). A logged fight: Ull
  in round 1 and again in round 2, the soldiers never act.
- **Numbers do not brake them.** Fatigue costs of 3 and 4 (and Partir's stun
  2 → 1) leave the patrol at 100%: one cast in round 1 decides before the
  price is paid. These need a RULE change (the user's call; proposals in the
  morning report): e.g. the ocean returns each blow to its own thrower; a
  lockout lands only on the wounded by a margin, or on one enemy while the
  damage hits all.
- **The unagi** stays at 100% even without them — a lone creature's single
  attack a round cannot threaten four full kits. Its kit needs more per-round
  threat (a second action, or an area that cannot be guarded).

Creature dice were raised (fantasy range: attacks 2d6-4d6, defenses 3d6-4d6);
measured above with the new dice.

### 43.3 Verified (2026-10-07)

Fast tier 442/442. Mutation 47/48 on the first run: the survivor ("an enemy
you choose" ignoring the seat's target policy) slipped past a test comparing
three structurally identical characters with `toEqual`; it compares identity
now and kills the mutant (re-checked by hand). The slow tier and the kit
analyzer were NOT run: with the shapes saturated (§43.1) every cell would sit
outside the measurement band, so their verdicts would mean nothing until the
finishers are decided.

### 43.4 The finishers, reworked by the designer (2026-10-07)

The user asked for debuffs that keep each card's concept; my first, improvised
ones (act last, one random enemy falls) were rejected, and the `card-taste`
agent proposed the directions instead. The rule it gave: no finisher takes a
whole side's round away; the enemies still act — badly, at the wrong targets,
or at a price they choose. Built:
- **Ira de l'oceà** — a contest: the ocean rolls once; a blow that does not
  beat it sinks and is owed back to its thrower at round end; one that beats it
  lands whole. Then the wave hits every enemy.
- **Ull de l'huracà** — every enemy hit; this round the wounded strike a
  random combatant.
- **Partir la terra** — every enemy hit; next round each wounded one climbs out
  (loses its action) or takes the same wound again.
- **Caiguda de cometa** — now a Focus: called this round, it falls as the next
  round opens, before any guard, on every enemy.

Remeasured at full kit, creatures at level 10: patrol **59%**, 2 shirshus
**58%**, mixed line **66%** — fair. The lone unagi is still 97% (a creature that
acts once a round cannot threaten four heroes in time); its rework is with the
designer.

### 43.5 Where it was paused (2026-10-07)

- **Unagi + Remolí** (a defense that wounds every hero whose blow it holds):
  no change, the heroes still win ~98%. Its level is no danger dial either:
  levels 10/13/16/19 all give ≥98%, and the fights get shorter. Built 2026-10-07 at full
  kit: patrol 71% DUR, shirshus 59%, mixed 73% DUR (the duration cap binds;
  re-check whether Salt del meteor's new cost caused the rise from 59/66%).
- **Open question for the user:** is the unagi a boss (fought alone) or a big
  creature in a mixed encounter? The designer's ★ for a boss is **Cap i cua**:
  one body, two cards a round (head: Canó, Engolir; body: Onada, Remolí,
  Capbussada), which needs a generic "cards per round" engine seam. The
  alternatives were two linked bodies (expected to still fail) and Sota l'aigua (a dive
  that buys time, not danger).
- **Air**, after Salt del meteor costs 1 fatigue: +6.9pp (inside the band; was
  +14.9pp), but requirement 1 fails worse: 15% of fights never end, p90 40
  rounds. Salt del meteor is still picked 64.7%; Cop i fuga 1.0%. The designer's ★
  for Cop i fuga: "Després de l'atac, els atacs contra tu i un aliat fallen la
  resta del torn." (alternatives: gone until your next blow at 1 fatigue; the blows
  aimed at you hit the one you struck). Not decided by the user yet.
- Still to look at: Cop desviat (0.7%) and Sentit sísmic (0.4%) as likely AI
  blind spots; Ira de l'oceà picked 64.6%.

## 44. Esgrima measured: the level cap, two priced statuses, and a stall that is not Esgrima's (2026-10-13, branch `elements-set`)

The shared ten-card Esgrima (`set-common`, skill `mestre-armes`) was measured
in both sets right after `pnpm calibration:refresh`. All numbers 800-combat kit
suites (`SLOW=1 npx vitest run test/kits/mestre-armes`) unless said otherwise.

### 44.1 Fantasy measured Esgrima at level 10 among heroes at 4-6

`analyze` fielded a subject at its full kit, and so did the calibration
(stand-ins, company rows, reference party). Fantasy's own kits have 4-6 cards,
so Esgrima played at L10 — and the level enters every roll. Checked first
(matrix only, subject level forced, company untouched): **L10 +25.2pp±1.5,
L6 +14.4pp±1.7, L5 +11.5pp±1.7** vs neutral. The level was about half of the
excess; the rest is real (one cell, `cap/c4` — a lone basilisk — reads +72pp
at every level).

Fixed generically: `Calibration.heroLevel` (bench) caps the level measurement
fields any HERO kit at; `measuredLevel(kitId)` applies it to the subject, the
stand-ins, the company rows and the reference party alike, so a subject is
never compared at one level against a baseline measured at another. Fantasy
declares `HERO_LEVEL = 6` (its longest own kit, nigromant); elements declares
nothing (all its kits have 10). The reference party caps too — it is "these
kits, fully learnt" only up to what the table's other heroes reach — so
fantasy's **REFERENCE_SIGMA is 22** (enginyer 5 + Esgrima 6 + nigromant 6 +
berserk 5). `test/calibration.test.ts` names the capped kits (today only
`mestre-armes`), so a kit growing past the cap is a decision.

The price, stated in every report card: in fantasy, Esgrima's L7-L10 cards
(Bardissa d'acer, Punt feble, Estocada fantasma, Tall rere tall) are measured
nowhere but the elements set.

After: fantasy power band **+16.1pp±1.5** (passes; was +25.2pp±1.5 FAIL).

### 44.2 Bloqueig d'escorpí and Braç mort: priced at a quarter of a body

Both statuses (`ESCORPI`, `BRAC_MORT`) said −0.1. Their payoff lands the round
AFTER the one-round search scores the board — the timing is right (set with 2
turns, still on the holder when the search scores) — so the price is the only
way the search sees them. `aiWeight` is not the lever: at depth 1 with
`topK: 0` every legal card is searched; aiWeight only steers the depth-0
opponents and continuation. Matrix-only play rates by price:

| price | fantasy Δ | escorpí | braç | elements Δ | escorpí | retruc |
|---|---|---|---|---|---|---|
| −0.1 | +15.7±1.5 | 1.6% | 1.7% | −5.0±1.8 | 4.3% | 10.0% |
| −0.25 | +15.9±1.5 | 9.9% | 6.0% | −2.6±1.8 | 8.3% | 5.4% |
| −0.5 | +12.9±1.6 | 16.1% | 10.4% | −5.1±1.8 | 10.3% | 3.1% |

At −0.5 the AI plays them where they are not right and the kit wins less
(Presó de terra's lesson, §15.1). Chosen −0.25 (the sting worth nothing once
its fencer is down). A level/PV-scaled price was considered and rejected: it
gives ~0.1 against elements' 73-PV soldiers (where 0.1 was measured blind) and
~0.4 against fantasy's 14-PV goblins (where 0.5 was measured harmful).

After (full suites, calibration refreshed): Bloqueig d'escorpí is no longer
flagged in either set. Two flags remain, both ON THE DETECTOR'S EDGE and both
ratcheted in `KNOWN_BLIND`: fantasy Braç mort (best 19%, played 3.6%, flagged
under 3.8%; when best it gains −0.7±0.5 PV on the runner-up — its best moments
are ties) and elements Retruc d'acer (best 29%, played 5.3%, flagged under
5.8%). The three Esgrima defenses are near-substitutes sharing the same
moments; whichever is played least is flagged. Open for the user: whether
`isBlindSpot` should require a positive gain-when-best (a card that is best
only by a tie is not a blind spot) — a change to the instrument, so not made
here.

### 44.3 The elements stalls are the airbender's Coixí de vent

Every stalled fight (17/795 with Esgrima as subject; **18/795 with the
waterbender as subject** — the same rate, so not Esgrima's) has the same
board: the calibration airbender alone at 1/12 PV and Esgotat, playing Coixí
de vent on itself every round from ~round 10 to 40, against soldiers (5 × 73
PV, often down to 1-9 PV each) who attack every round. Coixí's status clamps
any loss at 1 PV, so it cannot die; it never attacks, because any other card
lets the soldiers kill it this round — the search correctly prefers a draw
(0) to a loss (−100). Not an AI bug: the rules make a lone bender immortal.
Only company rows with an airbender stall (c1-c3); c4/c5 and the other shapes:
0. The DESIGN.md says "(and you)", the card text says only "l'aliat que
defenses".

Candidate fixes for the designer (not made): (a) Coixí cushions only the ally
you defend, not yourself (matches the printed text); (b) Coixí costs 1 fatigue
— a fatigue-cost card is unplayable at Esgotat (`fatigue_cost.canPlay`), so a
lone bender at 5 loses it; (c) a cushioned bender cannot be cushioned again
next round. After 44.2 the elements Esgrima suite happens to pass requirement 1
(stalls 1.3%±0.4), but the cause is untouched.

### 44.4 What else the measurement showed

- **Fantasy triangle after the cap**: Power > Protect **69.1%±1.6** (was
  27.1%±1.6: Tall rere tall, Bardissa and Riu de lava held it up; at L6 the
  calibration Esgrima no longer holds Tall rere tall), Protect > Aggro
  79.6%±1.4, but **Aggro > Power 46.4%±1.8 FAILS** — held up by cures-de-camp
  (+21.5pp), retruc-d-acer (+10.5pp), aguantar-el-cop (+2.0pp). Tall rere tall
  is not fixed by this, only unmeasured here: against a side that rarely
  defends every blow is an auto-hit for the full total (3d6 + weapon + level,
  > 12 PV at L10), so the chain never fails and one card can sweep a whole
  Focus-leaning team. Number levers for the user: 3d6 → 2d6; the follow-up
  blows without the level; fatigue 2 → 3; speed 1 → 0.
- **Elements triangle**: Esgrima is in no company row 0, so it is not in the
  mirror party and cannot move it.
- **Encounter creator** (`encounter-speed.test.ts`) is over its 3 s on the
  mixed band (4.3 s) and the horde (3.0-3.1 s). Not the measurement change —
  that test builds its own explicit level-3 party. It is Retruc d'acer: the
  party is stronger, the solver fields tougher enemies and the fights run
  longer. Single-thread solve of the mixed band, third hero swapped: berserk L3
  [11, 26] PV in 12.0 s; Esgrima L1 [9, 21] 11.9 s; **L2 [15, 37] 23.2 s**;
  L3 [20, 48] 25.7 s.

### 44.5 Retruc d'acer's riposte loses the level (2026-10-13)

The riposte rolled `1d6 + weapon + Esgrima level` with no opposing roll, so
no opposing level cancelled it: the whole level landed as raw damage. Its own
text never promised the level ("1d6 + arma"), so the handler now takes
`withLevel: false` (`steel_riposte`) and the description stands. Five number
variants measured, each with the calibration re-pinned (`pnpm
calibration:refresh`) so the triangle's `@cal` Esgrima moved with it; kit
deltas 800-combat analyzer runs, encounter-speed one run each (wall clock,
±0.2 s run to run):

| variant | fantasy Δ | P>Pr | Pr>A | A>P | enc. horde / mixed | elements Δ · stalls |
|---|---|---|---|---|---|---|
| before (1d6+arma+nivell, 3d4, vel 3) | +16.1±1.5 | 69.1±1.6 | 79.6±1.4 | **46.4±1.8 ✗** | **3.1 / 4.4 s ✗** | −2.8±1.8 · 1.3% |
| (a) riposte without the level | **+11.3±1.5** | 71.1±1.6 | 66.6±1.7 | 54.9±1.8 | 2.7 / 2.1 s | −6.0±1.8 · 1.3% |
| (b) 1d4 + arma + nivell | +16.4±1.4 | 67.0±1.7 | 78.1±1.5 | 46.0±1.8 ✗ | 3.2 / 4.7 s ✗ | −4.9±1.8 · 1.3% |
| (a+b) 1d4 + arma | +15.7±1.5 | 69.4±1.6 | 64.4±1.7 | 55.6±1.8 | 3.0 / 2.3 s ✗ | −5.8±1.8 · 1.3% |
| (c) defense 3d4 → 2d4 | +16.3±1.4 | 68.4±1.6 | 74.1±1.5 | 53.0±1.8 ✗ | 3.2 / 4.3 s ✗ | −7.1±1.9 · 1.3% |
| (d) speed 3 → 2 | +14.7±1.4 | 63.8±1.7 | 70.1±1.6 | 49.2±1.8 ✗ | 2.5 / 4.3 s ✗ | −4.1±1.8 · 1.5% |

**Kept (a)**: the only variant that brings everything inside — and it is what
the card already said. The defense dice are untouched, so the premium is too
(`experiment-defense-vs-attack`: Retruc 3d4 at L2, 67% mean over same-level
attacks — already under the 80% target; (c) would have taken it further away).
Encounter-speed re-timed twice more after (a): horde 2.87 / 2.77 s, mixed
2.10 / 2.15 s — the horde is still close to its 3 s (it read 3.0-3.1 s before
Esgrima existed).

- **Fantasy power band** +16.1 → **+11.3pp±1.5**; no other Esgrima card
  needed tuning. AI play of Retruc 41.0% → 15.6%; Braç mort 3.6% → 7.9%, so it
  left the blind-spot detector's edge and `KNOWN_BLIND` (fantasy) is empty.
- **Triangle**: Aggro > Power 46.4 → **54.9%±1.8 — holds**, though thinly
  (2.7σ over 50%). So the failure WAS Esgrima's: cures-de-camp's +21.5pp was a
  culprit ranking inside a broken edge, and with Retruc tuned it no longer
  breaks it. Protect > Aggro drops 79.6 → 66.6% (still holds): the protect
  corner lost its free damage.
- **Elements** Esgrima −2.8 → −6.0pp±1.8, stalls 1.3% (unchanged: Coixí de
  vent, §44.3). Retruc still flagged blind there (best 25%, played 1.8%) and
  still in its `KNOWN_BLIND`.
- **Tall rere tall at L10 (elements)**: not dominant. It is the best play only
  13% of the time, worth +2.1 PV over the hand (+3.3 PV when best) — the AI
  plays it 61% of the time where legal, more than its best-share warrants, but
  no measurement says it is too strong. Not tuned.

## 45. Acrobàcia implemented and measured: too strong in fantasy, in band in elements (2026-10-14, branch `elements-set`)

The shared ten-card Acrobàcia (`set-common`, skill `acrobacia`, unarmed) is in
both sets' catalogues as a main kit, with a company row in each (fantasy
`acrobacia | enginyer-explosius | metge`, stand-in berserk; elements
`acrobacia | earthbender | airbender`, stand-in waterbender) and the
calibration re-pinned (`pnpm calibration:refresh`). The approved design is
implemented as written — no concept, title, number or text changed. Fantasy
measures it capped at `HERO_LEVEL` 6, so its cards 7-10 (Trepitjar caps, Salt
mortal, Malabars a puntades, Capbussó suïcida) are measured only in elements.

### 45.1 What the engine got (generic; tests in `engine/test/seams-acrobat.test.ts`)

- `StatusBehavior.attackTargetsExcluded` — the holder's attacks cannot reach
  these characters (Cavalcar l'enemic). They leave every attack pool, area
  attacks included; its extra attacks miss them; their block no longer forces
  its blows; with nobody left the blow lands on nobody.
- `StatusBehavior.onAllyTargeted` — an enemy attack (normal or extra) is about
  to resolve against one of the holder's allies, before defenses are gathered
  (Tombarella de rescat pushes its guard there: it joins the wall).
- `EffectHandler.onAttackResolved` — once per attack action, after every
  target and pass (Trepitjar caps' chosen floor, Salt mortal's fall, the
  diver on the ground).
- Reveal options — `revealOptions` / `aiRevealOption` / `onRevealOption`: a
  pick made when the cards are revealed. A human seat gets a new `StepResult`
  `{kind:'choice'}` answered with `setResolveChoice(i)` (the web shows the
  options as buttons; `tools/play.ts`, the lookahead, regret and the test
  helper `playRound(…, choices)` answer it); any other seat, and a prompt
  answered with nothing, takes the card's own `aiRevealOption` hint.
- `performExtraAttack` now honours `attackRollAgainstHolder` (a body on the
  ground, or marked, counts against follow-ups and ripostes too) and returns
  the `recipient`. Checked not to move existing play: the elements triangle
  re-run without it gave identical seeded numbers.

Salt mortal's AI height: the lowest height whose expected roll (dice mean +
level + roll bonuses) reaches the softest enemy's PV + armour (+ the expected
roll of the Defensa it revealed); +2 when no height reaches anyone, since a
height that does not kill is paid in full. Trepitjar caps' pick goes through
`chooseTargets`, i.e. the seat's attack aim (the AI's searched target).
Statuses priced conservatively and NOT swept: a terra −0.1, cavalcat −0.1
while its acrobat stands; the trampoline, rescue and height statuses expire
inside the round the search plays out, so they are unpriced.

### 45.2 Measured (800-combat kit suites, `SLOW=1 npx vitest run test/kits/acrobacia`)

| | fantasy (L6) | elements (L10) |
|---|---|---|
| power band | **+22.1pp±1.2 ✗** (raw 89.4%±1.1) | −1.6pp±1.8 ✓ (raw 60.2%±1.7) |
| fights end | median 3, p90 5, stalls 0.0%±0.4 ✓ | median 2, p90 5, stalls 1.4%±0.4 ✓ |
| choice matters | 5.45±0.26 PV/decision ✓ | 26.25±1.81 PV/decision ✓ |
| blind spots | **Tombarella de rescat ✗** (best 31%, played 3.5%) | Esquiva i traveta (best 21%, played 1.9%) → `KNOWN_BLIND` |

Fantasy per-cell: horda +9/+18/+23/+26, escamot +36/+20/+11/+24, cap
+23/+45/+31, mixt +19/+18/−2/+29 (spread 47pp, ±10 per cell). Elements:
patrulla c4 −53 and mixt c4 −18 pull it down; bèstia is saturated in every
row (all six cells dropped). The band culprits named by the suite: Puntada
d'espagat (+0.07), Tombarella de rescat (+0.02), Cavalcar l'enemic (+0.02).

Card values (value vs. the hand · best play · gain when best · AI play rate):

| card | fantasy | elements |
|---|---|---|
| Escombrada | −1.8 PV · 7% · −1.1 · 4.0% | −9.1 · 4% · −2.1 · 1.5% |
| Esquiva i traveta | +3.7 · 23% · +8.2 · 17.2% | +19.4 · 21% · −2.2 · 1.9% |
| Trampolí de mans | −6.1 · 5% · −1.4 · 1.2% | −13.6 · 6% · −0.6 · 0.5% |
| Puntada d'espagat | +4.2 · 37% · +3.4 · 49.1% | +0.3 · 12% · +6.1 · 5.6% |
| Tombarella de rescat | +4.3 · 31% · +1.9 · 3.5% | +38.7 · 50% · +33.4 · 42.5% |
| Cavalcar l'enemic | −1.0 · 10% · +0.3 · 24.9% | −11.6 · 4% · −1.2 · 1.4% |
| Trepitjar caps | — | −5.9 · 6% · −0.7 · 9.9% |
| Salt mortal | — | −13.6 · 1% · −0.9 · 0.7% |
| Malabars a puntades | — | −0.3 · 10% · +2.8 · 12.0% |
| Capbussó suïcida | — | −4.4 · 10% · +0.5 · 24.2% |

- **Elements Esquiva i traveta** is best only by noise (−2.2 PV over the
  runner-up when "best" — its near-substitute Tombarella), the same detector
  edge as Esgrima's defenses (§44.2): ratcheted in elements `KNOWN_BLIND`.
- **Fantasy Tombarella de rescat** is NOT ratcheted: it gains +1.9 PV over the
  runner-up when best and is played at a ninth of its best share — a real
  under-play I cannot yet explain. Its payoff lands inside the round the
  search plays (no status to price); Esquiva, played 17%, gets a searched
  target and floors the attacker, so the two may read as substitutes to a
  6-sample search. Open; the fantasy suite fails on it.
- **Fantasy power band** fails, +22.1pp. Not tuned (the brief was to report).
  The AI's main card is Puntada d'espagat (49%: 2d6 on two enemies at speed 3,
  at L6 against goblin hordes). Number levers for the designer, unmeasured:
  Puntada 2d6 → 2d4 or speed 3 → 2; a fantasy-specific look at whether the
  level (L6 among heroes at 4-6) is again half of it, as it was for Esgrima.
- **Defense premium** (`experiment-defense-vs-attack`): Esquiva i traveta 3d4
  at L2 holds 67% on mean over same-level attacks (Retruc's number; under the
  80% aim). Tombarella (L5) has no same-level fantasy attack to measure.

### 45.3 Triangle and the rest

- **Fantasy triangle**: Power > Protect 71.1%±1.6, Protect > Aggro
  66.6%±1.7, Aggro > Power 54.9%±1.8 — all hold, identical to §44.5
  (Acrobàcia is not in company row 0, the mirror party).
- **Elements triangle FAILS, and not because of this work**: Power > Protect
  53.4%±1.8 ✗, Protect > Aggro **31.0%±1.6 ✗**, Aggro > Power 77.8%±1.5. The
  mirror party is row 0 (earth, fire, air + water stand-in), no Acrobàcia, and
  the one engine change that touches existing content was reverted for a
  re-run: identical numbers. So it was already broken on 9866652. Culprits:
  Ull de l'huracà@cal (+49.8pp on Protect > Aggro; +7.9pp on Power > Protect),
  Partir la terra (+5.0), Pluja de dagues (+4.3). Last recorded passing in
  §43; something between — likely the airbender's Ull de l'huracà — broke it.
- **Smoke** (`pnpm test:smoke`): every file executes; the one failure was
  `encounter-speed`'s parallel-vs-single-thread case timing out at 120 s while
  two 800-combat kit suites ran beside it. Alone it passes: horde 2.82 s,
  squad 1.46 s, boss 2.23 s, mixed 2.27 s (the horde still close to its 3 s).
- **Conflicts with intentions.md**: fantasy Acrobàcia outside the ±15pp band
  ("builds balanced"); Trampolí de mans, the kit's same-round combo card, is
  among its least played and lowest valued in both sets (1.2% / 0.5%), against
  "combos between actions played in the same round should be among the best
  options"; Salt mortal (0.7%), Escombrada and Cavalcar l'enemic (~1.5%) are
  near "so bad it never sees play" in elements, though requirement 3 passes;
  Esquiva i traveta's premium is 67%, not ~80%; the elements triangle (above).

## 46. Artífex implemented and measured: in band in both sets (2026-10-14, branch `elements-set`)

The shared ten-card Artífex (`set-common`, skill `artifex`, unarmed, kit rule
**Corda N** printed as the skill description) is in both sets' catalogues as a
main kit, with a company row in each (fantasy `artifex | berserk | gel`,
stand-in volcanic; elements `artifex | waterbender | airbender`, stand-in
firebender) and the calibration re-pinned. The approved design is implemented
as written — no concept, title, number or text changed. Fantasy measures it
capped at `HERO_LEVEL` 6, so Trepant incansable, Baldufa de ganivets, Colós de
butxaca and Boa mecànica are measured only in elements.

### 46.1 How the gadgets work

Every gadget is a status, one per card per maker — on the maker when it stands
by the party (automaton, top, colossus), on whoever it is stuck in or aimed at
otherwise (drill, boa, crossbow, the trap at an ally's feet), keyed by maker so
two artificers never share one. Replaying a card rewinds or moves its gadget.
A gadget acting on its own rolls the card's dice through `performExtraAttack`
with no skill: no level, no fatigue, and a close contest teaches nobody (its
defenses use a copy of the card with `skillId: ''`). Gadgets clear themselves
the first time a hook sees their maker down. Rulings the text left open:

- **Parany de molla** takes the place of the card's own guard on the ally that
  round (no double guard); the maker still guards itself. The sprung trap
  defends with 3d4 + the maker's level (+ the maker's roll bonuses) as a guard
  of the ALLY (`fixedTotal`), so a breach hurts the ally, not the distant
  maker. The attacker's 3 PV come off after the blow.
- **Ganxo salvavides** targets only the maker (self-guard); "un aliat" = another
  hero, so it never fires for the maker's own blow.
- **Paraigua blindat** covers its chosen ally as usual; against a blow whose
  target list holds two or more heroes it adds a one-blow guard of its own on
  each other hero — breaches land on the maker, as for any guard.
- **Colós de butxaca**: one 3d6 roll per blow (an area attack spends one turn
  of key once); its guard stands in for the target's (`fixedTotal`, defender =
  the target), so damage beyond it goes to whoever was struck. It falls right
  after the blow that spent its last turn (after that blow's last target).
- **Trepant / Boa**: a replay that does not wound pulls the old one out (the
  card was thrown again).
- Round-end acts face the guards still up from that round (guards are round
  scoped and the round has not ended yet); the drill and the boa ignore them.

### 46.2 What the engine got (generic; tests in `engine/test/seams-artificer.test.ts`)

`BlowInfo` on every blow (`id` shared across one area pass, `targets`);
`onAllyTargeted` may return true (the blow passes over that ally — no roll, no
damage); `onTargeted` (the holder itself); `guardsBlow` (a status on the
target's side replaces every guard on the target); `afterBlow`;
`beforeHolderAction` (just before the holder's card resolves; a wound there
interrupts a Focus, a fall cancels the card, an earlier same-tier hit still does
not); `EngineApi.performAreaAttack` (one roll over several targets). Existing
play is unchanged: the fantasy and elements triangles re-ran to identical seeded
numbers. Encounter-speed, the old engine against the new one on the same loaded
machine (load ~9, nice 19): horde 4.0/3.9 s vs 3.9/3.4 s — no measurable cost;
the horde is over its 3 s on this machine either way in that run, and passed
in the full fast tier (540/540) right after.

Prices (`positionValue`), not swept: 0.01 × the dice mean per remaining act
(automaton 1d6 ×3 = 0.1; colossus 3d6 ×3 = 0.3; drill/boa/crossbow negative on
their holder); the trap 0.1. Bumerang, Paraigua and Ganxo expire inside the
round the search plays: unpriced.

### 46.3 Measured (800-combat suites + the analyzer's report card)

| | fantasy (L6) | elements (L10) |
|---|---|---|
| power band | **+10.1pp±1.6 ✓** (raw 76.5%±1.5) | **−3.0pp±1.8 ✓** (raw 58.5%±1.7) |
| fights end | median 5, p90 7, stalls 0.0%±0.4, draws 1.3% ✓ | median 2, p90 5, stalls 1.9%±0.5, draws 2.3% ✓ |
| choice matters | 4.70±0.25 PV/decision ✓ | 9.20±0.92 PV/decision ✓ |
| blind spots | Ganxo salvavides (best 19%, played 3.3%) → `KNOWN_BLIND` | none flagged |

Fantasy per-cell spread 52pp (cap/c4 +43, cap/c5 +34, mixt/c6 +28; escamot/c3
−9), elements 62pp (patrulla/c4 −46 pulls it down; bèstia saturated in every
row).

Card values (value vs. the hand · best play · gain when best · AI play rate):

| card | fantasy | elements |
|---|---|---|
| Bumerang | +1.7 · 28% · +2.7 · 53.8% | −3.8 · 7% · +1.4 · 4.1% |
| Parany de molla | +4.5 · 21% · +1.3 · 20.8% | +3.0 · 15% · +0.3 · 8.9% |
| Autòmat de corda | −6.8 · 5% · −1.4 · 1.2% | −9.0 · 3% · −2.8 · 0.2% |
| Paraigua blindat | +4.5 · 26% · +3.3 · 15.4% | +18.6 · 36% · +16.4 · 10.4% |
| Ganxo salvavides | +1.7 · 19% · +0.4 · 3.3% | +3.0 · 11% · −2.5 · 1.8% |
| Ballesta sentinella | −3.7 · 11% · −0.2 · 5.0% | −6.2 · 7% · −5.1 · 1.2% |
| Trepant incansable | — | −5.0 · 3% · −2.5 · 2.8% |
| Baldufa de ganivets | — | +7.1 · 20% · +6.1 · 66.3% |
| Colós de butxaca | — | −4.0 · 8% · −3.6 · 2.1% |
| Boa mecànica | — | −3.6 · 4% · −1.6 · 2.2% |

- **Fantasy Ganxo salvavides** is best by near-ties only (+0.4 PV over the
  runner-up when best, Paraigua and Parany): ratcheted in fantasy `KNOWN_BLIND`,
  the same detector edge as §44.2.
- **Elements Paraigua blindat** is under-played: best 36% with +16.4 PV when
  best, played 10.4% — not flagged by the detector, but the largest gap in the
  kit. Its payoff lands inside the round (unpriced); the AI's main card is
  Baldufa de ganivets (66%: 3d6 on every enemy against five soldiers).
- **Autòmat de corda** is the least valued card in both sets (1.2% / 0.2%
  played), near "never sees play": a slow Focus whose 1d6 round-end blows face
  the round's guards. Trepant, Colós, Boa and Ballesta are played 1-3% in
  elements. Number levers for the designer, unmeasured: the automaton's dice or
  corda; a higher `WORTH_PER_POINT`, which Esgrima's −0.1 → −0.25 sweep (§44.2)
  suggests is the first thing to try.

### 46.4 Triangle and the rest

- **Fantasy triangle**: 71.1%±1.6 / 66.6%±1.7 / 54.9%±1.8 — all hold,
  identical to §45 (Artífex is not in row 0).
- **Elements triangle still FAILS as in §45**: Power > Protect 53.4%±1.8,
  Protect > Aggro 31.0%±1.6, Aggro > Power 77.8%±1.5 — identical numbers;
  culprit Ull de l'huracà@cal.
- **Conflicts with intentions.md**: Autòmat de corda near "never sees play";
  the elements kit leans on one card (Baldufa 66%), against "no action should
  be the best choice every time" (it is best only 20% of the time, so the AI
  over-plays it rather than it dominating); the elements triangle (pre-existing).

## 47. Mestre del xi implemented and measured; Toc de la mort's six rules compared (2026-10-14, branch `elements-set`)

The shared ten-card Mestre del xi (`set-common`, skill `mestre-del-xi`,
unarmed) is in both catalogues as a main kit, with a company row in each
(fantasy `mestre-del-xi | nigromant | runes`, stand-in berserk; elements
`mestre-del-xi | earthbender | firebender`, stand-in airbender) and the
calibration re-pinned. Texts as approved; the dice are the provisional design
numbers. Fantasy measures it capped at `HERO_LEVEL` 6, so its cards 7-10
(Tocs en cadena, Cop de vida, Toc de la mort, Tempesta de son) are measured
only in elements — except in the variant experiment below.

### 47.1 What the engine got (generic; tests in `engine/test/seams-xi.test.ts`)

`StatusBehavior.skipsRound` (no card at all this round, not even Cop
desesperat; asked after `onRoundStart`), `StatusBehavior.plainCards` (the
holder's cards resolve with no effects and one target: only type, speed and
dice), `StatusBehavior.onPvLost` (after any PV loss), `Character.lastWound`,
`AttackModifiers.damageMult` (0 = a blow that hurts nobody) and the target
requirement `'fallen_ally'` (the web picker offers only the fallen). Rulings
made where the text was silent: Entumit halves the margin before armour (the
existing `modifyOutgoingDamage` seam: "damage, then armour", rules.md);
Segellar la ferida heals the last PV loss of any cause, and may be played
again on the same wound (the text does not forbid it); Cop de vida rounds the
half down; Tempesta's sleepers are not woken by a loss in the storm's own
round (they are not asleep yet); Toc's touch replaces an earlier touch of the
same variant. Statuses priced: Entumit −0.15, Poder apagat −0.1, Bloqueig mutu
−0.25 on both bodies (the per-body average makes the trade good against a
lone boss, poor against one goblin of five), asleep −0.25, the pending Toc
statuses half the share of health they will take (−0.05 base; Cinc passes
−0.15 − 0.1 per card played; Tres tocs −0.1 per touch).

### 47.2 The kit, with V1 (Ressò) as default — 800-combat suites

| | fantasy (L6) | elements (L10) |
|---|---|---|
| power band | **+22.9pp±1.2 ✗** (raw 89.3%) | −12.1pp±1.8 ✓ (raw 48.1%) |
| fights end | median 3, p90 5, stalls 0.0% ✓ | median 2, p90 5, stalls 0.8%±0.4 ✓ |
| choice matters | 5.32±0.24 PV ✓ | 6.13±0.79 PV ✓ |
| blind spots | **Segellar la ferida ✗** (best 23%, played 1.0%, +2.9 PV when best) | Cop de vida (best 19%, played 2.8%) → `KNOWN_BLIND` |

Fantasy culprits named by the suite: Ràfega de dits (+0.09, played 55%),
Bloqueig mutu, Pinça entumidora. Elements: bèstia (unagi) is saturated in all
eight rows, so there is no boss cell in elements at all; patrulla c8 −67.
Card values (vs hand · best · gain when best · AI play) — fantasy: Ràfega
+6.7·41%·+4.7·55%, Pinça +2.9·20%·+4.1·9%, Cop al nervi +1.2·12%·−0.4·14%,
Poder apagat +0.4·10%·−1.6·19%, Bloqueig mutu −1.1·9%·−1.3·1.8%, Segellar
−6.5·23%·+2.9·1.0%. Elements: Ràfega +10.8·25%·+6.1·13%, Cop al nervi
+8.4·18%·+8.1·6%, Cop de vida +3.5·19%·+1.3·2.8%, Toc −0.7·8%·−1.9·2.0%,
Tempesta −1.5·9%·−4.1·24%, Pinça −1.8·14%·−2.4·18%, Tocs en cadena
−1.8·7%·+2.3·30%, Poder apagat −3.1·6%·−1.0·2.2%, Bloqueig mutu
−4.1·5%·−7.8·1.3%, Segellar −9.7·4%·−3.0·1.3%.

- **Cop de vida** is legal on every turn, even with nobody fallen, so its play
  rate is diluted; and as a speed-0 Focus it is interrupted most times the
  master is struck first (a probe: 3 revives in 40 forced plays against two
  goblins). The AI does see a revive. Ratcheted (elements).
- **Segellar la ferida** (fantasy) is NOT ratcheted: +2.9 PV when best, played
  at a twentieth of its best share. Hypothesis, unmeasured: the depth-0 aim
  for an `'ally'` card is the lowest PV fraction, not the largest last wound,
  so inside rollouts it seals the wrong ally. The suite fails on it.
- **Fantasy band** fails at +22.9pp — not tuned (dice provisional). Lever
  candidates for the designer: Ràfega de dits (three 1d6 blows each carrying
  the level, vs goblin hordes); Pinça entumidora 3d4 at speed 3.

### 47.3 Toc de la mort: V0-V5 compared

Throwaway harness (deleted): the kit analyzer with the touch's `variant`
param switched, 800 combats each, sequential. Elements at L10 as fielded;
fantasy with the master at L10 among heroes capped at 6 (so its band is
inflated by the level, §44.1 — compare variants with each other only). Shape
splits are the mean cell delta of each shape (±per-shape error); "Toc %" is
how often the AI played it where legal.

| variant | elements Δ | fantasy Δ (L10) | Toc vs hand el / fa | best el / fa | gain when best el / fa | AI play el / fa |
|---|---|---|---|---|---|---|
| V0 mig PV | −12.1±1.8 | +24.7±1.1 | +0.1±0.9 / +2.6±0.4 | 7.8% / 8.8% | −3.0 / +0.3 | 1.5% / 3.5% |
| V1 Ressò | −12.1±1.8 | +24.8±1.1 | −0.7±1.0 / +2.5±0.4 | 7.5% / 9.0% | −1.9 / +0.1 | 2.0% / 3.6% |
| V2 Cop retardat | −11.7±1.8 | +24.7±1.1 | −0.6±0.9 / +2.7±0.4 | 7.4% / 9.5% | −3.4 / +0.2 | 1.1% / 3.5% |
| V3 Cinc passes | −10.4±1.8 | +25.0±1.1 | −2.3±0.9 / +2.8±0.4 | 6.3% / 9.2% | −4.5 / +0.6 | 2.8% / 3.3% |
| V4 Tres tocs | −10.4±1.8 | +25.3±1.1 | −3.1±0.9 / +2.5±0.4 | 5.8% / 8.6% | −4.2 / +0.6 | 1.1% / 6.0% |
| V5 Cor ferit | −11.7±1.8 | +24.7±1.1 | −2.9±1.0 / +2.3±0.5 | 6.4% / 9.2% | −4.3 / +0.6 | 1.1% / 3.5% |

Fight length identical everywhere (elements median 2, p90 5, stalls 0.6-0.8%;
fantasy median 3, p90 5, stalls 0.0%). By shape (fantasy L10, every variant
within ±0.7pp of these): horda +14.5±4.8, escamot +34.6..34.9, cap (lone
basilisk) +31.1±6.2 (V4 +32.6), mixt +20.9..22.2. Toc's play rate by shape is
2.4% horde, 3.1% squad, 3.4% boss and 3.9-4.9% mixed in every variant but
**V4, played 14.2% against the boss** (and 2.4% against the horde). Elements
(no boss cell): patrulla −18.9..−21.2, caçadors −3.2..+1.5, mixt −11.6..−15.4;
Toc 1.0-3.5% everywhere.

Read: **no rule makes the card dominant, and none makes it matter** — the
kit's band moves by at most 1.7pp (elements) and 0.6pp (fantasy) across the
six, all inside the error, because the AI plays Toc on 1-6% of its turns and
the regret search finds it the best play only 6-10% of the time. What holds
the card down is the price before any rule fires (1 fatigue, a 2d6 that must
WOUND at speed 2), not the rule. Between the rules: V0 and V1 read best in
elements (the only ones near zero vs the hand); V4 Tres tocs is the one with a
shape: a boss-killer the AI reaches for against the lone basilisk (14%) and
ignores against hordes, but it needs three wounds in consecutive rounds (3
fatigue), and in elements it is the worst. V1 stays the default — nothing in
the data argues otherwise. If the card should matter, the lever is its
numbers (2d6 → 2d8, or no fatigue), measured with the rule the user picks.

### 47.4 The rest

- **Triangles** (Mestre del xi is in neither mirror party): fantasy Power >
  Protect 71.1%±1.6, Protect > Aggro 66.6%±1.7, Aggro > Power 54.9%±1.8 —
  hold, identical to §44.5. Elements unchanged from §45 (53.4 ✗ / 31.0 ✗ /
  77.8 ✓; pre-existing).
- **Encounter speed**: the horde reads 3.2-3.7 s on this loaded machine; the
  base commit (abf2b50) exported and timed alongside read 4.5-5.7 s — no cost
  from the new seams.
- **Conflicts with intentions.md**: fantasy kit outside ±15pp; Segellar la
  ferida, Bloqueig mutu, Poder apagat and Cop de vida near "never sees play"
  (1-3%); Toc de la mort, the kit's signature, is not a "distinctive,
  high-impact" card in either set under any of the six rules.

## 48. The three shared kits tuned by their numbers; two blind spots that are the card value's, not the AI's; the horde's 3 s is the engine (2026-10-14, branch `elements-set`)

Brief: bring Mestre del xi, Acrobàcia and Artífex inside every requirement in
both sets by numbers only (dice, speeds, fatigue costs, prices, AI hints).
Every variant is an 800-combat kit-analyzer run, sequential, against the
calibration as it stood (the live kit moves, its pinned `@cal` copy does not);
then `pnpm calibration:refresh` and the full kit suites. "Δ" is the kit delta
vs neutral; a card is "value vs the hand · best play · gain when best · AI
play".

### 48.1 Mestre del xi

**Ràfega de dits** (fantasy, L6). Dice and fatigue barely move it; speed does
— its three blows (each carrying the level) land before the goblins act.

| Ràfega | fantasy Δ | Ràfega | Segellar played |
|---|---|---|---|
| 1d6 · vel 2 (§47) | +22.9±1.2 | +6.7 · 41% · +4.7 · 54.7% | 1.0% |
| + Segellar aimed by its wound (48.2) | +22.8±1.2 | +6.8 · 40% · +4.8 · 55.2% | 1.1% |
| 1 fatiga | +20.6±1.3 | +6.7 · 44% · +5.1 · 51.2% | 1.1% |
| 1d4 | +19.3±1.3 | +6.8 · 42% · +5.4 · 53.2% | 1.2% |
| 1d4 · 1 fatiga | +20.8±1.3 | +6.3 · 44% · +5.4 · 48.8% | 1.5% |
| vel 0 | +11.9±1.5 | +0.2 · 18% · +1.7 · 37.3% | 0.7% |
| vel 1 | +16.9±1.4 | +3.5 · 28% · +4.1 · 45.2% | 1.2% |
| **vel 1 · 1 fatiga (kept)** | **+13.6±1.5** | +3.2 · 29% · +3.2 · 44.6% | 0.9% |

Elements (L10): vel 2 −12.1±1.8 (§47), vel 1 −13.1±1.8, vel 1 · 1 fatiga
−12.9±1.8 — Ràfega is a minor card there (4-5% played). Kept vel 1 with the
fatigue brake (the user's rule for a too-strong card) over vel 0, which takes
the "three wounds cancel its action" clause away almost always.

**Toc de la mort** (elements only: L9; V1 Ressò kept), with Ràfega as kept:

| Toc | elements Δ | Toc |
|---|---|---|
| 2d6 · 1 fatiga (§47) | −12.9±1.8 | +0.3 · 7% · −2.5 · 3.0% |
| 2d8 · 1 fatiga | −12.3±1.8 | +2.0 · 10% · −0.2 · 3.5% |
| 2d6 · no fatigue | −12.8±1.8 | +1.0 · 8% · −2.8 · 2.9% |
| 2d8 · no fatigue | −11.7±1.8 | +2.3 · 10% · +0.4 · 3.9% |
| **2d8 · no fatigue · Ressò priced −0.15 (kept)** | **−11.4±1.8** | +1.8 · 10% · −0.1 · 4.8% |

The pending echo's base price moved from −0.05 to −0.15 (a `price` param on
the card, so the cache sees it). Toc now gains PV over the hand and the AI
plays it about half as often as it is the best play — it matters a little and
dominates nothing. It is still played on ~5% of turns: in fights that end at a
median of two rounds, a death that arrives at the end of the NEXT round rarely
has a round to arrive in. The variant texts lost "Puges 1 nivell de fatiga".

### 48.2 Segellar la ferida and Tombarella de rescat: the card value counts PV in won fights

The §47 hypothesis was checked: the depth-0 aim for an ally card was the
lowest PV fraction. A generic AI hint now exists — `EffectHandler.
aiTargetPriority(ctx, candidate)`, used by `pickResolveTargets` for non-enemy
cards (ai `policy.test.ts`) — and Segellar returns the PV the seal would close.
It changed nothing measurable (played 1.0% → 1.1%), so the aim was not it.

A throwaway probe (deleted) replayed fantasy fights and, at each decision where
the card was legal, compared the card value's best card (whole fight, PV
differential) with a one-round evaluation of every card done the way the
depth-1 search does it:

| | decisions | card value: best | one-round search: best | both | AI played |
|---|---|---|---|---|---|
| Segellar la ferida | 117 | 19 | 2 | 0 | 3 |
| Tombarella de rescat | 99 | 26 | 5 | 0 | 10 |

At the moments the card value calls them best, the one-round search rates them
24 points (a quarter of a win) below its best card on average. A third of those
moments are fights already won this round — every card scores the win (100),
and the card value, which counts PV left at the end, prefers the card that
saves PV; most of the rest are opening rounds where the search prefers the
damage by a point or two. Neither a price nor an aim can fix that: the search
scores a win as a win, whatever PV it leaves. Both are ratcheted in fantasy
`KNOWN_BLIND`. For the user: whether the card value should stop counting the
PV of an already-decided fight (it makes every heal and guard look best in the
mop-up), or the search should value the PV a win leaves — instrument changes,
not made.

### 48.3 Acrobàcia

| variant | fantasy Δ | Puntada | Tombarella (best) |
|---|---|---|---|
| Puntada 2d6 · vel 3 (§45) | +22.4±1.2 | +4.7 · 40% · +3.5 · 52.2% | 3.6% (30%) |
| vel 2 | +20.7±1.3 | +3.8 · 32% · +2.5 · 52.5% | 4.0% (30%) |
| **vel 1 (kept)** | **+16.6±1.4** | +1.1 · 19% · +1.5 · 46.7% | 7.0% (35%) |
| vel 1 · 2d4 | +15.9±1.4 | +1.0 · 16% · +1.2 · 36.8% | 10.2% (34%) |
| vel 1 · 1 fatiga | +17.3±1.4 | +1.5 · 21% · +1.3 · 45.1% | 7.3% (34%) |
| vel 1 + Tombarella vel 3 | +16.5±1.4 | +1.9 · 27% · +2.0 · 47.9% | 4.8% (21%) |
| vel 1 + Trampolí +6 | +17.3±1.4 | Trampolí −4.6 · 9% · −0.8 · 2.2% | 6.5% (34%) |

Below +16-17 nothing in Puntada moves the kit: what is left is its two
defenses (Tombarella +4.3, Esquiva +3.2 over the hand) and the shape cells
every fantasy kit reads high (cap/c4 +43 to +45 for all three kits). Kept the one
change that moved it. The band passes (+16.6 − 2σ < 15) but thinly. Tombarella
at speed 3 changed the band by nothing and only dodged the detector, so it was
not kept; Tombarella is ratcheted instead (48.2).

**Trampolí de mans** stays +4: +6 moved it within noise (−5.3 → −4.6 PV, 2.2%).
Giving away the acrobat's own attack for +N on one ally's attack is worth N
against an attack worth its whole total; no sane N makes it a peer. For the
designer: the card needs something the acrobat keeps (a rule change).

Elements with Puntada vel 1: −4.6±1.8 (§45 −1.6).

### 48.4 Artífex

| variant | elements Δ | Baldufa | Paraigua (best) | gadgets played: Autòmat · Ballesta · Trepant · Colós · Boa |
|---|---|---|---|---|
| today, WORTH 0.01 | −6.1±1.8 | 61.0% | 12.1% (33%) | 0.6 · 1.2 · 2.5 · 2.1 · 2.2% |
| WORTH 0.025 | −8.9±1.8 | 60.0% | 12.6% (33%) | 0.5 · 0.7 · 2.9 · 3.9 · 2.6% |
| Autòmat 2d6, Baldufa 2 fatiga, Colós and Boa 1 fatiga | −7.2±1.8 | 58.7% | 12.9% (35%) | 0.8 · 1.2 · 2.4 · 2.6 · 1.9% |
| **Autòmat 2d6 (kept)** | −6.5±1.8 | 60.8% | 12.1% (33%) | 0.7 · 1.2 · 2.4 · 2.3 · 2.2% |

(The "today" row differs from §46's −3.0 because the calibration's other
kits moved: the `@cal` Mestre del xi aims Segellar differently.) A higher price
made the AI play gadgets no more and the kit weaker; cheaper gadgets and a
dearer Baldufa moved nothing. **Elements fights end at a median of two
rounds**: a gadget that pays over three rounds has, on average, one round to
pay in. That is the fights' length, not a number on the cards. Fantasy (median
five rounds) is where Autòmat 2d6 shows: played 1.2% → 3.6%, −6.8 → −6.3 PV,
kit +10.1 → +7.8pp±1.6. Kept; the dice are printed on the card, its text is
unchanged. Fantasy Ganxo salvavides is no longer flagged (best 16%, played
3.9%) and left `KNOWN_BLIND`.

### 48.5 The encounter creator's horde: the engine, not a kit

`encounter-speed.test.ts` reads 3.08-3.21 s on the horde (budget 3 s; everything
else passes). The party there holds no new kit (berserk, volcanic, Esgrima,
nigromant at L3), and no content it uses changed since a978fff. Single-thread
`solveEncounter` of each request, the same machine, sequential, two runs each:

| commit | horde | squad | boss | mixed | solved PV |
|---|---|---|---|---|---|
| a978fff (§44.5, passed at 2.8 s) | 15.0 / 15.2 s | 7.1 / 7.1 | 12.3 / 12.2 | 12.0 / 12.1 | [14] [18] [165] [12, 29] |
| 2381ef3 (Acrobàcia seams) | 15.5 | 7.4 | 12.8 | 12.4 | same |
| a278d28 (Artífex seams) | 15.9 | 7.5 | 13.1 | 12.8 | same |
| f0d6edd (Mestre del xi) | 16.1 / 16.1 | 7.7 / 7.6 | 13.8 / 13.7 | 13.0 / 12.9 | same |
| this commit | 16.1 | 7.6 | 13.7 | 12.9 | same |

The solver fields the very same enemies at every commit, so no party got
stronger: each set of new engine seams (per-blow `BlowInfo`, `onAllyTargeted`,
`guardsBlow`, `afterBlow`, `beforeHolderAction`, …) costs every fight 1-3%,
+6-12% in all. No kit number can buy it back. Budget not loosened; the fast
tier fails on it. For the user: a profiling pass on the per-blow hooks (most
fights hold no status with any of them), or a decision about the budget.

### 48.6 After (calibration refreshed; 800-combat suites)

| kit | fantasy Δ | elements Δ | suites |
|---|---|---|---|
| Esgrima | +14.7±1.5 | −5.9±1.8 | pass both |
| Acrobàcia | +22.4 → **+16.6±1.4** | −1.6 → −4.6±1.8 | pass both |
| Artífex | +10.1 → +7.8±1.6 | −3.0 → −6.5±1.8 | pass both |
| Mestre del xi | +22.9 → **+13.6±1.5** | −12.1 → −11.4±1.8 | pass both |

Fantasy `KNOWN_BLIND`: Tombarella de rescat and Segellar la ferida in,
Ganxo salvavides out. Fantasy triangle unchanged (Power > Protect 71.1%±1.6,
Protect > Aggro 66.6%±1.7, Aggro > Power 54.9%±1.8); none of these kits is in
its mirror party. Fast tier: all green but the horde's 3 s (48.5).

Defense premium (`experiment-defense-vs-attack`): no defense dice changed.
Colós de butxaca (L9, 3d6) now holds 67% against Toc de la mort's 2d8 (it was
~85% against 2d6), its mean over same-level attacks 57%.

Conflicts with intentions.md, still open: Trampolí de mans (48.3) and the
elements gadgets (48.4) near "never sees play"; Acrobàcia's fantasy band passes
only within its error.

### 48.7 The horde's 3 s bought back by the engine, with no outcome changed (2026-10-14)

A profiling pass on 48.5 (`node --cpu-prof`, single-thread horde solve). No
single seam was slow. The cost was spread out: each blow and each targeting
query walked statuses that almost never carry the hook being asked for
(`onTargeted`/`onAllyTargeted`/`afterBlow`/`guardsBlow` over the whole side,
`plainCards` before every effect dispatch, `untargetable`/`ignoresConcealment`
in every `enemiesOf`, `rollMode` in every roll). Each dispatch also looked up
a handler per effect (`getHandler` alone was 3.8% of the solve). Two changes,
both content-free:

- **`StatusMap`** (`Character.statuses`, still typed as a Map). It records
  which hooks any of its statuses' behaviours carries, recomputed after a set,
  delete or clear. `holdsStatusWith(hook)` lets the engine skip a walk that
  could call nothing. 37 hooks are gated this way (every per-blow, per-roll
  and per-decision one, plus `positionValue` in the evaluator). A plain Map
  assigned in its place still works, just without the shortcut.
- **`EffectRegistry.effectsWith(effects, hook)`**. It gives, in order, the
  effects whose handler implements the hook, cached per card effect list for
  every hook at once. The cache is reset by any register or unregister. All
  engine dispatch, `canPlay`, `getTargetRequirement`, and the AI's `aiWeight`
  and `aiTargetPriority` read through it.

Every call that used to happen still happens, in the same order, with the
same arguments. Only calls that could not have done anything are skipped.

| commit, same machine, back to back | horde single-thread | encounter-speed horde (8 workers) |
|---|---|---|
| 7072d3b (before) | 15.99 / 15.69 s | 2.98 s |
| this commit | 14.54 / 14.85 s | 2.49 s (2.65 s inside the full fast tier) |

Proof that nothing moved:

- A seeded fingerprint of 1,390 fights hashed every log line, result and
  final PV. It covered every player kit at full level in a trio against two
  of each creature, plus a trio-vs-trio, in both sets. The hash is identical
  before and after (`dbae8852694e9341`).
- `kit-analyzer --player mestre-del-xi`, run on both commits, prints the same
  report line for line: +13.7pp±1.5, and the same card ranking.
- The solved PVs are unchanged ([14] for the horde).
- The fast tier is green (579 tests), plus `engine/test/hook-shortcuts.test.ts`
  for the two caches.

The budget is not loosened.

## 49. Trampolí de mans gets the user's rule; the AI's opponent model cannot see what it breaks (2026-10-14, branch `elements-set`)

The user picked rule B (`packages/sets/common/DESIGN.md`): **"Un aliat: el seu
atac d'aquest torn es resol ara; si fereix, l'objectiu queda a terra."** Id,
title, type (Focus) and speed (4) unchanged. One ally, not yourself. When the
Focus resolves, if that ally's card this round is an Atac that has not
resolved, it resolves right after the launch, ahead of its own speed slot,
with its own targets and dice. Every target it wounds is floored (area
attacks: each one). If the ally plays no Atac, or already attacked, the
launch is wasted. A wounded acrobat never launches (it is a Focus). The +4
(`TRAMPOLI`) is gone; the effect key stays `hand_trampoline`, and its status
is now `llancat` (LLANCAT).

### 49.1 What the engine got (generic; tests in `engine/test/seams.test.ts`)

- `EngineApi.advancePendingAction(target)`: the counterpart of
  `delayPendingAction`. The target's pending action moves to just after the
  one now resolving and joins its speed tier, so it is simultaneous with it.
  A body it fells in that tier still acts. Returns false when the action has
  already resolved or was cancelled. A Focus advanced for an actor already
  hit stays interrupted.
- `StatusBehavior.onHolderAttackHit(ctx, target, damage, action)`: called for
  every blow of the holder that hit (walls included), with the damage after
  armour (0 when armour took it all) and the card. It runs after the card's
  own `onAttackHit`. It is gated like the other per-blow hooks.
- `AIContext.plan`: the revealed queue (`pendingSummary()`). It is empty
  while cards are being chosen, because the table chooses simultaneously.
  It is filled from the reveal on.

AI hints. `aiWeight` cannot read the plan: at choice time the plan is empty,
and `AIContext` has no engine. So it reads the allies' HANDS instead: 0.6 if
an ally holds an Atac slower than the launch. `aiTargetPriority` reads the
plan at the reveal and aims at the ally whose Atac is still to come. The
search plays the team's joint plan, so the launched card is simulated in its
advanced order. In a probe, every real launch found an Atac (0 wasted).

### 49.2 Measured (800-combat kit-analyzer; "before" is 81e61ee, "after" this commit with the calibration re-pinned)

| | fantasy (L6) before | fantasy after | elements (L10) before | elements after |
|---|---|---|---|---|
| kit Δ vs neutral | +15.1pp±1.5 | +16.9pp±1.4 | −3.9pp±1.8 | −3.8pp±1.8 |
| Trampolí: value vs the hand | −5.3 PV | **−0.2 PV** | −12.2 PV | **+23.1 PV** |
| best play | 7% | **22%** | 5% | **28%** |
| gain when best | −0.6 PV | **+10.4 PV** | −4.2 PV | **+11.0 PV** |
| AI play rate | 2.0%±0.3 | 3.2%±0.4 | 0.5%±0.2 | 8.1%±0.7 |

Both kit suites pass. Requirements 1-3 hold in both sets. The fantasy band
passes inside its error: +16.9 − 2σ < 15. In elements, Trampolí is now the
second-best card by value, after Tombarella. In fantasy, Tombarella de rescat
stopped being a blind spot (best 28%, played 6.9%) and left `KNOWN_BLIND`.
Trampolí took its place there, for the reason below. The fast tier is green
(587).

### 49.3 Why the fantasy AI under-plays it: the search's opponent model never hides

A throwaway probe (deleted) used 40 fantasy fights: the acrobat at L6 with
four company rows against 5 goblins at PV 14. At each acrobat decision where
Trampolí was legal, it compared:
- the card value (`valuePosition`, the analyzer's own);
- a one-round score per card with a depth-1 continuation;
- the production joint plan;
- the search's own evaluation of that plan with and without Trampolí. That
  evaluation was run twice: once with the goblins at depth 0 (as in the
  rollouts), once with them at depth 1 (as in the real fight). Each used 24
  paired samples.

- **The plan is not the problem.** The card value calls Trampolí best at 31
  of 118 decisions. At 26 of those, the production plan already has an ally
  on a slow Atac, and the one-round score ranks Trampolí top at 25. Usually
  it leads by 50-98 points, which means the round decides the fight. The
  production AI played it at 4 of them.
- **The opponent model is.** At the 27 best moments the AI missed, Trampolí
  minus the AI's pick, scored by the search with depth-0 goblins: median
  −2.3, 6 of 27 positive. With depth-1 goblins: 15 of 27 positive, eleven of
  them by +44 to +86.
- **What it breaks is Amagar-se.** This is the goblins' Focus at speed 2:
  dodge every attack this turn. The launched attack lands at speed 4,
  interrupts the hide, and so the rest of the party's round lands too. The
  real goblins (depth 1) played Amagar-se in **43%** of their cards in those
  rounds. The depth-0 model used for them inside the search played it in
  **1.1%**. Its hint is 0.7 (1.6 when hurt) on a Focus base of 1.2, set
  against attack weights that grow with expected damage. So the search
  almost never sees a hide to break.
- **Causal check, reverted.** I raised the hide hint to 4 (5 when hurt) and
  ran the same probe. The depth-0 hide rate went to 7.7%, the AI played
  Trampolí at 13 of 24 best moments (it was 4 of 31), and 17% of its legal
  turns overall (it was 3.4%).

None of the candidate causes is a Trampolí bug. Trampolí's `aiWeight` only
seeds the search. The floored status's −0.1 price does not decide these
rounds. The search does simulate the ally's card in the advanced order. The
cause is the depth-0 OPPONENT MODEL, which §20.8 keeps "swingy" on purpose.
Fixing it means changing the goblin's hint, and that moves every fantasy
measurement that holds goblins (the horde and mixt shapes, every kit's
baseline). So it was not done here. Trampolí is ratcheted in fantasy
`KNOWN_BLIND`. In elements the gap is smaller (played 8.1% against 28% best)
and not flagged.

**For the user:** whether to bring the depth-0 goblin closer to the field,
via its Amagar-se hint or a general Focus/interrupt term in `actionWeight`.
That needs a full recalibration and every fantasy kit suite re-run, and it is
the same lever §20.8 warns about ("do not fix this weight without measuring
the SEARCH").

### 49.4 Conflicts with intentions.md

"Combos between actions played in the same round should be among the best
options." Trampolí is now one of them by value: 22% / 28% best play, +10-11 PV
when best. The AI still plays it far below that in fantasy (49.3). The
fantasy band (+16.9±1.4) passes only within its error, as in §48.3.

## 50. Mestre del xi: Entumit becomes −3 to attacks; Desbloquejar el cos replaces Segellar la ferida; "efecte negatiu" is one convention (2026-10-14, branch `elements-set`)

The user's decisions (`packages/sets/common/DESIGN.md`), built as written:

- **Entumit**: "Fins al final del torn següent, els seus atacs tenen −3." The
  −3 is on the attack ROLL (the contested total, and so the damage of an
  undefended blow), never on the damage after a defense. It renews, never
  stacks. Priced −0.05 per point (−0.15 at 3, as the halving was). The
  halving code is gone; the rule text is in the skill description.
- **Card 3: Desbloquejar el cos** (Focus, speed −1, unlock 3, as Segellar):
  "Un aliat dret, o tu, recupera 4 PV i perd tots els efectes negatius." N = 4
  (below Bàlsam de lluna's 2d6). It never targets the fallen (Cop de vida stays
  the only revive), and a swallowed body is out of its reach. AI hint: worth
  the PV it would restore plus the cleared statuses' own `positionValue`, each
  lost action −0.25, each penalty point −0.04 (`unblockWorth`); the same number
  aims it (`aiTargetPriority`).
- **rules.md** defines *efecte negatiu*: any state an enemy card has left on you.

### 50.1 What the engine got (generic; tests in `engine/test/seams-xi.test.ts`)

- `StatusBehavior.attackRollOfHolder(ref)`: added to every attack total the
  holder rolls, each pass of its card and every extra blow. Gated like the
  other per-blow hooks.
- `CombatModifier.data`: an inert payload, like `StatusEntry.data`, copied by
  `cloneState`.
- `Character.lastWound` is removed. Segellar was its only reader.

### 50.2 Efecte negatiu: one convention across both sets

`packages/sets/common/src/effects/harm.ts`. Every status or modifier an enemy
card leaves carries `harm: 1` in its data. Lost actions are `skipTurns` (only
enemy cards raise it; the one self-stun handler is unused). A status that takes
the body out of the fight carries `bodyOut: 1` instead, and `clearHarm` leaves
such a body alone. Before this, `harm: 1` was on the elements and shared-kit
statuses only, and nothing read it. Now marked too:

- fantasy statuses: verí/cremades/foc persistent (DOT, from enemy cards only;
  the shaman's sagnia on its own side stays unmarked), marca, silenced,
  indefensable, marca-objectiu, putrefacció, condemnat, encegat, maleït de sang;
- fantasy modifiers: Debilitació (bone devil's sting), Repèl (horned devil's
  block), a negative `skill_mod` cast on the other side (bone and horned
  devils, Gel);
- elements: the ice prison, the strip of armour, `debuff_on_hit`;
- the unagi's swallow: `harm` → `bodyOut`;
- Bloqueig mutu: only the enemy's half is harm (the master's is its own price).

Fantasy's unused `cleanse` handler now calls `clearHarm`. No claw that hangs a
hero exists in code (Urpa elevadora was an Artífex draft, never built). If one
is built, it should carry `bodyOut`.

### 50.3 Measured (800-combat kit analyzer; before = 1daa805, after = this commit with the calibration re-pinned)

| | fantasy (L6) before | fantasy after | elements (L10) before | elements after |
|---|---|---|---|---|
| kit Δ vs neutral | +14.0pp±1.5 | +15.9pp±1.4 ✓ | −10.2pp±1.8 | −9.1pp±1.8 ✓ |
| fights end (median · p90 · stalls) | 4 · 6 · 0.0% | 4 · 6 · 0.0% | 2 · 5 · 0.4% | 2 · 5 · 1.1% |
| choice matters (PV/decision) | 4.22±0.19 | 4.18±0.22 | 5.69±0.78 | 3.62±0.65 |

Cards: value vs the hand · best play · gain when best · AI play.

| card | fantasy before | fantasy after | elements before | elements after |
|---|---|---|---|---|
| Cop al nervi (numbs) | +2.3 · 15% · +0.2 · 17.0% | +1.7 · 15% · +0.0 · 16.5% | +11.6 · 25% · +12.6 · 8.2% | +5.4 · 16% · +5.9 · 7.2% |
| Pinça entumidora (numbs) | +2.5 · 20% · +4.4 · 13.5% | +2.7 · 19% · +4.3 · 16.7% | −1.6 · 13% · +0.8 · 20.6% | −0.3 · 16% · −1.8 · 22.3% |
| Ràfega de dits (numbs) | +3.6 · 30% · +3.4 · 43.8% | +3.6 · 30% · +3.7 · 41.8% | −0.3 · 9% · −1.0 · 4.7% | +0.1 · 9% · +0.1 · 5.7% |
| Tocs en cadena (numbs) | L7, not measured | — | +1.0 · 12% · +2.2 · 29.6% | +1.3 · 9% · +1.3 · 26.9% |
| Segellar → **Desbloquejar** | −5.7 · 20% · +2.2 · 0.9% | **−6.1 · 18% · +1.1 · 0.7%** | −10.1 · 5% · −7.4 · 1.3% | **−9.0 · 7% · −3.6 · 0.4%** |
| Cop de vida | L8, not measured | — | +3.6 · 18% · +9.1 · 2.7% | +3.2 · 16% · +2.8 · 3.7% |

Play rates are ±0.2-1.2pp (2σ ≈ the printed ± twice); a card value moves about
±1 PV between runs.

Read:

- **Entumit −3 is about as strong as the halving.** Both bands moved within
  ~1σ of the difference (+1.9pp fantasy, +1.1pp elements). Each numbing card
  stays within noise of where it was, except Cop al nervi in elements, which
  lost half its lead (+11.6 → +5.4 PV over the hand). Against the elements
  soldiers' big totals, halving took more than 3 points. No band fails, so N
  stays 3.
- **Desbloquejar el cos is played as little as Segellar was** (0.7% / 0.4%).
  Fantasy flags it as a blind spot (best 18%) with the signature of §48.2: a
  small gain when best (+1.1 PV), the mop-up of a won fight that the card value
  counts and the search does not. Fantasy's fights leave few efectes negatius
  on heroes (goblins leave none). Ratcheted in fantasy `KNOWN_BLIND`; **not
  re-probed**. In elements, where shirshus paralyse and soldiers burn, it is
  best only 7% of the time and gains nothing when it is. N was not tuned: the
  bands pass, and the brief allows N only under 7.
- **Cop de vida** (elements) is no longer a blind spot (best 16%, played 3.7%)
  and left elements `KNOWN_BLIND`. Toc de la mort's numbers moved with the
  re-pinned calibration (+1.7 → +2.8 PV), within about 1σ.
- Both kit suites pass. Fast tier: 594 green. The horde's encounter-speed
  test read 3.08-3.12 s on two reruns, with another session's process on a
  core and the run at `nice 19`. It passed in the first full fast-tier run
  with the same engine code. The new hook is gated, so it costs a fight
  nothing unless it holds a numb.

### 50.4 Conflicts with intentions.md

- Desbloquejar el cos, like Segellar before it, is near "never sees play"
  (0.4-0.7%). If it should matter, the levers are its speed (a −1 Focus is
  interrupted by any blow first) or a decision on the §48.2 card-value
  question. Both are for the user.
- The fantasy band (+15.9±1.4) passes only within its error, like Acrobàcia's
  (§48.3, §49).
---

## 51. The AI audit: the production AI against a Nash referee, on imaginary cards (2026-10-14, branch `elements-set`)

A standing harness that judges the AI by an OBJECTIVE referee and imports no
content set. In a position, the best play is whichever branch, played out,
ends best. Real fights are too big to solve, so the audit deals small fights
from imaginary cards and solves them properly. Design and knobs are in
ARCHITECTURE.md, "The AI audit". Code: `packages/ai/src/audit/`,
`tools/src/ai-audit.ts` and `tools/src/ai-audit-calibrate.ts`.

### 51.1 What it is

- **18 archetypes** (`catalogue.ts`), content-free: attack, fast jab, area
  sweep, armour-piercing or undefendable, guard an ally, block an enemy, heal,
  revive, cleanse, a slow setup Focus (next attack +N), delayed damage (lands
  as next round opens), a delayed-death mark (2-3 rounds on), a device (hits
  the weakest foe at every round end for 2-4 rounds), stun (`skipTurns`),
  lock attacks, weaken (−N), advance an ally's card (`advancePendingAction`),
  taunt, and the universal fallback. Each card states its payoff horizon.
  65% of status cards price themselves (`positionValue`), as measured on the
  real table; the rest do not.
- **The generator** draws from distributions measured on both sets and frozen
  in `profile.ts`: speeds, dice ladders (1d2 to 4d6), type mix (53/23/25),
  levels (heroes 5-10, enemies 3-10), armour, fatigue costs (16% of cards),
  shapes (4 heroes against 1, 2, 4 or 5) and fight lengths (2-5 rounds).
- **The referee** solves each round as a zero-sum matrix game for its Nash
  equilibrium (simplex, regret matching as fallback). It recurses to the real
  end of the fight. Payoff: PV of side A minus PV of side B at the end. No leaf
  is scored by a heuristic.
- **The check**: the production AI (`bestResponse` at `DEFAULT_LOOKAHEAD`, 4
  seeds) picks for team 0. A pick is a MISMATCH if all of these hold:
  - its equilibrium probability is under 2%;
  - against the equilibrium opponent it loses more than ε = 1 PV and 2 root
    standard errors;
  - two re-solves under independent referee seeds agree;
  - the mean loss over the three solves clears ε by 2 standard errors of
    their own spread.
- **Fixtures**: each confirmed mismatch is appended to
  `ai/test/audit-fixtures.json`, with the referee's verdict on every card
  combination. The fast tier replays only the AI; open fixtures are `todo`.

### 51.2 Realism given up, and why

- **Hands are cut to 3-4 cards.** Real heroes hold 6-10. A hero holds 6-10 options
  times up to 3 targets, and the referee recurses over every one of them.
- **Shapes.** The night reaches 4v1, 1v4, 4v2, 3v3, 4v4 and 4v5. Only 4v1,
  1v4, 4v2 and 3v3 get 3 rounds left; the biggest get 2. Long horizons
  (3-4 rounds) live in 1v1, 2v1, 1v2, 2v2 and 4v1.
- **PV is paced.** Each side's PV is rescaled so the other side's blows take
  about the rounds left (×0.6-1.5) to remove it. Drawn as measured, a lone
  12-PV hero facing a level-10 3d6 blow is over in one round, and no
  multi-round card could matter. The PV table still sets the ratio between
  bodies.
- **Targets are committed at the reveal**, from the 3 weakest candidates. The
  AI aims at resolution, so its pick is credited with its best target variant.
- **A round cap ends every position.** The AI is shown one round more,
  because its evaluator treats `maxRounds` as a draw worth 0.

### 51.3 Validation

- **The solver** (`audit.test.ts`) gets these exactly: rock-paper-scissors,
  matching pennies, a 2×3 game solved by hand (value 8/5), a saddle point,
  duplicate rows. On 200 random matrices up to 7×7, exploitability is under
  1e-6 and regret matching agrees on the value.
- **The referee on hand-made fights** (`controls.ts`): 7 controls, each
  equilibrium exact by arithmetic. There are long/short twins for a device
  and for delayed damage. The device or bomb is the play only when the fight
  lasts long enough; in the twin, the foe dies first and a plain strike is
  right. There is also an interrupt of a delayed blow, and unpriced copies of
  the long pair. All 7 match to 1e-6.
- **Double oracle vs full enumeration**: 10 positions (2v1, 3 cards, 2
  rounds), same samples. Value difference rms 0.04 PV. (Before the
  multi-start best response it was 3.5 PV, with one miss of 11 PV.)
- **Referee noise**, same position under 3 referee seeds, 2v1 c3 r3, mean
  |value| 35 PV:

  | samples per depth | value sd | s per solve |
  |---|---|---|
  | 8, 2, 1 | 2.39 PV | 1.1 |
  | 16, 4, 1 (chosen) | 1.33 PV | 2.6 |
  | 16, 4, 2 | 1.31 PV | 4.4 |
  | 32, 8, 2 | 0.70 PV | 8.4 |

  On 16 night-mix positions with 2 replicates each: game value sd 1.91 PV
  (worst 6.2). An AI pick's loss has sd 4.26 PV per solve, larger than the
  root's own standard error can see. That is why a mismatch needs three
  solves and a mean loss beyond their spread.

### 51.4 Timing sweep (2026-10-14, nice 19)

Seconds per position, including the AI's 4 picks and any confirming
re-solves. Rows marked * ran 8 at a time; the rest ran while ~38 processes
shared 32 cores, so they read about 2× slow. In the trial (4 lanes) the
night mix averaged 35 s.

| config | done | over budget | mean s | median s | max s |
|---|---|---|---|---|---|
| 1v1 c4 r2* | 8 | 0 | 0.2 | 0.2 | 0.3 |
| 1v1 c4 r3* | 8 | 0 | 0.5 | 0.5 | 0.8 |
| 1v1 c4 r4* | 8 | 0 | 1.6 | 1.2 | 3.4 |
| 1v1 c4 r5* | 8 | 0 | 5.6 | 5.1 | 12.3 |
| 2v1 c3 r2* | 8 | 0 | 0.8 | 0.6 | 1.7 |
| 2v1 c3 r3* | 8 | 0 | 6.6 | 1.7 | 35.9 |
| 2v1 c3 r3, K 8,2,1 | 6 | 0 | 6.8 | 4.8 | 16.5 |
| 2v1 c3 r3, K 32,8,2 | 6 | 0 | 41.0 | 14.2 | 105.5 |
| 2v1 c3 r4 | 6 | 0 | 73.4 | 41.7 | 304 |
| 2v1 c3 r5 | 6 | 1 | 78.1 | 67.0 | 228 |
| 1v2 c3 r4 | 5 | 0 | 200 | 164 | 511 |
| 2v2 c2 r3 | 6 | 0 | 182 | 168 | 587 |
| 2v2 c3 r2 | 6 | 0 | 20.1 | 20.8 | 41.0 |
| 2v2 c3 r3 | 5 | 2 | 34.3 | 19.9 | 78.9 |
| 2v2 c4 r3 | 4 | 2 | 66.3 | 128 | 128 |
| 2v2 c3 r4 | 2 | 1 | 733 | — | — |
| 4v1 c3 r3 | 6 | 0 | 155 | 94 | 593 |
| 4v1 c3 r4 | 1 | 0 | 247 | — | — |
| 4v1 c4 r3 | 2 | 1 | 522 | — | — |
| 4v2 c3 r2 | 3 | 0 | 319 | 316 | 391 |
| 3v3 c3 r2 | 3 | 0 | 437 | 325 | 672 |
| 4v4 c3 r2 | 1 | 0 | 606 | — | — |
| 3v3 c3 r3, 4v2 c3 r3, 4v5 c3 r2 | 0 | — | > 13 min | | |

"Over budget" means one solve passed 20 M simulated rounds; the position is
reported unsolved. The cost grows with joint actions per side, raised to the
rounds left. Around 3 rounds for 2-4 bodies a side and 5 for 1v1 is where it
stops being minutes.

**Maximum per position in one night**: 4v4 / 4v5 at 2 rounds left, 4v1 and
2v2 at 4, 2v1 at 5, 1v1 at 5 (6 is still cheap for 1v1).

### 51.5 The trial: 50 night-mix positions, 4 lanes (2026-10-14)

Wall time 727 s (35 s a position on average; median 10.6, p90 106, max 379).
96% solved (2 over budget).

- **Positions with a confirmed mismatch: 31%±7** (18 screened). The AI's
  decisions that are mismatches: 27%±6. (Under the rule as it was then:
  three agreeing solves. The mean-loss test was added afterwards.)
- **By horizon**: 1: 5/11; 2: 10/29; 3+: 0/8.
- **The controls**: the AI is right on 6 of 7. It misses `bomb-long-unpriced`:
  delayed damage whose status does not price itself is invisible to the
  depth-1 search. The priced copy, and the unpriced device (which ticks this
  round), are fine.
- **What recurs** in the mismatches:
  - stun is ruled the play, and the AI plays weaken, strike or pierce (stun
    is `skipTurns`, which nothing prices);
  - setup Focus played where it loses;
  - heal or guard played where a strike or a guard on the right body wins;
  - taunts played where a block was right.

  One trial is too small to rank these. The night is for that.

### 51.6 The night (launched 2026-10-14)

From `packages/tools`, 28 lanes, every child at nice 19:

    setsid nohup nice -n 19 node --import tsx src/ai-audit.ts --mix night \
      --games 11600 --lanes 28 --hours 7.25 --out /tmp/ai-audit/night \
      > /tmp/ai-audit/night.log 2>&1 &

- **The deadline ends it, not N.** `--hours 7.25` stops dealing new
  positions; the ones in flight finish and the final report is written.
  Positions are dealt mixed, so the shares hold wherever it stops.
- **Expected yield**: 5,000-8,000 positions. Of those, about 25% horizon 1,
  50% horizon 2 and 25% horizon 3+ (by the mix's round caps and `longShare`).
- **Output**:
  - `report-<date>-partial.{md,json}` every 10 minutes;
  - `report-<date>.{md,json}` at the end;
  - lane files in `run-*/`.

  `--report-only <run-dir>` rebuilds the report and the fixtures after a
  crash.
- **Fixtures**: confirmed mismatches append to `ai/test/audit-fixtures.json`
  (`todo: true`).

## 52. The AI audit's defects: puzzles, causes, fixes (2026-10-15, branch `elements-set`)

The night of §51 found the production AI on a referee-dominated card in 26% of
positions. Each defect group got a GENERIC control puzzle first
(`ai/test/defect-puzzles.test.ts`: made-up cards, fixed dice, the answer exact
by arithmetic and confirmed by the referee), then a fix, judged three ways:
the puzzles; the AI REPLAYED on the night's 2,030 solved positions against the
referee's stored verdicts (paired, AI-only, a pick the referee did not weigh is
"unknown"); and a FRESH referee sample solved with `CheckOptions.rival` (the old
setting asked the same positions, judged on the same solves, under the full
confirmation rule). Fresh slices: 1x1 c4 r4, 2x1 c3 r3, 2x2 c3 r2, 4x1 c3 r2;
4 lanes at nice 19. Replay rule: equilibrium probability < 2% and loss > 2 PV on
the stored root solve (stricter than ε = 1, unconfirmed), so its rates read
higher than the night's confirmed 26%; only the paired difference matters.

### 52.1 Fix 1 — the leaf is settled at the start of the next round (`tempo`)

**Cause.** The depth-1 leaf (`positionScore`) is read when the searched round
ends. A stun (`skipTurns`) is only spent by the NEXT `prepareRound`; a delayed
blow lands in the next round's `onRoundStart`; a raised ally first acts next
round. So a stun scored as its dice, an unpriced bomb as nothing, a revive as
a few PV and one more body (the bodies term is divided by everyone standing).
An underpriced status (a terra's −0.1; §49) is the same blind spot: its +N
lands on next round's blows.

**Fix** (`LookaheadOptions.tempo`, default 1, ai only, no engine change): after
the searched round the rollout prepares the next one (round-start effects land,
the bodies that lose it are known) and adds each side's next-round blows —
every acting body's best LEGAL attack, plus the largest
`attackRollAgainstHolder` a foe carries — in the PV term's units (blows over
the other side's total max PV). Not when that round is the cap.

Tried and rejected:
- **Playing the next round out at depth 0** (`continuation`): best on the
  audit replay (decisions 31.7% → 17.8%) but it LOST the fantasy mirror
  (45.0%±5.7 at 6 samples, 37.8%±5.6 at 3 samples to keep the cost) and
  doubled the search's cost: our own side's depth-0 play in that round is weak.
- **Capping the threat at the PV the other side has left**: our threat then
  shrank with every point dealt and the search guarded where it should strike
  — fresh 4x1 c3 r2 went +7.1pp±3.8 worse; uncapped, +2.5pp±2.3.
- `tempo` 0.5 / 0.75: smaller gains everywhere, mirror 52%.
- A softer rollout opponent (`rolloutSharpness` 1) on top: +1.3pp±1.2 worse.

**Measured (2026-10-15).**

| | before | after | paired Δ |
|---|---|---|---|
| puzzles (a) stun, (b) unpriced bomb, (c) revive, (e2) underpriced exposure | fail | pass | |
| night replay, positions with a ruled-out pick (2,030) | 38.5%±2.2 | 30.1%±2.0 | −8.4pp±1.4 |
| … decisions | 31.7%±2.1 | 22.9%±1.9 | |
| … hand holds a stun (474) | 59.3%±4.5 | 34.2%±4.4 | −25.1pp±4.1 |
| … equilibrium stuns (330) | 68.2%±5.1 | 36.4%±5.3 | −31.8pp±5.1 |
| … hand holds a bomb (319) | 39.2%±5.5 | 29.2%±5.1 | −10.0pp±4.2 |
| … hand holds a revive (247) | 38.1%±6.2 | 26.7%±5.6 | −11.3pp±4.6 |
| … 4x1 (299) | 74.6%±5.0 | 53.8%±5.8 | −20.7pp±4.8 |
| … 4x2, 3x3, 4x4, 4x5 (202) | 69.8%±6.5 | 64.4%±6.7 | −5.4pp±3.2 |
| … no group got worse | | | |
| night fixtures (179, all failing before) | 100% | 59.8%±7.3 | −40.2pp±7.3 |
| fresh referee sample, confirmed (1,681; first cut, capped threat) | 25.6%±2.1 | 21.8%±2.0 | −3.7pp±1.5 |
| … 1x1 c4 r4 (522) | 14.6%±3.1 | 6.3%±2.1 | −8.2pp±2.5 |
| … 2x1 c3 r3 (486) | 25.7%±4.0 | 16.7%±3.4 | −9.1pp±3.0 |
| … 2x2 c3 r2 (337) | 19.3%±4.3 | 19.3%±4.3 | 0.0pp±1.9 |
| … 4x1 c3 r2, uncapped (407) | 49.1%±5.0 | 51.6%±5.0 | +2.5pp±2.3 |
| … hand holds a stun (248) | 41.1%±6.2 | 14.1%±4.4 | −27.0pp±6.0 |
| the 7 controls | 6/7 (misses bomb-long-unpriced) | 7/7 | |
| fantasy mirror, new vs old, 2 × 600 combats | | 56.8%±4.0, 53.3%±4.1 (seed 7, an earlier cut) | |

4x1 c3 r2 is the one slice that did not improve: +2.5pp±2.3 (1σ). Its fights
end in two rounds and hold no multi-round card, so the term can only add noise
there; the extra picks are mostly guards where a strike was right, on one or
two of the four AI seeds. Accepted for the gains elsewhere and the mirror;
watch it.

**Cost.** Reference party vs 5 goblins / vs 2 wolves and a golem, 40 fights,
interleaved: 10.0 → 10.7 ms a round (+7%) and 3.9 → 3.8 ms; per fight the
goblins went 74 → 89 ms because the fights got longer (heroes won 7/40 → 0/40:
both sides use the AI, and the goblins gained more). `encounter-speed`, same
load: horde 4.85 → 4.25 s, bone devils 1.71 → 2.25, boss 2.98 → 4.39, mixed
2.44 → 2.83 (sum +14%). The 3 s budget already failed at baseline on this
machine under load (horde 3.5-4.8 s at load 8-14); the boss's +47% is the
fight getting longer, not the leaf.

**Calibration.** Every baseline moves (the enemies think with the same AI):
`pnpm calibration:refresh` and the slow kit suites are due, at night.

### 52.2 Fix 2 — the aim rule counts the team's blows still to come (focus fire)

**Cause.** `pickResolveTargets` (policy.ts) gave the kill bonus only when ONE
blow fells the target; otherwise it aimed by wounded FRACTION, so two blows
that together fell a dangerous small body went at a big half-dead one. The
rollouts aim by this rule, so the SEARCH priced a strike whose worth was a
joint kill as a scratch on the boss, and guarded instead (puzzle (d): two
heroes can fell Small before its slow maul; the AI guarded, 4/4 seeds).

**Fix** (ai only): an attack's target also scores +3 when its expected
damage plus the expected damage of teammates' attacks still pending this round
(single-target, read from `playedActionIdx`) fells it.

**Measured (2026-10-15).** Puzzle (d) passes. Night replay vs fix 1: all
−0.9pp±0.5; 4x2/3x3/4x4/4x5 (202) 64.4% → 55.4%, −8.9pp±4.5 (but 20% of those
picks were not weighed by the night's referee); 3-4 seats −3.6pp±1.8; nothing
else moved. Fresh referee sample (2x2, 3x2, 4x2 at 2 rounds, the same 150
seeds solved under each code, 96 solved by both): 34.4% → 32.3%,
−2.1pp±4.1 — not resolved at this size; 4x2 +5.6pp±10.8 on 18. No mirror
A/B is possible in one process (both sides aim by the same rule). Cost: one
pass over the pending queue per target choice, not measurable.

### 52.3 Still open (2026-10-15)

- **(e1) The opponent model never hides.** The rollouts play the other side
  with the depth-0 heuristic (`selectAction`): an attack is worth
  `1 + 1.5 × expected damage`, a Focus a flat 1.2, so a foe that should dodge
  (puzzle (e1): claw and die, or hide and lose nothing — the referee hides
  p = 1) claws 98% of the time. Still `it.fails`. Tried: a uniform ε-mixture
  for the opponents inside rollouts (ε 0.15 / 0.3): night replay −1.2pp±1.0 /
  +0.3pp±1.2, mirror 51.2%±4.1 — no measurable gain, not shipped. The audit
  has no hide archetype, so it cannot measure this at all; the lever that
  worked in §49.3 is the content hint (Amagar-se's `aiWeight`), which moves
  every fantasy baseline. **For the user**, as in §49.3. Adding a "dodge this
  round" archetype to the audit catalogue would let the referee judge it.
- **Advance** (`advancePendingAction`) is still the worst archetype in the
  replay (45% of positions): inside a rollout an unhinted `ally_other` Focus
  goes to the most wounded ally, not the one with a slow attack. Real cards
  carry an `aiTargetPriority` hint (Trampolí does); the audit's does not.
- **Guard/block vs strike** is now the largest remaining pair in the
  multi-body slices; the referee pays in PV, the leaf in mean fractions, and
  part of this may be that currency difference rather than an AI fault.
- **Fixtures.** 70 of the 179 night fixtures now pass the fast tier's own
  rule (ε 0.5) and were flipped from `todo` to guards; 109 stay open.
- **Cost of both fixes**, 40 fights, same session: 10.5 → 12.9 ms a round vs
  goblins (+23%), 4.2 → 4.4 vs wolves and golem (+5%); per fight +32-43%,
  most of it longer fights.
- **Due at night:** `pnpm calibration:refresh` and the slow kit suites — both
  fixes change how every enemy plays too.

### 52.4 The search's cost bought back, no decision changed (2026-10-15)

`encounter-speed` failed after the two fixes (boss 2.98 → 4.39 s at 8
workers). A CPU profile of the boss solve (single thread) showed no new hot
spot: the leaf's own work (`prepareRound` + `nextRoundThreat`) was ~4%; the
rest was more rollouts per round (+19% clones on the boss, partly longer
fights) at a slightly dearer leaf (+8% per clone). So the cut came from the
search not redoing work, in one per-decision memo (`DecisionMemo`,
`lookahead.ts`):

- **Plans asked twice read their rollouts back.** A sample is a pure function
  of (board, plan, `pairSeed + s`), and `bestResponse`'s second pass re-asks
  every card of every seat whose teammates have not moved since the first.
  Values are stored per plan and per sample; the racing rule still runs
  sample by sample against the CURRENT floor, so a plan cut earlier resumes
  where it stopped and a full one is cut exactly where a fresh one would be.
- **Each opponent seat is weighed once per decision.** Every rollout clones
  the same prepared board and nobody's choice changes it, so a seat's depth-0
  odds are the same in every sample of every candidate; only the draw (one
  `random()` in the seat's stream, as before) differs. `selectAction` was
  split into `actionOdds` + `drawAction` for this. Not shared where the board
  can differ: a round the rollout prepares itself, a later round, a seat that
  chooses after the reveal.

Proof that nothing moved: a seeded fingerprint of 1,152 depth-1 fights (every
player kit of both sets, at full level, in trios, against two of every
creature; every log line, result and final PV hashed) is identical before and
after (`f759868773532d69`), and every solved PV of the four requests is
unchanged ([9], [17], [189], [10, 24]).

| single thread, one pinned core, interleaved ×2 | before | after |
|---|---|---|
| horde (5 goblins) | 28.7 s | 20.5 s |
| bone devils | 18.1 s | 12.4 s |
| boss (basilisk) | 44.3 s | 28.8 s |
| mixed band | 32.2 s | 19.7 s |
| sum | 123.2 s | 81.4 s (−34%) |
| rollouts (clones), boss | 960k | 801k |
| µs per clone, boss | 46 | 36 |

For scale, the same script with `tempo: 0` (no leaf settling, i.e. roughly
before §52.1) summed 158 s in a noisier session against 164 s with it; the
fixes' cost was mostly longer fights and more rollouts, not the leaf.

### 52.5 Fix 3 — the opponent model drops the foe's blunders (`opponentSearch`, 2026-10-15)

**The audit can see it now.** A `hide` archetype joined the catalogue (Focus,
speed 1-4: no blow wounds the holder for the rest of the round; unpriced, as
it lapses before any leaf reads it), with a long/short control pair
(`hide-long`: hide twice, −20; `hide-short`: the claw fells a 6-PV foe first,
+10 — hiding costs a fatigue level, and the fatigued claw no longer kills).
`GeneratorConfig.foeCard` deals an archetype to the OTHER side, and
`ai-audit --mix verify` holds §52's four fresh slices plus the same four with
a hide in the foe's hand. `ai-audit --rival '<json>'` A/Bs an AI setting on
the same solves.

**Puzzles.** (e1) now asks the model the SEARCH uses (`rolloutOdds`), not the
depth-0 policy; (e1b) is new — §49.3's Trampolí in miniature: break the hide
with a 1-point jab before it resolves, or strike for 8 after it; the foe's
claw never lands, so in every equilibrium it hides with some chance and the
jab is the only answer (referee: jab p = 1). Both failed (hide 1.4%; AI
strike 4/4) and pass.

**Fix** (ai only). Once per decision, each opponent seat's cards are played
out for one round (2 samples, everyone else at depth 0, scored from the
foe's side); a card trailing the foe's best by more than 10 leaf points
(about one side's whole health) has its depth-0 odds cut by e^−(excess).
Everything else keeps the heuristic's odds.

Tried first and rejected — **replacing** the odds by a quantal response to
the searched values (weight 0.3-1, sharpness 0.5-30): night replay WORSE,
+1.5 to +3pp of positions with a ruled-out pick, worst in 1x1 (+4pp) and 2x1;
better only in 4x1/4x2. The modelled foe answered a depth-0 us, not the us
that plays — §20.8 again. (The replay now pools three AI seed bases: one seed
base alone moves the headline by ±1.2pp, and a single-seed comparison had
made every change look worse.)

**Measured (2026-10-15).**

| | before | after |
|---|---|---|
| puzzles (e1), (e1b) | fail | pass |
| controls (9) | `bomb-short` wrong (from §52.1, see §52.6) | same; `hide-long`, `hide-short` right |
| night replay, 2,030 positions, 3 seed bases | 28.0% | 28.1% (+0.1pp±0.1) |
| fixtures (179) | 60.9% | 60.3% (−0.6pp±0.6; no guard broken) |
| fresh referee sample, `--mix verify`, 320 positions | 23.4%±2.4 | 23.4%±2.4 — not one pick differs |
| … with a hide in the foe's hand (179) | 19.6%±3.0 | 19.6%±3.0 |
| goblins' modelled Amagar-se, where legal (149 decisions) | 3.1% | 57.3% (the real depth-1 goblins: 36.5%) |
| reference party vs 5 goblins (PV 18), both old → goblins new, 1,500 seeds | 55.1%±1.3 | 50.1%±1.3 (the goblins got stronger) |
| … heroes new, goblins old | 55.1%±1.3 | 54.4%±1.3 |
| fantasy mirror, new vs old, 600 combats | | 52.2%±2.0 (seed 424242), 55.6%±2.0 (seed 7) |

So: on random imaginary positions the referee sees no change at all — an
equilibrium foe hides only as one side of a guessing game, which no
one-response model reproduces, and a hide is a *blunder-avoider* only when
the other card gets it killed. On the real table it is exactly that case:
the goblins' model moved from 3% to 57% hiding (the real ones 36%), and the
AI that thinks this way wins more as goblins and no less as heroes.
Whether Trampolí (§49.3) is now played where it should be is for tonight's
kit suites.

**Cost** (single pinned core, the four encounter-speed solves): 78.5 →
84.1 s (+7%); per round horde +18%, bone devils +16%, boss +2%, mixed band
+34% (the opponent search adds ~one rollout per foe card per decision; the
inner rollouts reuse the memo's depth-0 odds). Every solved PV moves a
little (bone devils 17 → 18, boss 189 → 185, mixed [10, 24] → [9, 23]):
the calibration refresh due tonight covers it.

### 52.6 Multi-body guard/block vs strike: mostly the referee's currency, and not to be fixed in the AI (2026-10-15)

**A side finding first, fixed (e782d33).** The 9 controls asked of the AI
showed `bomb-short` wrong (bomb 4/4 where the strike fells a 3-PV foe now):
the `tempo` leaf added next round's blows ON TOP of a win that a round-start
effect had just produced (bomb 118.5 against strike 110). The leaf now stops
at a result, and a win scores 100 plus the health term (a loss −100 minus
it), so two winning lines no longer tie. All 9 controls are asked of the AI
in the fast tier now (puzzles (f)). Night replay, 3 seed bases: 28.1% →
28.0% (−0.1pp±0.1), no group worse.

**Hypothesis 1 — the AI's leaf reads mean health fractions (plus bodies), the
referee pays absolute PV.** Tested with `EvaluatorWeights.absolutePv` (the PV
term in both sides' PV over their mean total; default 0, kept for A/B):

| night replay, 2,030 positions, 3 AI seed bases | ruled-out | 4x1 (299) | 4x2 (127) | 2x2 (319) |
|---|---|---|---|---|
| production | 28.0% | 53.3% | 50.7% | 29.6% |
| PV term in absolute PV | 24.4% (−3.6pp±0.6) | 47.4% | 47.2% | 23.4% |
| … at half weight | 26.1% (−1.9pp±0.4) | 52.3% | 49.9% | 26.1% |
| absolute PV and no bodies term (the referee's own currency) | 23.3% (−4.7pp±0.7) | 45.5% | 45.4% | 21.9% |

So the currency explains about a sixth of the multi-body mismatches (4x1
53 → 45). And on the real table it is ruinous:

| reference party vs a level-10 basilisk (PV 260), 800 seeds, basilisk on production | heroes win |
|---|---|
| heroes on production | 69.5%±1.6 |
| heroes, absolute PV | 14.1%±1.2 |
| heroes, absolute PV at half weight | 29.6%±1.6 |
| heroes, absolute PV, no bodies term | 4.0%±0.7 |
| basilisk on absolute PV (heroes production) | 71.0%±1.6 |
| vs 2 level-10 horned devils (PV 80): production / absolute PV | 66.9% / 64.8% |
| fantasy mirror, absolute PV vs production (600 × 2 seeds) | 49.5%, 51.8% |

A cut fight paid in PV cannot see the turns a fallen body no longer takes;
the leaf's bodies term is what keeps four 12-PV heroes alive against a
260-PV boss. Not shipped. Puzzle (g) pins the divergence both ways: H0 on 4
of 40 PV can strike the boss or guard itself; the boss hits one of two
heroes for 5. The referee (PV) has the boss hit the 40-PV hero whatever
happens, so the guard saves nothing — strike. The AI's model of the boss
takes the kill, so it guards; it still guards with the PV term absolute, and
strikes only without the bodies term.

**For the user:** the referee's payoff, not the AI, is the thing to revisit
for multi-body shapes — e.g. pay health fractions plus bodies standing at the
cut, or play the cut position out with a fixed policy — before the next
night. As it stands, 4x1/4x2 mismatch rates overstate the AI's errors there.

**Hypothesis 2 — advance lands on the wrong ally inside rollouts.** Tested
with a rollout-only aim rule (an unhinted `ally_other` card goes to the ally
whose attack is still to come, the hardest first — near ideal for the
audit's advance): hand-holds-advance 42.9% → 40.9% (−2.0pp±0.8), all
−0.3pp±0.1, 4x1 −0.9pp±0.4. A small share of the advance mismatches; and the
rule would misaim real unhinted ally cards (heals, buffs), so not shipped.

**What the 4x1 residual is.** Seat swaps (AI card → equilibrium card) over
the 161 4x1 positions with a ruled-out pick are spread, not one-sided:
strike→guard 40, strike→block 36, guard→strike 35, strike→jab 29,
lock→strike 29, block→strike 26, guard→stun 26 … Guard/block vs strike goes
both ways, and many of these positions hold 1-4-PV bodies beside a 200-400-PV
boss (`pace` on the `side: enemy` draw), exactly where PV and bodies
disagree most.

### 52.7 Still open after §52.4-52.6 (2026-10-15)

- **The referee's currency** for multi-body shapes (§52.6) — for the user.
- **(e1) in random positions.** The fresh sample with a foe-held hide shows
  no error the opponent search could fix: an equilibrium foe hides only as
  one side of a guessing game. The jab-before-the-hide pattern still shows up
  among the mismatches (2× `strike,strike → jab,strike`). Modelling the foe
  as a mixed strategy would need the foe's response to OUR plan (a second
  best-response pass, roughly double the cost) — not tried.
- **Advance** stays the worst archetype (41-43%); targeting explains little.
- **Due at night:** `pnpm calibration:refresh` and the slow kit suites — the
  opponent search and the decided-board fix change how every enemy plays.
  Worth reading there: Trampolí's play rate (§49.3), now that the goblins'
  model hides.

### 52.8 Final cost, and the encounter-speed test (2026-10-15)

A re-profile of the boss solve after §52.5-52.6 put the opponent search at a
quarter of the time (the basilisk searches four heroes' cards). One rollout
per opponent card instead of two: night replay 28.0% → 28.1% (+0.1pp±0.1,
3 seed bases), fixtures unchanged, goblins still +5.7pp stronger (heroes
55.1% → 49.4%), puzzles green. Shipped.

| single pinned core, the four requests | before §52.4 | after everything |
|---|---|---|
| horde | 28.7 s | 20.5 s |
| bone devils | 18.1 s | 12.5 s |
| boss | 44.3 s | 26.9 s |
| mixed band | 32.2 s | 23.0 s |
| sum | 123.2 s | 82.8 s (−33%) |

`encounter-speed` (8 workers, load ~1): horde 1.53 s, bone devils 1.06,
boss 1.98, mixed 1.80 — all under the 3 s budget again. Solved PVs: [9],
[18], [191], [9, 21] (were [9], [17], [189], [10, 24]; the opponent search
and the decided-board fix change play, so the calibration refresh is due).

## 53. The slow tier after the §52 AI: three fantasy kits over the band, the fantasy triangle breaks, the airbender stalls (2026-10-15, branch `elements-set`)

The AI of §52 (tempo leaf, focus fire, opponent search, decided board, memo;
up to 773c6b1) plays both sides, so every baseline moved. `pnpm
calibration:refresh` re-pinned the calibration kits (no kit had changed, so
only `REFRESHED` moved; the recalibration itself happened on the first
measurement, as the bench cache keys on the AI's source). `REFERENCE_SIGMA` is a
level sum, so its guard did not throw (fantasy 22, elements 40, unchanged).
Fast tier green (711 + 109 todo). Kit suites at `GAMES` default (612 fights
fantasy, 594 elements), nice 19; `--maxWorkers=1` did not serialise the
files (`vitest.shared.ts` sets `maxForks: 4` under SLOW), so four kit files ran
at once, each on bench's idle-aware lanes.

### 53.1 Kit verdicts, before → after

"Before" is the last full suite in §47-50 (§48.6 for Esgrima and Artífex,
§49.2 for Acrobàcia, §50.3 for Mestre del xi). The sets' own kits were not
re-measured in §44-50; where an older number exists its section is named.
Requirement 1 = fights end (median · p90 · stalls), 2 = power band (Δ vs
neutral, fails when Δ − 2σ > 15), 3 = choice matters (PV per decision).

**Fantasy (L6)**

| kit | 1 · fights end | 2 · power band | 3 · choice | blind spots |
|---|---|---|---|---|
| Esgrima | 4 · 6 · 0.0% ✓ | +14.7 → +17.0±1.5 ✓ (inside its error) | 3.52 ✓ | none |
| Acrobàcia | 4 · 6 · 0.0% ✓ | +16.9 → **+20.0±1.4 ✗** (culprits Puntada d'espagat, Trampolí, Esquiva i traveta) | 5.45 (§45) → 4.68 ✓ | **Trampolí de mans no longer blind** (left `KNOWN_BLIND`) |
| Artífex | 4 · 7 · 0.0% ✓ | +7.8 → +14.9±1.5 ✓ | 4.70 (§46) → 3.45 ✓ | none |
| Mestre del xi | 4 · 6 · 0.0% → 4 · 6 · 0.0% ✓ | +15.9 → **+18.7±1.4 ✗** (Ràfega de dits, Desbloquejar, Cop al nervi) | 4.18 → 3.67 ✓ | **Desbloquejar el cos no longer blind** (left `KNOWN_BLIND`) |
| Berserk | 4 · 6 · 0.0% ✓ | +3.9 (§38) → +3.2±1.7 ✓ | 3.74 ✓ | **Rugit de guerra new** (best 18%, played 2.4%, −0.8 PV when best) → `KNOWN_BLIND` |
| Enginyer d'explosius | 4 · 7 · 0.1% ✓ | +10.9±1.6 ✓ | 3.07 ✓ | none |
| Nigromant | 4 · 6 · 0.0% ✓ | +16.2 (§38) → **+19.8±1.4 ✗** (Mà de la tomba, Invocar l'ombra de l'infern, Xuclar la vida) | 4.65 ✓ | none |
| Màgia volcànica | 4 · 6 · 0.0% ✓ | +0.7±1.8 ✓ | 2.05 ✓ | none |

**Elements (L10)**

| kit | 1 · fights end | 2 · power band | 3 · choice | blind spots |
|---|---|---|---|---|
| Esgrima | 2 · 5 · 1.8% ✓ | −5.9 → −9.9±1.8 ✓ | 10.26 ✓ | Retruc d'acer (known) |
| Acrobàcia | 2 · 5 · 0.5% ✓ | −3.8 → −3.3±1.8 ✓ | 26.25 (§45) → 27.11 ✓ | Esquiva i traveta (known) |
| Artífex | 2 · 5 · 1.4% ✓ | −6.5 → −9.4±1.8 ✓ | 9.20 (§46) → 11.65 ✓ | none |
| Mestre del xi | 2 · 5 · 1.1% → 2 · 6 · 1.1% ✓ | −9.1 → −11.3±1.8 ✓ | 3.62 → 3.91 ✓ | none |
| earthbender | 2 · 6 · 1.3% ✓ | −4.1±1.8 ✓ | 18.25 ✓ | none |
| firebender | 2 · 5 · 1.6% ✓ | −6.1±1.8 ✓ | 12.38 ✓ | none |
| waterbender | 2 · 6 · 1.5% ✓ | −5.5±1.8 ✓ | 22.95 ✓ | **Cop desviat new** (best 21%, played 1.8%, +14.8±9.1 PV when best) ✗ |
| airbender | **3 · 40 · 14.3% ✗** (culprits Coixí de vent, Salt del meteor) | +2.0±1.8 ✓ | 23.05 ✓ | **Catapulta de vent** (best 22%, played 1.7%, +2.8 when best), **Cop i fuga** (16%, 0.8%, +0.9) ✗ |

Fantasy `set`, `balancer` and `ai-strength` slow tests pass.

### 53.2 The triangles

| | Power > Protect | Protect > Aggro | Aggro > Power |
|---|---|---|---|
| fantasy before (§44.5-§48.6) | 71.1%±1.6 | 66.6%±1.7 | 54.9%±1.8 |
| fantasy after | 76.1%±1.5 | **50.1%±1.8 ✗** | 59.7%±1.7 |
| elements before (§45-§47, already failing) | 53.4%±1.8 ✗ | 31.0%±1.6 ✗ | 77.8%±1.5 |
| elements after | 52.2%±1.8 ✗ | 31.6%±1.6 ✗ | 75.2%±1.5 |

Fantasy Protect > Aggro is held up (the culprit search) by Riu de lava@cal
(+16.1pp), Cures de camp@cal (+15.9pp), Bufetada insolent@cal (+9.1pp). Elements
is unchanged within noise; still Ull de l'huracà@cal (+15.2pp / +39.6pp).

**Bisected** (the fantasy triangle re-run in a worktree at each AI commit,
same seeds, 800 fights an edge):

| commit | Power > Protect | Protect > Aggro | Aggro > Power |
|---|---|---|---|
| 4c05346 (before §52) | 71.1 | 66.6 | 54.9 |
| e64b59a tempo leaf | 76.7 | **53.9** | 57.9 |
| fc13420 focus fire | 73.4 | 53.8 | 58.9 |
| 6307942 opponent search | 77.9 | **48.2** | 63.1 |
| e782d33 decided board | 79.0 | 47.1 | 60.1 |
| 773c6b1 one rollout per opponent card | 76.1 | 50.1 | 59.7 |

So the tempo leaf took ~13pp off Protect > Aggro and the opponent search
another ~5pp; focus fire and the decided board moved nothing beyond noise.
Reading: the leaf now prices each side's NEXT-round blows, which an all-attack
side owns and an all-defense side does not (a guard's worth lapses with the
round), so the Aggro side's search now weighs the threat it keeps; and the
opponent search lets it dodge the Protect side's few real punishes. Whether
the triangle or the leaf should give is a design question — for the user. A
number lever on the content side would be the Protect corner's own cards
(the culprits are the Aggro corner's).

### 53.3 Diagnosis

- **The fantasy band drift (+3 to +7pp on every shared and rich kit).** The
  calibration's neutral stand-ins are vanilla; the subjects carry the cards
  the new leaf now sees (stuns, delayed blows, revival-like summons, numbs,
  gadgets that act next round). The biggest movers are exactly those: Artífex
  +7.1, Nigromant +3.6, Acrobàcia +3.1, Mestre del xi +2.8, Esgrima +2.3;
  the plain kits barely moved (berserk −0.7). Not bisected per kit (each kit
  suite recalibrates from scratch at each commit). Three kits now fail the
  band (Acrobàcia, Mestre del xi, Nigromant — the first two were already
  passing only inside their error); for the user: tune by their numbers
  (memory: numbers before mechanics), or accept that the ruler moved.
- **Trampolí de mans and Desbloquejar el cos left the blind list**, as §52.5
  and §52.6 predicted: the opponent model now hides (Trampolí breaks the
  hide), and a win keeps its health (the mop-up heal is worth something to
  the search). Fixed by the AI, as intended.
- **Rugit de guerra** reads blind but gains nothing when best (−0.8 PV): the
  card value's noise (§48.2 signature); ratcheted into `KNOWN_BLIND`.
- **The airbender's stalls are NOT the new AI.** A probe (deleted) replayed
  the airbender suite's 22 cells, 12 fights each, same seeds and the same
  solved encounters, under 4c05346 and under 773c6b1: 35/264 stalls (13.3%)
  under both. Every stalled board is §44.3's: the airbender (now the subject,
  so in every company row) alone at 1/12 PV and Esgotat, playing Coixí de
  vent on itself every round against soldiers it cannot finish. Turning off
  `tempo` and `opponentSearch` changes nothing either (18.2% vs 18.2% at 2 a
  cell). The airbender's own suite had not been run since §44; its failure is
  §44.3's rule (a lone bender is immortal), still for the designer: (a)
  Coixí cushions only the ally, as printed; (b) a fatigue cost; (c) no
  cushion twice running.
- **The elements blind spots** (Cop desviat, Catapulta de vent, Cop i fuga)
  have no pre-§52 measurement to compare with (those suites had not run since
  §44). Not ratcheted: Cop desviat gains +14.8 PV when best (noisy, but not
  the noise signature) and is worth a look; Catapulta and Cop i fuga gain
  little when best (+2.8, +0.9).

### 53.4 The AI audit, night 2

Launched after the slow tier to compare with §51's night: `ai-audit.ts --mix
night --games 11600 --hours 7.9 --lanes 28`, nice 19, 22:30 → 06:32; report
`/tmp/ai-audit/night2/report-2026-10-15.md`. The catalogue gained the `hide`
archetype in §52.5, so the dealt hands differ from night 1's at the same seeds
(2757 positions vs 2442). Same referee settings; referee noise unchanged
(value sd 2.35 PV vs 2.56). Every control passes (9, with §52.5's two hide
controls). +91 fixtures appended (270 in `audit-fixtures.json`, recorded as
todo).

| | night 1 (§51, before §52) | night 2 (after §52) |
|---|---|---|
| solved | 82.8%±0.8 | 82.9%±0.7 |
| positions with a confirmed mismatch | 26.0%±1.0 | **21.3%±0.9** |
| AI decisions that are mismatches | 20.8%±0.9 | **15.4%±0.8** |
| horizon 1 | 31.0%±2.4 | 35.1%±2.3 |
| horizon 2 | 28.7%±1.4 | **21.8%±1.2** |
| horizon 3+ | 17.1%±1.6 | **9.9%±1.2** |
| 1x1 (c4 r4 / r5) | 15.6 / 17.1 | **7.6 / 7.3** |
| 2x1 c3 r4 / r5 | 23.1 / 34.7 | **17.3 / 16.2** |
| 4x1 c3 r3 | 51.7%±3.2 | 43.2%±3.0 |
| 4x2 c3 r2 | 44.1%±4.6 | 52.9%±4.2 |
| 3x3 c3 r2 | 43.1%±6.1 | 37.7%±5.8 |
| featured stun | 44.3%±4.8 | **17.0%±3.2** |
| featured device / doom | 19.8 / 20.0 | **10.9 / 11.4** |
| featured cleanse | 28.9%±4.8 | **15.8%±3.6** |

Reading: the §52 fixes did what they aimed at — the multi-round horizons
(the tempo leaf), stun, delayed cards (device, doom) and the duels all
roughly halved. Horizon 1 did not improve (+4.1pp, about 1.2σ: noise or a
slight cost of the leaf on one-round boards), and the large multi-body slices
stay at 40-55% (4x2 got worse by ~1.5σ). Those slices are where the
referee's currency (summed PV margin) is least like winning, so before
fixing the AI there the payoff for multi-body fights should be decided
(open question). The commonest residual swaps: guard/block instead of a
strike (14), lock instead of stun (7), strike instead of revive (6).

## 54. The referee made exact for every decision (2026-10-16, branch `elements-set`, uncommitted at writing)

The referee of §51-53 approximated four things: dice (sampled), targets (the
three weakest, committed with the card at the reveal), big sides (double
oracle above 16 joint plays) and positions over budget (dropped). On night 2
the double-oracle slices carried the high mismatch rates: in 2x2, positions
solved by full enumeration at the root mismatched 10%, the approximated ones
25%; 4x1 and 4x2 (0% enumerated) 45% and 53%. So §53.4's "big fights are the
AI's weak spot" is NOT a finding — it may be the referee's error.

Now (`referee.ts`): every card combination of every seat is enumerated (no
double oracle); every in-round decision is taken by its seat at resolution,
as the rules say, a max/min over every legal target, found by REPLAYING the
round under a script of answers (the engine asks its `targetChooser`
synchronously); identical mid-round states share one solve (a generic walk of
the engine's fields, 64-bit digest). Only chance is sampled: `samples` per
cell as before, and each decision is taken on the mean of `decisionSamples`
(8, then 4) fresh continuations, never on one draw. Over budget = unsolved;
unrepresentable (reveal options, choosing after the reveal, chance at a
round's start) = `Unsupported`. The check judges cards only.

**Cost** (one lane, nice 19, budget 2·10⁷ simulated rounds, 4 positions a shape):

| shape | solved | time each |
|---|---|---|
| 1x1 c4 r3 / r5 | 4/4, 4/4 | 0.2-0.4 s / 4-14 s |
| 2x1 c3 r2 / r3 | 4/4, all seen | 2-7 s / 2-4 s |
| 1x2 c3 r3 / r4 | 4/4, 4/4 | 0-3 s / 4-21 s |
| 2x1 c3 r4 | 3/4 | 8-190 s |
| 2x2 c3 r2 | 1/3 | 180 s |
| 4x1 c3 r2 | 0/3 | — |

So the exact referee covers duels and two-against-one, and short two-a-side
fights at best; four bodies a side is out of reach. Seed-to-seed spread of
the value on 12 2x1 r2 positions: 2.20 PV (old referee 1.34; the seat streams'
common random numbers are gone, decisions add their own sampling); still
under the check's 3-PV bar. Values otherwise agree within that noise on those
small positions.

Consequences, open: the 270 fixtures were judged by the old referee and must
be re-judged; the audit's mix must keep to the shapes this referee solves; the
AI's own in-round aiming can now be judged too (the referee knows each
decision's value).

### 54.1 Fixed dice at full size, and what the AI gets wrong there (2026-10-17)

Exact chance (`chance: 'enumerate'`, engine `randomInt`/`withChance`) plus
`fixedDice` (every die its average, as n d1) leaves only speed-tie order to
chance, so full-size fights solve exactly, nothing sampled — but only small:
4x1 c3 r2 (~5 min), 4x2 c3 r1 (30-114 s), 4x3 c2 r1 (42-445 s); 4x4 c2 r1
solved 1 of 25 in the run below, 4x5 never, and no 2-round fight beyond 4x1.

`--mix full --aims`, 4 h, 4 lanes (`/tmp/ai-audit/full1/report-2026-10-17.md`):

| | full size, fixed dice | small, real dice |
|---|---|---|
| positions solved | 91 | 104 |
| AI card choice is a mismatch | 57 (63%) | 11 (11%) |
| median loss when it is | 8.3 PV | 6.9 PV |
| aims judged / mismatched | 757 / 112 (15%) | 140 / 16 (11%) |

So the multi-body weakness is real, not referee error. The clearest pattern:
the equilibrium leans on `advance` in 20 positions; the AI held it in 29 and
played it in 9. On the stored verdicts (re-asking only the AI, seconds a run,
195 positions, paired), mismatched positions:

| AI variant | advance (20) | all (195) |
|---|---|---|
| production | 75% | 42.6% |
| + two-seat moves, every pair | 70% | 41.5% |
| + two-seat moves, ally-targeting cards only | 70% | 42.1% |
| leaf in absolute PV, no bodies term (the referee's currency) | 65% | 37.4% |
| both | 55% | 35.4% |
| samples 6 → 24 | — | 39.0% |
| opponent-search margin 2 / sharpness 3 | — | 41.0% |
| tempo 0 | — | 45.1% |

(The replay has no noise filter on the sampled small slices, so its rates
run above the audit's; read the rows against each other.) Three causes:
(1) SEARCH — one-seat passes cannot find a plan two seats must switch to
together (g169: slow sweep + advance, 61 PV; two-seat moves fix it), but the
gain is 1-2 positions in 195; every-pair moves break the 3-s encounter budget
(5 s), ally-only ones are free and gain 1; not landed. (2) CURRENCY — about a
third of the gap is the referee's PV margin at the cut against the AI's
fractions-plus-bodies leaf; a cut fight's PV margin is a weak proxy for
winning, and §52.6 measured the PV leaf losing real fights. (3) the rest:
the AI's evaluator ranks the referee's plan 5th-67th of 16-81 even with
search and currency aligned — its one-round rollouts against a predicted
opponent, where the referee plays the opponent's best reply. Only more
rollouts moved it (24 samples: −3.6pp), at 4× the cost. The catalogue's
`advance` lacking the real card's `aiTargetPriority` hint made no difference.

### 54.2 Played to the end: the playout judge, discovery, shrinking (2026-10-17 night)

The user's ask: no cut-off and no prediction, every position played until a
side is down. The exact referee cannot do that at real size (fixed dice, win/
loss payoff, 20 M simulated rounds per solve: 1v1 c3 solved 3/3, 2v1 c3 0/3,
2v2 c2 0/3, 4v1 c2 1/3), and a lopsided position played to the end is often
already decided, so every card ties. So discovery moved to the PLAYOUT JUDGE
(`ai/src/audit/playout.ts`, `tools/src/ai-discover.ts`): real shapes and
hands, real dice, the AI's pick and every one-seat change each played to the
end ~200 times on the same seeds with the AI on both sides afterwards; a
change that wins clearly more, twice, is a discovery. Side B's PV is first
scaled toward an even AI-vs-AI fight (`balance`, 1/32-32). This is a
backgammon-style rollout: it proves the AI contradicts its own continuation,
not what the best card is — the exact referee confirms that on the SHRUNK
position (`shrink.ts`, `tools/src/ai-shrink.ts`, into `ai/test/discovered.json`).

| run | positions | judged | a one-seat change beats the AI |
|---|---|---|---|
| d2, 4 lanes, 65 min | 42 | 32 | 31% ± 8 |
| d3, 16 lanes, 60 min (killed) | 47 | 46 | 37% ± 7 |

Small shapes (1x4, 4x1, 2x4) ~0%; 4x4/4x5/5x4 36-60%. The session was
OOM-killed at 01:38 running d3 (16 lanes) beside the shrinker (10 lanes) on a
62 GB box with no swap; the shrinker had finished nothing. `ai-match.ts` now
caps its lanes at 16, and one lane-spawning harness runs at a time.

### 54.3 The match decides; what it has said (2026-10-18)

Judging AI changes by how many stored positions they now get right was the
wrong test: the guard/block aim fix mended g102, g175, g224 on the stored
referee verdicts, broke g169, g123, g86, and left the count at 83/195. Chess
engines settle that with a MATCH (Fishtest: new vs old, SPRT), so
`tools/src/ai-match.ts` plays the working-tree AI against the AI at a git ref —
extracted and run on TODAY'S engine, refused unless the engine source is
identical — in duplicate pairs (same seed, AIs swapped) on imaginary real-size
fights played to the end, until SPRT (δ 0.03 mean pair result ≈ 1.5 points of
score) calls better / worse / equal. `--candidate-opts` matches an option
variant with no code edit. The playout judge and the referee go back to
producing TESTS; the match decides FIXES.

| change (candidate vs baseline) | positions | mean pair result | verdict |
|---|---|---|---|
| defenses aim where pending blows land; blocks skip AoE (§54.2's fix) vs HEAD | 483 | +0.021 ± 0.007 | better — landed |
| `startPlans: 'pick'` (also climb from all-attack) | ~150 | −0.002 ± 0.008 | equal — dropped |
| leaf in absolute PV (`absolutePv: 1`) | ~130 | −0.049 ± 0.019 | worse — dropped |
| `startPlans: 'search'` (climb from both, keep the better) | ~150 | +0.004 ± 0.009 | equal — dropped, code removed |
| `attackAim: 'share'` (below) | 130 | +0.048 ± 0.018 | better (early stop) |
| `attackAim: 'share'`, confirmation on fresh seeds (100001+) | ~260 | +0.032 ± 0.013 | better — landed as the default |

`absolutePv` is the variant the cut-off referee liked best (§54.1: 42.6% →
37.4% mismatches); played to the end it loses. That is the case for the match.

Diagnosis of the 27 discoveries (d2 + d3) with the fix: 4 now play a winner,
2 are SEARCH failures (the AI's own evaluation rates the winner higher — g5040
is a local optimum: block, guard, heal, block, which no single change
improves, scores −4.86 where all-strike scores +1.18), 21 are EVALUATION
failures (the AI's one-round evaluation prefers its pick). Lock is
over-valued in several (g37, g5006, g5045, g5011): the catalogue prices it at
a flat −0.3 per round left whatever the locked foe would have done — a
catalogue price, not an AI defect, so not "fixed" there.

A large share of the evaluation gap is the ROLLOUT MODEL: inside every
rollout, attacks are aimed by the heuristic, and it agreed with the real
target search on only 38-46% of first-round attack decisions (the search
agrees with itself 85-95%). The search aims at the biggest share of full
health the blow removes (lower max PV: 73% of disagreements); the heuristic
aimed at the lowest health fraction (83%). `attackAim: 'share'` aims by that
share, through the target's standing wall, and picks guard vs block by the
share each saves: agreement 57-62% on attacks, 61-67% on guard-or-block
(26-51% before).

Landed as the default (2026-10-18). The encounter-speed test passes with it on
a quiet machine (boss 2.3 s of 3); its earlier failures were the 16 match
lanes beside it. The local optimum g5040 shows is real but rare: escaping it
(`startPlans`) did not move a match.

Option sweeps against the new default (2026-10-18, `--baseline WORKTREE
--candidate-opts …`, cached deck seeds 1+, fine runs on seeds 100001+):

| variant | mean pair result | verdict |
|---|---|---|
| samples 6 → 12 | +0.026 ± 0.010 | better |
| samples 6 → 9 | +0.032 ± 0.010 | better — NOT landed: the mixed band then takes 2.76-2.97 s of the encounter test's 3 s (user's call) |
| race off | −0.001 ± 0.008 | equal: racing is free |
| targetSamples 2 → 4 | +0.002 ± 0.007 | equal |
| passes 2 → 3 | −0.001 ± 0.005 | equal: the climb has settled by pass 2 |
| tempo 1 → 0 / → 2 | −0.047 ± 0.015 / −0.035 ± 0.010 | worse / worse: 1 is the top |
| bodies 6 → 3 / → 10 (δ 0.03) | +0.012 ± 0.006 / −0.010 ± 0.006 | equal / equal |
| bodies 6 → 3 / → 1, fresh seeds (δ 0.015) | +0.000 ± 0.006 / +0.003 ± 0.005 | equal / equal |
| opponent search off | −0.011 ± 0.005 | equal (leans worse): keep |

So the number knobs are at their tops except the sample count: what is left
of the AI's error at depth 1 is rollout NOISE (more samples help, more
target samples or passes do not) and the evaluation itself.

Fresh discovery against the improved AI (d4, seeds 30001+, 16 lanes, 2 h):
104 judged, a one-seat change beats the AI in **24.0% ± 4.2** (31-37% the
night before). Hide stood out: the AI's hide was beaten in 5 of 8. Cause, the
same disease as `share`: inside rollouts the heuristic aimed 75% of attacks
with a hidden foe in reach AT the hidden one (the search: 11%), so imagined
enemies wasted their blows on a hider. A status that changes incoming damage
can now say so to the AI: `StatusBehavior.expectedIncomingDamage` (pure,
AI-only — `modifyIncomingDamage` may consume the status, so it cannot be
asked hypothetically); the catalogue's hide returns 0, and a blow that cannot
wound no longer earns the danger or team-kill bonuses. Heuristic now 2 of 216,
search 3. Match vs 02021e6: **+0.037 ± 0.010** (164 positions, seeds 100001+),
confirmed **+0.017 ± 0.007** (seeds 1+) — landed.

Content follow-up (not done): real statuses with `modifyIncomingDamage` and no
`expectedIncomingDamage` are invisible to the aim the same way. Advance and
heal targets agree with the search 49% / 55%: the heuristic cannot know a
focus is an advance or a heal — that is each card's `aiTargetPriority`.

Antithetic rollouts (2026-10-18): the AI's error is rollout noise (more
samples win, §54.3 sweep), and samples are expensive, so sample 2k+1 replays
2k's seed with every draw mirrored (engine `seatStreamMirror`, rng
`mirrored()`; AI `antithetic`). Same cost. Match vs the default:
**+0.012 ± 0.004** over 1065 positions — landed as the default. The
encounter-speed test passes with everything landed today (boss 2.3 s,
mixed band 2.2 s of 3, quiet machine).
