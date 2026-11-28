// SCRATCH: what the encounter solver answers for the fights the creature rating was asked about (the reference party, 60%).
// bench-exempt(seeded): the solver seeds itself.
import { useSet } from '@pimpampum/bench';
import { ELEMENTS } from '@pimpampum/set-elements/bench';

useSet(ELEMENTS);
const level = Number(process.argv[2] ?? 6);
const reference = ['waterbender', 'earthbender', 'firebender', 'airbender'];
const shapes: [string, number][] = [['soldat-del-foc', 7], ['shirshu', 2], ['unagi', 3], ['arquer-yuyan', 2]];
for (const [s, count] of shapes) {
  const started = Date.now();
  const solved = ELEMENTS.solveEncounter([{ enemyId: s, count }], { characters: reference.map((k, i) => ELEMENTS.hero(`Heroi ${i + 1}`, k, level)) }, 0.6);
  console.log(`level ${level}, ${s} ×${count}: the solver says PV ${solved?.groups[0]?.pv ?? 'none'}${solved?.clamped ? ' (clamped)' : ''}${solved?.durationCapped ? ' (held back by the fight-length cap)' : ''} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}
