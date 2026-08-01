<script setup lang="ts">
import type { LogEntry } from '@pimpampum/engine';
import { downloadCombatLog } from '../utils/combat-log';

withDefaults(defineProps<{
  winner: number | null;
  log?: LogEntry[];
}>(), { log: () => [] });

const emit = defineEmits<{ (e: 'playAgain'): void }>();
</script>

<template>
  <div class="victory-overlay">
    <div class="victory-content">
      <div class="victory-title">
        {{ winner === 0 ? 'Victòria!' : winner === 1 ? 'Derrota!' : 'Empat!' }}
      </div>
      <div class="victory-subtitle">
        {{ winner === 0 ? 'El teu equip ha guanyat!' : winner === 1 ? "L'enemic ha guanyat!" : 'Cap equip ha guanyat.' }}
      </div>
      <div class="victory-actions">
        <button class="btn btn-primary" @click="emit('playAgain')">
          Torna a jugar
        </button>
        <button
          type="button" class="btn"
          :disabled="log.length === 0"
          title="Descarrega el registre com a fitxer de text"
          @click="downloadCombatLog(log)"
        >⭳ Descarrega el registre</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.victory-actions {
  display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: center;
}
</style>
