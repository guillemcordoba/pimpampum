<script setup lang="ts">
import { STAT_ICONS, STAT_DISPLAY_NAMES } from '@pimpampum/engine';

const stats = [
  { key: 'strength' as const },
  { key: 'magic' as const },
  { key: 'defense' as const },
  { key: 'speed' as const },
];

const equipmentSlots = [
  { label: 'Cap', icon: 'icons/000000/transparent/1x1/lorc/visored-helm.svg' },
  { label: 'Tors', icon: 'icons/000000/transparent/1x1/lorc/armor-vest.svg' },
  { label: 'Braços', icon: 'icons/000000/transparent/1x1/lorc/mailed-fist.svg' },
  { label: 'Cames', icon: 'icons/000000/transparent/1x1/delapouite/leg-armor.svg' },
];

const maxLifeCircles = 6;
</script>

<template>
  <div class="character-sheet">
    <div class="sheet-frame"></div>
    <div class="sheet-inner">
      <!-- Top row: name/class + lives -->
      <div class="sheet-top">
        <div class="sheet-header">
          <div class="sheet-name-line">
            <span class="sheet-label">Nom:</span>
            <span class="sheet-blank-line"></span>
          </div>
          <div class="sheet-name-line">
            <span class="sheet-label">Classe:</span>
            <span class="sheet-blank-line"></span>
          </div>
        </div>
        <div class="sheet-lives">
          <div class="sheet-section-title">Punts de vida</div>
          <div class="sheet-lives-row">
            <span class="sheet-pv">PV:</span>
            <span class="sheet-stat-box empty"></span>
            <div class="life-circles">
              <span
                v-for="i in maxLifeCircles"
                :key="i"
                class="life-circle"
              ></span>
            </div>
          </div>
        </div>
      </div>

      <!-- Middle: 4 stat blocks in a row -->
      <div class="sheet-stats-row">
        <div v-for="stat in stats" :key="stat.key" class="stat-block">
          <!-- Stat header: icon + name + base box -->
          <div class="stat-block-header">
            <img class="stat-block-icon" :src="'/' + STAT_ICONS[stat.key]" :alt="stat.key">
            <span class="stat-block-name">{{ STAT_DISPLAY_NAMES[stat.key] }}</span>
            <span class="sheet-stat-box empty"></span>
          </div>
          <!-- Modifier area (open box for dice) -->
          <div class="stat-block-modifier">
            <span class="stat-block-mod-label">Mod.</span>
          </div>
        </div>
      </div>

      <!-- Bottom row: equipment slots -->
      <div class="sheet-equipment">
        <div v-for="slot in equipmentSlots" :key="slot.label" class="equip-slot">
          <img class="equip-slot-icon" :src="'/' + slot.icon" :alt="slot.label">
          <span class="equip-slot-label">{{ slot.label }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
