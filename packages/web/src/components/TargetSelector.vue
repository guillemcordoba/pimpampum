<script setup lang="ts">
import type { Character, CharacterTemplate } from '@pimpampum/engine';
import CharacterPortrait from './CharacterPortrait.vue';

const props = defineProps<{
  prompt: string;
  targets: Character[];
  templates: CharacterTemplate[];
  cancellable?: boolean;
  multiSelect?: boolean;
  selectedIndices?: number[];
}>();

const emit = defineEmits<{
  (e: 'select', index: number): void;
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

function isSelected(i: number): boolean {
  return props.selectedIndices?.includes(i) ?? false;
}

function onOverlayClick() {
  if (props.cancellable !== false) emit('cancel');
}
</script>

<template>
  <div class="target-overlay" @click.self="onOverlayClick">
    <div class="target-prompt">
      <h3>{{ prompt }}</h3>
      <div class="target-options">
        <div
          v-for="(target, i) in targets"
          :key="i"
          class="target-option"
          :class="{ 'target-selected': multiSelect && isSelected(i), 'target-defeated': !target.isAlive() }"
          @click="emit('select', i)"
        >
          <CharacterPortrait
            :character="target"
            :template="templates[i]"
          />
          <span v-if="!target.isAlive()" class="defeated-label">Derrotat</span>
        </div>
      </div>
      <button
        v-if="multiSelect && (selectedIndices?.length ?? 0) > 0"
        class="btn btn-primary"
        style="margin-top: 1rem;"
        @click="emit('confirm')"
      >
        Confirmar
      </button>
    </div>
  </div>
</template>
