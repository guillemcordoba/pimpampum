<script setup lang="ts">
/**
 * Layout host for everything under `/combats`.
 *
 * It used to carry a sub-tab strip, but the two things a GM actually navigates
 * to — their parties and the encounter creator — are top-level tabs now, and
 * the AI fight is not a destination at all: it is something the creator starts.
 * So this is purely the piece that hands its height down to the active section,
 * which is what lets those screens size to the window instead of the viewport.
 */
</script>

<template>
  <div class="combats-page">
    <router-view />
  </div>
</template>

<style scoped>
/* Fills <main> exactly, so sections size to the screen instead of pushing the
   whole page into a scrollbar. */
.combats-page { height: 100%; display: flex; flex-direction: column; min-height: 0; }
.combats-page > * { flex: 1; min-height: 0; }

@media (max-width: 760px) { .combats-page { height: auto; } }
</style>
