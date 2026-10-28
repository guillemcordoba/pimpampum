# Priority system — migration report (2026-10-28)

Branch `priority-system`, cut from `elements-set`. Nothing merged. The plan is in
`PRIORITY-MIGRATION.md`.

> **Status: in progress.** Sections marked _pending_ are still running.

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

_Pending:_ the slow tier, the triangle and armour tests, `/analyze`, the referee audit and the bot ladder.

## Design pass (P3)

_Pending:_ four `card-designer` batches, each judged by a fresh `card-taste`:
- **A:** speed effects that lost their meaning;
- **B:** the 7 enemy-block cards;
- **C:** timing that the fast step doesn't carry;
- **D:** defenses with no on-block payoff.

Proposals in `DESIGN-PROPOSALS.md`, for the user to pick.

## Decisions for the user

_Filled in at the end._

## Notes

- **The mutation harness:** 5 of 48 find-strings were already stale before this branch (they name code that has moved). The one this change would have broken (the chooser signature) is fixed.
- **The old engine is in a scratch worktree** for before/after comparisons. It isn't committed anywhere.
