import {
  CARD_TYPE_DISPLAY_NAMES,
  CARD_TYPE_CSS,
  CARD_ICONS,
  STAT_ICONS,
} from '@pimpampum/engine';
import type { Card, EquipmentTemplate } from '@pimpampum/engine';

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

export function cardToDisplayProps(card: Card, classCss: string, className: string): CardDisplayProps {
  const typeName = CARD_TYPE_DISPLAY_NAMES[card.cardType];
  const typeCss = CARD_TYPE_CSS[card.cardType];
  const iconPath = CARD_ICONS[card.name] ?? '';

  const stats: CardStat[] = [];

  if (card.physicalAttack) {
    stats.push({ iconPath: STAT_ICONS.strength, value: card.physicalAttack.toString() });
  }
  if (card.magicAttack) {
    stats.push({ iconPath: STAT_ICONS.magic, value: card.magicAttack.toString() });
  }
  if (card.defense) {
    stats.push({ iconPath: STAT_ICONS.defense, value: card.defense.toString() });
  }
  if (card.speedMod !== 0) {
    const prefix = card.speedMod > 0 ? '+' : '';
    stats.push({ iconPath: STAT_ICONS.speed, value: `${prefix}${card.speedMod}` });
  }

  return {
    name: card.name,
    subtitle: `${typeName} | ${className}`,
    classCss,
    typeCss,
    iconPath,
    effectText: card.description || undefined,
    stats,
    smallName: card.name.length > 16,
  };
}

const STAT_TOKEN_MAP: Record<string, string> = {
  '{F}': '/' + STAT_ICONS.strength,
  '{M}': '/' + STAT_ICONS.magic,
  '{D}': '/' + STAT_ICONS.defense,
  '{V}': '/' + STAT_ICONS.speed,
};

/** Convert {F}, {M}, {D}, {V} tokens in description text to inline icon HTML */
export function renderDescription(text: string): string {
  return text.replace(/\{[FMDV]\}/g, (token) => {
    const src = STAT_TOKEN_MAP[token];
    return src ? `<img src="${src}" class="rules-icon" alt="${token[1]}">` : token;
  });
}

export function equipmentToDisplayProps(template: EquipmentTemplate): CardDisplayProps {
  const stats: CardStat[] = [];

  stats.push({ iconPath: STAT_ICONS.defense, value: template.defenseLabel });
  stats.push({ iconPath: STAT_ICONS.speed, value: template.speedLabel });

  return {
    name: template.name,
    subtitle: `Objecte | ${template.slotLabel}`,
    classCss: 'objecte',
    typeCss: 'defensa',
    iconPath: template.iconPath,
    stats,
    smallName: false,
  };
}
