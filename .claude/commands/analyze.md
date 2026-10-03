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

3. If the change touched creatures or anything a fight's difficulty rests on, also run the set-level checks:
```bash
SLOW=1 npx vitest run test/balancer.slow.test.ts test/ai-strength.slow.test.ts
```

4. Read the output. Each requirement is a test (`@pimpampum/playtest/vitest`, `kitSuite`):
   1 level ramp · 2 duration · 3 thinking beats not thinking · 3b the strategy space matters · 3c no one card carries the kit · 4 no dead cards · 5 no auto-include · 8 inside the power band. Requirement 7 (cards that correlate with losing) is a FLAG, printed, never failed on.
   - A test named `— KNOWN to fail: …` is a recorded finding (`test/kits/known.ts`). If it now FAILS, the finding was fixed: delete its entry.
   - For every other failure explain: **what** the requirement checks, the **numbers** behind the verdict (the verdict's `detail` and the recorded JSON), the **root cause**, and a **suggested fix** (card, handler, or AI — remember a card the AI never plays is usually a blind EVALUATOR, not a weak card: check `positionValue` first).

5. Read `intentions.md` and flag any conflict with it. Read the relevant `NEXT-STEPS.md` sections before proposing changes.

6. Present: pass/fail per kit and requirement, each failure's diagnosis and fix, patterns across failures, and anything that moved against the recorded verdicts.
