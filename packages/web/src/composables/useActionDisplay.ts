import { ACTION_TYPE_DISPLAY_NAMES, ACTION_TYPE_CSS, STAT_ICONS } from '@pimpampum/engine';
import type { ActionDefinition, EquipmentDefinition } from '@pimpampum/engine';

export interface CardStat {
  iconPath: string;
  value: string;
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

/** Stat row for an action card: damage dice, speed, and any flat roll bonus. */
export function actionStats(def: ActionDefinition): CardStat[] {
  const stats: CardStat[] = [];
  if (def.damageDice) stats.push({ iconPath: STAT_ICONS.damage, value: def.damageDice.toString() });
  stats.push({ iconPath: STAT_ICONS.speed, value: def.speed > 0 ? `+${def.speed}` : String(def.speed) });
  if (def.rollBonus) stats.push({ iconPath: STAT_ICONS.armor, value: `+${def.rollBonus}` });
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
  if (eq.passiveArmor) stats.push({ iconPath: STAT_ICONS.armor, value: `+${eq.passiveArmor}` });
  if (eq.speedPenalty) stats.push({ iconPath: STAT_ICONS.speed, value: `-${eq.speedPenalty}` });
  return {
    name: eq.name,
    subtitle: `Objecte · ${eq.slotLabel ?? eq.slot}`,
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
  '{D}': { icon: STAT_ICONS.armor, alt: 'D' },
  '{V}': { icon: STAT_ICONS.speed, alt: 'V' },
  '{DAMAGE}': { icon: STAT_ICONS.damage, alt: 'Dany' },
};

/** Render **bold** markup and {A}/{D}/{V}/{DAMAGE} icon tokens to inline HTML. */
export function renderDescription(text: string): string {
  const base = import.meta.env.BASE_URL;
  return text
    .replace(/\{(?:A|D|V|DAMAGE)\}/g, token => {
      const entry = TOKEN_ICON_MAP[token];
      return entry
        ? `<img src="${base}${entry.icon}" class="rules-icon" alt="${entry.alt}">`
        : token;
    })
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
