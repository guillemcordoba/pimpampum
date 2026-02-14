<script setup lang="ts">
import { RULES_SUMMARY } from '@pimpampum/engine';
</script>

<template>
  <div class="print-card rules-card">
    <div class="card-frame"></div>
    <div class="card-inner">
      <div class="card-header rules-header">
        <div class="card-name">Regles</div>
      </div>
      <div class="rules-content">
        <div v-for="(section, i) in RULES_SUMMARY" :key="i" class="rules-section">
          <div class="rules-title">{{ section.title }}</div>
          <ol v-if="section.type === 'ordered-list'" class="rules-list">
            <li v-for="(item, j) in section.items" :key="j">{{ item }}</li>
          </ol>
          <div v-else class="rules-text">{{ section.text }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
