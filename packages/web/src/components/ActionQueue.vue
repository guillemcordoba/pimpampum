<script setup lang="ts">
import type { Character, CharacterTemplate, PlannedAction } from '@pimpampum/engine';
import { STAT_ICONS } from '@pimpampum/engine';
import MiniCard from './MiniCard.vue';

const base = import.meta.env.BASE_URL;

const props = defineProps<{
  actions: PlannedAction[];
  currentIndex: number;
  playerTeam: Character[];
  enemyTeam: Character[];
  playerTeamTemplates: CharacterTemplate[];
  enemyTeamTemplates: CharacterTemplate[];
}>();

function getCard(action: PlannedAction) {
  const team = action.team === 1 ? props.playerTeam : props.enemyTeam;
  return team[action.charIdx].cards[action.cardIdx];
}

function getClassCss(action: PlannedAction) {
  const templates = action.team === 1 ? props.playerTeamTemplates : props.enemyTeamTemplates;
  return templates[action.charIdx].classCss;
}

function itemState(index: number): 'pending' | 'active' | 'resolved' {
  if (props.currentIndex < 0) return 'pending';
  if (index < props.currentIndex) return 'resolved';
  if (index === props.currentIndex) return 'active';
  return 'pending';
}
</script>

<template>
  <div class="action-queue-row">
    <div
      v-for="(action, i) in actions"
      :key="i"
      class="action-queue-card"
      :class="itemState(i)"
    >
      <div class="action-queue-label">
        <span class="action-team-dot" :class="action.team === 1 ? 'player' : 'enemy'"></span>
        <span class="action-queue-char-name">{{ action.characterName }}</span>
        <span class="action-queue-speed">
          <img :src="base + STAT_ICONS.speed" alt="V" class="action-speed-icon">
          {{ action.effectiveSpeed }}
        </span>
      </div>
      <MiniCard
        :card="getCard(action)"
        :class-css="getClassCss(action)"
        :disabled="true"
      />
    </div>
  </div>
</template>
