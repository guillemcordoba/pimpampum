<script setup lang="ts">
defineProps<{
  winner: number;
}>();

const emit = defineEmits<{
  (e: 'playAgain'): void;
}>();
</script>

<template>
  <div class="victory-overlay">
    <div class="victory-content">
      <div class="victory-title">
        {{ winner === 1 ? 'Victoria!' : winner === 2 ? 'Derrota!' : 'Empat!' }}
      </div>
      <div class="victory-subtitle">
        {{ winner === 1 ? 'El teu equip ha guanyat!' : winner === 2 ? "L'enemic ha guanyat!" : 'Cap equip ha guanyat.' }}
      </div>
      <button class="btn btn-primary" @click="emit('playAgain')">
        Torna a jugar
      </button>
    </div>
  </div>
</template>
