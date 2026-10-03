/**
 * BUDGETS FOR THE PIPELINE CONTROLS, shared by every `controls-*` file.
 *
 * One file per control because vitest parallelises by FILE: nine analyses in
 * one file ran on one core while the rest of the machine idled. Splitting only
 * works because the budgets live here — a control that quietly used a
 * different sample than its neighbours would be a different experiment wearing
 * the same name.
 *
 * EVERY BLOCK PAYS ONLY FOR THE REQUIREMENT IT ASSERTS, and skips measuring the
 * rest (`skip`): `analyze` computes all seven requirements whatever you came
 * for, and 4/5 and 3c are most of the bill.
 *
 * EVERY NUMBER GOES THROUGH `games()`, so `GAMES=2` turns the whole suite down
 * to a smoke run. The first version hard-coded them, and a "smoke" run of the
 * controls took as long as a real one.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { games, SMOKE } from '@pimpampum/bench';
import { analyzeIsolated, type AnalyzeBudget, type ControlName, type KitReport } from '../src/index.js';

export { SMOKE };

/** Small, because every effect asserted here is huge by construction. */
export const CHEAP = { mindlessGames: games(80), oneTrickGames: games(80), cardValueGames: games(40) };
export const NO_CARDS = ['cardValue'] as const;
export const NO_TRICK = ['oneTrick'] as const;
export const NEITHER = ['cardValue', 'oneTrick'] as const;
/** 3c's bar is four times finer than 3's and needs its own sample (§19.1). */
/**
 * 3c's bar is four times finer than 3's, and a control must sit well clear of
 * the bar it tests, not merely resolve it. The arms desynchronise their dice
 * once a choice differs, so they are close to independent samples, and a TRUE
 * margin of zero reads as noise around zero: measured +1.4pp±2.5 at 800 an arm
 * and +2.5pp±1.6 at 2,000 — both "passing" a 5pp bar the kit cannot clear. At
 * 5,000 the 1σ is about a point, and a zero margin fails it with room to spare.
 */
export const FOR_3C: AnalyzeBudget = { ...CHEAP, oneTrickGames: games(5000), skip: [...NO_CARDS] };
/**
 * 4/5 is per-DECISION, so it needs fights, not verify passes. Tripled on
 * 2026-09-23: once card-value fights took the production AI's targeting (F13),
 * a do-nothing card read dead under two opponent models of three at 240 —
 * resolved, but not clear of the bar, which is what a control must be.
 */
export const FOR_CARDS: AnalyzeBudget = { ...CHEAP, cardValueGames: games(720), skip: [...NO_TRICK] };
export const GAMES = games(160);

/** The synthetic set, as the isolated child loads it. */
export const SYNTHETIC_MODULE = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../node_modules/@pimpampum/bench/dist/testing.js');

/**
 * Analyse a control kit as a player subject, in its own process (see
 * `analyzeIsolated` — a minutes-long synchronous analysis inside a vitest
 * worker fails the run on an RPC timeout, whatever the assertions say).
 */
export function run(
  control: ControlName, args: unknown[] = [], sweepGames = GAMES,
  budget: AnalyzeBudget = { ...CHEAP, skip: [...NEITHER] },
): Promise<KitReport> {
  return analyzeIsolated({
    set: { module: SYNTHETIC_MODULE, export: 'SYNTHETIC' },
    subject: { control, args }, games: sweepGames, budget,
  });
}

/** A card's id in a report, by the name the control kit gave it. */
export function cardId(r: KitReport, name: string): string {
  const card = r.cards.find(c => c.name === name);
  if (!card) throw new Error(`no card named ${name} in the report`);
  return card.id;
}

/** What every control file checks even in a smoke run: the pipeline produced a
 *  whole report about the kit it was given. */
export function expectWellFormed(r: KitReport, kitCards: number): void {
  if (r.cards.length !== kitCards) throw new Error(`report is about ${r.cards.length} cards, not ${kitCards}`);
  if (r.levels.length !== kitCards) throw new Error(`report swept ${r.levels.length} levels, not ${kitCards}`);
  for (const v of [r.monotonicity, r.duration, r.spam, r.strategySpace, r.oneTrick, r.cardUse, r.autoInclude, r.strength, r.correlation]) {
    if (typeof v.ok !== 'boolean' || !v.detail) throw new Error('a verdict came back empty');
  }
}
