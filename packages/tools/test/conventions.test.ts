/**
 * THE ANTI-DRIFT GUARD — conventions every package is held to, asserted on the
 * source rather than trusted to review.
 *
 * Every defect this file checks for was a real one, and every one of them was
 * SILENT: the harnesses kept printing numbers, the numbers were simply about
 * something other than what the report said. A convention nobody can violate
 * by accident is worth more here than a convention written down: the cost of a
 * wrong number is a content decision made on it.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PACKAGES = path.join(REPO, 'packages');

/** Every package's source directory, by a short name (`bench`, `sets/fantasy`). */
function packageDirs(): [name: string, dir: string][] {
  const out: [string, string][] = [];
  for (const e of fs.readdirSync(PACKAGES, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name === 'web') continue;
    if (e.name === 'sets') {
      for (const s of fs.readdirSync(path.join(PACKAGES, 'sets'), { withFileTypes: true })) {
        if (s.isDirectory()) out.push([`sets/${s.name}`, path.join(PACKAGES, 'sets', s.name)]);
      }
    } else out.push([e.name, path.join(PACKAGES, e.name)]);
  }
  // A directory is a package when it says so; `.bench-cache` and friends are not.
  return out.filter(([, dir]) => fs.existsSync(path.join(dir, 'package.json')));
}

/**
 * THE SOURCE THESE RULES GOVERN — every package's `src/`, found by walking,
 * so a new package is governed the day it appears. (The first version listed
 * its roots by hand, and after a package move it went on watching the
 * leftovers — the failure these rules exist to prevent, applied to the rules.)
 * `rel` is package-qualified, so a failure names a file you can open.
 */
function sources(): { rel: string; text: string }[] {
  const out: { rel: string; text: string }[] = [];
  const walk = (prefix: string, dir: string, base: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(prefix, full, base);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) {
        out.push({ rel: `${prefix}/${path.relative(base, full)}`, text: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  for (const [name, dir] of packageDirs()) walk(name, path.join(dir, 'src'), path.join(dir, 'src'));
  return out;
}

/** A top-level harness: a script someone runs, as opposed to a module it
 *  imports. Only harnesses print reports or choose sample sizes. */
function isHarness(rel: string): boolean {
  return /^tools\/[^/]+\.ts$/.test(rel);
}

/** Source with comments stripped, so a rule about CODE is not tripped by prose
 *  describing the rule. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/**
 * ESCAPE HATCH, WITH A REASON ATTACHED.
 *
 * Some files genuinely should not obey one of these rules — a harness that
 * computes exact probabilities from convolved dice has no sampling error to
 * quote, and a mechanics seam test has no AI to set a depth for. A rule with
 * no way out gets deleted the first time it is inconvenient; a rule you can
 * only escape by writing down WHY survives.
 *
 *   // bench-exempt(interval): exact convolved-dice probabilities, not a sample
 *
 * The reason is required and is asserted to be substantive, so the hatch
 * cannot become a silent `// eslint-disable`.
 */
const MIN_REASON = 20;
function exemption(text: string, rule: string): string | null {
  const m = text.match(new RegExp(`bench-exempt\\(${rule}\\):\\s*(.+)`));
  return m ? m[1].trim() : null;
}

/** Files subject to `rule`, plus the reasons given by those that opted out. */
function subjectTo(rule: string): { files: { rel: string; text: string }[]; reasons: [string, string][] } {
  const files: { rel: string; text: string }[] = [];
  const reasons: [string, string][] = [];
  for (const s of sources()) {
    const why = exemption(s.text, rule);
    if (why) reasons.push([s.rel, why]);
    else files.push(s);
  }
  return { files, reasons };
}

describe('the escape hatch cannot be used silently', () => {
  it('every exemption gives a substantive reason', () => {
    for (const rule of ['seeded', 'depth', 'interval', 'sample']) {
      for (const [rel, why] of subjectTo(rule).reasons) {
        expect(why.length, `${rel}: bench-exempt(${rule}) needs a real reason, got "${why}"`)
          .toBeGreaterThanOrEqual(MIN_REASON);
      }
    }
  });
});

describe('every harness can be turned down to nothing', () => {
  /*
   * CLAUDE.md: every harness reads its sample size through bench's `games()`,
   * never a hardcoded const — a harness nobody can run cheaply is one nobody
   * runs, and one nobody runs rots in silence. This rule was written down and
   * not enforced for a while, and two harnesses quietly stopped obeying it.
   */
  it('reads its sample size through @pimpampum/bench, or says why not', () => {
    for (const s of subjectTo('sample').files) {
      if (!isHarness(s.rel)) continue;
      expect(
        /@pimpampum\/bench/.test(s.text),
        `${s.rel}: hardcodes its sample size. Read it through games() so GAMES=2 can turn it `
        + 'down, or add a bench-exempt(sample) line saying why it has no sample to turn down.',
      ).toBe(true);
    }
  });
});

describe('the reference party is one thing', () => {
  it('nobody re-derives it by position in the catalogue', () => {
    // `MAINS.slice(0, 4)` was copy-pasted into seven files; reordering the
    // catalogue swapped the benchmark out from under every number, silently.
    for (const s of sources()) {
      expect(code(s.text), `${s.rel}: re-derives the reference party positionally — use referenceParty()`)
        .not.toMatch(/\.slice\(0,\s*4\)/);
    }
  });
});

describe('randomness is seeded', () => {
  it('nothing in src draws from bare Math.random()', () => {
    // An unseeded arm inside a `withSeed` block is the worst case: it LOOKS
    // reproducible, shares no random numbers with the arm it is compared
    // against, and quietly widens every difference the harness reports.
    // play.ts is the one exception — it deliberately replaces the global with a
    // seeded LCG so a hand-played script always replays the same game.
    const offenders = subjectTo('seeded').files
      .filter(s => /Math\.random\s*\(/.test(code(s.text)))
      .map(s => s.rel);
    expect(offenders, `use random() from @pimpampum/engine instead: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('AI depth is never implicit', () => {
  it('every CombatEngine is handed an explicit policy', () => {
    // The engine defaults aiDepth to 0. The balancer prices at 1. A harness
    // that omits the option therefore measures weaker play than the number it
    // is checking was made with — which is exactly how main.ts came to grade
    // depth-1 solves with depth-0 play, for as long as that file existed.
    // An actionChooser satisfies the rule because it bypasses aiDepth entirely.
    const offenders: string[] = [];
    for (const s of subjectTo('depth').files) {
      const stripped = code(s.text);
      // SCAN A WINDOW, NOT A BRACE GROUP. This used to match the first
      // `{...}` after `new CombatEngine(`, which worked while the option was a
      // flat `aiDepth: 1`. Once the policy arrived as `...aiPolicy({ depth: 1 })`
      // the inner braces made that regex capture the WRONG object — the
      // `{ depth: 1 }` — and every correct call site read as an offender. A
      // window is clumsier and cannot be fooled by nesting.
      for (const m of stripped.matchAll(/new CombatEngine\(/g)) {
        const window = stripped.slice(m.index, m.index + 260);
        if (!/aiPolicy|actionChooser/.test(window)) {
          offenders.push(`${s.rel}: ${window.replace(/\s+/g, ' ').slice(0, 90)}`);
        }
      }
    }
    expect(offenders, `state the depth explicitly:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });
});

describe('no winrate is printed without its error bar', () => {
  it('percentages go through bench/report.ts', () => {
    // Before this rule only experiment-seat.ts quoted an interval; everything
    // else printed one decimal of false precision, and a 2pp difference off 300
    // games read as a finding.
    const offenders: string[] = [];
    for (const s of subjectTo('interval').files) {
      if (!isHarness(s.rel)) continue;
      for (const m of code(s.text).matchAll(/toFixed\(\d\)[^`'"\n]{0,12}%/g)) {
        offenders.push(`${s.rel}: ${m[0]}`);
      }
    }
    expect(
      offenders,
      `format winrates with pct()/pctCoarse()/deltaPP() from bench/report.ts:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});

/**
 * THE LAYERS ONLY LOOK DOWN.
 *
 * The engine is the rules and knows no content; the AI is an instrument and
 * knows no content; bench, the balancer and playtest measure whatever set is
 * INSTALLED and must never reach for one. A single import of a set from any of
 * them welds the instrument to one game again — which is what `GameSet` was
 * built to undo — and it compiles without complaint. So it is checked here, on
 * both the declared dependencies and the actual imports (an import that works
 * only because pnpm happened to hoist a package is still a wrong edge).
 */
const ALLOWED: Record<string, string[]> = {
  engine: [],
  ai: ['engine'],
  'combat-balancer': ['engine', 'ai'],
  bench: ['engine', 'ai', 'combat-balancer'],
  playtest: ['engine', 'bench'],
  'sets/fantasy': ['engine', 'ai', 'bench', 'combat-balancer'],
};

describe('the layers only look down', () => {
  const npmName = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name as string;
  const byNpm = new Map(packageDirs().map(([name, dir]) => [npmName(dir), name]));

  it.each(Object.entries(ALLOWED))('%s depends only on the layers beneath it', (pkg, allowed) => {
    const dir = packageDirs().find(([n]) => n === pkg)![1];
    const deps = Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).dependencies ?? {})
      .filter(d => d.startsWith('@pimpampum/')).map(d => byNpm.get(d) ?? d);
    expect(deps.filter(d => !allowed.includes(d)), `${pkg} declares a dependency on a layer above it`).toEqual([]);
  });

  it('no source imports a package it does not declare', () => {
    const offenders: string[] = [];
    for (const [name, dir] of packageDirs()) {
      const pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      const declared = new Set([...Object.keys(pj.dependencies ?? {}), pj.name]);
      for (const s of sources().filter(x => x.rel.startsWith(`${name}/`))) {
        for (const m of code(s.text).matchAll(/from '(@pimpampum\/[^/']+)[^']*'/g)) {
          if (!declared.has(m[1])) offenders.push(`${s.rel} imports ${m[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("a set's content entry stays browser-safe: no Node, and no bench beyond its types", () => {
    // The web app bundles `@pimpampum/set-fantasy`. Its measurement adapter
    // (`./bench`) is Node-only and lives behind its own entry point.
    const offenders = sources()
      .filter(s => s.rel.startsWith('sets/') && !/^sets\/[^/]+\/bench\//.test(s.rel))
      .filter(s => /from 'node:/.test(s.text) || /from '@pimpampum\/bench'/.test(code(s.text)))
      .map(s => s.rel);
    expect(offenders).toEqual([]);
  });
});
