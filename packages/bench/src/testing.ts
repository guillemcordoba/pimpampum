/**
 * `@pimpampum/bench/testing` — A SECOND GAME SET, small and synthetic.
 *
 * Two jobs, and they are the same job:
 *
 *  1. VERIFY THE INSTRUMENT WITHOUT THE CONTENT IT JUDGES. The requirement
 *     controls, the pipeline tests and the AI's strength checks need a set to
 *     run in. Running them in the fantasy set made every one of them depend on
 *     the very cards they exist to judge: a control whose verdict "follows from
 *     its construction" was really following from its construction PLUS
 *     goblin counts, basilisk PV and whatever the fantasy AI tuning happened to
 *     be. Here every card is plain dice, the creatures are plain dice, and the
 *     only handler is a heal.
 *
 *  2. PROVE THE CONTRACT HOLDS FOR MORE THAN ONE GAME. `GameSet` claims a set
 *     can be swapped in without bench knowing. This is that claim, compiled and
 *     run on every test.
 *
 * Deliberately CHEAP: small parties, small creatures, short fights — so that a
 * control that needs a few hundred combats per arm stays a control someone
 * runs.
 */
import {
  ActionType, type ActionDefinition, type Character, createCharacter, DiceRoll, EffectRegistry,
  EquipmentSlot, type EquipmentDefinition, random, type EffectHandler,
} from '@pimpampum/engine';
import {
  solveEncounter, type EncounterContent,
} from '@pimpampum/combat-balancer';
import { actionPrint } from './cache.js';
import {
  isExplicitParty, type CharacterBuildSpec, type FieldedGroup, type GameSet, type KitInfo,
  type PartySpec, type SubjectKit,
} from './gameset.js';

// --- content ------------------------------------------------------------------

function card(kit: string, i: number, name: string, type: ActionType, dice: string, speed: number,
  over: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    id: `${kit}-${i}`, name, skillId: kit, unlockLevel: i, actionType: type, speed,
    dice: DiceRoll.parse(dice), effects: [], description: '', iconPath: '', ...over,
  };
}
const A = ActionType.Atac, D = ActionType.Defensa, F = ActionType.Focus;

/** The one handler in the set: heal an ally by the card's own dice. */
const HEAL = 'syn-heal';
const HANDLERS: Record<string, EffectHandler> = {
  [HEAL]: {
    getTargetRequirement: () => 'ally',
    onResolve(ctx) {
      const amount = ctx.action.dice?.roll() ?? 0;
      for (const t of ctx.targets ?? []) ctx.engine.heal(t, amount);
    },
  },
};

interface Kit { id: string; side: 'player' | 'enemy'; actions: ActionDefinition[]; bulk?: number }

const KITS: Kit[] = [
  { id: 'brawler', side: 'player', actions: [
    card('brawler', 1, 'Jab', A, '2d6', 3),
    card('brawler', 2, 'Guard', D, '2d6', 4),
    card('brawler', 3, 'Smash', A, '3d6', 1),
    card('brawler', 4, 'Sweep', A, '2d6', 2, { targetCount: 99 }),
  ] },
  { id: 'duelist', side: 'player', actions: [
    card('duelist', 1, 'Thrust', A, '2d6', 3),
    card('duelist', 2, 'Parry', D, '3d6', 5),
    card('duelist', 3, 'Lunge', A, '4d6', 0),
  ] },
  { id: 'medic', side: 'player', actions: [
    card('medic', 1, 'Patch', F, '2d4', 2, { effects: [{ type: HEAL }] }),
    card('medic', 2, 'Cover', D, '2d6', 4),
  ] },
  { id: 'neutral', side: 'player', actions: [
    card('neutral', 1, 'Strike', A, '2d6', 2),
    card('neutral', 2, 'Block', D, '2d6', 3),
    card('neutral', 3, 'Heavy', A, '3d6', 1),
  ] },
  { id: 'grunt', side: 'enemy', bulk: 1, actions: [
    card('grunt', 1, 'Club', A, '3d6', 2),
    card('grunt', 2, 'Stab', A, '2d6', 4),
  ] },
  { id: 'brute', side: 'enemy', bulk: 2, actions: [
    card('brute', 1, 'Maul', A, '3d6', 1),
    card('brute', 2, 'Stomp', A, '2d6', 0, { targetCount: 99 }),
  ] },
];

/** Every combatant always holds a last-resort card, as in any real set. */
const DESPERATE: ActionDefinition = {
  id: 'syn-desperate', name: 'Desperate', skillId: 'syn', unlockLevel: 0, actionType: A, speed: 0,
  dice: new DiceRoll(1, 4), lastResort: true, effects: [], description: '', iconPath: '',
};

const LEATHER: EquipmentDefinition = {
  id: 'syn-leather', name: 'Leather', slot: EquipmentSlot.Armor, passiveArmor: 1, speedPenalty: 0,
  rollBonuses: [], iconPath: '', description: '',
};
const EQUIPMENT = new Map([[LEATHER.id, LEATHER]]);

const kits = new Map(KITS.map(k => [k.id, k]));
const PLAYER_PV = 12;

function clampLevel(kit: Kit, level: number | undefined): number {
  return Math.max(1, Math.min(kit.actions.length, level ?? kit.actions.length));
}

function actionsAt(kitId: string, level: number): ActionDefinition[] {
  return kits.get(kitId)?.actions.filter(a => a.unlockLevel <= level) ?? [];
}

function buildCharacter(spec: CharacterBuildSpec): Character {
  const actions = Object.entries(spec.skills).flatMap(([id, level]) => actionsAt(id, level));
  return createCharacter({
    name: spec.name, classCss: 'syn', pv: spec.pv, skills: spec.skills,
    actions: [...actions, DESPERATE],
    equipment: (spec.equipment ?? []).map(id => EQUIPMENT.get(id)).filter((e): e is EquipmentDefinition => !!e),
    category: spec.category ?? 'player',
  });
}

function hero(name: string, kitId: string, level?: number): CharacterBuildSpec {
  const kit = kits.get(kitId);
  if (!kit) throw new Error(`synthetic set: no kit '${kitId}'`);
  return { name, pv: PLAYER_PV, skills: { [kitId]: clampLevel(kit, level) }, equipment: [LEATHER.id], category: 'player' };
}

const PLAYER_KITS = () => KITS.filter(k => k.side === 'player' && !k.id.startsWith('control-'));

function buildParty(spec: PartySpec): Character[] {
  if (isExplicitParty(spec)) return spec.characters.map(buildCharacter);
  const per = (v: number | number[] | undefined, i: number, d: number) =>
    v === undefined ? d : typeof v === 'number' ? v : v[Math.min(i, v.length - 1)] ?? d;
  return Array.from({ length: Math.max(1, spec.count) }, (_, i) => {
    const pool = PLAYER_KITS();
    const kit = pool[Math.floor(random() * pool.length)];
    const c = buildCharacter({
      ...hero(`${spec.prefix ?? 'Heroi '}${i + 1}`, kit.id, per(spec.levels, i, 3)),
      pv: spec.pv ?? PLAYER_PV,
      equipment: per(spec.armor, i, 0) > 0 ? [LEATHER.id] : [],
    });
    c.setFatigue(per(spec.fatigue, i, 0));
    return c;
  });
}

function buildEncounter(groups: FieldedGroup[]): Character[] {
  return groups.flatMap(g => {
    const kit = kits.get(g.enemyId);
    if (!kit) return [];
    const level = clampLevel(kit, g.level);
    return Array.from({ length: Math.max(0, g.count) }, (_, i) => {
      const c = buildCharacter({
        name: g.count > 1 ? `${kit.id} ${i + 1}` : kit.id, pv: g.pv,
        skills: { [kit.id]: level }, category: 'enemy',
      });
      c.aiControlled = true;
      return c;
    });
  });
}

function registry(): EffectRegistry {
  const r = new EffectRegistry();
  for (const [type, h] of Object.entries(HANDLERS)) r.register(type, h);
  return r;
}

let encounterRegistry: EffectRegistry | null = null;
const CONTENT: EncounterContent<PartySpec> = {
  registry: () => (encounterRegistry ??= registry()),
  buildParty,
  isFixedParty: isExplicitParty,
  buildEncounter,
  creature(id) {
    const kit = kits.get(id);
    return kit && kit.side === 'enemy' ? { bulk: kit.bulk ?? 1, fullKitLevel: kit.actions.length } : undefined;
  },
};

/**
 * THE SYNTHETIC SET.
 *
 * Small and cheap: its job is to be fast enough to run the instrument end to end in a test, not to model
 * strong play — no verdict about THIS content is ever reported.
 */
export const SYNTHETIC: GameSet = {
  id: 'synthetic',
  registry,
  buildParty,
  buildEncounter,
  randomParty(prefix, size, budget, equip = true, pv = PLAYER_PV) {
    return buildParty({ count: size, levels: budget, armor: equip ? 1 : 0, pv, prefix });
  },
  playerPV: PLAYER_PV,
  kit(id): KitInfo | undefined {
    const k = kits.get(id);
    return k && { id: k.id, side: k.side, actions: k.actions, fullLevel: k.actions.length };
  },
  kitIds(side) {
    return KITS.filter(k => k.side === side).map(k => k.id);
  },
  hero,
  solveEncounter(pool, party, target, opts = {}) {
    // At the balancer's own depth, which is the depth cells play at: a shape
    // solved by weaker play lands wherever stronger play takes it (depth 0 put
    // a '60%' shape at 82% for the stand-in party, past the saturation band).
    return solveEncounter(CONTENT, pool, party, target, {
      // FLOORED, not merely defaulted. This set is a FIXTURE: smoke runs turn
      // SEARCH_GAMES down to a handful, and a bisection on four-game samples
      // can field a 600-PV brute — every later fight then runs to the cap at
      // depth 1 and the 'quick' run takes minutes. Its shapes must stay sane at
      // any budget; nothing reported is ever about them.
      searchGames: Math.max(40, opts.searchGames ?? 60), games: Math.max(100, opts.games ?? 200), seed: opts.seed,
      maxAvgRounds: opts.maxAvgRounds,
    });
  },
  calibration: {
    referenceKits: ['brawler', 'duelist', 'neutral', 'medic'],
    shapes: [
      { label: 'pack', pool: [{ enemyId: 'grunt', count: 4 }] },
      { label: 'boss', pool: [{ enemyId: 'brute', count: 1 }] },
      { label: 'mixed', pool: [{ enemyId: 'grunt', count: 2 }, { enemyId: 'brute', count: 1 }] },
    ],
    company: [['brawler', 'duelist', 'medic'], ['duelist', 'medic', 'brawler']],
    standIns: ['neutral'],
    fair: 0.6,
    // The solver's own default: this set's controls were calibrated at it.
    maxAvgRounds: 6,
    saturation: { min: 0.2, max: 0.8 },
    mainKits: ['brawler', 'duelist', 'neutral'],
    aiBlindCards: {},
  },
  installKit(subject: SubjectKit) {
    const kit: Kit = { id: subject.id, side: 'player', actions: subject.actions };
    kits.set(kit.id, kit);
    KITS.push(kit);
    return () => {
      kits.delete(kit.id);
      KITS.splice(KITS.indexOf(kit), 1);
    };
  },
  unlockedActions: actionsAt,
  skillPrint(id) {
    const k = kits.get(id);
    return k ? `${k.id}:${k.actions.map(actionPrint).join('|')}` : `${id}:?`;
  },
  enemyPrint(id) {
    const k = kits.get(id);
    return k ? `${k.id}:${k.bulk ?? 1}:${k.actions.map(actionPrint).join('|')}` : `${id}:?`;
  },
  print() {
    const handlers = Object.entries(HANDLERS)
      .map(([t, h]) => `${t}:${Object.values(h).map(f => String(f)).join(';')}`);
    return ['synthetic', ...KITS.map(k => this.skillPrint(k.id)), ...handlers].join('\n');
  },
};
