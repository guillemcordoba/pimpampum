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

const isMultiSelect = computed(() => {
  const p = game.currentTargetPrompt.value;
  return p ? p.count > 1 : false;
});

const targetPromptText = computed(() => {
  const p = game.currentTargetPrompt.value;
  if (!p) return '';
  if (p.count > 1) {
    const selected = game.multiTargetSelections.value.length;
    if (p.requirement === 'enemy') {
      return `${p.charName}: Tria ${p.count} enemics per ${p.cardName} (${selected}/${p.count})`;
    }
    return `${p.charName}: Tria ${p.count} aliats per ${p.cardName} (${selected}/${p.count})`;
  }
  if (p.requirement === 'enemy') {
    return `${p.charName}: Tria un enemic per ${p.cardName}`;
  }
  return `${p.charName}: Tria un aliat per ${p.cardName}`;
});

const targetList = computed(() => {
  const p = game.currentTargetPrompt.value;
  if (!p || !game.engine.value) return [];
  if (p.requirement === 'enemy') {
    return game.engine.value.team2.filter(c => c.isAlive());
  }
  return game.engine.value.team1.filter((c, i) => {
    if (!c.isAlive()) return false;
    if (p.requirement === 'ally_other' && i === p.charIdx) return false;
    return true;
  });
});

const targetTemplates = computed(() => {
  const p = game.currentTargetPrompt.value;
  if (!p || !game.engine.value) return [];
  if (p.requirement === 'enemy') {
    return game.enemyTeamTemplates.value.filter((_, i) =>
      game.engine.value!.team2[i].isAlive(),
    );
  }
  return game.playerTeamTemplates.value.filter((_, i) => {
    const c = game.engine.value!.team1[i];
    if (!c.isAlive()) return false;
    if (p.requirement === 'ally_other' && i === p.charIdx) return false;
    return true;
  });
});

/** Map actual team indices in multiTargetSelections back to filtered indices shown in TargetSelector */
const selectedFilteredIndices = computed(() => {
  const p = game.currentTargetPrompt.value;
  if (!p || !game.engine.value) return [];

  const teamNum = p.requirement === 'enemy' ? 2 : 1;
  const team = teamNum === 2 ? game.engine.value.team2 : game.engine.value.team1;

  // Build mapping: filtered index → actual team index
  const actualIndices: number[] = [];
  for (let i = 0; i < team.length; i++) {
    if (!team[i].isAlive()) continue;
    if (p.requirement === 'ally_other' && i === p.charIdx) continue;
    actualIndices.push(i);
  }

  // For each selection, find its filtered index
  const result: number[] = [];
  for (const [selTeam, selIdx] of game.multiTargetSelections.value) {
    if (selTeam !== teamNum) continue;
    const filteredIdx = actualIndices.indexOf(selIdx);
    if (filteredIdx >= 0) result.push(filteredIdx);
  }
  return result;
});

function handleTargetSelect(filteredIndex: number) {
  const p = game.currentTargetPrompt.value;
  if (!p || !game.engine.value) return;

  if (p.requirement === 'enemy') {
    const living = game.engine.value.team2
      .map((c, i) => c.isAlive() ? i : -1)
      .filter(i => i >= 0);
    if (filteredIndex < living.length) {
      game.selectTarget(2, living[filteredIndex]);
    }
  } else {
    const eligible = game.engine.value.team1
      .map((c, i) => {
        if (!c.isAlive()) return -1;
        if (p.requirement === 'ally_other' && i === p.charIdx) return -1;
        return i;
      })
      .filter(i => i >= 0);
    if (filteredIndex < eligible.length) {
      game.selectTarget(1, eligible[filteredIndex]);
    }
  }
}

function handleMultiTargetConfirm() {
  game.confirmMultiTarget();
}

const showCombatScreen = computed(() => {
  const phase = game.gamePhase.value;
  return phase === 'card-selection' || phase === 'reveal' || phase === 'resolving';
});
</script>

<template>
  <!-- Setup phase: normal page inside AppLayout -->
  <div v-if="!isFullscreen">
    <SetupScreen
      :templates="game.allTemplates"
      :player-team="game.playerTeamTemplates.value"
      :enemy-team="game.enemyTeamTemplates.value"
      :player-equipment="game.playerEquipment.value"
      :enemy-equipment="game.enemyEquipment.value"
      @add-player="game.addToPlayerTeam($event)"
      @remove-player="game.removeFromPlayerTeam($event)"
      @add-enemy="game.addToEnemyTeam($event)"
      @remove-enemy="game.removeFromEnemyTeam($event)"
      @set-player-equipment="(idx: number, ids: string[]) => game.setPlayerEquipment(idx, ids)"
      @set-enemy-equipment="(idx: number, ids: string[]) => game.setEnemyEquipment(idx, ids)"
      @start="game.startCombat()"
    />
  </div>

  <!-- Active combat: fullscreen overlay -->
  <div v-else class="combat-fullscreen">
    <button class="back-btn no-print" @click="router.push('/')">&#x2190; Tornar</button>

    <CombatScreen
      v-if="showCombatScreen"
      :player-team="game.playerTeam.value"
      :enemy-team="game.enemyTeam.value"
      :player-team-templates="game.playerTeamTemplates.value"
      :enemy-team-templates="game.enemyTeamTemplates.value"
      :combat-log="game.combatLog.value"
      :player-selections="game.playerSelections.value"
      :round-skipping="game.roundSkipping.value"
      :phase="game.gamePhase.value"
      :can-confirm="game.canConfirmCards()"
      :action-queue="game.actionQueue.value"
      :current-action-index="game.currentActionIndex.value"
      :highlighted-target="game.highlightedTarget.value"
      :round-complete="game.roundComplete.value"
      @select-card="game.selectCard($event.charIdx, $event.cardIdx)"
      @confirm="game.confirmCards()"
      @start-resolving="game.startResolving()"
      @advance-resolution="game.advanceResolution()"
      @next-round="game.nextRound()"
    />

    <!-- Target selection overlay (during resolution) -->
    <TargetSelector
      v-if="game.currentTargetPrompt.value"
      :prompt="targetPromptText"
      :targets="targetList"
      :templates="targetTemplates"
      :cancellable="false"
      :multi-select="isMultiSelect"
      :selected-indices="selectedFilteredIndices"
      @select="handleTargetSelect($event)"
      @confirm="handleMultiTargetConfirm"
      @cancel="() => {}"
    />

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
  transition: color 0.2s;
}

.back-btn:hover {
  color: var(--parchment);
}

@media print {
  .no-print {
    display: none !important;
  }
}
</style>
