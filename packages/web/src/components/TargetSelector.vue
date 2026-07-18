<script setup lang="ts">
import { computed } from 'vue';
import type { Character } from '@pimpampum/engine';
import type { Game } from '../composables/useGame';
import CharacterPortrait from './CharacterPortrait.vue';

const props = defineProps<{ game: Game }>();

const prompt = computed(() => props.game.currentTargetPrompt.value);

const promptText = computed(() => {
  const p = prompt.value;
  if (!p) return '';
  if (p.requirement === 'defense') {
    return `${p.actorName}: tria un aliat a protegir o un enemic a bloquejar per ${p.actionName}`;
  }
  const what = p.requirement === 'enemy' ? 'enemic' : 'aliat';
  if (p.count > 1) {
    return `${p.actorName}: tria ${p.count} ${what}s per ${p.actionName} (${props.game.multiTargetSelections.value.length}/${p.count})`;
  }
  return `${p.actorName}: tria un ${what} per ${p.actionName}`;
});

interface Option { team: number; idx: number; character: Character; }

const options = computed<Option[]>(() => {
  const p = prompt.value;
  const eng = props.game.engine.value;
  if (!p || !eng || p.requirement === 'defense') return [];
  if (p.requirement === 'enemy') {
    return eng.teams[1].map((c, idx) => ({ team: 1, idx, character: c as Character }))
      .filter(o => o.character.isAlive());
  }
  return eng.teams[0].map((c, idx) => ({ team: 0, idx, character: c as Character }))
    .filter(o => {
      if (p.requirement === 'ally_other' && o.idx === p.actorIdx) return false;
      return o.character.isAlive() || p.canReviveTarget;
    });
});

/** Defense dual choice, split in two rows: enemies to BLOCK (top) and
 *  allies to DEFEND, including self (bottom). */
const blockOptions = computed<Option[]>(() => {
  const p = prompt.value;
  const eng = props.game.engine.value;
  if (!p || !eng || p.requirement !== 'defense') return [];
  const foeTeam = 1 - p.actorTeam;
  return eng.teams[foeTeam].map((c, idx) => ({ team: foeTeam, idx, character: c as Character }))
    .filter(o => o.character.isAlive());
});
const defendOptions = computed<Option[]>(() => {
  const p = prompt.value;
  const eng = props.game.engine.value;
  if (!p || !eng || p.requirement !== 'defense') return [];
  return eng.teams[p.actorTeam].map((c, idx) => ({ team: p.actorTeam, idx, character: c as Character }))
    .filter(o => o.character.isAlive());
});

function isSelected(o: Option): boolean {
  return props.game.multiTargetSelections.value.some(t => t.team === o.team && t.idx === o.idx);
}
</script>

<template>
  <div v-if="prompt" class="target-overlay">
    <div class="target-prompt">
      <h3>{{ promptText }}</h3>
      <template v-if="prompt.requirement === 'defense'">
        <div class="target-group-label">Bloquejar un enemic</div>
        <div class="target-options">
          <div
            v-for="o in blockOptions"
            :key="`${o.team}-${o.idx}`"
            class="target-option"
            :class="{ 'target-selected': isSelected(o) }"
            @click="game.selectTarget(o.team, o.idx)"
          >
            <CharacterPortrait :character="o.character" :is-enemy="true" />
          </div>
        </div>
        <div class="target-group-label">Defensar un aliat</div>
        <div class="target-options">
          <div
            v-for="o in defendOptions"
            :key="`${o.team}-${o.idx}`"
            class="target-option"
            :class="{ 'target-selected': isSelected(o) }"
            @click="game.selectTarget(o.team, o.idx)"
          >
            <CharacterPortrait :character="o.character" :is-enemy="false" />
          </div>
        </div>
      </template>
      <div v-else class="target-options">
        <div
          v-for="o in options"
          :key="`${o.team}-${o.idx}`"
          class="target-option"
          :class="{ 'target-selected': isSelected(o), 'target-defeated': !o.character.isAlive() }"
          @click="game.selectTarget(o.team, o.idx)"
        >
          <CharacterPortrait :character="o.character" :is-enemy="o.team === 1" />
          <span v-if="!o.character.isAlive()" class="defeated-label">Derrotat</span>
        </div>
      </div>
      <button
        v-if="prompt.count > 1 && game.multiTargetSelections.value.length > 0"
        class="btn btn-primary"
        style="margin-top: 1rem;"
        @click="game.confirmTargets()"
      >
        Confirmar
      </button>
    </div>
  </div>
</template>
