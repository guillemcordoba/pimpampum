import { ACTION_TYPE_DISPLAY_NAMES, ACTION_TYPE_CSS, ActionType, STAT_ICONS } from '@pimpampum/engine';
import type { ActionDefinition, EquipmentDefinition } from '@pimpampum/engine';

export interface CardStat {
  iconPath: string;
  value: string;
  /** Optional icon rendered right after the value (e.g. "1d6 × <pressió>"). */
  suffixIconPath?: string;
}

export interface CardDisplayProps {
  name: string;
  subtitle: string;
  classCss: string;
  typeCss: string;
  iconPath: string;
  effectText?: string;
  stats: CardStat[];
  smallName: boolean;
}

// All icon paths returned here are RAW (no BASE_URL prefix); rendering components
// prepend import.meta.env.BASE_URL themselves.

/** Stat row for an action card: contest dice (attack dice for Atac, defense
 *  dice under the shield icon for Defensa, plus any flat roll bonus) and speed. */
export function actionStats(def: ActionDefinition): CardStat[] {
  const stats: CardStat[] = [];
  // Flat roll bonus rendered inline with the dice (e.g. "2d6+1", "arma +2").
  const bonusStr = def.rollBonus
    ? `${def.rollBonus > 0 ? '+' : ''}${def.rollBonus}`
    : '';
  let bonusShown = false;
  if (def.dice) {
    const diceIcon = def.actionType === ActionType.Defensa ? STAT_ICONS.defense : STAT_ICONS.attack;
    stats.push({ iconPath: diceIcon, value: def.dice.toString() + bonusStr });
    bonusShown = true;
  }
  // Weapon actions roll the wielded weapon's dice (×times) instead of their own.
  const weaponEff = def.effects.find(e => e.type === 'weapon_damage');
  if (weaponEff) {
    const times = (weaponEff.params?.times as number) ?? 1;
    const label = times > 1 ? `arma×${times}` : 'arma';
    stats.push({ iconPath: STAT_ICONS.attack, value: bonusStr ? `${label} ${bonusStr}` : label });
    bonusShown = true;
  }
  // Erupció's damage formula: 1d6 × pressió (the pressure icon closes the
  // expression). Leads the row like any other damage stat.
  if (def.effects.some(e => e.type === 'eruption')) {
    stats.push({ iconPath: STAT_ICONS.attack, value: '1d6 ×', suffixIconPath: STAT_ICONS.pressure });
  }
  stats.push({ iconPath: STAT_ICONS.speed, value: def.speed > 0 ? `+${def.speed}` : String(def.speed) });
  // Diceless actions (some focus cards) still show a bare roll bonus.
  if (bonusStr && !bonusShown) stats.push({ iconPath: STAT_ICONS.defense, value: bonusStr });
  // Esgotadora cards show their above-default fatigue cost in the corner.
  if (def.fatigueCost !== undefined && def.fatigueCost !== 1) {
    stats.push({ iconPath: STAT_ICONS.fatigue, value: String(def.fatigueCost) });
  }
  // Bandolier cost: fixed càrregues for ordnance, or the whole pool (Traca final).
  const chargeEff = def.effects.find(e => e.type === 'charge_cost');
  if (chargeEff) {
    stats.push({ iconPath: STAT_ICONS.charge, value: String(chargeEff.params?.amount ?? 1) });
  } else if (def.effects.some(e => e.type === 'empty_bandolier')) {
    stats.push({ iconPath: STAT_ICONS.charge, value: 'tot' });
  }
  // Pressió cost: fixed for the geyser, the whole pool for Erupció.
  const pressureEff = def.effects.find(e => e.type === 'pressure_cost');
  if (pressureEff) {
    stats.push({ iconPath: STAT_ICONS.pressure, value: String(pressureEff.params?.amount ?? 1) });
  }
  // Pressió gain: stoking actions show it as a corner stat instead of desc text.
  const pressureGain = def.effects.find(e => e.type === 'pressure_gain');
  if (pressureGain) {
    stats.push({ iconPath: STAT_ICONS.pressure, value: `+${pressureGain.params?.amount ?? 1}` });
  } else if (def.effects.some(e => e.type === 'obsidian_skin')) {
    stats.push({ iconPath: STAT_ICONS.pressure, value: '+1' });
  }
  return stats;
}

export function actionToDisplayProps(def: ActionDefinition, classCss: string, skillName?: string): CardDisplayProps {
  return {
    name: def.name,
    subtitle: skillName
      ? `${ACTION_TYPE_DISPLAY_NAMES[def.actionType]} · ${skillName}`
      : ACTION_TYPE_DISPLAY_NAMES[def.actionType],
    classCss,
    typeCss: ACTION_TYPE_CSS[def.actionType],
    iconPath: def.iconPath,
    effectText: def.description || undefined,
    stats: actionStats(def),
    smallName: def.name.length > 16,
  };
}

export function equipmentToDisplayProps(eq: EquipmentDefinition): CardDisplayProps {
  const stats: CardStat[] = [];
  if (eq.dice) stats.push({ iconPath: STAT_ICONS.attack, value: eq.dice.toString() });
  if (eq.passiveArmor) stats.push({ iconPath: STAT_ICONS.defense, value: `+${eq.passiveArmor}` });
  if (eq.speedPenalty) stats.push({ iconPath: STAT_ICONS.speed, value: `-${eq.speedPenalty}` });
  // Roll bonuses: attack bonuses under the damage icon, defense (or any-roll)
  // bonuses under the shield icon.
  for (const b of eq.rollBonuses ?? []) {
    stats.push({
      iconPath: b.kind === 'attack' ? STAT_ICONS.attack : STAT_ICONS.defense,
      value: `${b.value > 0 ? '+' : ''}${b.value}`,
    });
  }
  // Weapons (anything with weapon dice) are labelled "Arma", armour "Armadura".
  const kind = eq.dice ? 'Arma' : eq.passiveArmor > 0 ? 'Armadura' : 'Objecte';
  return {
    name: eq.name,
    subtitle: `${kind} · ${eq.slotLabel ?? eq.slot}`,
    classCss: 'objecte',
    typeCss: 'objecte',
    iconPath: eq.iconPath,
    effectText: eq.description || undefined,
    stats,
    smallName: eq.name.length > 16,
  };
}

/** Inline-icon tokens used in skill / action descriptions. */
const TOKEN_ICON_MAP: Record<string, { icon: string; alt: string }> = {
  '{A}': { icon: 'icons/000000/transparent/1x1/lorc/crossed-swords.svg', alt: 'A' },
  '{D}': { icon: STAT_ICONS.defense, alt: 'D' },
  '{V}': { icon: STAT_ICONS.speed, alt: 'V' },
  '{DAMAGE}': { icon: STAT_ICONS.damage, alt: 'Dany' },
  '{FATIGA}': { icon: STAT_ICONS.fatigue, alt: 'Fatiga' },
};

/** Render **bold** markup and {A}/{D}/{V}/{DAMAGE}/{FATIGA} icon tokens to inline HTML. */
export function renderDescription(text: string): string {
  const base = import.meta.env.BASE_URL;
  return text
    .replace(/\{(?:A|D|V|DAMAGE|FATIGA)\}/g, token => {
      const entry = TOKEN_ICON_MAP[token];
      return entry
        ? `<img src="${base}${entry.icon}" class="rules-icon" alt="${entry.alt}">`
        : token;
    })
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
