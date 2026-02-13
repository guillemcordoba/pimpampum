import { DiceRoll } from './dice.js';
import { Equipment } from './equipment.js';
import { Card, CardType, isPhysical, isFocus } from './card.js';
import { CombatModifier, ModifierDuration } from './modifier.js';
import { AIStrategy } from './strategy.js';

/** Defense bonus: [defenderTeam, defenderIdx, defenderName, flatDefense, dice] */
export type DefenseBonus = [number, number, string, number, DiceRoll];

export class Character {
  public team = 0;
  public equipment: Equipment[] = [];
  public aiStrategy: AIStrategy | null = null;

  // Combat state
  public currentWounds = 0;
  public modifiers: CombatModifier[] = [];
  public defenseBonuses: DefenseBonus[] = [];
  public skipTurns = 0;
  public stunned = false;
  public dodging = false;
  public focusInterrupted = false;
  public playedCardIdx: number | null = null;
  public woundedThisCombat = false;
  public hasAbsorbPain = false;
  public hasPoisonWeapon = false;
  public hasCounterThrow = false;

  constructor(
    public name: string,
    public maxWounds: number,
    public strength: number,
    public magic: number,
    public defense: number,
    public speed: number,
    public cards: Card[],
    public characterClass: string,
  ) {}

  isAlive(): boolean {
    return this.currentWounds < this.maxWounds;
  }

  /** Returns true if the character died */
  takeWound(): boolean {
    this.currentWounds++;
    this.woundedThisCombat = true;
    return !this.isAlive();
  }

  getStatModifier(stat: string, condition?: string): number {
    let total = 0;
    for (const m of this.modifiers) {
      if (m.stat === stat) {
        if (m.condition !== null) {
          if (condition !== undefined) {
            if (!m.condition.includes(condition)) continue;
          } else {
            continue;
          }
        }
        total += m.getValue();
      }
    }
    return total;
  }

  getEquipmentSpeed(): number {
    return this.equipment.reduce((sum, e) => sum + e.speedMod, 0);
  }

  getEquipmentDefense(): number {
    return this.equipment.reduce((sum, e) => sum + e.getDefense(), 0);
  }

  getEquipmentDefenseAvg(): number {
    return this.equipment.reduce((sum, e) => sum + e.getDefenseAvg(), 0);
  }

  getEffectiveSpeed(card?: Card): number {
    let base = this.speed + this.getStatModifier('speed');
    base += this.getEquipmentSpeed();
    if (card) base += card.speedMod;
    return base;
  }

  getEffectiveStrength(): number {
    return this.strength + this.getStatModifier('strength');
  }

  getEffectiveMagic(): number {
    return this.magic + this.getStatModifier('magic');
  }

  getEffectiveDefense(): number {
    const base = this.defense + this.getStatModifier('defense');
    return base + this.getEquipmentDefense();
  }

  hasDefenseBonus(): boolean {
    return this.defenseBonuses.length > 0;
  }

  /** Pop one defense bonus and return [defenderTeam, defenderIdx, defenderName, totalDefense] */
  popDefenseBonus(): [number, number, string, number] | null {
    const bonus = this.defenseBonuses.pop();
    if (!bonus) return null;
    const [team, idx, name, flatDefense, dice] = bonus;
    const total = flatDefense + dice.roll();
    return [team, idx, name, total];
  }

  getAttackBonus(targetName: string): number {
    let bonus = 0;
    for (const m of this.modifiers) {
      if (m.stat === 'attack_bonus') {
        if (m.condition !== null) {
          if (m.condition.includes(targetName)) {
            bonus += m.getValue();
          }
        } else {
          bonus += m.getValue();
        }
      }
    }
    return bonus;
  }

  equip(item: Equipment): void {
    this.equipment = this.equipment.filter(e => e.slot !== item.slot);
    this.equipment.push(item);
  }

  resetForNewCombat(): void {
    this.currentWounds = 0;
    this.modifiers = [];
    this.defenseBonuses = [];
    this.skipTurns = 0;
    this.stunned = false;
    this.dodging = false;
    this.focusInterrupted = false;
    this.playedCardIdx = null;
    this.woundedThisCombat = false;
    this.hasAbsorbPain = false;
    this.hasPoisonWeapon = false;
    this.hasCounterThrow = false;
  }

  /** Returns true if the character is skipping this turn */
  resetForNewRound(): boolean {
    this.dodging = false;
    this.focusInterrupted = false;
    this.playedCardIdx = null;
    this.defenseBonuses = [];
    if (this.skipTurns > 0) {
      this.skipTurns--;
      return true;
    }
    return false;
  }

  advanceTurnModifiers(): void {
    this.modifiers = this.modifiers.filter(m => {
      switch (m.duration) {
        case ModifierDuration.ThisTurn:
          return false;
        case ModifierDuration.NextTurn:
          m.duration = ModifierDuration.ThisTurn;
          return true;
        case ModifierDuration.ThisAndNextTurn:
          m.duration = ModifierDuration.NextTurn;
          return true;
        case ModifierDuration.NextTwoTurns:
          m.duration = ModifierDuration.NextTurn;
          return true;
        case ModifierDuration.RestOfCombat:
          return true;
      }
    });
  }
}

// =============================================================================
// CHARACTER FACTORIES
// =============================================================================

export function createFighter(name: string): Character {
  const cards = [
    new Card('Espasa llarga', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 6))
      .withSpeedMod(-2)
      .withEffect({ type: 'Stun' })
      .withDescription('Aturdeix: anul·la els atacs que el jugador atacat anés a fer aquest combat.'),
    new Card('Sacrifici', CardType.Defense)
      .withSpeedMod(6)
      .withEffect({ type: 'Sacrifice' })
      .withDescription('Tria un jugador. Rep tots els atacs que li farien aquest torn.'),
    new Card('Ràbia traumada', CardType.Focus)
      .withSpeedMod(-5)
      .withEffect({ type: 'StrengthBoost', amount: 4, dice: new DiceRoll(1, 8) })
      .withDescription('F+1d8+4 per la resta del combat.'),
    new Card('Embestida', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 6))
      .withSpeedMod(2)
      .withEffect({ type: 'EmbestidaEffect' })
      .withDescription('El jugador atacat té V-2 el següent torn. Tu tens V-3 el següent torn.'),
    new Card('Crit de guerra', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 4))
      .withSpeedMod(1)
      .withEffect({ type: 'AllyStrengthThisTurn', amount: 2 })
      .withDescription('Tots els aliats reben F+2 aquest torn.'),
    new Card('Formació defensiva', CardType.Focus)
      .withSpeedMod(-4)
      .withEffect({ type: 'DefenseBoostDuration', dice: new DiceRoll(1, 6), turns: 2 })
      .withDescription('Tu i tots els aliats D+1d6 per la resta del combat.'),
  ];
  return new Character(name, 3, 2, 0, 4, 2, cards, 'Fighter');
}

export function createWizard(name: string): Character {
  const cards = [
    new Card('Pantalla protectora', CardType.Defense)
      .withDefense(new DiceRoll(1, 8))
      .withSpeedMod(1)
      .withEffect({ type: 'DefendMultiple', count: 2 })
      .withDescription('Defensa a 2 jugadors que triïs.'),
    new Card('Bola de foc', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 6))
      .withSpeedMod(0),
    new Card('Raig de gel', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 4))
      .withSpeedMod(0)
      .withEffect({ type: 'EnemySpeedDebuff', amount: 2 })
      .withDescription('El jugador atacat té V-2 el següent torn.'),
    new Card('Trampa de gel', CardType.Focus)
      .withSpeedMod(-5)
      .withEffect({ type: 'IceTrap' })
      .withDescription('Tots els enemics reben V-8 els dos pròxims torns.'),
    new Card('Cadena de llamps', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 4, -1))
      .withSpeedMod(-1)
      .withEffect({ type: 'MultiTarget', count: 2 })
      .withDescription('Afecta a 2 enemics que triïs.'),
    new Card('Camp de distorsió', CardType.Focus)
      .withSpeedMod(-7)
      .withEffect({ type: 'TeamSpeedBoost' })
      .withDescription('Tots els jugadors aliats reben V+4 per la resta del combat.'),
  ];
  return new Character(name, 3, 0, 5, 1, 2, cards, 'Wizard');
}

export function createRogue(name: string): Character {
  const cards = [
    new Card('Emboscada coordinada', CardType.Focus)
      .withSpeedMod(3)
      .withEffect({ type: 'CoordinatedAmbush' })
      .withDescription("Tria un enemic. Tots els aliats que l'ataquin reben +1d6+2 a la seva tirada."),
    new Card('Bomba de fum', CardType.Focus)
      .withSpeedMod(-3)
      .withEffect({ type: 'BlindingSmoke' })
      .withDescription('Enemics reben V-8 i D-8 i aliats reben V+4 el següent torn.'),
    new Card('Clon de fum', CardType.Defense)
      .withDefense(new DiceRoll(1, 8))
      .withSpeedMod(2)
      .withEffect({ type: 'CounterThrow' })
      .withDescription("L'atacant rep V-3 el següent torn."),
    new Card('Ballesta', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 6))
      .withSpeedMod(3),
    new Card('Dagues', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 4))
      .withSpeedMod(3)
      .withEffect({ type: 'MultiTarget', count: 2 })
      .withDescription('Afecta a 2 enemics que triïs.'),
    new Card('El·lusió', CardType.Focus)
      .withSpeedMod(5)
      .withEffect({ type: 'DodgeWithSpeedBoost' })
      .withDescription("Esquiva tots els atacs rebuts aquest torn. V+5 i F+4 el següent torn."),
    new Card('Enverinar arma', CardType.Focus)
      .withSpeedMod(-6)
      .withEffect({ type: 'PoisonWeapon' })
      .withDescription('Tria 3 aliats (pot ser tu). Durant la resta del combat, els seus atacs físics causen una ferida addicional.'),
    new Card('Foc alquímic', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 6))
      .withSpeedMod(1),
  ];
  return new Character(name, 3, 2, 1, 2, 4, cards, 'Rogue');
}

export function createBarbarian(name: string): Character {
  const cards = [
    new Card('Ràbia', CardType.Focus)
      .withSpeedMod(-6)
      .withEffect({ type: 'RageBoost', amount: 2, dice: new DiceRoll(1, 6), speedBoost: 3 })
      .withDescription('F+1d6+2 i V+3 per la resta del combat.'),
    new Card('Destral de guerra', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 8))
      .withSpeedMod(-1),
    new Card('Atac temerari', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 6))
      .withSpeedMod(1)
      .withEffect({ type: 'RecklessAttack' })
      .withDescription('Tu tens D-2 aquest torn i el següent.'),
    new Card('Escomesa salvatge', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 4))
      .withSpeedMod(0)
      .withEffect({ type: 'MultiTarget', count: 2 })
      .withDescription('Afecta a 2 enemics que triïs.'),
    new Card('Resistir', CardType.Defense)
      .withDefense(new DiceRoll(1, 8))
      .withSpeedMod(2)
      .withEffect({ type: 'AbsorbPain' })
      .withDescription('Si absorveix un atac, D+1 per la resta del combat.'),
    new Card('Rugit intimidant', CardType.Focus)
      .withSpeedMod(1)
      .withEffect({ type: 'IntimidatingRoar' })
      .withDescription("Cada oponent tira 1d4. Els que treuen 2 o menys queden atordits i no actuen aquest torn."),
  ];
  return new Character(name, 3, 4, 0, 2, 3, cards, 'Barbarian');
}

export function createGoblin(name: string): Character {
  const cards = [
    new Card('Fúria enfollida', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(2, 6))
      .withSpeedMod(5)
      .withEffect({ type: 'SkipNextTurns', count: 1 })
      .withDescription('No jugues cap carta el següent torn.'),
    new Card('Maça de punxes', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 6))
      .withSpeedMod(1),
    new Card('Escut de fusta', CardType.Defense)
      .withDefense(new DiceRoll(1, 8))
      .withSpeedMod(4),
    new Card('Venjança', CardType.Focus)
      .withSpeedMod(-5)
      .withEffect({ type: 'Vengeance' })
      .withDescription("Tria un jugador. Els jugadors que l'ataquin durant aquest combat reben un atac físic F+1d8."),
  ];
  return new Character(name, 3, 2, 0, 3, 3, cards, 'Goblin');
}

export function createGoblinShaman(name: string): Character {
  const cards = [
    new Card('Llamp', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(2, 4))
      .withSpeedMod(0),
    new Card('Possessió demoníaca', CardType.Focus)
      .withSpeedMod(-5)
      .withEffect({ type: 'MagicBoost', amount: 3, dice: new DiceRoll(1, 6) })
      .withDescription('M+1d6+3 per la resta del combat.'),
    new Card('Set de sang', CardType.Focus)
      .withSpeedMod(-6)
      .withEffect({ type: 'BloodThirst' })
      .withDescription('Cada enemic que hagi rebut una ferida durant aquest combat rep una altra ferida.'),
    new Card('Pluja de flames', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 4))
      .withSpeedMod(-4)
      .withEffect({ type: 'MultiTarget', count: 3 })
      .withDescription('Afecta a 3 enemics que triïs.'),
    new Card('Absorvir dolor', CardType.Defense)
      .withDefense(new DiceRoll(1, 8))
      .withSpeedMod(3)
      .withEffect({ type: 'AbsorbPain' })
      .withDescription('Si absorveix un atac, D+1 per la resta del combat.'),
  ];
  return new Character(name, 3, 1, 4, 2, 3, cards, 'GoblinShaman');
}

// =============================================================================
// CHARACTER TEMPLATES (metadata for UI)
// =============================================================================

export interface CharacterTemplate {
  id: string;
  displayName: string;
  classCss: string;
  iconPath: string;
  baseStrength: number;
  baseMagic: number;
  baseDefense: number;
  baseSpeed: number;
  baseMaxWounds: number;
  creator: (name: string) => Character;
}

export const ALL_CHARACTER_TEMPLATES: CharacterTemplate[] = [
  {
    id: 'fighter',
    displayName: 'Guerrer',
    classCss: 'guerrer',
    iconPath: 'icons/000000/transparent/1x1/delapouite/black-knight-helm.svg',
    baseStrength: 2, baseMagic: 0, baseDefense: 4, baseSpeed: 2, baseMaxWounds: 3,
    creator: createFighter,
  },
  {
    id: 'rogue',
    displayName: 'Murri',
    classCss: 'murri',
    iconPath: 'icons/000000/transparent/1x1/lorc/rogue.svg',
    baseStrength: 2, baseMagic: 1, baseDefense: 2, baseSpeed: 4, baseMaxWounds: 3,
    creator: createRogue,
  },
  {
    id: 'wizard',
    displayName: 'Mag',
    classCss: 'mag',
    iconPath: 'icons/000000/transparent/1x1/lorc/wizard-staff.svg',
    baseStrength: 0, baseMagic: 5, baseDefense: 1, baseSpeed: 2, baseMaxWounds: 3,
    creator: createWizard,
  },
  {
    id: 'barbarian',
    displayName: 'Bàrbar',
    classCss: 'barbar',
    iconPath: 'icons/000000/transparent/1x1/delapouite/barbarian.svg',
    baseStrength: 4, baseMagic: 0, baseDefense: 2, baseSpeed: 3, baseMaxWounds: 3,
    creator: createBarbarian,
  },
  {
    id: 'goblin',
    displayName: 'Goblin',
    classCss: 'goblin',
    iconPath: 'icons/000000/transparent/1x1/delapouite/goblin-head.svg',
    baseStrength: 2, baseMagic: 0, baseDefense: 3, baseSpeed: 3, baseMaxWounds: 3,
    creator: createGoblin,
  },
  {
    id: 'goblin-shaman',
    displayName: 'Goblin Xaman',
    classCss: 'goblin-shaman',
    iconPath: 'icons/000000/transparent/1x1/delapouite/skull-staff.svg',
    baseStrength: 1, baseMagic: 4, baseDefense: 2, baseSpeed: 3, baseMaxWounds: 3,
    creator: createGoblinShaman,
  },
];

/** Map of card names to icon paths */
export const CARD_ICONS: Record<string, string> = {
  'Espasa llarga': 'icons/000000/transparent/1x1/lorc/broadsword.svg',
  'Sacrifici': 'icons/000000/transparent/1x1/lorc/bleeding-heart.svg',
  'Ràbia traumada': 'icons/000000/transparent/1x1/lorc/screaming.svg',
  'Embestida': 'icons/000000/transparent/1x1/lorc/bull.svg',
  'Crit de guerra': 'icons/000000/transparent/1x1/lorc/shouting.svg',
  'Formació defensiva': 'icons/000000/transparent/1x1/lorc/rally-the-troops.svg',
  'Emboscada coordinada': 'icons/000000/transparent/1x1/lorc/hidden.svg',
  'Bomba de fum': 'icons/000000/transparent/1x1/lorc/dust-cloud.svg',
  'Clon de fum': 'icons/000000/transparent/1x1/lorc/two-shadows.svg',
  'Ballesta': 'icons/000000/transparent/1x1/carl-olsen/crossbow.svg',
  'Dagues': 'icons/000000/transparent/1x1/lorc/daggers.svg',
  'El·lusió': 'icons/000000/transparent/1x1/lorc/ghost.svg',
  'Enverinar arma': 'icons/000000/transparent/1x1/lorc/poison-bottle.svg',
  'Foc alquímic': 'icons/000000/transparent/1x1/lorc/fire-bottle.svg',
  'Pantalla protectora': 'icons/000000/transparent/1x1/lorc/magic-shield.svg',
  'Bola de foc': 'icons/000000/transparent/1x1/lorc/fireball.svg',
  'Raig de gel': 'icons/000000/transparent/1x1/lorc/ice-bolt.svg',
  'Trampa de gel': 'icons/000000/transparent/1x1/lorc/frozen-block.svg',
  'Cadena de llamps': 'icons/000000/transparent/1x1/lorc/lightning-helix.svg',
  'Camp de distorsió': 'icons/000000/transparent/1x1/lorc/psychic-waves.svg',
  'Ràbia': 'icons/000000/transparent/1x1/lorc/wolf-howl.svg',
  'Destral de guerra': 'icons/000000/transparent/1x1/lorc/battle-axe.svg',
  'Atac temerari': 'icons/000000/transparent/1x1/lorc/deadly-strike.svg',
  'Escomesa salvatge': 'icons/000000/transparent/1x1/lorc/crossed-slashes.svg',
  'Resistir': 'icons/000000/transparent/1x1/lorc/muscle-up.svg',
  'Rugit intimidant': 'icons/000000/transparent/1x1/lorc/shouting.svg',
  'Fúria enfollida': 'icons/000000/transparent/1x1/delapouite/enrage.svg',
  'Maça de punxes': 'icons/000000/transparent/1x1/lorc/spiked-mace.svg',
  'Escut de fusta': 'icons/000000/transparent/1x1/willdabeast/round-shield.svg',
  'Venjança': 'icons/000000/transparent/1x1/lorc/fanged-skull.svg',
  'Llamp': 'icons/000000/transparent/1x1/lorc/lightning-arc.svg',
  'Possessió demoníaca': 'icons/000000/transparent/1x1/lorc/daemon-skull.svg',
  'Set de sang': 'icons/000000/transparent/1x1/skoll/blood.svg',
  'Pluja de flames': 'icons/000000/transparent/1x1/lorc/flame-spin.svg',
  'Absorvir dolor': 'icons/000000/transparent/1x1/lorc/back-pain.svg',
};
