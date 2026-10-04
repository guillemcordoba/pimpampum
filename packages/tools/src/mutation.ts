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
 * WHY IT IS AFFORDABLE: the kill set is THE WHOLE FAST TIER — every package's
 * test files that are not `*.slow.test.ts`, run as one suite from the root —
 * which takes seconds. Mutants land in rules, decision rules and the pieces of
 * the instrument that have fast tests, so the fast tier is where they should
 * die. The statistical tier is deliberately excluded: it takes minutes, and a
 * mutation harness nobody can afford to run is one nobody runs.
 *
 * That split is not cosmetic. The "armour stops reducing damage" mutant
 * SURVIVED a run because the one test that catches it was sitting in a file
 * that took 311 seconds; moving three pure-function tests into the fast tier
 * killed it. Keep the kill set and the fast tier identical.
 *
 * EVERY MUTANT IS REBUILT — its package and everything downstream of it —
 * because packages consume each other as built `dist/`. The rebuild is also
 * the COMPILE CHECK, and that is not a detail: a mutant that does not compile
 * is not a mutant the suite caught, it is a crash, and scoring it as killed is
 * how the tie-credit mutant was once counted as a kill it never earned
 * (NEXT-STEPS §24.4). Such a mutant is reported INVALID and scores nothing.
 *
 * Run: pnpm --filter @pimpampum/tools exec tsx src/mutation.ts
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { games } from '@pimpampum/bench';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const VITEST = path.join(ROOT, 'node_modules', '.bin', 'vitest');

interface Mutant {
  /** What real defect this reproduces. */
  label: string;
  /** Relative to the repo root. */
  file: string;
  find: string;
  replace: string;
}

/** The workspace package a file belongs to, for the rebuild filter. */
function packageOf(file: string): string {
  let dir = path.dirname(path.join(ROOT, file));
  while (!fs.existsSync(path.join(dir, 'package.json'))) dir = path.dirname(dir);
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name;
}

const MUTANTS: Mutant[] = [
  {
    label: 'durationVerdict: the stall bar can never fire',
    file: 'packages/playtest/src/rules.ts',
    find: 'if (stallRate >= maxStalls)',
    replace: 'if (stallRate >= 1.1)',
  },
  {
    label: 'stderr: every error bar becomes zero',
    file: 'packages/bench/src/report.ts',
    find: 'return Math.sqrt(Math.max(rate * (1 - rate), 0.01) / n);',
    replace: 'return 0;',
  },
  {
    label: 'gamesFor: every sample size is deemed sufficient',
    file: 'packages/bench/src/report.ts',
    find: 'return Math.ceil(2 * (sigmas / d) ** 2 * 0.25);',
    replace: 'return 1;',
  },
  {
    label: "regret: decided positions count towards the best-share (\u00a719.5 fault 3 \u2014 a no-op reads alive)",
    file: 'packages/bench/src/regret.ts',
    find: "if (top === bottom) return { choiceCost: 0, cards: [] };",
    replace: "if (false) return { choiceCost: 0, cards: [] };",
  },
  {
    label: "regret: a tie for best is split, not credited (\u00a719.5 fault 4 \u2014 duplicates read dead)",
    file: 'packages/bench/src/regret.ts',
    find: 'const isBest = b.score >= top ? 1 : 0;',
    replace: 'const isBest = b.score >= top ? 1 / branches.filter(o => o.score >= top).length : 0;',
  },
  {
    label: "ENGINE resolution: a tie no longer holds for the defense",
    file: 'packages/engine/src/resolution.ts',
    find: "return { hit: margin > 0, margin };",
    replace: "return { hit: margin >= 0, margin };",
  },
  {
    label: "ENGINE resolution: armour stops reducing damage",
    file: 'packages/engine/src/resolution.ts',
    find: "return Math.max(0, margin - passiveArmor);",
    replace: "return Math.max(0, margin);",
  },
  {
    label: "ENGINE resolution: every contest teaches, not just close ones",
    file: 'packages/engine/src/resolution.ts',
    find: "return lostBy >= 0 && lostBy <= SKILL_UP_MARGIN;",
    replace: "return lostBy >= 0;",
  },
  // --- Faults found and fixed on 2026-09-23 (NEXT-STEPS §25) ----------------
  {
    label: "ENGINE dice: the AI's distributions forget the contest floors (F4 — tired heroes priced as defenceless)",
    file: 'packages/engine/src/dice.ts',
    find: 'const total = (sum: number) => Math.max(0, Math.max(0, sum) + flat);',
    replace: 'const total = (sum: number) => sum + flat;',
  },
  {
    label: 'ENGINE combat: a speed tie stops being simultaneous (F8 — first come, first served)',
    file: 'packages/engine/src/combat.ts',
    find: 'if (aliveBeforeHazards && !actor.isAlive()) break;',
    replace: 'if (!actor.isAlive()) break;',
  },
  {
    label: 'AI: self-guard names a target outside the pool (F10)',
    file: 'packages/ai/src/policy.ts',
    find: 'return pool.includes(actor) ? [actor] : [];',
    replace: 'return [actor];',
  },
  {
    label: "combat log: a fatigued attacker's blow is unreadable (F11 — the U+2212 minus)",
    file: 'packages/bench/src/combatlog.ts',
    find: 'const SIDE = String.raw`(?:\\d+(?:[+−]\\d+)?[=→])?(\\d+)`;',
    replace: 'const SIDE = String.raw`(?:\\d+(?:[+]\\d+)?[=→])?(\\d+)`;',
  },
  {
    label: "cache: a card's target count leaves its fingerprint (F12 — a sweep served a single-target card's numbers)",
    file: 'packages/bench/src/cache.ts',
    find: 'const { name: _n, description: _d, iconPath: _i, ...rest } = a;',
    replace: 'const { name: _n, description: _d, iconPath: _i, targetCount: _t, ...rest } = a;',
  },
  {
    label: 'cache: the fingerprint forgets the AI (F9 — AI changes served stale baselines)',
    file: 'packages/bench/src/cache.ts',
    find: "export const FINGERPRINTED = ['engine', 'ai', 'bench', 'combat-balancer'];",
    replace: "export const FINGERPRINTED = ['engine', 'bench', 'combat-balancer'];",
  },
  {
    label: 'requirement 2: fail a kit that is out of band only inside its noise',
    file: 'packages/playtest/src/rules.ts',
    find: "if (delta - 2 * se > band) return { ok: false, side: 'above' };",
    replace: "if (delta > band) return { ok: false, side: 'above' };",
  },
  {
    label: 'cache: the fingerprint looks above the repo and hashes nothing (af533c1 — every rules change served stale numbers)',
    file: 'packages/bench/src/cache.ts',
    find: "const REPO = path.resolve(HERE, '../../..');",
    replace: "const REPO = path.resolve(HERE, '../../../..');",
  },
  {
    label: "balancer: the search AI's clamp goes out unchecked at the real depth (§26 — bone devils at PV 1)",
    file: 'packages/combat-balancer/src/index.ts',
    find: '  if (clamped && depth !== searchDepth) {',
    replace: '  if (false && clamped && depth !== searchDepth) {',
  },
  // --- The four-requirement rules (NEXT-STEPS §27.3) -------------------------
  {
    label: 'requirement 3: choosing matters on the point estimate, no error bar',
    file: 'packages/playtest/src/rules.ts',
    find: 'return meanCost + 2 * se >= bar;',
    replace: 'return meanCost >= bar;',
  },
  {
    label: 'regret: the choice cost forgets to cross-fit (winner\'s curse — noise reads as choice)',
    file: 'packages/bench/src/regret.ts',
    find: '  if (n < 2) return plain(branches.map(b => b.score));',
    replace: '  return plain(branches.map(b => b.score));',
  },
  {
    label: "regret: the gain when best is the winner's own lead (winner's curse — every best play looks decisive)",
    file: 'packages/bench/src/regret.ts',
    find: '  const ways = (branches[0]?.samples.length ?? 0) < 2',
    replace: '  const ways = true',
  },
  {
    label: 'requirement 3: call a card never right on the point estimate',
    file: 'packages/playtest/src/rules.ts',
    find: '  return gain + 2 * se < 0;',
    replace: '  return gain < 0;',
  },
  {
    label: 'regret: the gain when best is averaged per fight (twins read −2 PV)',
    file: 'packages/bench/src/regret.ts',
    find: '    const g = whenBest.length ? clusteredRatio(whenBest, o => o.gain) : null;',
    replace: '    const g = whenBest.length ? clusteredStderr(whenBest, o => o.gain) : null;',
  },
  {
    label: 'AI: a curse or a swallow is aimed at the enemy about to die (wasted)',
    file: 'packages/ai/src/policy.ts',
    find: "let s = def.actionType === ActionType.Atac ? 2 * (1 - pvFraction(e)) : 2 * pvFraction(e);",
    replace: "let s = 2 * (1 - pvFraction(e));",
  },
  {
    label: 'ENGINE wall: a bracing member is rolled like any other (lends its level, dodges the breach)',
    file: 'packages/engine/src/combat.ts',
    find: '      if (absorbs(g)) return { g, total: 0, absorbing: true };',
    replace: '      if (false) return { g, total: 0, absorbing: true };',
  },
  {
    label: 'ENGINE streams: an action resolves on the shared stream (the lookahead pairs nothing)',
    file: 'packages/engine/src/combat.ts',
    find: '    this.inSeatStream(this.actStream(cur.actor), () => this.resolveOne(cur));',
    replace: '    this.resolveOne(cur);',
  },
  {
    label: 'balancer: a real-depth fight already played is played again (the horde paid twice)',
    file: 'packages/combat-balancer/src/index.ts',
    find: '    decided.set(key, r);',
    replace: '    void decided;',
  },
  {
    label: 'AI: the evaluator ignores bodies standing (a guard that saves an ally is worthless)',
    file: 'packages/ai/src/lookahead.ts',
    find: 'w.bodies * bodyDiff',
    replace: '0 * bodyDiff',
  },
  {
    label: 'blind spot: a card is blind whatever the AI plays',
    file: 'packages/playtest/src/rules.ts',
    find: '&& playRate < BLIND_MAX_PLAY_RATIO * bestShare;',
    replace: '&& playRate >= 0;',
  },
  {
    label: 'AI: targets come from the rule alone, never searched (a deadly focus left to resolve)',
    file: 'packages/ai/src/lookahead.ts',
    find: 'samples: 6, passes: 1, topK: 0, targetSamples: 2 };',
    replace: 'samples: 6, passes: 1, topK: 0, targetSamples: 0 };',
  },
  {
    label: 'requirement 4: an edge holds on the point estimate',
    file: 'packages/playtest/src/rules.ts',
    find: 'return winrate - 2 * stderr(winrate, games) > 0.5;',
    replace: 'return winrate > 0.5;',
  },
  {
    label: 'requirement 4: the triangle holds when ANY edge does',
    file: 'packages/playtest/src/rules.ts',
    find: 'return { ok: broken.length === 0, broken };',
    replace: 'return { ok: broken.length < edges.length, broken };',
  },
  {
    label: 'armour sweet spot: only ask that a few wearers beat nobody',
    file: 'packages/playtest/src/rules.ts',
    find: 'const winner = interior.find(p => clearly(p, none) && clearly(p, all));',
    replace: 'const winner = interior.find(p => clearly(p, none));',
  },
  {
    label: 'armour sweet spot: judge the hump on point estimates',
    file: 'packages/playtest/src/rules.ts',
    find: 'a.winrate - b.winrate - 2 * deltaStderr(a.winrate, a.games, b.winrate, b.games) > 0;',
    replace: 'a.winrate - b.winrate > 0;',
  },
];

/**
 * Rebuild a package and everything downstream of it (the web app aside — it
 * has no tests to kill anything). False when the source does not COMPILE:
 * that mutant is invalid, not killed.
 */
function build(pkg: string): boolean {
  try {
    execFileSync('pnpm', ['--filter', `${pkg}...`, '--filter', '!@pimpampum/web', 'build'], { cwd: ROOT, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** Run the whole fast tier. True = all green, i.e. the mutant SURVIVED. */
function testsPass(): boolean {
  try {
    execFileSync(VITEST, ['run'], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, CI: '1', SLOW: '0' } });
    return true;
  } catch {
    return false;
  }
}

/**
 * NEVER MUTATE SOURCE FROM INSIDE A TEST RUN.
 *
 * `harnesses.slow.test.ts` executes every script in `src/` at two combats to prove
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
  for (const [file, text] of originals) fs.writeFileSync(path.join(ROOT, file), text);
  originals.clear();
}
// A crash mid-mutation must not leave the instrument mutated for the next
// person who runs anything.
process.on('exit', restoreAll);
process.on('SIGINT', () => { restoreAll(); process.exit(130); });

// `games()` is the package's one sample-size seam, and the smoke run turns it
// down to 2 — there is no sample here, so it is read as "how many mutants".
const LIMIT = Math.max(1, Math.min(MUTANTS.length, games(MUTANTS.length)));
const chosen = MUTANTS.slice(0, LIMIT);

console.log(`MUTATION TESTING · ${chosen.length}/${MUTANTS.length} mutants · kill set: the fast tier of every package\n`);

// The baseline must be GREEN, or every mutant reads as killed by a failure
// that was already there and the score is meaningless.
if (!testsPass()) {
  console.log('❌ the kill set does not pass UNMUTATED — fix that first; every score below would be a lie.');
  process.exit(1);
}

const survivors: string[] = [];
const invalid: string[] = [];
for (const m of chosen) {
  const abs = path.join(ROOT, m.file);
  const pkg = packageOf(m.file);
  const text = fs.readFileSync(abs, 'utf8');
  const hits = text.split(m.find).length - 1;
  if (hits !== 1) {
    // A mutant that does not apply is not a passing mutant — and printing a
    // skip let two of them silently leave the score when their code moved.
    // It is an INVALID mutant: fix it or delete it.
    console.log(`⚠️  INVALID (${hits} matches, need exactly 1): ${m.label}`);
    invalid.push(m.label);
    continue;
  }
  originals.set(m.file, text);
  fs.writeFileSync(abs, text.replace(m.find, m.replace));
  const compiles = build(pkg);
  const survived = compiles && testsPass();
  restoreAll();
  build(pkg);   // put the real source back before the next mutant
  if (!compiles) { console.log(`⚠️  INVALID (does not compile) ${m.label}`); invalid.push(m.label); continue; }
  console.log(`${survived ? '💀 SURVIVED' : '✅ killed  '}  ${m.label}`);
  if (survived) survivors.push(m.label);
}

const scored = chosen.length - invalid.length;
const killed = scored - survivors.length;
console.log(`\nmutation score: ${killed}/${scored}${invalid.length ? ` (${invalid.length} invalid — fix the mutant, it scores nothing)` : ''}`);
if (survivors.length) {
  console.log('\nSURVIVORS — each one is a fault the suite would not notice:');
  for (const s of survivors) console.log(`  · ${s}`);
}
if (survivors.length || invalid.length) process.exitCode = 1;
