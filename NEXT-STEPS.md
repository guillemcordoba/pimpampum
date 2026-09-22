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

It is REPORTED, not asserted. §15.6 already measured that the triangle does not
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
