# `@pimpampum/tools` — the harnesses, and the rules every measurement obeys

Every measurement in this repo produces a **number that someone will make a
content decision on**. That is the whole job, and it sets the standard: a
harness is not allowed to print something it cannot defend.

The measuring itself lives in libraries; this package is what you RUN.

| | |
|---|---|
| **`@pimpampum/bench`** | the instrument: cells, positions and baselines, per-decision card value, the report maths, the cache. Set-agnostic — it measures whichever `GameSet` is installed. |
| **`@pimpampum/playtest`** | the requirements: the verdict rules, `analyze`, the control kits, and the assertion API a set's tests are written in. |
| **`sets/fantasy/src/bench`** | the fantasy set's calibration DATA: the reference party, the fight shapes, the company rows. |
| **`tools/src/`** (here) | the harnesses. One question each. |
| **`tools/test/`** (here) | the repo's conventions, and the smoke test that runs every harness. |

---

## The five rules

Each one exists because it was violated, silently, and the wrong number was
believed for a while. Four are enforced by `tools/test/conventions.test.ts`,
which scans the source — a convention you cannot
break by accident beats a convention written down.

### 1. There is ONE reference party, and it is named, not positional

`sets/fantasy/src/bench/reference.ts`. Four kits **by id**, built at **full kit**, and an
**asserted Σ** that throws at import if the catalogue moves.

"Full kit", not a fixed level: a level is an ordinal in this game, so a flat
`5` is a number that stops meaning "fully learnt" the moment a kit gains a
sixth card. Two already had — nigromant and berserk were fielded a card short
while every comment said "at full kit". Σ therefore MOVES when a kit gains a
card, and the import-time guard is what makes that loud instead of silent.

It used to be `MAINS.slice(0, 4)`, copy-pasted into seven files. Adding a kit to
`catalog.ts` or reordering it swapped the benchmark out from under every number
in the package, with no warning anywhere, and the level sum was emergent rather
than chosen (Σ20 only because all four of those kits happen to have ≥5 cards).

```ts
import { referenceParty } from '@pimpampum/bench';   // built from the set's declared referenceKits
```

**Changing `REFERENCE_KITS` re-bases everything.** A run before the change and a
run after it are not comparable, whatever both printed. Re-run the scoreboards.

### 2. Randomness is seeded, and arms share their seed

`random()` from `@pimpampum/engine`, never `Math.random()`. The set's party
generator draws through it, so `withSeed(...)` actually binds.

An unseeded arm inside a `withSeed` block is the worst case: it *looks*
reproducible, shares no random numbers with the arm it is compared against, and
quietly widens every difference the harness reports. Comparing content
mutations without **common random numbers** — the same seed per arm — means
reading a 1-2pp effect off two independent ±2pp samples.

`play.ts` seeds the engine's own stream (`setRng(seededRng(...))`) so a
hand-played script replays the same game. (It used to patch `Math.random`,
which the engine had already captured at import — so it seeded nothing.)

### 3. AI depth is never implicit

The engine has NO default policy: an AI seat with no chooser throws. The
balancer prices at depth **1**. A harness that hands the engine a weaker policy
than the number it is checking was made with measures the gap between two AIs —
which is how `main.ts` graded depth-1 solves with depth-0 play for as long as
that file existed.

State it, every time, even when the answer is 0. An implicit depth is
indistinguishable from a forgotten one.

### 4. No winrate is printed without its error bar

bench's `report.ts` is the only place a percentage gets formatted:

| | for |
|---|---|
| `pct(rate, n)` | a sampled winrate → `61.5%±2.8` |
| `deltaPP(a, na, b, nb)` | a difference → `+18.2pp±4.0` |
| `share(n, total)` | a share of a count (action mix, play rate on legality) |
| `exact(rate)` | a **known** number — a requested target, a constant. No interval, because there is no sample. |

And the companion rules: `gamesFor(pp)` says what a threshold costs, and
`significant(...)` is the honest predicate behind any "X beats Y".

### 5. A threshold is sized, and checked against the difference's own noise

Every verdict in this package is a difference of two samples. A fixed constant
alone is not a threshold — it is a coin flip whose bias depends on the sample
size.

The kit analyzer's old level check used a flat 3pp. At its old default a
genuinely flat level read as a regression about one time in four, so over four
or five steps **most kits printed a false ❌** — which is most of what the first
report card said. Every requirement now fails only when its whole 2σ interval
is past its bar.

**Sample size is per requirement.** `--games` sizes the full-kit run
(requirements 1 and 2: 800 combats put a kit's delta at ±2pp inside a ±15pp
band); the card value derives its fights from it; the triangle has its own
(`TRIANGLE_GAMES`, sized so a 5pp edge clears an even duel).

Three corollaries that keep coming up:

- **Never report the sample you selected on.** Picking the best of *k* noisy
  candidates and quoting that same sample is winner's curse (~1.7σ at k=14).
  The requirements no longer select at all; a harness that does must re-measure
  the winner on a fresh seed.
- **Subtract like for like.** Two arms of a comparison must sweep the same
  matrix, AND handicap the same number of seats. A three-company average minus a
  one-company average is not a margin; neither is a whole-side restriction
  minus a one-seat one (NEXT-STEPS §12.7).
- **A max over noisy estimates is biased, every time it is taken.** "The best
  card's score minus the mean" reads a choice between cards worth exactly the
  same; the random-pick cost is cross-fitted (choose on half the rollouts,
  price on the other half). And a per-card "how often was it best" cannot be
  saved by more rollouts when the fight barely depends on the choice — so it
  is printed, not judged (NEXT-STEPS §27.3).

---

## The foundation (`@pimpampum/bench`)

- **`gameset.ts`** — the contract a set implements (`GameSet`), and `useSet` /
  `theSet`. Bench THROWS when nothing is installed rather than measure default
  content.
- **`positions.ts`** — the reference party, the cell-shaped calibration party,
  solved shapes, the per-cell **neutral baselines**, and what makes a cell
  usable — computed from the data a set DECLARES (`GameSet.calibration`).
- **`cells.ts`** — running one: the impoverished policies, the ONE legality
  instrument, and `runMatrix`, which sweeps the usable cells and subtracts the
  baseline. Every arm — and every baseline — plays with the same AI and the
  same target chooser: a baseline measured differently from the arms it is
  subtracted from is a constant bias in every delta (NEXT-STEPS §25).
- **`regret.ts`** — per-decision card value.
- **`report.ts`** — the formatters and the sampling maths.
- **`isolate.ts`** — `isolated(module, fn, args)`: run a long measurement in a
  child process. A vitest worker blocked for over a minute fails the run on an
  RPC timeout whatever its assertions say, so every slow test measures there.
- **`testing.ts`** (`@pimpampum/bench/testing`) — `SYNTHETIC`, a small second
  set of plain-dice content. The instrument is verified on it, never on the
  content it judges.

### What a cell has to be: unsaturated

A shape is **solved** to `FAIR` (60%) rather than written down, so it re-prices
itself when the cards or the AI move. It is priced against a **cell-shaped**
calibration party — a neutral stand-in in seat 1 plus a real company row — and
then **measured against every company row**, which gives each cell its
**neutral baseline**.

**Every score is a delta from that baseline.** Subtracting it removes two things
that were otherwise unfixable: the cell's own difficulty, so a shape drifting as
content is added no longer moves any kit's score; and the SEATING, which is
worth up to 66pp between company rows and was burying the kit under the seat.

Which is why a cell no longer has to be *fair*, only **unsaturated**
(`SATURATION`, 20-80%). Demanding ±8pp of 60% excluded three of four shapes and
could not be fixed by re-probing — adjacent body counts are 20-35pp apart and
the band was 16pp wide. But nothing was ever compared to 60%: every kit
requirement is already a delta. A cell only has to not be pinned
against an edge, where every arm reads the same and differences compress to
nothing. The band went from 4 usable cells to 15.

The calibration party used to be four main kits at full kit while the cells were
fought by a subject plus two mains and a complementary kit. Different parties,
so the 60% never transferred — worst at level 1, where it mattered most. The
report said "fair by construction" anyway.

**Nothing is measured nowhere.** Every player kit must appear in some `COMPANY`
row (a kit scored only as a subject and never as an ally is half-measured — that
was `ombres`), and every creature must be fielded by some `SHAPE` or listed in
`UNFIELDED_ENEMIES` **with a reason**. Half the roster was in that hole and
nothing said so. Adding content now fails CI until someone decides where it gets
measured.

**An empty matrix throws.** If every cell saturates there is nothing left to
measure, and the averages would quietly report 0% everywhere — which reads
exactly like a catastrophic kit.

A **capped** solve (the solver ran out of PV or hit the round budget) is
reported but no longer disqualifying: a capped cell is still a fine place to
measure a delta, it simply is not at the winrate that was asked for.
`probe-shapes.ts` measures a candidate count through the same cell runner the
baselines use, so the tool that chooses the counts cannot disagree with the
tool the counts are for.

---

## The harnesses

```bash
pnpm --filter @pimpampum/tools exec tsx src/<file>.ts
```

Every file here answers a question asked again after every content change (or,
for the four `ai-*` files, after every AI change), and nothing else lives here:
a question asked once is answered in a scratch file and the scratch file is
deleted (below). `tools/test/harnesses.slow.test.ts` runs each of them at `GAMES=2`.

| file | question |
|---|---|
| **the kits** | |
| `kit-gate.ts` | **the livable zone** — every main kit, levels 3-10, heroes against heroes: fights end, no kit dominates the field, the triangle, dumb play loses (turtle, spam, random cards), the AI's model of its opponents, every card's use (the TEST is `sets/elements/test/gate.slow.test.ts`) |
| `kit-analyzer.ts` | **the report card** against creatures — the three kit requirements, every number, card values included; `--triangle` adds the set's fourth (the TESTS are each set's `test/kits/` and `triangle.slow.test.ts`) |
| `dynamics-report.ts` | **a set's health, at a glance — the tool to iterate a kit with** — how many of playtest's `REQUIREMENTS` hold at levels 3/6/10; the cards to look at first (those that set a level's PV floor, hold its ceiling down, or block a class alone, ranked by how many of these they do past the noise); each class and the cards that block it (each failing kit cell re-played without each card; cards that fell fresh heroes; cards never right); the table; each level's PV window (levels 3-10) with the cards behind its floor and ceiling and their error bars. `--kit <kit>` for one kit, `--fixes` to also measure candidate structures (slow) |
| `kit-tuner.ts` | the numbers that clear most of one kit's gate cells — a PROPOSAL, re-measured at the gate's budget; it never writes a card |
| `main.ts` | the standing report: mirror balance + a replay check on the balancer |
| **the structure and PV** | |
| `derive-pv.ts` | a hero's PV, derived on the real kits: each level's floor and ceiling (and the cards behind them), the line base + slope × level, then each bulk tier's slope by every class's field score; prints `HERO_BASE_PV` and `PV_PER_LEVEL` to pin in the set |
| `derive-structure.ts` | which structure (Focus strength, defense rung, chip damage, the burst reading, the guard rules) lets the requirements hold, every candidate ranked with each level's derived PV (GOALS.md B26) |
| `vanilla-check.ts` | do the vanilla twins `derive-structure` reasons on still play like the real kits; `--calibrate` re-fits playtest's `TWIN_DEFAULTS` |
| `probe-shapes.ts` | which body counts make a usable calibration cell (re-run when the in-band guard fails) |
| **the AI, after every AI change** | |
| `ai-audit.ts` | **the referee audit**: the production AI against the exact Nash referee, on imaginary cards; mismatches go to `ai/test/audit-fixtures.json` |
| `ai-match.ts` | is the AI in the working tree stronger than the one at a commit (duplicate pairs, a sequential test) — accepts or rejects an AI change |
| `ai-discover.ts` | where the AI's choice loses games at real size (the playout judge) |
| `ai-shrink.ts` | each discovery shrunk to the smallest position that still shows it, written to `ai/test/discovered.json` |
| **the repo** | |
| `fingerprint.ts` | one hash of 300 seeded fights in both sets (`pnpm fingerprint`); a pure refactor leaves it unchanged, and the simplify night run refuses any change that moves it |
| `mutation.ts` | can the fast tier actually fail — see its header; not run by the smoke test (it rebuilds packages) |
| `mutants.ts` | the faults `mutation.ts` injects — data, checked by `test/mutants.test.ts` |
| `play.ts` | hand-play harness — not a measurement |
| `sets.ts` | `--set fantasy` / `--set elements`: the module every set-agnostic harness takes its set from |

### The lifecycle of a harness

**Born** when a question will be asked *again* after the next content change.
A question asked once is answered in a scratch file, its conclusion written,
dated, into the doc it changes (`rules.md`, `intentions.md`,
`ARCHITECTURE.md`) or the commit message, and the scratch file is deleted. The conclusion is
the durable artifact; the script is scaffolding.

**While it lives** it must read its sample size through bench's `games()`, so
it runs at `GAMES=2`, so `test/harnesses.slow.test.ts` can execute it on every
change.
That test asserts nothing about the numbers — two combats measure nothing — only
that the harness still runs against today's content.

**Deleted** when its question stops being asked. Eight were deleted on
2026-09-20: `experiment-berserk`, `-balance-pass`, `-tuning`, `-objects`,
`-heal`, `-horde-armour`, `-armour-absorption`, `-pv-curve`. Two of them had
been *crashing* on a renamed berserk card for an unknown length of time, and
nobody knew, because checking them cost thousands of combats. That is the whole
argument for both rules: **a harness nobody can run cheaply is one nobody runs,
and one nobody runs rots in silence.** Eight more went on 2026-09-23 (the
kit-levels, GM-encounter, level, seat, fatigue-penalty, fatigue-tiers,
solve-cost and sanity scripts), their findings already written down —
solve-cost had also been silently measuring nothing. Seventeen went on
2026-11-10 (GOALS.md's first night goal: keep only the standing harnesses):
the equilibrium player's seven (`ai-breadth`, `-breadth-real`,
`-equilibrium-match`, `-equilibrium-real`, `-leaf-real`, `-noise`,
`-shortcut-gap`; their findings are NEXT-STEPS §57-58 and GOALS.md A7),
`ai-audit-calibrate` (the audit profile is frozen until the redesigned kits
land), `ai-benchmark`, `reads-vs-routines` and `measure-swing` (the kit
gate's dumb-play duels ask their question every run), `card-value` (the kit
analyzer's requirement 3, the same functions), `experiment-defense-vs-attack`
(now an exact fast test on the ladder, `sets/common/test/ladder.test.ts`),
`experiment-kit-threat` (the creatures move onto the ladder first, B20),
`feasibility` and `vanilla` (B26's first layers; their libraries stay in
playtest, read by `derive-pv` and `dynamics-report`), and
`profile-lookahead`. Each one's conclusion is in that day's commit message.

### Escaping a rule

Some files genuinely should not obey one — exact dice maths has no sampling
error, a mechanics seam test has no AI to set a depth for. Say so, in the file:

```ts
// bench-exempt(interval): no sampling happens here at all — the contest is
// solved exactly by convolving the two cards' dice distributions.
```

The reason is required and its length is asserted, so the hatch cannot become a
silent `// eslint-disable`. Rules: `seeded`, `depth`, `interval`, `sample`.

---

## Why a run is fast

A full sweep was eleven minutes. It is ninety seconds cold, seventy after
editing one kit, and about a second when nothing changed. Two mechanisms, and
both are built so that being wrong costs time rather than correctness.

**bench's `cache.ts` — content-fingerprinted, per cell.** The key is a hash of
exactly what that measurement depends on: every behavioural field of the cards
in the cell and the source of their kit's own file, the enemies in the shape,
the set's id, and the source of the rules AND the instrument (engine, ai, bench,
combat-balancer — so any change to how a fight resolves or is measured
invalidates everything). Editing one player kit therefore invalidates the rows
that seat it and nothing else. Delete `.bench-cache/` if you ever suspect it;
it is pure derived data, and `BENCH_NO_CACHE=1` bypasses the disk (values are
still remembered within one process).

**bench's `parallel.ts` — children only warm the cache.** They never take part in
a measurement. The run itself is the same single-threaded code it always was and
simply finds its answers already computed, so the numbers are bit-identical to a
serial run — verified by diffing a cached run against `BENCH_NO_CACHE=1`. A
child that fails, hangs or is killed costs nothing but time — and is REPORTED:
the worker is the caller's (playtest's `warm-worker.ts`), and when a package move deleted the
old one, every sweep silently ran serially for as long as nobody timed one. `BENCH_SERIAL=1`
turns it off when a crash needs a readable stack.

The unit of both is the CELL, because that is what parallelises to the width of
the matrix. Jobs are BATCHED one child per lane: at one child per cell, process
startup cost more CPU than the measurements did and wall time did not move.

## Before you trust a number

1. Does the harness say what **n** it ran at, and does the threshold it is
   checking fit inside that? (`gamesFor` tells you.)
2. Is the **replay at the same depth** as the solve it is grading?
3. Did the arms share a **seed**?
4. Is the shape **in band**, or capped?
5. Is the reference party the one the docs you are comparing against used? (Σ
   is printed by the guard and moves when a kit gains a card.)

## What still goes stale as content grows

Named so it is chosen rather than discovered:

- **`SHAPES` species and counts.** Hand-picked, and re-priced by every content
  change. `probe-shapes.ts` re-picks the counts; the in-band guard says when.
  Two gaps are declared in `UNFIELDED_ENEMIES`: no caster-horde shape and no
  armoured-elite shape, so nothing tests a kit against either.
- **Runtime.** ~20 ms/combat at depth 1, linear in kits and in cards-per-kit.
  Cutting the requirements to four (§27.3) took a kit's plain combats from
  ~16,000 to 800; the card value is now nearly all of a sweep's cost.
- **`FIELDED`** (`sets/fantasy/src/bench/shapes.ts`) is a hand-picked body count
  per creature; the calibration test fails if a creature is missing from it.
- **`COMPLEMENTARY_SKILLS`** (in `sets/fantasy/src/players/party.ts`) is a
  hand-kept set, and `MAIN_KITS` derives from it. A new support kit left out of
  it is treated as a kit that can stand alone.
