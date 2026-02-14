<script setup lang="ts">
import type { Character } from '@pimpampum/engine';
import type { CharacterTemplate } from '@pimpampum/engine';
import MiniCard from './MiniCard.vue';

const props = defineProps<{
  character: Character;
  template: CharacterTemplate;
  selectedCardIdx: number | null;
  disabled?: boolean;
  setAsideIndices?: Set<number>;
}>();

const emit = defineEmits<{
  (e: 'selectCard', cardIdx: number): void;
}>();
</script>

<template>
  <div class="card-hand">
    <MiniCard
      v-for="(card, i) in character.cards"
      :key="i"
      :card="card"
      :class-css="template.classCss"
      :selected="selectedCardIdx === i"
      :disabled="disabled"
      :set-aside="setAsideIndices?.has(i) ?? false"
      @select="emit('selectCard', i)"
    />
  </div>
</template>
