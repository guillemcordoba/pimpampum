<script setup lang="ts">
import { ref } from 'vue';
import { getScaledStats, STAT_ICONS, STAT_DISPLAY_NAMES, ALL_ENCOUNTERS, ALL_CHARACTER_TEMPLATES } from '@pimpampum/engine';
import type { CharacterTemplate, EncounterDefinition } from '@pimpampum/engine';

const base = import.meta.env.BASE_URL;
const playerCount = ref(5);

function getCharacterStats(t: CharacterTemplate) {
  return [
    { key: 'lives' as const, value: t.baseLives, icon: STAT_ICONS.lives, label: STAT_DISPLAY_NAMES.lives },
    { key: 'strength' as const, value: t.baseStrength, icon: STAT_ICONS.strength, label: STAT_DISPLAY_NAMES.strength },
    { key: 'magic' as const, value: t.baseMagic, icon: STAT_ICONS.magic, label: STAT_DISPLAY_NAMES.magic },
    { key: 'defense' as const, value: t.baseDefense, icon: STAT_ICONS.defense, label: STAT_DISPLAY_NAMES.defense },
    { key: 'speed' as const, value: t.baseSpeed, icon: STAT_ICONS.speed, label: STAT_DISPLAY_NAMES.speed },
  ];
}

function getScaledCharacterStats(t: CharacterTemplate, pc: number) {
  const scaled = getScaledStats(t, pc);
  return [
    { key: 'lives' as const, value: scaled.lives, base: t.baseLives, icon: STAT_ICONS.lives, label: STAT_DISPLAY_NAMES.lives },
    { key: 'strength' as const, value: scaled.strength, base: t.baseStrength, icon: STAT_ICONS.strength, label: STAT_DISPLAY_NAMES.strength },
    { key: 'magic' as const, value: scaled.magic, base: t.baseMagic, icon: STAT_ICONS.magic, label: STAT_DISPLAY_NAMES.magic },
    { key: 'defense' as const, value: scaled.defense, base: t.baseDefense, icon: STAT_ICONS.defense, label: STAT_DISPLAY_NAMES.defense },
    { key: 'speed' as const, value: scaled.speed, base: t.baseSpeed, icon: STAT_ICONS.speed, label: STAT_DISPLAY_NAMES.speed },
  ];
}

function getEncounterGroups(enc: EncounterDefinition, pc: number) {
  const groups = enc.compositions[pc];
  if (!groups) return [];
  return groups.map(g => {
    const tmpl = ALL_CHARACTER_TEMPLATES.find(t => t.id === g.templateId);
    return { ...g, template: tmpl };
  });
}
</script>

<template>
  <div class="encounters-page">
    <h1 class="screen-title">Equips enemics</h1>

    <div class="player-count-selector">
      <span class="player-count-label">Jugadors:</span>
      <button
        v-for="pc in [3, 4, 5, 6]"
        :key="pc"
        class="player-count-btn"
        :class="{ active: playerCount === pc, baseline: pc === 5 }"
        @click="playerCount = pc"
      >{{ pc }}</button>
    </div>

    <div class="encounters-list">
      <div
        v-for="enc in ALL_ENCOUNTERS"
        :key="enc.id"
        class="encounter-card"
      >
        <div class="encounter-header">
          <h3 class="encounter-name">{{ enc.name }}</h3>
          <span class="encounter-difficulty" :class="enc.difficulty">{{ enc.difficulty === 'tutorial' ? 'Tutorial' : enc.difficulty === 'normal' ? 'Normal' : 'Difícil' }}</span>
        </div>
        <div class="encounter-groups">
          <div
            v-for="(group, gi) in getEncounterGroups(enc, playerCount)"
            :key="gi"
            class="encounter-group"
          >
            <div class="encounter-group-header">
              <img v-if="group.template" :src="base + group.template.iconPath" :alt="group.template?.displayName" class="encounter-group-icon">
              <span class="encounter-group-count">{{ group.count }}x</span>
              <span class="encounter-group-name">{{ group.template?.displayName ?? group.templateId }}</span>
            </div>
            <div v-if="group.template?.scaling" class="encounter-group-stats">
              <span
                v-for="stat in getScaledCharacterStats(group.template!, playerCount)"
                :key="stat.key"
                class="encounter-stat"
                :class="{
                  'stat-up': stat.value > stat.base,
                  'stat-down': stat.value < stat.base,
                }"
              >
                <img :src="base + stat.icon" :alt="stat.label" class="encounter-stat-icon">{{ stat.value }}
              </span>
            </div>
            <div v-else-if="group.template" class="encounter-group-stats">
              <span
                v-for="stat in getCharacterStats(group.template!)"
                :key="stat.key"
                class="encounter-stat"
              >
                <img :src="base + stat.icon" :alt="stat.label" class="encounter-stat-icon">{{ stat.value }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.encounters-page {
  padding: 1rem;
}

/* -- Player count selector -- */
.player-count-selector {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.player-count-label {
  font-family: 'MedievalSharp', serif;
  font-size: 1rem;
  color: var(--parchment-dark);
  margin-right: 0.25rem;
}

.player-count-btn {
  width: 36px;
  height: 36px;
  border: 2px solid rgba(232, 220, 196, 0.2);
  border-radius: 6px;
  background: rgba(232, 220, 196, 0.06);
  color: var(--parchment-dark);
  font-family: 'MedievalSharp', serif;
  font-size: 1.1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.player-count-btn:hover {
  background: rgba(232, 220, 196, 0.12);
  color: var(--parchment);
}

.player-count-btn.active {
  background: rgba(232, 220, 196, 0.15);
  color: var(--parchment);
  border-color: var(--parchment-dark);
}

.player-count-btn.baseline {
  border-style: dashed;
}

.player-count-btn.baseline.active {
  border-style: solid;
}

/* -- Scaled stat indicators -- */
.stat-up {
  color: #6b9e6b !important;
}

.stat-down {
  color: #c4784e !important;
}

/* -- Encounters list -- */
.encounters-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 700px;
  margin: 0 auto;
}

.encounter-card {
  border: 2px solid rgba(232, 220, 196, 0.2);
  border-radius: 8px;
  background: rgba(232, 220, 196, 0.06);
  overflow: hidden;
}

.encounter-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 1rem;
  background: rgba(232, 220, 196, 0.08);
  border-bottom: 1px solid rgba(232, 220, 196, 0.12);
}

.encounter-name {
  font-family: 'Cinzel Decorative', serif;
  font-size: 1rem;
  font-weight: 700;
  color: var(--parchment);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0;
}

.encounter-difficulty {
  font-family: 'Crimson Text', serif;
  font-size: 0.85rem;
  padding: 0.15rem 0.6rem;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.encounter-difficulty.tutorial {
  background: rgba(107, 158, 107, 0.2);
  color: #8bc48b;
  border: 1px solid rgba(107, 158, 107, 0.3);
}

.encounter-difficulty.normal {
  background: rgba(196, 176, 120, 0.2);
  color: #c4b078;
  border: 1px solid rgba(196, 176, 120, 0.3);
}

.encounter-difficulty.hard {
  background: rgba(196, 100, 78, 0.2);
  color: #c4644e;
  border: 1px solid rgba(196, 100, 78, 0.3);
}

.encounter-groups {
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.encounter-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.encounter-group-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.encounter-group-icon {
  width: 24px;
  height: 24px;
  filter: invert(0.7);
}

.encounter-group-count {
  font-family: 'MedievalSharp', serif;
  font-size: 1.05rem;
  color: var(--parchment);
  font-weight: bold;
  min-width: 2em;
}

.encounter-group-name {
  font-family: 'Crimson Text', serif;
  font-size: 1rem;
  color: var(--parchment-dark);
}

.encounter-group-stats {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.encounter-stat {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  font-family: 'Crimson Text', serif;
  font-size: 0.85rem;
  color: var(--parchment-dark);
}

.encounter-stat-icon {
  width: 14px;
  height: 14px;
  filter: invert(0.6);
}
</style>
