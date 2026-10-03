Run the balance tests and diagnose any failures. Use after any content change (cards, kits, creatures, equipment) — a content change is experimental until simulated.

**Argument (optional):** a player kit id (e.g. `/analyze berserk`). With it ($ARGUMENTS), measure that kit in full; without, sweep every main kit.

## Steps

1. Build, and run the fast tier — rules, seams, properties and pure verdict rules. It must be green before any measurement means anything:
```bash
pnpm test 2>&1 | tail -30
```

2. Run the kit requirements — one `*.slow.test.ts` per main kit, each a full `analyze` on the real content (minutes per kit; measurements are cached by content fingerprint, so an unchanged kit is free). Record the verdicts as JSON for step 4:
```bash
cd packages/sets/fantasy
SLOW=1 PLAYTEST_RECORD_DIR=/tmp/verdicts npx vitest run test/kits/${ARGUMENTS:-} 2>&1 | tail -60
```
For the printed report card of one kit (every number, with its error bar):
```bash
pnpm --filter @pimpampum/tools exec tsx src/kit-analyzer.ts --player <kit>
```

3. Run the set-level requirement 4, the strategy triangle, after any content change. If the change touched creatures, armour or anything a fight's difficulty rests on, also run the other set-level checks:
```bash
SLOW=1 npx vitest run test/triangle.slow.test.ts
SLOW=1 npx vitest run test/set.slow.test.ts test/balancer.slow.test.ts test/ai-strength.slow.test.ts
```
The kit analyzer prints the triangle too with `--triangle`.

4. Read the output. Four requirements, one intention each (`@pimpampum/playtest` `rules.ts`; per kit through `kitSuite`):
   1 fights end (median ≤ 5, p90 ≤ 8, stalls < 2%) · 2 inside the power band (±15pp of neutral) · 3 choosing matters (a random legal card costs at least `MIN_CHOICE_COST` PV per decision against the best one, cross-fitted so noise costs nothing; and no card is NEVER the right play — even where it looks best, the runner-up is clearly better on fresh rollouts). The report card ranks the cards: value against the hand, share as the best play, lead over the runner-up when best, how often the AI plays it · 4 the strategy triangle, set-level (Power > Protect > Aggro > Power).
   - A test named `— KNOWN to fail: …` is a recorded finding (`test/kits/known.ts`). If it now FAILS, the finding was fixed: delete its entry.
   - For every other failure explain: **what** the requirement checks, the **numbers** behind the verdict (the verdict's `detail` and the recorded JSON), the **root cause**, and a **suggested fix** (card, handler, or AI — remember a card the AI never plays is usually a blind EVALUATOR, not a weak card: check `positionValue` first).

5. Read `intentions.md` and flag any conflict with it. Read the relevant `NEXT-STEPS.md` sections before proposing changes.

6. Present: pass/fail per kit and requirement, each failure's diagnosis and fix, patterns across failures, and anything that moved against the recorded verdicts.
