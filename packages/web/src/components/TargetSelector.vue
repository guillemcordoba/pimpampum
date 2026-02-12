<script setup lang="ts">
import type { Character, CharacterTemplate } from '@pimpampum/engine';
import CharacterPortrait from './CharacterPortrait.vue';

const props = defineProps<{
  prompt: string;
  targets: Character[];
  templates: CharacterTemplate[];
  cancellable?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', index: number): void;
  (e: 'cancel'): void;
}>();

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
          @click="emit('select', i)"
        >
          <CharacterPortrait
            v-if="target.isAlive()"
            :character="target"
            :template="templates[i]"
          />
        </div>
      </div>
    </div>
  </div>
</template>
