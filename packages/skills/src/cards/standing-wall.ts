import { Character, DiceRoll, EffectHandler, StatusBehavior } from '@pimpampum/engine';
import { ActionType } from '@pimpampum/engine';
import { action, d } from '../types.js';
import { num, str, diceParam } from '../effects/helpers.js';

/**
 * STANDING COVER — a SHARED CARD (see cards/index.ts): one mechanics+text
 * source, instantiated per skill via `standingCoverAction` (the Earthbender's
 * and the Gòlem's Mur de pedra, the Enginyer's Barricada…). A persistent cover
 * raised on the guarded ally: this round the caster guards normally; afterwards
 * the cover's own status takes over (the generic standingGuard seam) — every
 * attack on the protected is contested against the CASTER's roll of this card's
 * dice. The cover has LIFE of its own, rolled when it goes up (its own `life`
 * knob, so staying power and the roll it defends with tune apart): a blow that
 * penetrates does not flatten it — the cover eats the damage instead of the
 * protected ally, and only collapses once its life runs out (any excess carries
 * through to the ally). ONE cover of each kind per ally (the status key is the
 * card's), whoever raises it.
 */
const COVER: StatusBehavior = {
  standingGuard(ctx) {
    const data = ctx.entry.data ?? {};
    const caster = data.caster as Character | undefined;
    if (!caster || !caster.isAlive()) { ctx.holder.clearStatus(ctx.key); return; }
    const roll = ctx.engine.rollDiceFor(caster, data.dice as DiceRoll | undefined, 'defense');
    return roll + caster.getRollBonus((data.skillId as string) ?? '', 'defense') + num(data, 'bonus', 0);
  },
  // A blow got through the contest: flag it, so the damage the engine is about
  // to apply is charged to the cover's life rather than to the ally.
  onStandingGuardBroken(ctx) {
    const data = ctx.entry.data ?? {};
    data.breaching = true;
    ctx.engine.log('defense', `L'atac esquerda ${str(data, 'label', 'la cobertura')} que protegeix ${ctx.holder.name}.`, ctx.holder.team);
  },
  // Only damage that just breached this cover is soaked (a burn or a lava river
  // eats the ally, not the stone).
  modifyIncomingDamage(ctx, damage) {
    const data = ctx.entry.data ?? {};
    if (!data.breaching) return damage;
    data.breaching = false;
    const absorbed = Math.min(num(data, 'life', 0), damage);
    const left = num(data, 'life', 0) - absorbed;
    data.life = left;
    const label = str(data, 'label', 'la cobertura');
    if (left > 0) {
      ctx.engine.log('defense', `${label} aguanta ${absorbed} de dany (li queden ${left} de vida).`, ctx.holder.team);
    } else {
      ctx.holder.clearStatus(ctx.key);
      ctx.engine.log('defense', `${label} que protegia ${ctx.holder.name} cau feta miques!`, ctx.holder.team);
    }
    return damage - absorbed;
  },
};

/** Life left in the cover `key` standing in front of `c`, 0 if there is none. */
function coverLife(c: Character, key: string): number {
  const entry = c.statusRefs().find(r => r.key === key)?.entry;
  return entry ? num(entry.data ?? {}, 'life', 0) : 0;
}

export const STANDING_WALL_EFFECTS: Record<string, EffectHandler> = {
  // Raise the persistent cover on the guarded ally (rides the Defensa flow).
  standing_wall: {
    onResolve(ctx) {
      const key = str(ctx.params, 'key', 'mur-de-pedra');
      const label = str(ctx.params, 'label', 'el mur de pedra');
      for (const t of ctx.targets) {
        if (t.team !== ctx.source.team) continue; // cover rises for allies, not blocked enemies
        const life = (diceParam(ctx.params, 'life') ?? ctx.action.dice ?? new DiceRoll(2, 10)).roll();
        t.setStatus(key, 1, -1,
          { caster: ctx.source, bonus: ctx.action.rollBonus ?? 0, dice: ctx.action.dice, skillId: ctx.action.skillId, life, label }, COVER);
        ctx.engine.log('defense', `${ctx.action.name}: ${label} s'alça davant ${t.name} — i s'hi queda (${life} de vida).`, t.team);
      }
    },
    aiWeight(ctx) {
      // Cover doesn't advance the win condition — worth it for a wounded ally
      // with none up (or only a crumbling one); a poor default otherwise
      // (overplaying stalls fights).
      const key = str(ctx.params, 'key', 'mur-de-pedra');
      const uncovered = [ctx.actor, ...ctx.allies].filter(a => coverLife(a, key) < 5);
      if (uncovered.length === 0) return -10;
      return uncovered.some(a => a.currentPV < a.maxPV * 0.6) ? 1.0 : -1.5;
    },
  },
};

/** Stamp a skill's own instance of the shared standing-cover card. Defaults are
 *  Mur de pedra's (the original); the Barricada passes its own numbers. */
export function standingCoverAction(opts: {
  skillId: string; unlock: number;
  id?: string; name?: string; key?: string; label?: string; desc?: string;
  dice?: DiceRoll; life?: DiceRoll; speed?: number; icon?: string;
}) {
  const key = opts.key ?? 'mur-de-pedra';
  const life = opts.life ?? d(2, 6);
  return action({
    id: opts.id ?? 'mur-de-pedra', name: opts.name ?? 'Mur de pedra', skillId: opts.skillId, unlock: opts.unlock,
    type: ActionType.Defensa, speed: opts.speed ?? 0, dice: opts.dice ?? d(3, 6),
    effects: [{ type: 'standing_wall', params: { key, life, label: opts.label ?? 'el mur de pedra' } }],
    desc: opts.desc ?? `El mur persisteix: mentre és dret, els atacs contra el protegit es resolen contra la teva defensa. Té ${life} de vida i absorbeix el dany que el travessa; es destrueix quan se li acaba.`,
    icon: opts.icon ?? 'delapouite/stone-wall.svg',
  });
}

