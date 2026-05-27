<script setup lang="ts">
import { computed } from 'vue';
import type { ActionInstance, RevealedAction } from '@pimpampum/engine';
import type { Game } from '../composables/useGame';
import CharacterPortrait from './CharacterPortrait.vue';
import MiniCard from './MiniCard.vue';
import CombatLog from './CombatLog.vue';

const props = defineProps<{ game: Game }>();
const g = props.game;

const phase = g.gamePhase;
const playerTeam = g.playerTeam;
const enemyTeam = g.enemyTeam;
const combatLog = g.combatLog;
const revealed = g.revealed;
const roundComplete = g.roundComplete;
const highlighted = g.highlightedTarget;

const livingPlayers = computed(() =>
  playerTeam.value.map((c, idx) => ({ c, idx })).filter(p => p.c.isAlive() && !g.skippingPlayers.value.has(p.idx)));

/**
 * Each revealed action paired with its card instance, in speed order. Kept
 * index-aligned with the engine's pending queue (no filtering) so the current /
 * resolved highlighting below maps onto the right card.
 */
const revealedCards = computed<{ r: RevealedAction; action: ActionInstance | undefined }[]>(() =>
  revealed.value.map((r) => {
    const actor = g.engine.value?.teams[r.actorTeam]?.[r.actorIdx];
    const action = actor?.actions.find(a => a.def.id === r.actionId);
    return { r, action };
  }));

/**
 * Index of the card under resolution: the just-resolved one, or — while waiting
 * on a target prompt — the one about to resolve (one past the last resolved).
 */
const resolvingIndex = computed(() =>
  g.currentTargetPrompt.value ? g.currentStepIndex.value + 1 : g.currentStepIndex.value);

function isCurrent(i: number): boolean {
  return phase.value === 'resolving' && !roundComplete.value && i === resolvingIndex.value;
}
function isResolved(i: number): boolean {
  if (phase.value !== 'resolving') return false;
  return roundComplete.value || i < resolvingIndex.value;
}

function isHighlighted(team: number, idx: number): boolean {
  const h = highlighted.value;
  return !!h && h.team === team && h.idx === idx;
}
</script>

<template>
  <div class="combat-screen">
    <div class="combat-main">
      <!-- Enemy team -->
      <div class="team-row enemies">
        <CharacterPortrait
          v-for="(c, i) in enemyTeam"
          :key="i"
          :character="c"
          is-enemy
          :is-highlighted="isHighlighted(1, i)"
          compact
        />
      </div>

      <!-- Middle: reveal / controls -->
      <div class="combat-middle">
        <div class="combat-controls">
          <template v-if="phase === 'card-selection'">
            <button class="btn btn-primary" :disabled="!g.canConfirmCards()" @click="g.confirmCards()">
              Revelar accions
            </button>
          </template>

          <template v-else-if="phase === 'reveal' || phase === 'resolving'">
            <div class="reveal-cards">
              <div
                v-for="({ r, action }, i) in revealedCards"
                :key="i"
                class="reveal-card"
                :class="{ enemy: r.actorTeam === 1, current: isCurrent(i), resolved: isResolved(i) }"
              >
                <div class="reveal-card-name">
                  {{ r.actorName }}
                  <span class="reveal-speed">vel {{ r.speed }}</span>
                </div>
                <MiniCard v-if="action" :action="action" :class-css="r.classCss" readonly />
              </div>
            </div>

            <button v-if="phase === 'reveal'" class="btn btn-primary" @click="g.startResolving()">
              Resoldre la ronda
            </button>
            <button v-else-if="!roundComplete" class="btn btn-primary" @click="g.advanceResolution()">
              Següent acció
            </button>
            <button v-else class="btn btn-primary" @click="g.nextRound()">Següent ronda</button>
          </template>
        </div>
      </div>

      <!-- Player team -->
      <div class="team-row players">
        <CharacterPortrait
          v-for="(c, i) in playerTeam"
          :key="i"
          :character="c"
          :is-highlighted="isHighlighted(0, i)"
          compact
        />
      </div>

      <!-- Player hands (selection phase) -->
      <div v-if="phase === 'card-selection'" class="hands">
        <div v-for="p in livingPlayers" :key="p.idx" class="hand">
          <div class="hand-name">{{ p.c.name }}</div>
          <div class="hand-cards">
            <MiniCard
              v-for="(action, ai) in p.c.actions"
              :key="ai"
              :action="action"
              :class-css="p.c.characterClass"
              :selected="g.playerSelections.value.get(p.idx) === ai"
              :set-aside="p.c.isActionSetAside(ai)"
              :consumed="!action.isAvailable()"
              @select="g.selectCard(p.idx, ai)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Combat log: its own panel on the right -->
    <aside class="combat-log-panel">
      <CombatLog :entries="combatLog" />
    </aside>
  </div>
</template>

<style scoped>
.combat-screen { display: flex; gap: 1rem; align-items: flex-start; }
.combat-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1rem; }
.combat-log-panel { flex: 0 0 320px; max-width: 360px; }
.team-row { display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: center; }

/* Stack the log under the combat area on narrow screens. */
@media (max-width: 900px) {
  .combat-screen { flex-direction: column; }
  .combat-log-panel { flex: none; width: 100%; max-width: none; position: static; max-height: 320px; }
}
.combat-middle { display: flex; flex-direction: column; gap: 0.75rem; align-items: center; }
.combat-controls { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
.reveal-cards {
  display: flex; flex-wrap: wrap; gap: 0.75rem;
  justify-content: center; margin-bottom: 0.5rem;
}
.reveal-card {
  display: flex; flex-direction: column; align-items: center; gap: 0.25rem;
  transition: opacity 0.2s, filter 0.2s, transform 0.2s;
}
.reveal-card-name {
  font-family: 'MedievalSharp', serif; color: var(--parchment);
  font-size: 0.9rem; text-align: center;
}
.reveal-card.enemy .reveal-card-name { color: #f0b0b0; }
.reveal-speed { opacity: 0.7; font-size: 0.8rem; margin-left: 0.3rem; }

/* Already-resolved cards fade and desaturate. */
.reveal-card.resolved { opacity: 0.4; filter: grayscale(0.85); }

/* The card under resolution lifts and glows gold. */
.reveal-card.current { transform: translateY(-4px); }
.reveal-card.current :deep(.mini-card) {
  border-color: gold;
  box-shadow: 0 0 14px rgba(255, 215, 0, 0.7);
}
.hands { display: flex; flex-wrap: wrap; gap: 1rem; justify-content: center; }
.hand { display: flex; flex-direction: column; gap: 0.25rem; }
.hand-name { font-family: 'MedievalSharp', serif; color: var(--parchment); text-align: center; }
.hand-cards { display: flex; gap: 0.4rem; flex-wrap: wrap; }
</style>
