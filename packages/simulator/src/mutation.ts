/**
 * MUTATION TESTING FOR THE INSTRUMENT — can these tests actually FAIL?
 *
 * Every other harness here asks whether the GAME is right. This one asks
 * whether the tests are, and it exists because the answer kept being "not
 * quite": three assertions have been found that could not fail at all —
 * `/taules/` matched against a string that always contains it, `COSTAT SENCER`
 * likewise, and a convergence check written as `margin − 2σ < bar`, which any
 * noisy sample passes for free (NEXT-STEPS §19.11, §20.5b). All three were
 * found by reading. Reading does not scale.
 *
 * Mutation testing is the standard answer: inject a small fault, run the
 * tests, and if they still pass the mutant SURVIVED — which is a direct
 * indictment of a missing or weak test. The score is killed / total.
 *
 * WHAT IS MUTATED, and why these and not random operator flips: each mutant
 * below is a fault this project has ACTUALLY SHIPPED, in the exact line it
 * shipped in. Dropping an error term, comparing a rate to a count, judging a
 * card on a sample too small to judge it — that is the local fauna, and a
 * suite that catches arbitrary syntax noise while missing these would score
 * well and protect nothing.
 *
 * WHY IT IS AFFORDABLE: the kill set is THE WHOLE FAST TIER — every test file
 * that is not `*.slow.test.ts` — which runs in about half a second. Mutants
 * land in decision rules and engine rules, both pure functions, so the fast
 * tier is exactly where they should die. The statistical tier is deliberately
 * excluded: it takes minutes, and a mutation harness nobody can afford to run
 * is one nobody runs.
 *
 * That split is not cosmetic. The "armour stops reducing damage" mutant
 * SURVIVED a run because the one test that catches it was sitting in a file
 * that took 311 seconds; moving three pure-function tests into the fast tier
 * killed it. Keep the kill set and the fast tier identical.
 *
 * ENGINE mutants are included too, marked `rebuild`: the simulator consumes
 * the engine as built `dist/`, so those cost a ~10s rebuild each. Worth it —
 * `resolution.ts` is where the RULES live, and a suite that cannot notice
 * "a tie now goes to the attacker" is not guarding the game at all.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/mutation.ts
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { games } from '@pimpampum/bench';

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exit(code: number): never;
  on(event: string, fn: () => void): void;
};

const SRC = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(SRC, '..');
const VITEST = path.join(PKG, 'node_modules', '.bin', 'vitest');

/**
 * The tests a mutant must die to. Fast files only — every one of these runs in
 * milliseconds, so the whole sweep costs seconds rather than the hours a full
 * suite per mutant would.
 */
const KILL_SET = [
  'src/tests/requirements.test.ts',
  'src/tests/bench.test.ts',
  'src/tests/seams.test.ts',
  'src/tests/ai-rules.test.ts',
  'src/tests/engine-sanity.test.ts',
];

interface Mutant {
  /** What real defect this reproduces. */
  label: string;
  file: string;
  find: string;
  replace: string;
  /**
   * WHICH PACKAGE TO REBUILD before the mutant can be seen.
   *
   * Cross-package sources are consumed as built `dist/`, so a mutant in one is
   * invisible until that package is rebuilt — and a mutant nobody can see is
   * scored as KILLED by a suite that never met it, which is worse than no
   * score at all. Costs ~10s per mutant, which is why the ones inside this
   * package do not pay it.
   */
  rebuild?: 'engine' | 'bench';
}

const MUTANTS: Mutant[] = [
  {
    label: 'marginVerdict: drop the error term (§19.1 — how 3c came to report its seed)',
    file: 'src/kit-analyzer-lib.ts',
    find: 'ok: margin + 2 * se >= bar,',
    replace: 'ok: margin >= bar,',
  },
  {
    label: 'marginVerdict: ignore the bar entirely',
    file: 'src/kit-analyzer-lib.ts',
    find: 'ok: margin + 2 * se >= bar,',
    replace: 'ok: margin + 2 * se >= 0,',
  },
  {
    label: 'classifyStep: drop the noise floor (§12 — flat levels read as regressions)',
    file: 'src/kit-analyzer-lib.ts',
    find: "if (step < -Math.max(regressionPP, 2 * se)) return 'regression';",
    replace: "if (step < -regressionPP) return 'regression';",
  },
  {
    label: 'durationVerdict: the draw bar can never fire',
    file: 'src/kit-analyzer-lib.ts',
    find: 'if (drawRate >= maxDraws)',
    replace: 'if (drawRate >= 1.1)',
  },
  {
    label: 'correlatesWithLosing: judge a card on any sample at all (§19 — the play gate)',
    file: 'src/kit-analyzer-lib.ts',
    find: 'if (plays < minPlays) return { judged: false, flagged: false, rate: 0 };',
    replace: 'if (plays < 0) return { judged: false, flagged: false, rate: 0 };',
  },
  {
    label: 'correlatesWithLosing: flag on the point estimate, no error bar',
    file: 'src/kit-analyzer-lib.ts',
    find: 'flagged: rate + 2 * stderr(rate, plays) < floor',
    replace: 'flagged: rate < floor',
  },
  {
    label: 'dead cards: call a card dead on the point estimate (§17.5 — the noise floor)',
    file: 'src/kit-analyzer-lib.ts',
    find: 'return bestShare + 2 * bestStderr < nullShare;',
    replace: 'return bestShare < nullShare;',
  },
  {
    label: 'stderr: every error bar becomes zero',
    file: '../bench/src/report.ts', rebuild: 'bench' as const,
    find: 'return Math.sqrt(Math.max(rate * (1 - rate), 0.01) / n);',
    replace: 'return 0;',
  },
  {
    label: 'gamesFor: every sample size is deemed sufficient',
    file: '../bench/src/report.ts', rebuild: 'bench' as const,
    find: 'return Math.ceil(2 * (sigmas / d) ** 2 * 0.25);',
    replace: 'return 1;',
  },
  {
    label: "regret: decided positions are not dropped (\u00a719.5 fault 3 \u2014 every card dragged to its null)",
    file: "../bench/src/regret.ts", rebuild: "bench" as const,
    find: "if (top === bottom) return null;",
    replace: "if (false) return null;",
  },
  {
    label: "regret: a tie for best is split, not credited (\u00a719.5 fault 4 \u2014 duplicates read dead)",
    file: "../bench/src/regret.ts", rebuild: "bench" as const,
    // BOTH LINES, SWAPPED, rather than just the first. `topCount` is declared
    // after `isBest`, so patching `isBest` alone produces source that does not
    // COMPILE — and since a bench mutant is only visible after `pnpm build`,
    // an uncompilable mutant is not a survivor or a kill, it is a crash.
    find: `const isBest = b.score >= top ? 1 : 0;
      const topCount = branches.filter(o => o.score >= top).length;`,
    replace: `const topCount = branches.filter(o => o.score >= top).length;
      const isBest = b.score >= top ? 1 / topCount : 0;`,
  },
  {
    label: "regret: the null stops self-calibrating (\u00a719.7 \u2014 a flat 1/k understates chance)",
    file: "../bench/src/regret.ts", rebuild: "bench" as const,
    find: "nullShare: list.reduce((a, o) => a + o.topCount / o.candidates, 0) / list.length,",
    replace: "nullShare: list.reduce((a, o) => a + 1 / o.candidates, 0) / list.length,",
  },
  {
    label: "ENGINE resolution: a tie no longer holds for the defense",
    file: "../engine/src/resolution.ts", rebuild: "engine" as const,

    find: "return { hit: margin > 0, margin };",
    replace: "return { hit: margin >= 0, margin };",
  },
  {
    label: "ENGINE resolution: armour stops reducing damage",
    file: "../engine/src/resolution.ts", rebuild: "engine" as const,

    find: "return Math.max(0, margin - passiveArmor);",
    replace: "return Math.max(0, margin);",
  },
  {
    label: "ENGINE resolution: every contest teaches, not just close ones",
    file: "../engine/src/resolution.ts", rebuild: "engine" as const,

    find: "return lostBy >= 0 && lostBy <= SKILL_UP_MARGIN;",
    replace: "return lostBy >= 0;",
  },
];

/** Rebuild a package so a mutation in its source reaches the simulator. */
function build(pkg: 'engine' | 'bench'): void {
  const filters = pkg === 'engine'
    // Everything downstream of the engine is typed against it, so a rebuilt
    // engine with an unrebuilt bench is a pair of dist/ trees that disagree.
    ? ['--filter', '@pimpampum/engine...']
    : ['--filter', '@pimpampum/bench...'];
  execFileSync("pnpm", [...filters, "build"], {
    cwd: path.resolve(PKG, "../.."), stdio: "pipe",
  });
}

/** Run the kill set. True = all green, i.e. the mutant SURVIVED. */
function testsPass(): boolean {
  try {
    execFileSync(VITEST, ['run', ...KILL_SET], {
      cwd: PKG, stdio: 'pipe', env: { ...process.env, CI: '1' },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * NEVER MUTATE SOURCE FROM INSIDE A TEST RUN.
 *
 * `harnesses.test.ts` executes every script in `src/` at two combats to prove
 * it still runs against today's content — and this one edits the package's own
 * source in place. Doing that underneath a live vitest run means forked workers
 * importing a half-mutated instrument, which would be a spectacular way to
 * produce numbers nobody could explain.
 *
 * So the smoke test gets what it actually wants (proof this executes) and
 * nothing else.
 */
if (process.env.VITEST) {
  console.log('MUTATION TESTING · skipped: refuses to mutate source from inside a test run.');
  process.exit(0);
}

const originals = new Map<string, string>();
function restoreAll(): void {
  for (const [file, text] of originals) fs.writeFileSync(path.join(PKG, file), text);
  originals.clear();
}
// A crash mid-mutation must not leave the instrument mutated for the next
// person who runs anything. `mirrorSweep` learned this the hard way.
process.on('exit', restoreAll);
process.on('SIGINT', () => { restoreAll(); process.exit(130); });

// `games()` is the package's one sample-size seam, and the smoke run turns it
// down to 2 — there is no sample here, so it is read as "how many mutants".
const LIMIT = Math.max(1, Math.min(MUTANTS.length, games(MUTANTS.length)));
const chosen = MUTANTS.slice(0, LIMIT);

console.log(`MUTATION TESTING · ${chosen.length}/${MUTANTS.length} mutants · kill set: ${KILL_SET.length} fast files\n`);

// The baseline must be GREEN, or every mutant reads as killed by a failure
// that was already there and the score is meaningless.
if (!testsPass()) {
  console.log('❌ the kill set does not pass UNMUTATED — fix that first; every score below would be a lie.');
  process.exit(1);
}

const survivors: string[] = [];
for (const m of chosen) {
  const abs = path.join(PKG, m.file);
  const text = fs.readFileSync(abs, 'utf8');
  const hits = text.split(m.find).length - 1;
  if (hits !== 1) {
    // A mutant that does not apply is not a passing mutant. Loudly.
    console.log(`⚠️  SKIPPED (${hits} matches, need exactly 1): ${m.label}`);
    continue;
  }
  originals.set(m.file, text);
  fs.writeFileSync(abs, text.replace(m.find, m.replace));
  if (m.rebuild) build(m.rebuild);
  const survived = testsPass();
  restoreAll();
  if (m.rebuild) build(m.rebuild);   // put the real source back before the next mutant
  console.log(`${survived ? '💀 SURVIVED' : '✅ killed  '}  ${m.label}`);
  if (survived) survivors.push(m.label);
}

const killed = chosen.length - survivors.length;
console.log(`\nmutation score: ${killed}/${chosen.length}`);
if (survivors.length) {
  console.log('\nSURVIVORS — each one is a fault the suite would not notice:');
  for (const s of survivors) console.log(`  · ${s}`);
}
