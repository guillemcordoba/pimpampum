<script setup lang="ts">
import { STAT_ICONS, STAT_DISPLAY_NAMES } from '@pimpampum/engine';
import type { CharacterTemplate } from '@pimpampum/engine';

const base = import.meta.env.BASE_URL;

const props = defineProps<{
  template: CharacterTemplate;
  subtitle?: string;
}>();

const stats = [
  { key: 'strength' as const, value: props.template.baseStrength },
  { key: 'magic' as const, value: props.template.baseMagic },
  { key: 'defense' as const, value: props.template.baseDefense },
  { key: 'speed' as const, value: props.template.baseSpeed },
];
</script>

<template>
  <div class="print-card character" :class="template.classCss">
    <div class="card-frame"></div>
    <div class="card-inner">
      <div class="card-header">
        <div class="card-name">{{ template.displayName }}</div>
        <div class="card-subtitle">{{ subtitle ?? (template.category === 'player' ? 'Personatge' : 'Enemic') }}</div>
      </div>
      <div class="card-art">
        <img :src="base + template.iconPath" :alt="template.displayName">
      </div>
      <div class="character-stats">
        <div v-for="stat in stats" :key="stat.key" class="character-stat">
          <span class="character-stat-icon"><img :src="base + STAT_ICONS[stat.key]" :alt="stat.key"></span>
          <span class="character-stat-name">{{ STAT_DISPLAY_NAMES[stat.key] }}</span>
          <span class="character-stat-value">{{ stat.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
