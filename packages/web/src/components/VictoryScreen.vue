<script setup lang="ts">
defineProps<{
  winner: number | null;
}>();

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
      <button class="btn btn-primary" @click="emit('playAgain')">
        Torna a jugar
      </button>
    </div>
  </div>
</template>
