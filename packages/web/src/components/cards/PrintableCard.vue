<script setup lang="ts">
import { computed } from 'vue';
import { renderDescription } from '../../composables/useCardDisplay';
import type { CardStat } from '../../composables/useCardDisplay';

const props = defineProps<{
  name: string;
  subtitle: string;
  classCss: string;
  typeCss: string;
  iconPath: string;
  effectText?: string;
  stats: CardStat[];
  smallName?: boolean;
}>();

const base = import.meta.env.BASE_URL;

const renderedEffect = computed(() =>
  props.effectText ? renderDescription(props.effectText) : '',
);
</script>

<template>
  <div class="print-card" :class="[classCss, typeCss]">
    <div class="card-frame"></div>
    <div class="card-inner">
      <div class="card-header">
        <div class="card-name" :class="{ small: smallName }">{{ name }}</div>
        <div class="card-subtitle">{{ subtitle }}</div>
      </div>
      <div class="card-art">
        <img :src="base + iconPath" :alt="name">
      </div>
      <div v-if="effectText" class="card-effect" v-html="renderedEffect"></div>
      <div class="card-stats">
        <div v-for="(stat, i) in stats" :key="i" class="stat">
          <span class="stat-icon"><img :src="base + stat.iconPath" :alt="stat.value"></span>
          <span class="stat-value">{{ stat.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
