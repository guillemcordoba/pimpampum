import { ActionType, Character, DiceRoll, EffectHandler, EngineApi, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, d, ICON_PREFIX } from '../types.js';
import { num } from '../effects/helpers.js';

/**
 * Màgia volcànica — Pele's register: slow, inexorable, geological. The whole
 * kit threads one resource, `pressio`: molten strikes and absorbed blows stoke
 * the mountain, the geyser vents it, and Erupció releases everything at once —
 * on friend and foe alike ("la muntanya no distingeix"). Never solid rock
 * (that's the Earthbender's); everything here stays molten.
 */
export const VOLCANIC_SKILL_ID = 'volcanic';
export const PRESSURE_STATUS = 'pressio';

export function getPressure(c: Character): number {
  return c.getStatusValue(PRESSURE_STATUS, 0);
}

function addPressure(engine: EngineApi, c: Character, delta: number): void {
  const next = Math.max(0, getPressure(c) + delta);
  c.setStatus(PRESSURE_STATUS, next, -1);
  if (delta > 0) engine.log('info', `La muntanya s'agita: pressió ${next}.`, c.team);
}

const VOLCANIC_EFFECTS: Record<string, EffectHandler> = {
  // Stoke the mountain: gain pressió when the action actually goes off.
  pressure_gain: {
    onPlay(ctx) {
      addPressure(ctx.engine, ctx.source, num(ctx.params, 'amount', 1));
    },
  },

  // Vent the mountain: spend pressió to play (Guèiser).
  pressure_cost: {
    canPlay(actor, params) {
      return getPressure(actor) >= num(params, 'amount', 1);
    },
    onPlay(ctx) {
      addPressure(ctx.engine, ctx.source, -num(ctx.params, 'amount', 1));
    },
  },

  // Guèiser: erupts from below — no third party can intercept it. The target's
  // own defensa (a guard where they are their own defender) still contests;
  // anti-feint statuses (preventsGuardBypass, e.g. seismic awareness) veto the
  // bypass at the engine seam.
  from_below: {
    modifyAttack(ctx) {
      const t = ctx.target;
      if (!t || !ctx.attackMods) return;
      const guard = [...t.guards].reverse().find(g => g.defender.isAlive());
      if (!(guard && guard.defender === t)) ctx.attackMods.ignoreDefense = true;
    },
  },

  // Pell d'obsidiana: every blocked attack scorches the attacker (fixed,
  // armour-ignored — heat) and stokes the mountain.
  obsidian_skin: {
    onDefend(ctx) {
      const attacker = ctx.target;
      if (!attacker) return;
      const dmg = num(ctx.params, 'damage', 2);
      ctx.engine.log('defense', `L'obsidiana crema ${attacker.name} (${dmg} dany).`, ctx.source.team);
      ctx.engine.applyPvLoss(attacker, dmg, ctx.source);
      addPressure(ctx.engine, ctx.source, 1);
    },
    aiWeight() { return 0.4; },
  },

  // Riu de lava: declare the flow; at the END of the NEXT round it sweeps all
  // enemies — undefendable, unguardable (armour applies). The river keeps
  // flowing even if the caster falls after declaring it.
  lava_flow: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      ctx.source.setStatus('riu-de-lava', 1, -1, { sides: num(ctx.params, 'sides', 8) }, RIU_DE_LAVA);
      ctx.engine.log('focus', `${ctx.source.name} obre la terra: un riu de lava comença a fluir!`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.enemies.length >= 2 ? 1.6 : 0.6; },
  },

  // Erupció: spend ALL pressió (min 2); everyone except the caster takes Nd6.
  // Allies are struck via extra attacks on play (they may defend); enemies via
  // the normal all-enemies attack pass, whose damage is the same Nd6.
  eruption: {
    canPlay(actor, params) {
      return getPressure(actor) >= num(params, 'min', 2);
    },
    onPlay(ctx) {
      const n = getPressure(ctx.source);
      addPressure(ctx.engine, ctx.source, -n);
      ctx.source.setStatus('erupcio', n, 1);
      ctx.engine.log('attack', `${ctx.source.name} desferma l'Erupció amb ${n} de pressió: la muntanya no distingeix!`, ctx.source.team);
      for (const ally of ctx.engine.alliesOf(ctx.source, false)) {
        ctx.engine.performExtraAttack(ctx.source, ally, new DiceRoll(n, 6), { skillId: VOLCANIC_SKILL_ID, label: 'Erupció' });
      }
    },
    modifyAttack(ctx) {
      const n = ctx.source.getStatusValue('erupcio', 0);
      if (n > 0 && ctx.attackMods) ctx.attackMods.extraDamageDice.push(new DiceRoll(n, 6));
    },
    aiWeight(ctx) {
      const n = getPressure(ctx.actor);
      if (n < num(ctx.params, 'min', 2)) return 0;
      // Value scales with pressure and enemy count, discounted by exposed allies.
      return Math.max(0.2, n * 0.5 * (ctx.enemies.length - 0.8 * ctx.allies.length));
    },
  },
};

// The declared river: value 1 = still flowing (announce), value 0 = it arrives.
// Sweeps every living enemy of the holder at round end — no guards, no
// defenses; armour applies; the untargetable (melted into shadow) are spared.
const RIU_DE_LAVA: StatusBehavior = {
  onRoundEnd(ctx) {
    if (ctx.entry.value > 0) {
      ctx.entry.value--;
      ctx.engine.log('info', 'El riu de lava avança, imparable...', ctx.holder.team);
      return;
    }
    const sides = num(ctx.entry.data ?? {}, 'sides', 8);
    const roll = new DiceRoll(1, sides).roll();
    ctx.engine.log('attack', `El riu de lava arriba! (dau ${roll})`, ctx.holder.team);
    for (const e of ctx.engine.enemiesOf(ctx.holder)) {
      if (e.statusRefs().some(r => r.entry.behavior?.untargetable?.(r))) continue;
      const dmg = Math.max(0, roll - e.getPassiveArmor());
      ctx.engine.log('attack', `La lava arrossega ${e.name} (${dmg} dany).`, ctx.holder.team);
      ctx.engine.applyPvLoss(e, dmg, ctx.holder);
    }
    ctx.holder.clearStatus('riu-de-lava');
  },
};

export const VOLCANIC: SkillDefinition = {
  id: VOLCANIC_SKILL_ID, displayName: 'Màgia volcànica', classCss: 'volcanic', category: 'player',
  description: 'La veu de la muntanya: la pressió creix amb cada acte volcànic fins que la terra esclata.',
  iconPath: ICON_PREFIX + 'lorc/volcano.svg',
  actions: [
    action({
      id: 'roca-fosa', name: 'Roca fosa', skillId: VOLCANIC_SKILL_ID,
      unlock: 1, type: ActionType.Atac, speed: 1, dice: d(2, 4),
      effects: [
        { type: 'pressure_gain', params: { amount: 1 } },
        { type: 'debuff_on_hit', params: { kind: 'armor', amount: 1, duration: 'restOfCombat' } },
      ],
      desc: "Si encertes, l'objectiu té −1 d'armadura durant la resta del combat.",
      icon: 'lorc/burning-round-shot.svg',
    }),
    action({
      id: 'pell-obsidiana', name: "Pell d'obsidiana", skillId: VOLCANIC_SKILL_ID,
      unlock: 2, type: ActionType.Defensa, speed: 2, dice: d(2, 6),
      effects: [{ type: 'obsidian_skin', params: { damage: 2 } }],
      desc: "Si bloqueges un atac, l'atacant rep 2 de dany, ignorant l'armadura.",
      icon: 'lorc/crystalize.svg',
    }),
    action({
      id: 'gueiser', name: 'Guèiser', skillId: VOLCANIC_SKILL_ID,
      unlock: 3, type: ActionType.Atac, speed: -1, dice: d(1, 12),
      effects: [
        { type: 'pressure_cost', params: { amount: 1 } },
        { type: 'from_below' },
      ],
      desc: "Cap defensor no el pot interceptar: només l'objectiu es pot defensar a si mateix.",
      icon: 'lorc/fountain.svg',
    }),
    action({
      id: 'riu-de-lava', name: 'Riu de lava', skillId: VOLCANIC_SKILL_ID,
      unlock: 4, type: ActionType.Focus, speed: -3, fatigueCost: 2,
      effects: [
        { type: 'pressure_gain', params: { amount: 1 } },
        { type: 'lava_flow', params: { sides: 10 } },
      ],
      desc: 'Al final del torn següent, tots els enemics reben 1d10, ignorant defenses.',
      icon: 'sbed/lava.svg',
    }),
    action({
      id: 'erupcio', name: 'Erupció', skillId: VOLCANIC_SKILL_ID,
      unlock: 5, type: ActionType.Atac, speed: -2, fatigueCost: 2, targetCount: 99,
      effects: [{ type: 'eruption', params: { min: 2 } }],
      desc: 'Gasta tota la pressió, afecta a tots els aliats i enemics.',
      icon: 'lorc/eruption.svg',
    }),
  ],
  effects: VOLCANIC_EFFECTS,
};

export const VOLCANIC_SKILLS: SkillDefinition[] = [VOLCANIC];
