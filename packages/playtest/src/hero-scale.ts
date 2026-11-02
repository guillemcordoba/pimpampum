/**
 * HERO SCALE, judged: bench's `heroScaleRun` at a level, and the rule that a
 * fast attack stays weak unless something answers it (`fastAttackVerdict`).
 * Set-level, like the triangle: it is about heroes meeting heroes, which no
 * kit cell (heroes against creatures) shows.
 */
import { games as sized, heroScaleRun, type HeroScaleRun } from '@pimpampum/bench';
import { fastAttackVerdict, HERO_SCALE_GAMES } from './rules.js';

export interface HeroScaleReport extends HeroScaleRun {
  fastAttacks: { ok: boolean; broken: string[]; unjudged: string[] };
}

export function measureHeroScale(level: number, games = sized(HERO_SCALE_GAMES)): HeroScaleReport {
  const run = heroScaleRun(level, games);
  return { ...run, fastAttacks: fastAttackVerdict(run.cards, run.fastDefense) };
}
