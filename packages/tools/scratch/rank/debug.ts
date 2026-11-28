// SCRATCH: one matchup of fixed strategies on a control kit, with scores.
// bench-exempt(seeded): seeds are explicit.
import { always, type Plan } from '@pimpampum/bench';
import { play, type ControlKitSpec, type Match } from './play.js';
import { controlHero, fightLength } from './common.js';

const kit = JSON.parse(process.argv[2]) as ControlKitSpec;
const plans = process.argv.slice(3) as Plan[];
for (const x of plans) for (const y of plans) {
  if (x >= y) continue;
  const heroes = [controlHero(kit.id), controlHero(kit.id)];
  const m: Match[] = Array.from({ length: 120 }, (_, i) => (i % 2
    ? { a: { heroes, style: `S:${JSON.stringify(always(y))}` }, b: { heroes, style: `S:${JSON.stringify(always(x))}` }, seed: 900 + i }
    : { a: { heroes, style: `S:${JSON.stringify(always(x))}` }, b: { heroes, style: `S:${JSON.stringify(always(y))}` }, seed: 900 + i }));
  const p = await play(m, [kit]);
  const s = p.reduce((t, r, i) => t + (i % 2 ? 1 - r.s : r.s), 0) / p.length;
  console.log(`${x} against ${y}: ${(100 * s).toFixed(0)}%  (${fightLength(p)})`);
}
