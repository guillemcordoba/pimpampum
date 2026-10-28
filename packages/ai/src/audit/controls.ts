/**
 * HAND-MADE CONTROLS — positions whose equilibrium is known by arithmetic.
 *
 * Fixed dice (`3d1` always rolls 3) so the arithmetic is exact. Each comes in
 * a pair where it can: the multi-round card that is the play ONLY because the
 * fight lasts long enough for it to pay, and its twin, where the fight ends
 * before it pays and a plain blow is right. The tests hold the referee to
 * these; the harness also asks the AI every one of them.
 */
import type { CardSpec, FighterSpec, Position } from './position.js';

const fixed = (n: number, fast = false): CardSpec => ({ arch: 'strike', p: { n, s: 1, fast: fast ? 1 : 0, fatigue: 0 } });
const fighter = (name: string, pv: number, cards: CardSpec[], maxPv = pv): FighterSpec =>
  ({ name, maxPv, pv, armour: 0, level: 0, fatigue: 0, cards });

function control(id: string, horizon: number, roundsLeft: number, hero: FighterSpec, foe: FighterSpec): Position {
  return { id, roundsLeft, teams: [[hero], [foe]], tags: { shape: '1x1', horizon, side: 'hero', control: id } };
}

// Fast, so the foe's blow cannot interrupt them the round they are set up.
const device: CardSpec = { arch: 'device', p: { dmg: 4, rounds: 3, fast: 1, priced: 1 } };
const bomb: CardSpec = { arch: 'bomb', p: { dmg: 8, fast: 1, priced: 1 } };

export interface Control {
  position: Position;
  /** The hero's equilibrium card (pure), by archetype. */
  answer: string;
  /** The game value, PV hero minus PV foe. */
  value: number;
}

export const CONTROLS: Control[] = [
  // 3 rounds: played now, the device ticks 3×4 = 12 and the hero still
  // strikes twice (6): foe 30−18 = 12, hero 20−9 = 11 → −1. A round later it
  // ticks only twice (14 in all); striking every round, 9 → −10.
  { position: control('device-long', 3, 3, fighter('H', 20, [fixed(3, true), device]), fighter('F', 30, [fixed(3)])), answer: 'device', value: -1 },
  // The foe has 3 PV: the strike (fast) fells it before it swings → +20.
  // The device would fell it too, at the round's end, after its blow → +17.
  { position: control('device-short', 3, 3, fighter('H', 20, [fixed(3, true), device]), fighter('F', 3, [fixed(3)])), answer: 'strike', value: 20 },
  // 2 rounds: the bomb (8) lands as round 2 opens, then a strike → 11 against
  // two strikes' 6 (a bomb played in round 2 never lands). Foe 19, hero 14 →
  // −5; strikes only: −10.
  { position: control('bomb-long', 2, 2, fighter('H', 20, [fixed(3, true), bomb]), fighter('F', 30, [fixed(3)])), answer: 'bomb', value: -5 },
  // Foe on 3 PV: strike now → +20; the bomb lands only after its blow → +17.
  { position: control('bomb-short', 2, 2, fighter('H', 20, [fixed(3, true), bomb]), fighter('F', 3, [fixed(3)])), answer: 'strike', value: 20 },
  // The foe's fast bomb (20) would fell the hero as round 2 opens; only the
  // fast jab, ahead of it in the fast step, interrupts the focus. Then slam in round 2 (a bomb planted then
  // lands after the cut): hero 10, foe 50−1−5 → −34. Slamming first lets the
  // bomb through: the hero falls, foe 45 → −45.
  {
    position: control('interrupt-delayed', 2, 2,
      fighter('H', 10, [{ arch: 'jab', p: { n: 1, s: 1, fast: 1, fatigue: 0 } }, fixed(5)]),
      fighter('F', 50, [{ arch: 'bomb', p: { dmg: 20, fast: 1, priced: 1 } }])),
    answer: 'jab', value: -34,
  },
  // A 20-point slam would fell the 10-PV hero; the hide (fast, a fatigue
  // level each time) dodges it. Hide twice: hero 10, foe 30 → −20.
  // Claw first: foe 24, the hero falls → −24. Hide then claw (5, fatigued):
  // foe 25, the hero falls → −25.
  {
    position: control('hide-long', 1, 2,
      fighter('H', 10, [fixed(6, true), { arch: 'hide', p: { fast: 1, fatigue: 1 } }]),
      fighter('F', 30, [fixed(20)])),
    answer: 'hide', value: -20,
  },
  // The foe has 6 PV: the claw (fast) fells it before the slam → +10.
  // Hiding first leaves the hero fatigued, and a fatigued claw (5) no longer
  // fells it before the slam next round.
  {
    position: control('hide-short', 1, 2,
      fighter('H', 10, [fixed(6, true), { arch: 'hide', p: { fast: 1, fatigue: 1 } }]),
      fighter('F', 6, [fixed(20)])),
    answer: 'strike', value: 10,
  },
  // The long pair again with statuses that do NOT price themselves
  // (`positionValue`), as an unpriced real card would be: same game, same
  // answer — what changes is only what the AI's evaluator can see.
  { position: control('device-long-unpriced', 3, 3, fighter('H', 20, [fixed(3, true), { arch: 'device', p: { ...device.p, priced: 0 } }]), fighter('F', 30, [fixed(3)])), answer: 'device', value: -1 },
  { position: control('bomb-long-unpriced', 2, 2, fighter('H', 20, [fixed(3, true), { arch: 'bomb', p: { ...bomb.p, priced: 0 } }]), fighter('F', 30, [fixed(3)])), answer: 'bomb', value: -5 },
];
