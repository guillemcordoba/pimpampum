/**
 * VANILLA FIGHTS, printed (playtest `vanilla.ts`, bench `kitOnlyMirrors`): the
 * game's structure with no real card in it — 2v2 heroes holding their level's
 * ladder attack, ladder defense and an Aim (a Focus worth a doubled blow),
 * played by the production AI — swept over PV at each checkpoint, beside what
 * the arithmetic (`feasibility`) predicts. Settle the PV curve and the ladder
 * here; read real kits against it.
 *
 *   pnpm --filter @pimpampum/tools exec tsx src/vanilla.ts --set elements
 *   … --levels 3,6,10 --pv 26,20,16,12 --aim 1
 *   … --defense-shift -2   each level's defense from two rungs lower (a smaller premium)
 */
import { flag, games, kitOnlyMirrors, useSet } from '@pimpampum/bench';
import { feasibility, vanillaKit, vanillaPrint, withControlKit, type LadderRung } from '@pimpampum/playtest';
import { chosenSet } from './sets.js';

const SET = await chosenSet();
useSet(SET.gameSet);
const { ATTACK_LADDER, DEFENSE_LADDER } = SET.root;
const levels = (flag('--levels') ?? '3,6,10').split(',').map(Number);
const pvs = (flag('--pv') ?? '26,20,16,12').split(',').map(Number);
const aim = Number(flag('--aim') ?? 1);
const shift = Number(flag('--defense-shift') ?? 0);
const fights = games(60);
const rung = (l: number): LadderRung => ({ attack: ATTACK_LADDER[l], defense: DEFENSE_LADDER[Math.max(1, Math.min(10, l + shift))] });

const pct = (x: number) => `${Math.round(100 * x)}%`.padStart(4);
console.log(`Vanilla 2v2 (ladder attack, ladder defense${shift ? ` ${shift} rungs` : ''}, Aim ×${aim}), ${fights} fights a cell, the production AI`);
console.log(`level   PV  median  p90  stalls  PV/round  empty atk  mix A/D/F        arithmetic (mix)`);
for (const level of levels) {
  for (const pv of pvs) {
    const kit = vanillaKit(level, rung(level), aim);
    const r = withControlKit(kit, def => kitOnlyMirrors(def.id, vanillaPrint(def), level, pv, fights));
    const [model] = feasibility({ ladder: { [level]: rung(level) }, pv, armour: 1, teamSize: 2, mix: { attack: r.mix.attack, defense: r.mix.defense } }, [level], 6);
    console.log(`L${String(level).padEnd(3)} ${String(pv).padStart(4)}  ${String(r.median).padStart(6)} ${String(r.p90).padStart(4)}  ${pct(r.stalls).padStart(6)}  ${r.pvPerRound.toFixed(1).padStart(8)}  ${pct(r.emptyAttacks).padStart(9)}  ${pct(r.mix.attack)}/${pct(r.mix.defense)}/${pct(r.mix.focus)}   ${model.mixRounds.toFixed(1)} rounds`);
  }
}
