import { Character, DiceRoll, EffectHandler, StatusBehavior } from '@pimpampum/engine';
import { ActionType } from '@pimpampum/engine';
import { action, d } from '../types.js';
import { num } from '../effects/helpers.js';

/**
 * Mur de pedra — a SHARED CARD (see cards/index.ts): one mechanics+text source,
 * instantiated per skill via `standingWallAction` (Earthbender, Gòlem de
 * Pedra…). A persistent wall raised on the guarded ally: this round the caster
 * guards normally; afterwards the `mur-de-pedra` status takes over (the
 * generic standingGuard seam) — every attack on the protected is contested
 * against the CASTER's roll of this card's dice, and the first blow that
 * penetrates shatters the wall. ONE wall per ally (shared status key),
 * whoever casts it.
 */
const MUR: StatusBehavior = {
  standingGuard(ctx) {
    const data = ctx.entry.data ?? {};
    const caster = data.caster as Character | undefined;
    if (!caster || !caster.isAlive()) { ctx.holder.clearStatus(ctx.key); return; }
    const roll = ctx.engine.rollDiceFor(caster, data.dice as DiceRoll | undefined, 'defense');
    return roll + caster.getRollBonus((data.skillId as string) ?? '', 'defense') + num(data, 'bonus', 0);
  },
  onStandingGuardBroken(ctx) {
    ctx.holder.clearStatus(ctx.key);
    ctx.engine.log('defense', `El mur de pedra que protegia ${ctx.holder.name} es fa miques!`, ctx.holder.team);
  },
};

export const STANDING_WALL_EFFECTS: Record<string, EffectHandler> = {
  // Raise the persistent wall on the guarded ally (rides the Defensa flow).
  standing_wall: {
    onResolve(ctx) {
      for (const t of ctx.targets) {
        if (t.team !== ctx.source.team) continue; // walls rise for allies, not blocked enemies
        t.setStatus('mur-de-pedra', 1, -1,
          { caster: ctx.source, bonus: ctx.action.rollBonus ?? 0, dice: ctx.action.dice, skillId: ctx.action.skillId }, MUR);
        ctx.engine.log('defense', `Un mur de pedra s'alça davant ${t.name} — i s'hi queda.`, t.team);
      }
    },
    aiWeight(ctx) {
      // Walls don't advance the win condition — worth it for a wounded,
      // unwalled ally; a poor default otherwise (overplaying stalls fights).
      const unwalled = [ctx.actor, ...ctx.allies].filter(a => !a.hasStatus('mur-de-pedra'));
      if (unwalled.length === 0) return -10;
      return unwalled.some(a => a.currentPV < a.maxPV * 0.6) ? 1.0 : -1.5;
    },
  },
};

/** Stamp a skill's own instance of the shared Mur de pedra card. */
export function standingWallAction(opts: { skillId: string; unlock: number; icon?: string }) {
  return action({
    id: 'mur-de-pedra', name: 'Mur de pedra', skillId: opts.skillId, unlock: opts.unlock,
    type: ActionType.Defensa, speed: 0, dice: d(2, 10), fatigueCost: 3,
    effects: [{ type: 'standing_wall' }],
    desc: 'El mur persisteix: mentre és dret, els atacs contra el protegit es resolen contra la teva defensa. El primer atac que el travessa el destrueix.',
    icon: opts.icon ?? 'delapouite/stone-wall.svg',
  });
}
