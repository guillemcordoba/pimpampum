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
has a smaller strategy space. `measure-verdict.ts` and `measure-mix.ts` run on
it now.

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
