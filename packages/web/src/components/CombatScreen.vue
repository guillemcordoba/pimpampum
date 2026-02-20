<script setup lang="ts">
import type { Character } from '@pimpampum/engine';
import type { CharacterTemplate, LogEntry, PlannedAction } from '@pimpampum/engine';
import CharacterPortrait from './CharacterPortrait.vue';
import CardHand from './CardHand.vue';
import CombatLog from './CombatLog.vue';
import ActionQueue from './ActionQueue.vue';

interface PlayerSelection {
  cardIdx: number;
}

const props = defineProps<{
  playerTeam: Character[];
  enemyTeam: Character[];
  playerTeamTemplates: CharacterTemplate[];
  enemyTeamTemplates: CharacterTemplate[];
  combatLog: LogEntry[];
  playerSelections: Map<number, PlayerSelection>;
  roundSkipping: Map<number, Set<number>>;
  phase: string;
  canConfirm: boolean;
  actionQueue: PlannedAction[];
  currentActionIndex: number;
  highlightedTarget: { team: number; charIdx: number } | null;
  roundComplete: boolean;
}>();

const emit = defineEmits<{
  (e: 'selectCard', payload: { charIdx: number; cardIdx: number }): void;
  (e: 'confirm'): void;
  (e: 'startResolving'): void;
  (e: 'advanceResolution'): void;
  (e: 'nextRound'): void;
}>();

function isSkipping(team: number, idx: number): boolean {
  return props.roundSkipping.get(team)?.has(idx) ?? false;
}

function isHighlighted(team: number, idx: number): boolean {
  if (!props.highlightedTarget) return false;
  return props.highlightedTarget.team === team && props.highlightedTarget.charIdx === idx;
}

function getSetAsideIndices(charIdx: number): Set<number> {
  const char = props.playerTeam[charIdx];
  if (!char) return new Set();
  return new Set(char.setAsideCards.keys());
}

const isRevealOrResolving = (phase: string) =>
  phase === 'reveal' || phase === 'resolving';
</script>

<template>
  <div class="screen combat-with-log">
    <!-- Main content (left) -->
    <div class="combat-main">
      <!-- Enemy zone (top) -->
      <div class="enemy-zone" :class="{ horde: enemyTeam.length > 5 }">
        <CharacterPortrait
          v-for="(char, i) in enemyTeam"
          :key="i"
          :character="char"
          :template="enemyTeamTemplates[i]"
          :is-enemy="true"
          :is-highlighted="isHighlighted(2, i)"
          :compact="enemyTeam.length > 5"
        />
      </div>

      <!-- Card selection layout -->
      <template v-if="!isRevealOrResolving(phase)">
        <div class="player-zone">
          <div v-for="(char, i) in playerTeam" :key="i" class="player-section">
            <CharacterPortrait
              :character="char"
              :template="playerTeamTemplates[i]"
            />
            <div v-if="isSkipping(1, i)" class="player-section-skip">
              Salta aquest torn
            </div>
            <CardHand
              v-else-if="char.isAlive()"
              :character="char"
              :template="playerTeamTemplates[i]"
              :selected-card-idx="playerSelections.get(i)?.cardIdx ?? null"
              :disabled="phase !== 'card-selection'"
              :set-aside-indices="getSetAsideIndices(i)"
              @select-card="emit('selectCard', { charIdx: i, cardIdx: $event })"
            />
          </div>
        </div>

        <div style="text-align: center; margin: 1rem 0;">
          <button
            class="btn btn-primary"
            :disabled="!canConfirm || phase !== 'card-selection'"
            @click="emit('confirm')"
          >
            Resolucio!
          </button>
        </div>
      </template>

      <!-- Reveal / Resolving layout -->
      <template v-else>
        <ActionQueue
          :actions="actionQueue"
          :current-index="currentActionIndex"
          :player-team="playerTeam"
          :enemy-team="enemyTeam"
          :player-team-templates="playerTeamTemplates"
          :enemy-team-templates="enemyTeamTemplates"
        />

        <!-- Player portraits row (no card hands) -->
        <div class="player-portraits-row">
          <CharacterPortrait
            v-for="(char, i) in playerTeam"
            :key="i"
            :character="char"
            :template="playerTeamTemplates[i]"
            :is-highlighted="isHighlighted(1, i)"
          />
        </div>

        <div style="text-align: center; margin: 1rem 0;">
          <button
            v-if="!roundComplete"
            class="btn btn-primary"
            @click="phase === 'reveal' ? emit('startResolving') : emit('advanceResolution')"
          >
            Propera accio
          </button>
          <button
            v-else
            class="btn btn-primary"
            @click="emit('nextRound')"
          >
            Propera ronda
          </button>
        </div>
      </template>
    </div>

    <!-- Combat log (right panel, always visible) -->
    <div class="combat-log-panel">
      <CombatLog :entries="combatLog" />
    </div>
  </div>
</template>
