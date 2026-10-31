# Priority system — migration report (2026-10-28)

Branch `priority-system`, cut from `elements-set`. Nothing merged. The plan is in
`PRIORITY-MIGRATION.md`.

> **Status: the night's work is done.** Still not run: the kit suites (slow tier) and `/analyze`. Your decisions are at the end.

## What changed

### Engine (P1)
- **No speed.** `ActionDefinition.fast` replaces `speed`. `StatusBehavior.fast` (grant or strip) replaces `modifySpeed`. Armour has no speed penalty.
  - `speed` and `speedPenalty` are still optional, ignored fields until the next cleanup. Nothing in the repo reads them; the pinned calibration copies were re-pinned without them.
- **The order of a round** is one function, `orderKey(type, fast)`: the fast step (fast Defense, fast Attack, fast Focus), then Defense, Attack, Focus. Equal keys are one step.
- **Inside a step:**
  - **Who falls is simultaneous.** Two attacks that fell each other both land.
  - **Everything else follows commit order.** People resolve in the order they committed their cards (the order of the human selections); AI seats land at random.
- **Every attack aims at the reveal.** AI seats aim in `planActions`; human seats are prompted before anything resolves (the existing reveal-aim prompt).
  - The aims are visible in `pendingSummary().targets` and `plannedThisRound().targets`.
- **A defense guards itself or one ally,** chosen when it resolves, after the aims. The generic "block an enemy" choice is gone.
  - A defense whose own effect asks for an `'enemy'` target still blocks it. That's the 7 interim cards awaiting redesign.
- **New seam `revealAs`:** a card can pick its type at the reveal and take that type's step.
- **Tests:** the engine's tests were rewritten for the new order. **198 of 198 pass**, including new tests for:
  - the fast step;
  - the full queue order;
  - a fast attack against a normal defense, and a fast defense against a fast attack;
  - aims at the reveal, and defenses choosing after them;
  - no enemy guard;
  - commit order, and AI seats at random;
  - status grant and strip.

### Content (P2)
- **Speed removed.** All 160 speed values and 11 armour and weapon speed penalties are gone.
- **23 cards are fast** (the audit's list for the "fast step first" option):
  - **plain attacks:** Punyalada ràpida, Urpa ràpida, Mossegada en vol, Punys encesos, Fletxa a l'escletxa, Llengua paralitzant, Vol propulsat;
  - **timing cards:** Trampolí de mans, Ràfega de dits, Bomba de fum, Marca de la perdició, Rugit de guerra, Injecció d'adrenalina, Poció de vida, Amagar-se, Fuet d'aigua, Sang sota la lluna, Ira de l'oceà, Guant de pedra, Catapulta de vent, Cop i fuga, Ull de l'huracà, Palmell d'aire.
- **Statuses:**
  - **Patinet d'aire** grants fast next round.
  - **Condemnat** (Marca de la perdició, Invocar l'ombra de l'infern) strips fast. It used to be −3 speed; its text waits for the design pass.
- **Calibration:** kits re-pinned from the live ones (`pnpm calibration:refresh`). The next measurement recalibrates every baseline.
- **Tests:** card tests whose setups ordered cards by speed now use fast flags or the order of the steps. Two cards were re-staged because the new order changes when they go up: Ballesta sentinella and Entrar en Fúria. A Focus hit earlier in the round is interrupted, so they now go up in a round without an attack.

### AI (P4, the port)
- **Interrupt value:** an enemy holds a Focus that resolves after this attack (any normal Focus, or a fast one if this attack is fast).
- **First strike** becomes a fast bonus.
- **A normal Focus is no longer telegraphed** while you're dying.
- **Guards read the real aims** (`landing()`); before the reveal they predict them as before.
- **Attack aiming predicts cover from the revealed Defense cards:** the target's own Defense card, minus a little for each allied defender who might step in.
- **The audit:**
  - archetypes draw fast from a measured share (attacks 18.5%, defenses 0%, focuses 17.1%);
  - jab, advance, taunt and hide are fast by nature;
  - controls and puzzles have fast exactly where a card's speed made it go first, with every arithmetic re-checked under the new order.
- **Tests:** 91 pass (plus the 132 `todo`s that were already there).

### Web (P5)
- **Card face:** a fast badge instead of the speed stat.
- **Reveal list:** in resolution order, showing each attack's aim as soon as it has aimed.
- **Commit order:** recorded (a changed mind goes to the back).
- **Highlight:** while an attack is being aimed, the highlighted card is that attack, not the next one to resolve.
- **RulesView:** rewritten.
- ⚠️ **Not verified in a browser:** headless Chromium doesn't start on this machine (a glibc mismatch). It builds, and its unit tests pass.

### Docs (P5)
`rules.md`, `intentions.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `card-taste.md`, `card-template.html`.

## The fast tier

| Package | Result |
|---|---|
| engine | 198/198 |
| ai | 91 pass (132 todo, as before) |
| common | 84/84 |
| fantasy | 52/54: **encounter-speed fails** (see the balance findings) |
| elements | 99/99 |
| bench | 68/69: `positions.test` **already failed before this branch** (baseline run 2026-10-28, before any change) |
| playtest, combat-balancer, tools, web | all pass |

## Balance findings (measured)

**Fights got longer and harder for the party.** Same 4 heroes (berserk, volcanic+metge, Esgrima, nigromant, levels 3, armour as in the timing test) against 5 goblins (10 health, level 3); old engine = `elements-set`, measured in a worktree:

| | Old (speed) | New (priority) |
|---|---|---|
| Rounds per fight | 4.3 | **6.0** |
| Party winrate, AI at depth 1 on both sides | 85% | 48% |
| Party winrate, depth 0 | 66% | 45% |
| AI cost per round | 5.1 ms | 5.0 ms |

- **Why the solver is slower:** the AI costs the same per round, so the encounter solver's 3 s budget (`encounter-speed.test`) now fails purely because fights last 38% longer.
- **The likely cause:** every defense is now up before every normal attack, so more blows are blocked; under speed, many attacks outran guards.
- **It conflicts with `intentions.md`:** "Combats should not go on for more than ~5 rounds".
- **The plan's levers:**
  - **defense payoffs** (the design pass): a block that pays shortens fights;
  - **Focus effects that pump attacks**, so prepared attacks break through;
  - **tuning numbers in the real engine.**
- **Not loosened:** I didn't loosen the 3 s budget.

## The measurement tiers

### Smoke tier: done

Every slow file at 2 games: **88 of 90 files execute.** The failures:
- **bench `positions.test`:** it failed before this branch.
- **bench `card-value.slow`:** a real finding, so the test stays as it is.
  - Its "overwhelming" control ("20d6 at every enemy, first") was speed 9 and is now fast. With that fix, at full size it ranks first again (30.8).
  - Two assertions still fail because **the synthetic brawler's Guard is now worth +28.9 and its attacks −12 to −26.** The spread between real cards is bigger than the controls' gap.
  - Under priority a defense resolves before every normal attack, and the instrument sees it.
- **The same signal as the longer fights:** defense became much stronger.
  - `intentions.md` wants Protect ahead of Aggro, but not by this much.
  - The answer its rules point to is "buff the corner that beats it": Focus effects that pump attacks so they break through.

### The strategy triangle and the armour bound (fantasy): done

| Test | Result |
|---|---|
| Armour moves a fight ≤15 points | ✅ passes |
| Power > Protect | ✅ 77.9% ±1.5 |
| Protect > Aggro | ✅ 74.7% ±1.5 |
| Aggro > Power | ❌ **22.6% ±1.5.** It held on the old engine (`KNOWN_BROKEN` was empty since 2026-10-05). |

**What held up Aggro > Power,** according to the test (each Power card taken out in turn):
- **Cures de camp: +39.8 points.**
- Riu de lava: +10.9.
- Atac temerari: +8.8.

**The likely mechanism:** a heal in the Focus step undoes the round's attacks unless the attackers interrupt the healer. Aggro is now the corner that loses to both others. This matches the longer fights and the Guard the card-value instrument now overvalues.

**The answer `intentions.md` prescribes:** buff the corner that beats the winner. Here the broken edge is Aggro > Power, so Aggro needs a reason to win. It also may be partly the AI port: attackers now aim before any guard is up. The bot ladder checks that.

### The bot ladder (`ai-strength.slow`, fantasy): done, 8/9

- ✅ The AI beats firstLegal, feeble, uniform and **spam** at least 70% of the time, and is never beaten by any of them.
- ✅ Depth 1 (thinking one round ahead) beats depth 0.
- ✅ Production is converged: a bigger budget beats it by clearly under 8 points.
- ❌ **A bigger search budget plays worse than production:** depth1x against depth1 is 45.8% ±1.8 over 800 combats.
  - **What it means:** more rollouts converge on the search's own model of the opponent, and that model (the depth-0 heuristic) now predicts the table worse under priority.
  - **The plan for it:** the equilibrium-AI night (`AI-EQUILIBRIUM-PLAN.md`), which replaces "best response to a fixed guess" with an equilibrium.

### AI benchmark, old engine against new (`tools/ai-benchmark.ts`, 200 combats per cell): done

| Mirror head-to-head (winrate of the row) | Old | New |
|---|---|---|
| depth 1 (production) vs spam | 57.5% | **98.0%** |
| depth-0 heuristic vs spam | 10.2% | 33.5% |
| depth-0 heuristic vs uniform random | 86.8% | **41.8%** |
| Production's play mix A/D/F, carrying the party | 62/10/28% | **17/42/41%** |

- **The memory rule holds:** production against spam must not get worse, and it got much better.
- **The real problem: the depth-0 heuristic now plays worse than random.** Its weights still make it attack about two-thirds of the time (66% of its decisions). Under priority, attacking into defenses that are always up first is a losing habit.
- **The same heuristic is the opponent model in the search's rollouts.** The search plans against opponents who attack too much. That's why a bigger budget plays worse (the ladder failure above).
- **What fixes it:**
  - **Retune the heuristic's weights for priority:** the Defense and Focus base weights against attack damage.
  - **Verify per the memory rules:** the referee audit after the fix, then the ladder, rejecting any fix that only moves the mistakes elsewhere.
  - **Or replace the opponent model** on the equilibrium-AI night.
- **The balance shift:** production now defends and focuses far more than it attacks. That's the same shift as the broken Aggro > Power edge and the longer fights.

### Referee audit (`ai-audit.ts`, exact Nash solver): done

- 50 generated positions plus 9 controls; 86% solved within budget (7 over budget).
- **Positions with a confirmed mismatch: 9.3% ±4.4.** AI decisions that are mismatches: 7.0% ±3.9.
- **Not directly comparable** with the old engine's 21.3% (NEXT-STEPS §53.4). That number covered 2,757 positions, big shapes included; this run covered 43 small solved ones.
  - Comparing only the slices both runs share, I see no sign the AI got worse.
- **Where the mismatches sit:**
  - the 2v1 and 1v2 shapes with 3 rounds left (20–25%);
  - hands holding a `block` card (12.5%);
  - the `lock` and `stun` archetypes (small samples).
  - That's the defensive side, where the depth-0 heuristic's attack bias would show.

_Not run:_ the kit suites (slow tier) and `/analyze`. Their verdicts are read through the AI, so they're worth running after the heuristic retune (decision 3), not before.

## Design pass (P3): done, not implemented

Four `card-designer` batches, each judged round by round by a fresh `card-taste`:
- **A:** speed effects that lost their meaning (closed);
- **B:** the 7 enemy-block cards (closed);
- **C:** timing that the fast step doesn't carry (closed);
- **D:** defenses with no on-block payoff (6 closed, 2 open).

Final texts are in `DESIGN-PROPOSALS.md`. Nothing is implemented: you pick first.

## Night 2 (2026-10-28 → 29): the exact layer, shortcuts, a prototype, and ganging up

Full numbers in `NEXT-STEPS.md` §56.

- **The exact referee was not quite exact.** In-round dice depended on the order it explored the game. Fixed; it's now order-exact (memo on or off, same value to the last digit).
- **Composed cards.** The audit now also deals imaginary cards built from parts (type, trigger, effect, subject), so verdicts aren't about one list of 20 effects. On-block payoffs are among them.
- **Shortcuts graded against the exact layer.** The ranking holds on both card sets:
  - two rounds of exact solving: 0.6–1.3 PV gap;
  - one round plus random playouts: 1.0–1.6;
  - today's AI: 0.7–3.1;
  - one round scored by PV, or by today's evaluator: 2.8–6.3.
  - **Today's hand-weighted evaluator is a worse leaf than plain PV.**
- **The prototype equilibrium player beats today's AI** on every small slice: +1.2 to +6.5 PV of margin, both seats, with no hand-set weights.
  - The edge holds with 32 playouts or exact decisions: the same within the noise.
  - It's far too slow for real hands yet.
- **Eight rules for several attacks on one defended body:** see the decision below.

## Night 4 (2026-10-29 → 30): the equilibrium player wins long fights

Full numbers in `NEXT-STEPS.md` §57–58. Everything is on the audit's composed cards; the real cards aren't migrated yet.

- **Why the fast player lost long fights:**
  - **Noise:** two careful solves of one round disagree by ~10 PV.
  - **Two costly shortcuts:** the pool cap and round-margin decisions.
  - **A bug:** live aims and guards were weighed by random playouts whatever the leaf.
- **The least biased leaf over long horizons,** graded exactly: greedy playouts cut at 2 rounds.
- **`MEDIUM_EQUILIBRIUM`** beats today's AI in long fights at every size **on composed cards**:
  - 2v2: +10.8 ±5.1 over 60 pairs;
  - 3v3: +18.4 ±11.8 over 60 pairs;
  - 4v4: +118 ±36.5 over 16 pairs.
  - Graded exactly, it is closer to best play than today's AI on every long small slice.
- **But on the hand-written archetypes (slow cards) it loses** *(corrected in Night 5: small samples; at 300 pairs it draws)*:
  - 2v2: −6.0 ±7.2 over 60 pairs;
  - 3v3: −33.5 ±18.1 over 30 pairs.
  - On short archetype positions it wins (+1.9 to +5.3), and graded exactly it beats today's AI on every archetype slice. So the loss is specific to long, multi-body fights with slow cards, beyond what the exact solver reaches.
  - It under-defends there (guard 39 vs 64, lock 17 vs 44). Two fixes were tried and ruled out: a different leaf, and informed playout targets.
  - **Open: needs understanding before the AI can be trusted at full size.**
- **Its cost:** ~1.7 s a round on 3v3, ~16 s on 4v4. Not switched in; that's your call, and waits for the migrated cards.

## Night 5 (2026-10-30 → 31): no archetype loss, and one setting that helps

Full numbers in `NEXT-STEPS.md` §58.1–58.2.

- **The archetype loss was small samples.** At scale the medium player draws with today's AI on archetypes:
  - 2v2: +0.9 ±2.6 over 300 pairs;
  - 3v3: −0.3 ±6.9 over 230 pairs.
  - Replays of the worst losses still show real habits: fragile bodies left open, no focus fire, lock and stun chains, attacks into a block that stays up.
- **The leaf isn't the problem:** greedy to the end (+4.4 ±7.9) and the evaluator at the cut (−0.2 ±11.1) do nothing in long fights.
- **One search setting helps: in-round decisions weighed on the full leaf,** +5.9 ±2.6 over 300 paired seeds, at 4× the time.
  - On composed cards it doesn't hurt: +3.9 ±2.7 over 300 pairs. **It is now part of `MEDIUM_EQUILIBRIUM`.** Its cost is 4× on 2v2 but 33× on a 4v4 opening round, over the budget — to be decided again (§58.3).
- **A solve's cells on worker threads** (`solveAsync`, `@pimpampum/ai/parallel`): the same answers, ×2 to ×2.9 on 4 workers.
  - Joint best response: −0.1 ±1.6.
  - ×16 samples: +2.2 ±2.7.
- **Speed:** playout leaves are cached by board, with identical results. A round now takes ~0.8 s on 3v3 and ~12 s on 4v4.
  - A one-draw greedy round was rejected: 11–14% cheaper, but measurably worse when graded exactly.

## Decisions for the user

1. **The design picks** (`DESIGN-PROPOSALS.md`):
   - accept or overrule each final text;
   - **two title changes:** Gel del mestre → Retorn glaçat, and Esquivar-los a tots → Fer-los xocar;
   - **the optional renames** in batch A (not Entumit for Glaçat: Mestre del xi already uses it);
   - **two open cards:**
     - **Colós de butxaca:** Corda would count rounds instead of blows, and the card would join each ally's wall. That's much stronger against a horde.
     - **Coixí de vent:** keep its payoff, cut it, or give it a new one. Cutting it breaks your "every defense pays" rule.
2. **The rulings:**
   - the wall rule (every card in a wall that holds pays);
   - an AoE "apunta" each of its targets;
   - the order of end-of-round events;
   - whether a Cometa that never lands still costs its fatigue.
3. ~~**The depth-0 heuristic: retune now?**~~ **Decided (2026-10-28): no.** Its constants go; the equilibrium AI replaces it, built from the exact layer up. See "Night 2" above.
4. **The balance direction.** Defense got much stronger:
   - fights went from 4.3 to 6.0 rounds;
   - Aggro > Power is broken (22.6%; the culprit is Cures de camp);
   - card-value prices Guard at +28.9.
   - `intentions.md` prescribes buffing the corner that beats the winner. Here that's attacks that break through: Focus effects that pump attacks, and the defense payoffs, which shorten fights when blocks pay. It's the direction we chose together.
   - **Recommendation:** do the AI first (the equilibrium player), re-measure, then tune numbers. Some of the shift is likely the AI.
5. **The encounter-speed test** (3 s budget) fails only because fights are longer. Keep it red until fights shorten (recommended), or raise the budget.
6. **Armour:** without its speed penalty, armour still moves a fight ≤15 points. Keep its values as they are (the default), or price it some other way.
7. **The interim defaults:**
   - a vanished aim retargets;
   - no slow keyword;
   - Cop desesperat is a normal card;
   - the 7 enemy-block cards keep working until their batch-B designs land.
   - Confirm them, or change any.
8. **The merge path:** `priority-system` → `elements-set` once you accept it, then the usual question for `main`. Nothing has been merged.
9. **Several attacks on one defended body: pick a rule** (2v2 numbers in §56.4).
   - **sum** (attacks in a step add up into one blow) and **flank** (+N per other attack on the target) are the two that make best play concentrate fire: 0.56 and 0.58 of paired attacks share a target, against 0.36 today.
   - **sum** is the lore you asked for ("add their dice"), and it mirrors walls. It mildly lowers the bigger side's reading value on 2v1.
   - **flank** keeps reading the most valuable, and N tunes its strength: +3 or +4 matches sum's power shift.
   - **wear** shifts power but barely changes focus fire.
   - **unguarded** ("swarmed means you can't protect") stacks with any of them; it halves defending in 2v2.
   - **My recommendation: sum,** optionally with unguarded. Then I delete the other rules and the experiment.
10. **The equilibrium player's next step: making it affordable for real hands** (hundreds of joint plans a side). The candidates:
   - per-seat best response;
   - greedy decisions, whose saving only shows with many decisions;
   - fewer joints through dominance pruning, graded against the exact layer as before.

## Notes

- **The mutation harness:** 5 of 48 find-strings were already stale before this branch (they name code that has moved). The one this change would have broken (the chooser signature) is fixed.
- **The old engine is in a scratch worktree** for before/after comparisons. It isn't committed anywhere.
