import { ActionType, Character, DiceRoll, EffectHandler, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, d, ICON_PREFIX } from '../types.js';
import { diceParam, num, str } from '../effects/helpers.js';

/**
 * Dominador de la terra — Toph-style earthbending: the immovable counter-
 * striker. Waits, listens through the ground, answers head-on. The most
 * defensa-weighted skill in the game: a wall that keeps standing until
 * something smashes through it, an enemy gripped by the ground, and — the one
 * card it did not have in the fantasy set it came from — metalbending, Toph's
 * answer to a world that wears iron.
 */

/**
 * MUR DE PEDRA — the standing cover (in the fantasy set it is a card several
 * kits share; here only the earth raises it). A persistent cover raised on the
 * guarded ally: this round the caster guards normally; afterwards
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
  /**
   * Life still in the stone is damage the holder has already not taken.
   *
   * Scaled against the holder's own health, because that is the unit
   * `positionScore` measures in: a wall with 7 left in front of a 12 PV hero is
   * worth a bit over half that hero. Capped at one body — a wall cannot be
   * worth more than the person behind it.
   */
  positionValue(ref) {
    const life = num(ref.entry.data ?? {}, 'life', 0);
    return Math.min(1, life / Math.max(1, ref.holder.maxPV));
  },
};

/** Life left in the cover `key` standing in front of `c`, 0 if there is none. */
function coverLife(c: Character, key: string): number {
  const entry = c.statusRefs().find(r => r.key === key)?.entry;
  return entry ? num(entry.data ?? {}, 'life', 0) : 0;
}

const STANDING_WALL_EFFECTS: Record<string, EffectHandler> = {
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

/** The earth's Mur de pedra card. */
function standingCoverAction(opts: {
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



// Presó de terra: gripped by the earth to the chest — pinned so only Focus
// actions (concentration needs no limbs) can be played, and still THERE to be
// hit. It used to swallow the enemy whole and out of reach: a fight with a
// buried enemy could not be won that round, the card was never the right play,
// and it dragged fights long (NEXT-STEPS §26).
const ENTERRAT: StatusBehavior = {
  blocksActionType(_ref, type) { return type !== ActionType.Focus; },
  // Buried to the chest, it cannot be shielded either: no ally's guard reaches it.
  preventsGuard() { return true; },
  /**
   * Being swallowed is a burden, so this is NEGATIVE for the holder — which is
   * how burying an enemy becomes visible to the lookahead at all. Before this,
   * removing a body from the fight for three rounds moved neither PV nor body
   * count and therefore scored exactly zero, and Presó de terra was played on
   * 2.3% of the turns it was legal.
   *
   * Priced per round still to serve, and deliberately WELL under a whole body:
   * the buried are also UNREACHABLE, so this buys time rather than a kill, and
   * a first pass at 0.2/round had the AI reaching for it often enough that
   * Presó de terra started correlating with LOSING (played on 6.6% of legal
   * turns, won 31% of them). Tempo is worth something; it is not worth a body.
   */
  positionValue(ref) {
    const left = ref.entry.remaining < 0 ? 3 : Math.min(3, ref.entry.remaining);
    return -0.1 * left;
  },
};

// Just broken free: the ground around them is cracked and will not hold them
// again at once. Without it the earthbender re-gripped the last enemy every
// round, the pinned enemy could only howl, and the fight ran to the cap
// (NEXT-STEPS §26 — 12 in 200 bone-devil fights).
const ESQUERDAT: StatusBehavior = {};

const TERRA_EFFECTS: Record<string, EffectHandler> = {
  ...STANDING_WALL_EFFECTS,

  // Dominar el metall: iron is earth too. Armour does not stop a blow the
  // earthbender bends THROUGH it, and an armoured target cannot get out of the
  // way of its own plate.
  metalbend: {
    modifyAttack(ctx) {
      if (!ctx.attackMods) return;
      ctx.attackMods.ignoreArmor = true;
      if (ctx.target && ctx.target.getPassiveArmor() > 0) ctx.attackMods.ignoreDefense = true;
    },
    aiWeight(ctx) { return ctx.enemies.some(e => e.getPassiveArmor() > 0) ? 1.4 : 0.4; },
  },

  // Presó de terra: the earth swallows the chosen enemy whole — no contest.
  bury: {
    getTargetRequirement() { return 'enemy'; },
    onResolve(ctx) {
      const target = ctx.targets[0];
      if (!target || !target.isAlive()) return;
      const turns = num(ctx.params, 'turns', 3);
      if (target.hasStatus('esquerdat')) {
        ctx.engine.log('focus', `La terra esquerdada no pot tornar a atrapar ${target.name}.`, ctx.source.team);
        return;
      }
      // Held for `turns`, then two rounds on cracked ground.
      target.setStatus('esquerdat', 1, turns + 3, undefined, ESQUERDAT);
      // remaining = turns + 1: the rest of this round plus the `turns`
      // rounds they spend held (Focus-only).
      target.setStatus('enterrat', 1, turns + 1, undefined, ENTERRAT);
      ctx.engine.log('focus', `La terra atrapa ${target.name} fins al pit!`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.enemies.length > 1 ? 1.6 : 1.0; },
  },
};

export const EARTHBENDER: SkillDefinition = {
  id: 'earthbender', displayName: 'Mestre de la terra', classCss: 'terra', category: 'player',
  description: 'Terracontrol: espera immòbil, escolta la terra i respon de front.',
  iconPath: ICON_PREFIX + 'lorc/stone-block.svg',
  actions: [
    action({
      id: 'cop-de-roca', name: 'Cop de roca', skillId: 'earthbender',
      unlock: 1, type: ActionType.Atac, speed: 2, dice: d(2, 4),
      desc: '',
      icon: 'delapouite/throwing-ball.svg',
    }),
    standingCoverAction({ id: 'mur-de-pedra', skillId: 'earthbender', unlock: 2 }),
    action({
      id: 'columna-de-terra', name: 'Columna de terra', skillId: 'earthbender',
      unlock: 3, type: ActionType.Atac, speed: 0, dice: d(2, 6),
      effects: [
        { type: 'debuff_on_hit', params: { kind: 'speed', amount: 2, duration: 'nextTurn' } },
      ],
      desc: "Si encerta, l'objectiu surt llançat: −2 de velocitat el torn següent.",
      icon: 'delapouite/ionic-column.svg',
    }),
    action({
      id: 'preso-de-terra', name: 'Presó de terra', skillId: 'earthbender',
      unlock: 4, type: ActionType.Focus, speed: 2,
      effects: [{ type: 'bury', params: { turns: 2 } }],
      desc: "Tria un enemic. La terra l'atrapa durant 2 torns: només pot jugar cartes de Focus i ningú no el pot protegir. No el pot tornar a atrapar fins 2 torns després.",
      icon: 'lorc/sinking-trap.svg',
    }),
    action({
      id: 'dominar-el-metall', name: 'Dominar el metall', skillId: 'earthbender',
      unlock: 5, type: ActionType.Atac, speed: 1, dice: d(2, 6),
      effects: [{ type: 'metalbend' }],
      desc: 'Ignora l\'armadura. Contra un objectiu amb armadura, no es pot defensar.',
      icon: 'lorc/metal-bar.svg',
    }),
  ],
  effects: TERRA_EFFECTS,
};

