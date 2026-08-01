/**
 * Does the game feel SWINGY in the way intentions.md now asks for?
 *
 * The claim to test is not "damage is random" — it is "reads pay out hard".
 * Four measurements, each aimed at one clause of the intention:
 *
 *  1. VALUE OF A READ — how much is knowing the enemy's card worth?
 *     An ORACLE policy peeks at what the enemies have committed this round and
 *     then chooses; a blind policy doesn't. The winrate gap is, precisely, what
 *     anticipation is worth. If the gap is small, no amount of table talk about
 *     mindgames makes the game a mindgame.
 *
 *  2. PUNISHMENT FOR BEING CAUGHT — what fraction of a character's health does
 *     one undefended hit remove, and how often is a hit effectively a kill
 *     (≥50% / ≥100% of max PV)?
 *
 *  3. REWARD FOR GUESSING RIGHT — how much damage does a defense actually
 *     prevent when it does intercept, as a fraction of max PV?
 *
 *  4. SET UP → EXECUTE — after a focus resolves, is the follow-up attack
 *     meaningfully bigger? This is the shape the intention asks for.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/measure-swing.ts
 */
import {
  ActionType, AIStrategy, Character, CombatEngine, assignStrategies, withSeed,
} from '@pimpampum/engine';
import { buildReferenceParty } from '@pimpampum/skills';
import { createEnemy, leanChooser } from '@pimpampum/enemies';
import { REGISTRY } from './tests/helpers.js';

declare const process: { env: Record<string, string | undefined> };

const GAMES = Number(process.env.GAMES ?? 200);

const MATCHUPS = [
  { label: 'goblin swarm', enemy: 'goblin', count: 6, pv: 17 },
  { label: 'golem squad', enemy: 'stone-golem', count: 3, pv: 18 },
  { label: 'devil boss', enemy: 'horned-devil', count: 1, pv: 118 },
];

function build(m: (typeof MATCHUPS)[number]): { players: Character[]; enemies: Character[] } {
  return {
    players: buildReferenceParty({ count: 4, levels: 6, armor: 1 }),
    enemies: Array.from({ length: m.count }, (_, k) =>
      createEnemy(m.enemy, { name: `${m.enemy} ${k + 1}`, pv: m.pv })!),
  };
}

// ---------------------------------------------------------------------------
// 1. Value of a read: an oracle that sees the enemy's committed cards.
// ---------------------------------------------------------------------------
/**
 * Peek at what the enemies will play this round, then answer it. Implemented
 * by cloning the combat, letting the clone plan (which commits the enemy AI to
 * its cards), and reading the reveal — the clone is discarded, so the real
 * combat is untouched. This is a strictly-better-informed player: the gap to a
 * blind player is the ceiling on what prediction can ever be worth.
 */
function oracleChooser(team: number) {
  let cache: { round: number; incoming: Map<Character, ActionType> } | null = null;
  return (engine: CombatEngine, actor: Character): number | null => {
    if (actor.team !== team) return null;
    if (!cache || cache.round !== engine.round) {
      const probe = engine.clone();
      probe.actionChooser = undefined;
      probe.prepareRound();
      const revealed = probe.planActions([]);
      const incoming = new Map<Character, ActionType>();
      for (const r of revealed) {
        if (r.actorTeam === team) continue;
        const enemy = engine.teams[r.actorTeam][r.actorIdx];
        if (enemy) incoming.set(enemy, r.actionType);
      }
      cache = { round: engine.round, incoming };
    }
    const attackers = [...cache.incoming.values()].filter(t => t === ActionType.Atac).length;
    const enemies = engine.teams[1 - team].filter(c => c.isAlive()).length;
    const underAttack = enemies > 0 && attackers / enemies >= 0.5;

    const legal: number[] = [];
    for (let i = 0; i < actor.actions.length; i++) {
      if (engine.canPlayActionIdx(actor, i) && !actor.actions[i].def.lastResort) legal.push(i);
    }
    if (legal.length === 0) return null;
    // Knowing a volley is coming: defend. Knowing it isn't: commit to a focus,
    // else hit. Deliberately crude — we are measuring the value of the
    // INFORMATION, not of a clever policy.
    const want = underAttack ? ActionType.Defensa : ActionType.Focus;
    const match = legal.filter(i => actor.actions[i].def.actionType === want);
    if (match.length > 0) {
      return match.reduce((best, i) =>
        (actor.actions[i].def.dice?.average() ?? 0) > (actor.actions[best].def.dice?.average() ?? 0) ? i : best);
    }
    const attacks = legal.filter(i => actor.actions[i].def.actionType === ActionType.Atac);
    return attacks.length > 0 ? attacks[0] : legal[0];
  };
}

/** Same crude policy WITHOUT the peek — the control. */
function blindChooser(team: number) {
  return (engine: CombatEngine, actor: Character): number | null => {
    if (actor.team !== team) return null;
    const legal: number[] = [];
    for (let i = 0; i < actor.actions.length; i++) {
      if (engine.canPlayActionIdx(actor, i) && !actor.actions[i].def.lastResort) legal.push(i);
    }
    if (legal.length === 0) return null;
    // Guess: defend when outnumbered, focus otherwise. Same shape, no info.
    const enemies = engine.teams[1 - team].filter(c => c.isAlive()).length;
    const allies = engine.teams[team].filter(c => c.isAlive()).length;
    const want = enemies > allies ? ActionType.Defensa : ActionType.Focus;
    const match = legal.filter(i => actor.actions[i].def.actionType === want);
    if (match.length > 0) {
      return match.reduce((best, i) =>
        (actor.actions[i].def.dice?.average() ?? 0) > (actor.actions[best].def.dice?.average() ?? 0) ? i : best);
    }
    const attacks = legal.filter(i => actor.actions[i].def.actionType === ActionType.Atac);
    return attacks.length > 0 ? attacks[0] : legal[0];
  };
}

function winrate(chooser: ((e: CombatEngine, a: Character) => number | null) | null, m: (typeof MATCHUPS)[number], games: number, seed: number): number {
  return withSeed(seed, () => {
    let wins = 0;
    for (let i = 0; i < games; i++) {
      const { players, enemies } = build(m);
      assignStrategies(players, [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect]);
      const engine = new CombatEngine(players, enemies, {
        registry: REGISTRY, maxRounds: 40, actionChooser: chooser ?? undefined,
      });
      const w = engine.runCombat().winner;
      if (w === 0) wins++; else if (w === null) wins += 0.5;
    }
    return wins / games;
  });
}

// ---------------------------------------------------------------------------
// 2-4. Hit anatomy, parsed from combat logs.
// ---------------------------------------------------------------------------
const UNDEFENDED = /🎲 ([^«]+)«([^»]+)»: atac (?:[\d+]+=)?(\d+) — (.+?) no es defensa/;
const CONTESTED = /🎲 ([^«]+)«([^»]+)»: atac (?:[\d+]+=)?(\d+) vs (.+?) «([^»]+)»: defensa (?:[\d+→+]*?)(\d+)/;
const HIT = /💥 .*colpeja ([^:]+): (\d+) dany/;
const BLOCKED = /🛡️ .*atura l'atac/;

interface Anatomy {
  undefendedHits: number;
  undefendedDamage: number;
  undefendedFracSum: number;
  halfKills: number;
  fullKills: number;
  contested: number;
  prevented: number;         // attack total − damage that got through
  preventedFracSum: number;
  postFocusAttack: number;   // attack totals in rounds right after a focus resolved
  postFocusCount: number;
  plainAttack: number;
  plainCount: number;
}

function anatomy(m: (typeof MATCHUPS)[number], games: number, seed: number): Anatomy {
  const a: Anatomy = {
    undefendedHits: 0, undefendedDamage: 0, undefendedFracSum: 0, halfKills: 0, fullKills: 0,
    contested: 0, prevented: 0, preventedFracSum: 0,
    postFocusAttack: 0, postFocusCount: 0, plainAttack: 0, plainCount: 0,
  };
  const chooser = leanChooser();

  withSeed(seed, () => {
    for (let g = 0; g < games; g++) {
      const { players, enemies } = build(m);
      assignStrategies(players, [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect]);
      const engine = new CombatEngine(players, enemies, {
        registry: REGISTRY, maxRounds: 40, actionChooser: chooser,
      });
      engine.runCombat();

      const maxPvByName = new Map<string, number>();
      for (const c of [...players, ...enemies]) maxPvByName.set(c.name, c.maxPV);

      // Who is currently carrying a set-up? Filled from the focus log lines,
      // which name the actor, so 'attack after I prepared' is measured per
      // CHARACTER rather than 'any focus happened recently'.
      const primed = new Set<string>();
      let pending: { total: number; target: string; contested: boolean; actor: string } | null = null;
      for (const entry of engine.logEntries) {
        const prime = /^(.+?) (?:carrega el proper atac|entra en)/.exec(entry.message);
        if (prime) primed.add(prime[1].trim());

        const u = UNDEFENDED.exec(entry.message);
        if (u) { pending = { total: Number(u[3]), target: u[4].trim(), contested: false, actor: u[1].trim() }; continue; }
        const c = CONTESTED.exec(entry.message);
        if (c) { pending = { total: Number(c[3]), target: c[4].trim(), contested: true, actor: c[1].trim() }; continue; }

        if (BLOCKED.test(entry.message) && pending) {
          // A defense that fully stopped the blow: everything was prevented.
          const max = maxPvByName.get(pending.target) ?? 12;
          a.contested++;
          a.prevented += pending.total;
          a.preventedFracSum += Math.min(1, pending.total / max);
          pending = null;
          continue;
        }

        const h = HIT.exec(entry.message);
        if (h && pending) {
          const dmg = Number(h[2]);
          const target = h[1].trim();
          const max = maxPvByName.get(target) ?? 12;
          if (!pending.contested) {
            a.undefendedHits++;
            a.undefendedDamage += dmg;
            a.undefendedFracSum += Math.min(1, dmg / max);
            if (dmg >= max * 0.5) a.halfKills++;
            if (dmg >= max) a.fullKills++;
          } else {
            a.contested++;
            a.prevented += Math.max(0, pending.total - dmg);
            a.preventedFracSum += Math.min(1, Math.max(0, pending.total - dmg) / max);
          }
          if (primed.has(pending.actor)) {
            a.postFocusAttack += pending.total; a.postFocusCount++;
            primed.delete(pending.actor);   // the charge is spent
          } else { a.plainAttack += pending.total; a.plainCount++; }
          pending = null;
        }
      }
    }
  });
  return a;
}

// ------------------------------------------------------------------- report
console.log(`Swinginess audit — ${GAMES} games per cell\n`);
console.log('1. VALUE OF A READ  (same crude policy, with and without seeing the enemy\'s cards)\n');
console.log('matchup           blind    oracle   gain');
let gainSum = 0;
for (const m of MATCHUPS) {
  const blind = winrate(blindChooser(0), m, Math.floor(GAMES / 2), 555);
  const oracle = winrate(oracleChooser(0), m, Math.floor(GAMES / 2), 555);
  gainSum += oracle - blind;
  console.log(
    `${m.label.padEnd(16)} ${(blind * 100).toFixed(0).padStart(5)}%  ${(oracle * 100).toFixed(0).padStart(6)}%  `
    + `${((oracle - blind) * 100 >= 0 ? '+' : '')}${((oracle - blind) * 100).toFixed(0)}pp`,
  );
}
console.log(`\n   mean gain from a perfect read: ${((gainSum / MATCHUPS.length) * 100).toFixed(0)}pp`);

console.log('\n2-4. HIT ANATOMY\n');
console.log('matchup           undef.hit  ≥half  ≥kill │ prevented │ focus→atk');
for (const m of MATCHUPS) {
  const a = anatomy(m, GAMES, 909);
  const meanFrac = a.undefendedHits ? a.undefendedFracSum / a.undefendedHits : 0;
  const half = a.undefendedHits ? a.halfKills / a.undefendedHits : 0;
  const kill = a.undefendedHits ? a.fullKills / a.undefendedHits : 0;
  const prev = a.contested ? a.preventedFracSum / a.contested : 0;
  const post = a.postFocusCount ? a.postFocusAttack / a.postFocusCount : 0;
  const plain = a.plainCount ? a.plainAttack / a.plainCount : 0;
  console.log(
    `${m.label.padEnd(16)} ${(meanFrac * 100).toFixed(0).padStart(7)}%  ${(half * 100).toFixed(0).padStart(5)}%  `
    + `${(kill * 100).toFixed(0).padStart(5)}% │ ${(prev * 100).toFixed(0).padStart(7)}% │ `
    + `${post.toFixed(1)} vs ${plain.toFixed(1)}`,
  );
}

console.log(`
Reading the table
  undef.hit  mean share of a target's MAX PV removed by one undefended hit
  ≥half      share of undefended hits taking half a character's health or more
  ≥kill      share taking a full health bar (a genuine one-shot)
  prevented  mean share of max PV a defense saves when it does intercept
  focus→atk  mean attack total in the round after a focus resolved vs otherwise

Intention targets (intentions.md, "the game should feel SWINGY")
  undef.hit  wants to be LARGE — being caught should cost a big chunk
  ≥half      wants to be common, not exceptional
  prevented  wants to be LARGE — guessing right should visibly save someone
  focus→atk  wants set-up attacks to be clearly bigger than plain ones
  read gain  wants to be LARGE — if small, the mindgame is decorative`);
