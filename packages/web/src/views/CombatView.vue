<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useGame } from '../composables/useGame';
import SetupScreen from '../components/SetupScreen.vue';
import CombatScreen from '../components/CombatScreen.vue';
import VictoryScreen from '../components/VictoryScreen.vue';
import TargetSelector from '../components/TargetSelector.vue';

const router = useRouter();
const game = useGame();

const isFullscreen = computed(() => game.gamePhase.value !== 'setup');
</script>

<template>
  <div v-if="!isFullscreen">
    <SetupScreen :game="game" />
  </div>

  <div v-else class="combat-fullscreen">
    <button class="back-btn no-print" @click="router.push('/')">&#x2190; Tornar</button>

    <CombatScreen v-if="game.gamePhase.value !== 'victory'" :game="game" />

    <TargetSelector :game="game" />

    <VictoryScreen
      v-if="game.gamePhase.value === 'victory'"
      :winner="game.winner.value"
      @play-again="game.playAgain()"
    />
  </div>
</template>

<style scoped>
.combat-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: var(--bg-dark);
  overflow-y: auto;
  padding: 1.5rem;
}
.back-btn {
  font-family: 'MedievalSharp', serif;
  font-size: 1rem;
  color: var(--parchment-dark);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.3rem 0;
  margin-bottom: 0.5rem;
}
.back-btn:hover { color: var(--parchment); }
@media print { .no-print { display: none !important; } }
</style>
