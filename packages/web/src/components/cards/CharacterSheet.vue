<script setup lang="ts">
import { STAT_ICONS, STAT_DISPLAY_NAMES } from '@pimpampum/engine';

const base = import.meta.env.BASE_URL;

const stats = [
  { key: 'strength' as const },
  { key: 'magic' as const },
  { key: 'defense' as const },
  { key: 'speed' as const },
];
</script>

<template>
  <div class="character-sheet">
    <div class="sheet-frame"></div>
    <div class="sheet-inner">
      <div class="sheet-columns">
        <!-- Left column: identity fields -->
        <div class="sheet-col-left">
          <div class="sheet-field">
            <span class="sheet-label">Nom</span>
            <div class="sheet-field-lines">
              <div class="sheet-blank-line"></div>
            </div>
          </div>
          <div class="sheet-field">
            <span class="sheet-label">Classe</span>
            <div class="sheet-field-lines">
              <div class="sheet-blank-line"></div>
            </div>
          </div>
          <div class="sheet-field">
            <span class="sheet-label">Raça</span>
            <div class="sheet-field-lines">
              <div class="sheet-blank-line"></div>
            </div>
          </div>
          <div class="sheet-field sheet-field-grow">
            <span class="sheet-label">Trets</span>
            <div class="sheet-field-lines">
              <div class="sheet-blank-line"></div>
              <div class="sheet-blank-line"></div>
              <div class="sheet-blank-line"></div>
              <div class="sheet-blank-line"></div>
            </div>
          </div>
        </div>

        <!-- Right column: PV + stats -->
        <div class="sheet-col-right">
          <div class="sheet-stats-list">
            <!-- Vida -->
            <div class="sheet-stat-row sheet-stat-row-vida">
              <img class="sheet-stat-icon" :src="base + STAT_ICONS.lives" alt="lives">
              <span class="sheet-stat-name">Vida</span>
              <div class="sheet-wounds-box"></div>
              <span class="sheet-pv-slash">/</span>
              <div class="sheet-stat-box empty"></div>
            </div>
            <!-- Other stats -->
            <div v-for="stat in stats" :key="stat.key" class="sheet-stat-row">
              <img class="sheet-stat-icon" :src="base + STAT_ICONS[stat.key]" :alt="stat.key">
              <span class="sheet-stat-name">{{ STAT_DISPLAY_NAMES[stat.key] }}</span>
              <span class="sheet-stat-box empty"></span>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom: blocks -->
      <div class="sheet-bottom-blocks">
        <div class="sheet-block-wrapper">
          <span class="sheet-block-title">Història</span>
          <div class="sheet-block"></div>
        </div>
        <div class="sheet-block-wrapper">
          <span class="sheet-block-title">Notes</span>
          <div class="sheet-block"></div>
        </div>
      </div>
    </div>
  </div>
</template>
