<script setup lang="ts">
import { computed } from 'vue';
import { ALL_EQUIPMENT, PLAYER_TEMPLATES, ENEMY_TEMPLATES } from '@pimpampum/engine';
import type { CharacterTemplate, EquipmentTemplate } from '@pimpampum/engine';

const base = import.meta.env.BASE_URL;

defineProps<{
  templates: CharacterTemplate[];
  playerTeam: CharacterTemplate[];
  enemyTeam: CharacterTemplate[];
  playerEquipment: string[][];
  enemyEquipment: string[][];
}>();

const emit = defineEmits<{
  (e: 'addPlayer', template: CharacterTemplate): void;
  (e: 'removePlayer', index: number): void;
  (e: 'addEnemy', template: CharacterTemplate): void;
  (e: 'removeEnemy', index: number): void;
  (e: 'setPlayerEquipment', charIdx: number, equipIds: string[]): void;
  (e: 'setEnemyEquipment', charIdx: number, equipIds: string[]): void;
  (e: 'start'): void;
}>();

const equipBySlot = computed(() => {
  const map = new Map<string, EquipmentTemplate[]>();
  for (const eq of ALL_EQUIPMENT) {
    const list = map.get(eq.slotLabel) ?? [];
    list.push(eq);
    map.set(eq.slotLabel, list);
  }
  return map;
});

function toggleEquip(team: 'player' | 'enemy', charIdx: number, currentIds: string[], eqId: string, slotLabel: string) {
  const slotIds = new Set((equipBySlot.value.get(slotLabel) ?? []).map(e => e.id));
  let newIds = currentIds.filter(id => !slotIds.has(id));
  if (!currentIds.includes(eqId)) {
    newIds.push(eqId);
  }
  if (team === 'player') {
    emit('setPlayerEquipment', charIdx, newIds);
  } else {
    emit('setEnemyEquipment', charIdx, newIds);
  }
}
</script>

<template>
  <div class="screen">
    <p class="screen-subtitle">Tria els teus personatges i enemics</p>

    <div class="setup-four-col">
      <!-- Player team -->
      <div class="setup-side">
        <div class="team-header">El teu equip</div>
        <div class="team-slots">
          <div v-for="(t, i) in playerTeam" :key="i" class="team-slot-wrap">
            <div class="team-slot" :class="t.classCss">
              <img :src="base + t.iconPath" :alt="t.displayName">
              <span class="slot-name">{{ t.displayName }}</span>
              <span class="portrait-stats">
                PV:{{ t.baseLives }} F:{{ t.baseStrength }} M:{{ t.baseMagic }} D:{{ t.baseDefense }} V:{{ t.baseSpeed }}
              </span>
              <button class="remove-btn" @click="emit('removePlayer', i)">&times;</button>
            </div>
            <div class="equip-picker">
              <div v-for="[slotLabel, items] in equipBySlot" :key="slotLabel" class="equip-slot-row">
                <span class="equip-slot-label">{{ slotLabel }}:</span>
                <button
                  class="equip-toggle"
                  :class="{ active: !items.some(eq => (playerEquipment[i] ?? []).includes(eq.id)) }"
                  @click="toggleEquip('player', i, playerEquipment[i] ?? [], '', slotLabel)"
                >Cap</button>
                <button
                  v-for="eq in items"
                  :key="eq.id"
                  class="equip-toggle"
                  :class="{ active: (playerEquipment[i] ?? []).includes(eq.id) }"
                  :title="eq.effectLabel ?? `D:${eq.defenseLabel} V:${eq.speedLabel}`"
                  @click="toggleEquip('player', i, playerEquipment[i] ?? [], eq.id, slotLabel)"
                >{{ eq.name }}</button>
              </div>
            </div>
          </div>
          <div v-if="playerTeam.length === 0" class="team-empty">
            Afegeix personatges &rarr;
          </div>
        </div>
      </div>

      <!-- Player character roster -->
      <div class="setup-roster">
        <div class="roster-header">Personatges</div>
        <div class="roster-list">
          <div
            v-for="t in PLAYER_TEMPLATES"
            :key="t.id"
            class="roster-row"
            :class="t.classCss"
          >
            <button class="roster-arrow" @click="emit('addPlayer', t)">&larr;</button>
            <img :src="base + t.iconPath" :alt="t.displayName">
            <span class="roster-row-name">{{ t.displayName }}</span>
            <span class="roster-row-stats">PV:{{ t.baseLives }} F:{{ t.baseStrength }} M:{{ t.baseMagic }} D:{{ t.baseDefense }} V:{{ t.baseSpeed }}</span>
            <button class="roster-arrow" @click="emit('addEnemy', t)">&rarr;</button>
          </div>
        </div>
      </div>

      <!-- Enemy character roster -->
      <div class="setup-roster">
        <div class="roster-header">Enemics</div>
        <div class="roster-list">
          <div
            v-for="t in ENEMY_TEMPLATES"
            :key="t.id"
            class="roster-row"
            :class="t.classCss"
          >
            <button class="roster-arrow" @click="emit('addPlayer', t)">&larr;</button>
            <img :src="base + t.iconPath" :alt="t.displayName">
            <span class="roster-row-name">{{ t.displayName }}</span>
            <span class="roster-row-stats">PV:{{ t.baseLives }} F:{{ t.baseStrength }} M:{{ t.baseMagic }} D:{{ t.baseDefense }} V:{{ t.baseSpeed }}</span>
            <button class="roster-arrow" @click="emit('addEnemy', t)">&rarr;</button>
          </div>
        </div>
      </div>

      <!-- Enemy team -->
      <div class="setup-side">
        <div class="team-header">El seu equip</div>
        <div class="team-slots">
          <div v-for="(t, i) in enemyTeam" :key="i" class="team-slot-wrap">
            <div class="team-slot" :class="t.classCss">
              <img :src="base + t.iconPath" :alt="t.displayName">
              <span class="slot-name">{{ t.displayName }}</span>
              <span class="portrait-stats">
                PV:{{ t.baseLives }} F:{{ t.baseStrength }} M:{{ t.baseMagic }} D:{{ t.baseDefense }} V:{{ t.baseSpeed }}
              </span>
              <button class="remove-btn" @click="emit('removeEnemy', i)">&times;</button>
            </div>
            <div class="equip-picker">
              <div v-for="[slotLabel, items] in equipBySlot" :key="slotLabel" class="equip-slot-row">
                <span class="equip-slot-label">{{ slotLabel }}:</span>
                <button
                  class="equip-toggle"
                  :class="{ active: !items.some(eq => (enemyEquipment[i] ?? []).includes(eq.id)) }"
                  @click="toggleEquip('enemy', i, enemyEquipment[i] ?? [], '', slotLabel)"
                >Cap</button>
                <button
                  v-for="eq in items"
                  :key="eq.id"
                  class="equip-toggle"
                  :class="{ active: (enemyEquipment[i] ?? []).includes(eq.id) }"
                  :title="eq.effectLabel ?? `D:${eq.defenseLabel} V:${eq.speedLabel}`"
                  @click="toggleEquip('enemy', i, enemyEquipment[i] ?? [], eq.id, slotLabel)"
                >{{ eq.name }}</button>
              </div>
            </div>
          </div>
          <div v-if="enemyTeam.length === 0" class="team-empty">
            &larr; Afegeix enemics
          </div>
        </div>
      </div>
    </div>

    <div class="setup-actions">
      <button
        class="btn btn-primary"
        :disabled="playerTeam.length === 0 || enemyTeam.length === 0"
        @click="emit('start')"
      >
        Comença!
      </button>
    </div>
  </div>
</template>
