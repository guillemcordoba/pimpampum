<script setup lang="ts">
import { computed } from 'vue';
import type { ActionInstance } from '@pimpampum/engine';
import { ACTION_TYPE_CSS } from '@pimpampum/engine';
import { actionStats, renderDescription } from '../composables/useActionDisplay';

const base = import.meta.env.BASE_URL;

const props = defineProps<{
  action: ActionInstance;
  classCss: string;
  selected?: boolean;
  disabled?: boolean;
  setAside?: boolean;
  consumed?: boolean;
  /** Display-only: no click/hover affordance (e.g. revealed enemy cards). */
  readonly?: boolean;
}>();

const emit = defineEmits<{ (e: 'select'): void }>();

const headerClass = computed(() => ACTION_TYPE_CSS[props.action.def.actionType]);
const iconPath = computed(() => base + props.action.def.iconPath);
const stats = computed(() => actionStats(props.action.def));
const renderedDescription = computed(() =>
  props.action.def.description ? renderDescription(props.action.def.description) : '');
</script>

<template>
  <div
    class="mini-card"
    :class="[classCss, { selected, disabled, 'set-aside': setAside, consumed, readonly }]"
    @click="!readonly && !disabled && !setAside && !consumed && emit('select')"
  >
    <div v-if="setAside" class="set-aside-overlay">EN JOC</div>
    <div v-if="consumed" class="consumed-overlay">CONSUMIT</div>
    <div class="mini-card-header" :class="headerClass">
      {{ action.def.name }}
    </div>
    <div class="mini-card-art">
      <img :src="iconPath" :alt="action.def.name">
    </div>
    <div class="mini-card-bottom">
      <div v-if="action.def.description" class="mini-card-effect" v-html="renderedDescription"></div>
      <div class="mini-card-stats">
        <span v-for="(s, i) in stats" :key="i" style="display: flex; align-items: center; gap: 1px;">
          <img :src="base + s.iconPath" :alt="s.value">
          {{ s.value }}
        </span>
      </div>
    </div>
  </div>
</template>
