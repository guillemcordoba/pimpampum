import { ActionType, Character, EffectHandler, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../../players/types.js';
import { PALMELL_D_AIRE_ICON } from '../../players/skills/airbender.js';
import { EnemyDefinition, ICON } from '../types.js';

/**
 * EL SENYOR DE LA POR — the villain (modelled on Pain / Nagato).
 *
 * He rules through six borrowed bodies and teaches that only fear keeps the
 * peace. He himself is a wasted thing nobody can reach while any of those
 * bodies still stands; what he does from hiding is FEAR, and fear here does two
 * things only — it DIVIDES (nobody can protect you; your blows land on your
 * friends) and it SILENCES (a card type gone from your hand for a turn). Every
 * one of those lasts a single turn and is a slow, telegraphed card, and the
 * Chakres kit is the party's answer to all of them.
 *
 * Nobody alive knows he was once a novice of the air monasteries. The cards
 * know: his first is the airbender's first, turned (same icon, speed and dice);
 * the body that pushes everything away pushes with air; and his last seals the
 * very chakra — the earth's, the one fear blocks — that the Chakres kit's first
 * card opens. He even wears the air's colour.
 */

/** Hidden: no enemy can reach him while one of the bodies he walked in with
 *  stands. A revived body hides him again. */
const AMAGAT: StatusBehavior = {
  untargetable(ref) {
    const bodies = ref.entry.data?.['bodies'];
    return Array.isArray(bodies) && bodies.some(b => b instanceof Character && b.isAlive());
  },
};

const POR_EFFECTS: Record<string, EffectHandler> = {
  // Set up once, at the start of combat: the bodies he hides behind.
  hidden_master: {
    onCombatStart(ctx) {
      const bodies = ctx.engine.alliesOf(ctx.source, false);
      if (bodies.length) ctx.source.setStatus('amagat', 1, -1, { bodies }, AMAGAT);
    },
  },
};

/** The Senyor's fear, card by card — the generic shutdown handlers
 *  (`players/effects/generic.ts`) carry the mechanics. */
const SENYOR_SKILL: SkillDefinition = {
  id: 'senyor-de-la-por', displayName: 'El Senyor de la Por', classCss: 'aire', category: 'enemy',
  description: "Un cos consumit que ningú no veu. Porta el cap rapat; on hi haurien d'haver les fletxes, cicatrius de cremades.",
  iconPath: ICON + 'lorc/hooded-figure.svg',
  actions: [
    action({
      id: 'palmell-del-buit', name: 'Palmell del buit', skillId: 'senyor-de-la-por',
      unlock: 1, type: ActionType.Atac, speed: 4, dice: d(1, 6),
      effects: [{ type: 'hidden_master' }, { type: 'lock_on_hit', params: { types: [ActionType.Defensa] } }],
      desc: "Si encerta, l'objectiu no pot jugar Defenses el torn següent.",
      icon: PALMELL_D_AIRE_ICON,
    }),
    action({
      id: 'onada-de-terror', name: 'Onada de terror', skillId: 'senyor-de-la-por',
      unlock: 2, type: ActionType.Focus, speed: 1,
      effects: [{ type: 'isolate', params: { target: 'enemies' } }],
      desc: 'Tots els enemics: el torn següent ningú no els pot protegir.',
      icon: 'lorc/terror.svg',
    }),
    action({
      id: 'paralisi-de-la-por', name: 'Paràlisi de la por', skillId: 'senyor-de-la-por',
      unlock: 3, type: ActionType.Focus, speed: 0,
      effects: [{ type: 'lock', params: { types: [ActionType.Defensa], only: true } }],
      desc: 'Tria un enemic: el torn següent només pot jugar Defenses.',
      icon: 'lorc/frozen-body.svg',
    }),
    action({
      id: 'desconfianca', name: 'Desconfiança', skillId: 'senyor-de-la-por',
      unlock: 4, type: ActionType.Focus, speed: -1,
      effects: [{ type: 'turn_on_allies' }],
      desc: 'Tria un enemic: el torn següent, els seus atacs van contra els seus aliats.',
      icon: 'lorc/backstab.svg',
    }),
    action({
      id: 'segellar-el-chakra-de-la-terra', name: 'Segellar el chakra de la terra', skillId: 'senyor-de-la-por',
      unlock: 5, type: ActionType.Focus, speed: -3,
      effects: [{ type: 'lock', params: { target: 'enemies', types: [ActionType.Focus] } }],
      desc: 'Tots els enemics: el torn següent no poden jugar Focus.',
      icon: 'lorc/lotus-flower.svg',
    }),
  ],
  effects: POR_EFFECTS,
};

export const SENYOR_DE_LA_POR: EnemyDefinition = {
  id: 'senyor-de-la-por', displayName: 'El Senyor de la Por', classCss: 'aire', iconPath: ICON + 'lorc/hooded-figure.svg',
  /** ~35 kg — what is left of him: half a man, kept alive by spite. */
  bulk: 0.79,
  skills: [SENYOR_SKILL],
};
