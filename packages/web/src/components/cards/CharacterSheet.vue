<script setup lang="ts">
import { STAT_ICONS } from '@pimpampum/engine';

const base = import.meta.env.BASE_URL;

// Number of blank skill rows. The skill-based system has no fixed stats —
// players write the skills they actually picked on the fly.
const SKILL_ROWS = 3;
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
            <span class="sheet-label">Raça</span>
            <div class="sheet-field-lines">
              <div class="sheet-blank-line"></div>
            </div>
          </div>
        </div>

        <!-- Right column: PV + fillable skill rows -->
        <div class="sheet-col-right">
          <div class="sheet-stats-list">
            <!-- Vida (the only fixed stat) -->
            <div class="sheet-stat-row sheet-stat-row-vida">
              <img class="sheet-stat-icon" :src="base + STAT_ICONS.pv" alt="pv">
              <span class="sheet-stat-name">Vida</span>
              <div class="sheet-wounds-box"></div>
              <span class="sheet-pv-slash">/</span>
              <div class="sheet-stat-box empty"></div>
            </div>
            <!-- Fillable skill rows: write the skill name on the line, level in the box -->
            <div v-for="i in SKILL_ROWS" :key="i" class="sheet-stat-row sheet-skill-row">
              <div class="sheet-blank-line sheet-skill-name"></div>
              <div class="sheet-stat-box empty"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom: fatigue token track + untitled resource-tracking area -->
      <div class="sheet-bottom-blocks">
        <div class="sheet-block-wrapper">
          <span class="sheet-block-title">
            <img class="sheet-stat-icon" :src="base + STAT_ICONS.fatigue" alt="fatiga">
            Fatiga
          </span>
          <div class="sheet-block"></div>
        </div>
        <div class="sheet-block-wrapper">
          <!-- Empty title spacer keeps this block the same height as Fatiga's. -->
          <span class="sheet-block-title"></span>
          <div class="sheet-block"></div>
        </div>
      </div>
    </div>
  </div>
</template>
