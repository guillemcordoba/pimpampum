Run the balance tests in the simulator package and diagnose any failures using the diagnostic report printed after the tests.

## Steps

1. Run the tests:
```bash
nix develop --command pnpm --filter simulator test 2>&1
```

2. Read the test output carefully. The test suite prints a **BALANCE DIAGNOSTIC REPORT** after all tests run, containing:
   - Class win rates
   - Combat length stats (average rounds, maxRounds hit %, draw rate per team size)
   - Card type balance (play share, win correlation, interrupt rate)
   - Per-class card type breakdown (what % of each class's plays are attacks, defense, focus)
   - Individual card stats per class (plays, class share, win correlation, interrupted count, max/min play ratio)
   - Worst matchups (most extreme win rates)
   - Team composition aggregate win rates

3. For each **failing test**, use the diagnostic data to explain:
   - **What** the test checks and why it fails
   - **Root cause** — what specific stats/numbers in the diagnostic report reveal the underlying issue
   - **Suggested fix** — concrete changes to CSV rules files, engine mechanics, or AI behavior that would address the root cause

4. Read `intentions.md` for context on design goals.

5. If relevant, read the specific CSV files for classes or equipment (`rules/classes/*.csv`, `rules/objectes.csv`) to understand current card values.

6. Present a summary with:
   - Total pass/fail count
   - For each failure: test name, root cause diagnosis, and suggested fix
   - Any patterns across failures (e.g., "combat is too long because defense is too strong, which also causes X and Y")
