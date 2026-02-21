<script setup lang="ts">
import { computed } from 'vue';
import { Card, CardType, isPhysical, CARD_ICONS, STAT_ICONS } from '@pimpampum/engine';
import { renderDescription } from '../composables/useCardDisplay';

const base = import.meta.env.BASE_URL;

const props = defineProps<{
  card: Card;
  classCss: string;
  selected?: boolean;
  disabled?: boolean;
  setAside?: boolean;
  consumed?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select'): void;
}>();

const headerClass = computed(() => {
  switch (props.card.cardType) {
    case CardType.PhysicalAttack:
    case CardType.PhysicalDefense:
      return 'atac-fisic';
    case CardType.MagicAttack:
      return 'atac-magic';
    case CardType.Defense:
      return 'defensa';
    case CardType.Focus:
      return 'focus';
  }
});

const iconPath = computed(() => {
  return base + (CARD_ICONS[props.card.name] ?? 'icons/000000/transparent/1x1/lorc/crossed-swords.svg');
});

const stats = computed(() => {
  const result: { icon: string; value: string }[] = [];
  if (props.card.physicalAttack) {
    result.push({ icon: base + STAT_ICONS.strength, value: props.card.physicalAttack.toString() });
  }
  if (props.card.magicAttack) {
    result.push({ icon: base + STAT_ICONS.magic, value: props.card.magicAttack.toString() });
  }
  if (props.card.defense) {
    result.push({ icon: base + STAT_ICONS.defense, value: props.card.defense.toString() });
  }
  if (props.card.speedMod !== 0) {
    const sign = props.card.speedMod > 0 ? '+' : '';
    result.push({ icon: base + STAT_ICONS.speed, value: `${sign}${props.card.speedMod}` });
  }
  return result;
});

const renderedDescription = computed(() =>
  props.card.description ? renderDescription(props.card.description) : '',
);
</script>

<template>
  <div
    class="mini-card"
    :class="[classCss, { selected, disabled, 'set-aside': setAside, consumed }]"
    @click="!disabled && !setAside && !consumed && emit('select')"
  >
    <div v-if="setAside" class="set-aside-overlay">EN JOC</div>
    <div v-if="consumed" class="consumed-overlay">CONSUMIT</div>
    <div class="mini-card-header" :class="headerClass">
      {{ card.name }}
    </div>
    <div class="mini-card-art">
      <img :src="iconPath" :alt="card.name">
    </div>
    <div class="mini-card-bottom">
      <div v-if="card.description" class="mini-card-effect" v-html="renderedDescription">
      </div>
      <div class="mini-card-stats">
        <span v-for="(s, i) in stats" :key="i" style="display: flex; align-items: center; gap: 1px;">
          <img :src="s.icon" :alt="s.value">
          {{ s.value }}
        </span>
      </div>
    </div>
  </div>
</template>
