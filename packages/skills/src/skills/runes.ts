import { ActionType, Character, EffectHandler, StatusBehavior, StatusHookContext, TargetRequirement } from '@pimpampum/engine';
import { SkillDefinition, action, ICON_PREFIX } from '../types.js';
import { num, str } from '../effects/helpers.js';

/**
 * Runes — a rune-carver: spends turns inscribing dormant marks whose power
 * fires in other people's moments. Every rune is carved with a slow Focus
 * (speed 1 — it resolves after most attacks, so wounding the carver that
 * round spoils the stave: real counterplay), holds its uses on the status
 * `value`, and flares for free
 * at its exact pipeline moment via a StatusBehavior. Re-carving refreshes the
 * uses, never stacks. Flares auto-fire at the optimal moment (the engine
 * plays the runer's "when I say so" perfectly); at a physical table the
 * player declares them.
 */

/** Burn one use; the rune fades when the last one goes. Returns uses left. */
function spendUse(ctx: StatusHookContext): number {
  ctx.entry.value--;
  if (ctx.entry.value <= 0) ctx.holder.clearStatus(ctx.key);
  return ctx.entry.value;
}

// Runa de la fulla esmolada: flares on the bearer's confirmed hit — the edge
// bites `amount` deeper (pre-armour). One use per blow that lands.
const RUNA_FULLA: StatusBehavior = {
  modifyOutgoingDamage(ctx, damage) {
    if (damage <= 0 || ctx.entry.value <= 0) return damage;
    const amount = num(ctx.entry.data ?? {}, 'amount', 2);
    const left = spendUse(ctx);
    ctx.engine.log('info', `ᛏ La runa de la fulla esmolada crida: +${amount} de dany (${left} usos restants).`, ctx.holder.team);
    return damage + amount;
  },
};

// Runa de la confusió: flares on a contested dice total the cursed enemy just
// rolled, AFTER both totals are seen — and only when −amount flips an outcome
// the holder was about to win. Never wastes a use.
const RUNA_CONFUSIO: StatusBehavior = {
  modifyContestTotal(ctx, own, opposing, kind) {
    if (ctx.entry.value <= 0) return own;
    const amount = num(ctx.entry.data ?? {}, 'amount', 4);
    // Attacks win on strictly-greater; defenses and saves hold on ties.
    const winning = kind === 'attack' ? own > opposing : own >= opposing;
    const stillWinning = kind === 'attack' ? own - amount > opposing : own - amount >= opposing;
    if (!winning || stillWinning) return own;
    const left = spendUse(ctx);
    ctx.engine.log('info', `ᚦ La runa de la confusió crida: −${amount} a la tirada de ${ctx.holder.name} (${own}→${own - amount}, ${left} usos restants).`, ctx.holder.team);
    return own - amount;
  },
};

// Runa de l'escut invisible: flares on damage about to land on the bearer
// (post-armour) — the blow stops on empty air. Spent only on real blows
// (≥3 damage) or when it keeps the bearer alive.
const RUNA_ESCUT: StatusBehavior = {
  modifyIncomingDamage(ctx, damage) {
    if (damage <= 0 || ctx.entry.value <= 0) return damage;
    if (damage < 3 && damage < ctx.holder.currentPV) return damage;
    const amount = num(ctx.entry.data ?? {}, 'amount', 4);
    const left = spendUse(ctx);
    const prevented = Math.min(amount, damage);
    ctx.engine.log('info', `ᛉ La runa de l'escut invisible crida: evita ${prevented} punts de dany (${left} usos restants).`, ctx.holder.team);
    return damage - amount;
  },
};

interface RuneSpec {
  key: string;
  label: string;
  behavior: StatusBehavior;
  target: TargetRequirement;
  amount: number;
}

// TODO(balance): rune amounts rescaled from the d20 era (were 4/10/5).
const RUNE_SPECS: Record<string, RuneSpec> = {
  fulla: { key: 'runa-fulla', label: 'la runa de la fulla esmolada', behavior: RUNA_FULLA, target: 'ally', amount: 2 },
  confusio: { key: 'runa-confusio', label: 'la runa de la confusió', behavior: RUNA_CONFUSIO, target: 'enemy', amount: 4 },
  escut: { key: 'runa-escut', label: "la runa de l'escut invisible", behavior: RUNA_ESCUT, target: 'ally', amount: 4 },
};

const RUNES_EFFECTS: Record<string, EffectHandler> = {
  // Carve a rune on the chosen bearer: sets the rune status carrying its
  // uses (`value`) and flare payload; the behaviour does the rest.
  carve_rune: {
    getTargetRequirement(p) { return RUNE_SPECS[str(p, 'rune', 'fulla')].target; },
    onResolve(ctx) {
      const spec = RUNE_SPECS[str(ctx.params, 'rune', 'fulla')];
      const target = ctx.targets[0];
      if (!target || !target.isAlive()) return;
      const uses = num(ctx.params, 'uses', 3);
      target.setStatus(spec.key, uses, -1, { amount: num(ctx.params, 'amount', spec.amount) }, spec.behavior);
      const prep = spec.target === 'enemy' ? 'contra' : 'a';
      ctx.engine.log('focus', `${ctx.source.name} grava ${spec.label} ${prep} ${target.name} (${uses} usos).`, ctx.source.team);
    },
    // Carve where no copy of this rune is still charged; idle otherwise.
    aiWeight(ctx) {
      const spec = RUNE_SPECS[str(ctx.params, 'rune', 'fulla')];
      const pool: Character[] = spec.target === 'enemy' ? ctx.enemies : [ctx.actor, ...ctx.allies];
      const lacking = pool.filter(c => c.getStatusValue(spec.key, 0) <= 0).length;
      return lacking > 0 ? 1.4 : 0;
    },
  },
};

export const RUNES: SkillDefinition = {
  id: 'runes', displayName: 'Runes', classCss: 'runes', category: 'player',
  description: "Gravador de runes: marques latents amb usos que esclaten a l'instant que el runer tria.",
  iconPath: ICON_PREFIX + 'lorc/rune-stone.svg',
  actions: [
    action({
      id: 'runa-fulla-esmolada', name: 'Runa de la fulla esmolada', skillId: 'runes',
      unlock: 1, type: ActionType.Focus, speed: 1,
      effects: [{ type: 'carve_rune', params: { rune: 'fulla', uses: 4, amount: 2 } }],
      desc: "Grava-la a l'arma d'un aliat: 4 usos. Quan el portador encerta un cop, pots activar-la a l'instant: {DAMAGE}+2.",
      icon: 'lorc/rune-sword.svg',
    }),
    action({
      id: 'runa-confusio', name: 'Runa de la confusió', skillId: 'runes',
      unlock: 2, type: ActionType.Focus, speed: 1,
      effects: [{ type: 'carve_rune', params: { rune: 'confusio', uses: 4, amount: 4 } }],
      desc: 'Grava-la contra un enemic: 4 usos. Quan aquell enemic fa una tirada, pots activar-la després de veure-la: −4 a la tirada.',
      icon: 'lorc/oily-spiral.svg',
    }),
    action({
      id: 'runa-escut-invisible', name: "Runa de l'escut invisible", skillId: 'runes',
      unlock: 3, type: ActionType.Focus, speed: 1,
      effects: [{ type: 'carve_rune', params: { rune: 'escut', uses: 4, amount: 4 } }],
      desc: "Grava-la sobre un aliat: 4 usos. Quan el portador rep un atac, pots activar-la a l'instant: evita 4 {DAMAGE}.",
      icon: 'lorc/shield-echoes.svg',
    }),
  ],
  effects: RUNES_EFFECTS,
};

export const RUNES_SKILLS: SkillDefinition[] = [RUNES];
