<script setup lang="ts">
import { computed } from 'vue';
import { ALL_EQUIPMENT } from '@pimpampum/skills';
import { equipmentToDisplayProps } from '../composables/useActionDisplay';
import PrintableCard from '../components/cards/PrintableCard.vue';
import CardGrid from '../components/cards/CardGrid.vue';

const equipCards = computed(() => ALL_EQUIPMENT.map(e => equipmentToDisplayProps(e)));
</script>

<template>
  <div class="objects-page">
    <CardGrid>
      <PrintableCard v-for="(c, i) in equipCards" :key="i" v-bind="c" />
    </CardGrid>
  </div>
</template>

<style scoped>
.objects-page { padding: 1rem; }
</style>
