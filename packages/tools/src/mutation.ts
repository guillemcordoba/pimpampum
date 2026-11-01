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
 * IN A TEMPORARY WORKTREE, never the checkout you work in. It used to patch
 * the live tree and restore it on exit, so anything run beside it (a build, a
 * measurement) could read a mutated instrument, and a killed run left one
 * behind. Now it copies HEAD plus your tracked changes (`git stash create`,
 * which leaves the stash list alone) into a fresh worktree, installs and
 * builds there, mutates only that copy, and removes it at the end. Untracked
 * files are not copied: `git add` a new file first.
 *
 * Run: pnpm --filter @pimpampum/tools exec tsx src/mutation.ts
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { games } from '@pimpampum/bench';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MUTANTS } from './mutants.js';

/** The checkout this script lives in; it is never written to. */
const CHECKOUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
/** The throwaway worktree every mutant lands in (set once it exists). */
let ROOT = CHECKOUT;
const vitest = (): string => path.join(ROOT, 'node_modules', '.bin', 'vitest');

/** The workspace package a file belongs to, for the rebuild filter. */
function packageOf(file: string): string {
  let dir = path.dirname(path.join(ROOT, file));
  while (!fs.existsSync(path.join(dir, 'package.json'))) dir = path.dirname(dir);
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name;
}


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
    execFileSync(vitest(), ['run'], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, CI: '1', SLOW: '0' } });
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

const git = (...args: string[]): string => execFileSync('git', args, { cwd: CHECKOUT, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
const snapshot = git('stash', 'create') || 'HEAD';
ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'pimpampum-mutation-'));
git('worktree', 'add', '--detach', ROOT, snapshot);
function removeWorktree(): void {
  try { git('worktree', 'remove', '--force', ROOT); } catch { fs.rmSync(ROOT, { recursive: true, force: true }); }
}
process.on('exit', removeWorktree);
process.on('SIGINT', () => process.exit(130));
console.log(`MUTATION TESTING · working copy: ${ROOT} (${snapshot === 'HEAD' ? 'HEAD' : 'HEAD + tracked changes'})`);
execFileSync('pnpm', ['install', '--offline', '--frozen-lockfile'], { cwd: ROOT, stdio: 'pipe' });
execFileSync('pnpm', ['--filter', '!@pimpampum/web', 'build'], { cwd: ROOT, stdio: 'pipe' });

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
