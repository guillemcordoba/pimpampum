# AI rewrite — play each round at its equilibrium (strategy-pool convergence)

## Why

A round is a simultaneous-move game: both sides commit cards blind. The right answer is often
a **mix**, not a card. A side that always guards its focuser can be read and punished. One that
never does loses the focuser.

Today's AI doesn't model that:
- **Depth 1** (`lookahead.ts`) optimises one team's joint plan against opponents who play at depth 0, by iterated best response.
- That is a best response to a fixed guess about the opponent, not an equilibrium. It is exploitable by construction.

The priority system makes this central, since reads are the game. The exploration of 2026-10-27
also showed two traps to avoid:
1. **A population mix alone is a weak player.** A one-round look-ahead beat the best-play mix of composition policies 90–97%.
2. **Verdicts move with the simulated player.** Changing how the reader modelled opponents moved "best routine" from 10% to 59%.

So convergence must be **measured** (exploitability), never assumed.

The referee (`audit/referee.ts`) already solves rounds as zero-sum matrix games, exactly, on tiny
positions. This plan brings the same idea into play at production scale, approximately, and uses the
referee to grade the approximation.

## Design: a double oracle per round, live

For each round, for each pair of teams, the AI searches for the equilibrium of the round game.

### 1. Strategies are joint plans

A strategy is a joint plan: one card per character of a team.
- In-round decisions are taken by the existing choosers inside the rollouts: attack aims at the reveal, then guards after the aims (the priority rules).
- So a plan is small, and the engine resolves everything else.

### 2. Start with small pools (2–4 plans per side), seeded from

- the current depth-1 best response;
- a few draws from the depth-0 odds (`actionOdds`);
- cheap archetypes: "guard the most valuable focuser", "all-in attack", "everyone builds".

### 3. The payoff matrix

- Each cell is the mean of `samples` rollouts with **both teams' cards fixed** to the two plans. The engine already accepts explicit selections for every seat.
- Rollouts use common random numbers across cells, antithetic dice (already supported), and the settled leaf `positionScore`.
- The payoff is the leaf score difference between the teams (zero-sum).

### 4. Iterate

1. Solve the matrix with `solveZeroSum` to get each side's mix.
2. **Best response:** run the existing iterated best response against the *opponent's mix*. Each rollout samples one opponent plan from the mix, instead of letting the opponent play at depth 0.
3. Add each side's best response to its pool if it beats the current value by more than ε.
4. Stop when neither best response improves by more than ε (converged), or at the pool cap or time budget.

The **exploitability estimate** is the larger of the two best-response gains. It is returned with
the decision and logged, so convergence is never silent.

### 5. Play and cache

- **Play:** sample this team's plan from its equilibrium mix.
- **Cache:** solved once per round for both sides (today's cache is per team per round).
- When both sides are AI (the balancer, bench), one solve serves both, which halves the cost.

### 6. What stays

- Depth 0 as the cheap opinion and candidate generator.
- The leaf evaluator.
- Target search.
- No learned or per-card table anywhere, so nothing goes stale when content changes.

## Options and knobs

- `aiPolicy({ mode: 'equilibrium', pool, samples, epsilon, budgetMs })` next to today's `depth` knob.
  Once verified it becomes the production mode, and the old depth-1 mode goes away (one AI, one knob).
- **Optional `reader`.** It biases the equilibrium toward exploiting an opponent's observed tendencies. A per-fight belief over the opponent's pool is updated from revealed plans, as in the exploration.
  - **Off by default:** the balancer must measure against unexploitable play, not against a reader tuned to its own AI.
  - **Also a measuring tool:** it serves the "reads beat routines" audit (below).

## New measurement tools

- **`exploitability` per decision**, in the bench report: its mean and tail. That's the convergence monitor.
- **Routine audit** (bench), the user's core test: the best *fixed* strategy (same card pattern every round) against the equilibrium AI must lose clearly, for each kit and each table size.
- **Read value** (bench): an AI that sees one enemy card before choosing, against one that doesn't.
- **Referee grading** (audit): on the audit's small positions, compare the AI's mix with the referee's exact equilibrium, using `exploitability` against the referee's matrix.
  - This replaces "did it pick the referee's card" with "how much could a perfect opponent gain against its mix".
  - It's the right metric for mixed play: a correct mix often doesn't contain the referee's single pick.

## Files

- **`packages/ai/src/round-game.ts` (new):**
  - pool seeding;
  - the payoff matrix with fixed selections, common random numbers and antithetic dice;
  - the double-oracle loop;
  - the exploitability estimate.
- **`lookahead.ts`:** `bestResponse` accepts an opponent model given as a mix of joint plans (it currently plays them at depth 0). `evaluatePlan` exposes cell evaluation.
- **`index.ts`:** the `mode: 'equilibrium'` policy, a shared solve per round, and sampling from the mix.
- **`audit/`:**
  - `check.ts` and `playout.ts` gain mix grading against the referee;
  - `zero-sum.ts` is reused as it is.
- **`bench`:** the routine audit, read value and exploitability columns, and a ladder row for the new mode.
- **Tests (`packages/ai/test`):**
  - **Unit:** on a hand-built rock-paper-scissors round (content-free fixtures), the double oracle converges to the uniform mix and `exploitability` goes below ε.
  - **Property:** a pure dominant plan is found as a pure strategy.
  - **Determinism:** under a seed, the same result.
  - **Puzzles and defect puzzles:** ported to "the mix puts weight ≥ x on the right card".

## Verification (memory rules)

1. **Referee audit:** the new mode's mix exploitability on the audit positions must beat today's depth-1 picks. Fixes that move mistakes elsewhere are rejected.
2. **Bot ladder** (`ai-benchmark`, `ai-strength.slow.test.ts`): the new mode vs spam, random and today's depth 1 must not get worse. Then head-to-head against depth 1, both seats.
3. **Cost:** ms per combat on the reference fight. Budget: within ~3× of depth 1, so that the balancer and the bench stay usable. Tighten the pool, samples and ε until it fits.
4. **Only after that:** recalibrate (`calibration:refresh`). The AI is the unit of difficulty, so every solved PV moves once.

## Order relative to the priority migration

**A separate night, after the priority migration lands** (decided 2026-10-28). The round game must
encode the new order: cards → aims at the reveal → guards after the aims → steps. So it's built on
the priority engine, never on speed.

**Decided:**
- live, per round;
- the production AI plays the equilibrium;
- the reader is a bench tool only.

**Its night:**
1. `round-game.ts` + unit tests.
2. Referee grading.
3. The ladder.
4. Cost.
5. The switch to default.
6. One re-calibration with the new AI.

## Risks

- **Cost.** Matrix cells multiply rollouts. Mitigations: small pools, racing (`race`, already built), shared solves for both sides, and sample counts that grow only on close cells.
- **Pool quality.** The double oracle is only as good as its best-response oracle (iterated best response is local). Exploitability measured against the referee keeps this honest.
- **Noise.** Rollout noise can make the solver chase phantom best responses. Mitigations: common random numbers, antithetic dice, and an ε above the measured noise.
- **Balance shift.** A stronger, mixing AI changes every solved PV and kit report. Expected; it's what P6 re-measures.
