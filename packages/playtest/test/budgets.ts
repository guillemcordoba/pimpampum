/**
 * BUDGETS FOR THE PIPELINE CONTROLS, shared by every `controls-*` file.
 *
 * One file per control because vitest parallelises by FILE: nine analyses in
 * one file ran on one core while the rest of the machine idled. Splitting only
 * works because the budgets live here — a control that quietly used a
 * different sample than its neighbours would be a different experiment wearing
 * the same name.
 *
 * EVERY BLOCK PAYS ONLY FOR THE REQUIREMENT IT ASSERTS: requirement 3's card
 * value is most of the bill, so the controls for 1 and 2 skip it.
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
export const CHEAP: AnalyzeBudget = { cardValueGames: games(40) };
export const NO_CARDS = ['cardValue'] as const;
/** Requirement 3 is per-DECISION, so it needs fights: at 720 the combo's cost
 *  sits several σ clear of zero, and the twins' ±0.13 resolves "nothing". */
export const FOR_CARDS: AnalyzeBudget = { cardValueGames: games(720) };
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
  budget: AnalyzeBudget = { ...CHEAP, skip: [...NO_CARDS] },
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
  if (r.fullKit.games <= 0) throw new Error('the full-kit run played no fights');
  for (const v of [r.duration, r.strength, r.choices]) {
    if (typeof v.ok !== 'boolean' || !v.detail) throw new Error('a verdict came back empty');
  }
}
