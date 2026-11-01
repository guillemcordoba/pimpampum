/**
 * AGENT DUEL — two players (people or agents) play a 2v2 of the elements set's
 * benders against each other, one CLI call at a time, through files.
 *
 * Every call REPLAYS the game from its seed and both sides' recorded answers,
 * so the files are the whole state and the two sides never write the same
 * file. Information flows as at the table: cards are picked blind; at the
 * reveal each side aims its attacks without seeing the other's aims; a defense
 * picks whom it guards when it resolves, seeing every aim; a Focus picks its
 * target when it resolves.
 *
 *   tsx agent-duel/duel.ts rules
 *   tsx agent-duel/duel.ts wait   --game 1 --side A     (blocks until it is A's turn or the game ends)
 *   tsx agent-duel/duel.ts status --game 1 --side A
 *   tsx agent-duel/duel.ts move   --game 1 --side A --answer "waterbender,firebender"
 *
 * DUEL_DIR holds the games (default: ./agent-duel/games).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ActionType, CombatEngine, seededRng, setRng, type Character, type TargetRef } from '@pimpampum/engine';
import { aiPolicy } from '@pimpampum/ai';
import { buildCharacter, createRegistry } from '@pimpampum/set-elements';

const KITS = ['waterbender', 'airbender', 'earthbender', 'firebender'] as const;
const KIT_NAMES: Record<string, string> = { waterbender: "Mestre de l'aigua", airbender: "Mestre de l'aire", earthbender: 'Mestre de la terra', firebender: 'Mestre del foc' };
const DIR = process.env.DUEL_DIR ?? path.resolve('agent-duel/games');
const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const GAME = Number(opt('game') ?? 1);
const SIDE = (opt('side') ?? 'A').toUpperCase() as 'A' | 'B';
const gameDir = path.join(DIR, `game-${GAME}`);

const RULES = `PIM PAM PUM — a 2v2 of benders (you control two heroes; labels A1 A2 / B1 B2).
Each round:
 1. Both sides pick one card per hero, blind.
 2. REVEAL: everyone sees every card. Each side aims its attacks (without seeing the other side's aims).
 3. Resolution order: FAST cards first (fast Defense, fast Attack, fast Focus), then Defense, Attack, Focus.
    A Defense picks whom it guards (itself or one ally) when it resolves, seeing every aim. The defender always also guards itself.
    If an attack beats the defense of a guarded ally, the DEFENDER takes the damage, not the ally.
    Defenses covering the same attack add up into a wall.
    Inside one step, cards resolve one by one; who goes first alternates between the sides every round (shown in the reveal).
    A step is simultaneous for who falls: a hero taken out earlier in the same step still plays its card in that step.
 4. An attack is ONE contested roll: attack dice vs the defense dice. Ties hold for the defense.
    Damage = attack total - defense total, minus armour. An UNDEFENDED target takes the whole attack total.
    "Envoltat": a body that n attacks aim at this round has each defense covering it roll n times and keep the worst.
 5. A Focus is cancelled if its hero takes damage before it resolves.
A roll is just the card's dice (minus 1 per fatigue level). Heroes have 12 PV; at 0 PV a hero is out.
A card's text says only what is special about it. "Ràpid" = fast. Cremat = loses PV at the end of this round and the next.
Every hero also has "Cop desesperat", playable only when nothing else is. Win by taking out both enemy heroes.`;

// --- files ---------------------------------------------------------------------

interface Cfg { seed: number; level: number }
function cfg(): Cfg {
  const f = path.join(gameDir, 'cfg.json');
  if (!fs.existsSync(f)) {
    fs.mkdirSync(gameDir, { recursive: true });
    fs.writeFileSync(f, JSON.stringify({ seed: 7000 + GAME, level: GAME <= 5 ? 6 : 10 }));
  }
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
const answersFile = (s: 'A' | 'B') => path.join(gameDir, `${s}.json`);
function answers(s: 'A' | 'B'): string[] {
  const f = answersFile(s);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
}

// --- the replay ------------------------------------------------------------------

type Need =
  | { kind: 'pick' }
  | { kind: 'cards'; heroes: Character[] }
  | { kind: 'aim' | 'guard' | 'focus'; actor: Character; action: string; requirement: string; count: number }
  | { kind: 'choice'; actor: Character; action: string; options: readonly string[] };
interface State {
  engine?: CombatEngine;
  pending: { side: 'A' | 'B'; need: Need }[];
  over: boolean;
  log: string[];
  level: number;
}

const firstSide = (round: number): ('A' | 'B')[] => ((round + GAME) % 2 === 0 ? ['A', 'B'] : ['B', 'A']);
const label = (e: CombatEngine, c: Character) => `${c.team === 0 ? 'A' : 'B'}${e.teams[c.team].indexOf(c) + 1}`;
const sideOf = (team: number): 'A' | 'B' => (team === 0 ? 'A' : 'B');
function fromLabel(e: CombatEngine, s: string): Character | undefined {
  const m = /^([AB])([12])$/i.exec(s.trim());
  return m ? e.teams[m[1].toUpperCase() === 'A' ? 0 : 1][Number(m[2]) - 1] : undefined;
}

function replay(): State {
  const { seed, level } = cfg();
  const qa = answers('A'), qb = answers('B');
  const q = { A: qa, B: qb };
  const at = { A: 0, B: 0 };
  const next = (s: 'A' | 'B') => (at[s] < q[s].length ? q[s][at[s]++] : undefined);
  const st: State = { pending: [], over: false, log: [], level };
  const picks = { A: q.A[0], B: q.B[0] };
  if (picks.A === undefined) st.pending.push({ side: 'A', need: { kind: 'pick' } });
  if (picks.B === undefined) st.pending.push({ side: 'B', need: { kind: 'pick' } });
  if (st.pending.length) return st;
  at.A = at.B = 1;
  setRng(seededRng(seed));
  const team = (s: 'A' | 'B') => picks[s].split(',').map((k, i) =>
    buildCharacter({ name: `${s}${i + 1} ${KIT_NAMES[k.trim()]}`, classCss: k.trim(), pv: 12, skills: { [k.trim()]: level } } as never));
  const e = new CombatEngine(team('A'), team('B'), { registry: createRegistry(), ...aiPolicy({ depth: 0 }) });
  st.engine = e;
  for (const c of [...e.teams[0], ...e.teams[1]]) c.aiControlled = false;
  while (!e.isOver() && e.round < 40) {
    const { skipping } = e.prepareRound();
    const skip = new Set(skipping.map(r => e.teams[r.team][r.idx]));
    const acting = (t: number) => e.teams[t].filter(c => c.isAlive() && !skip.has(c));
    const cardAns: Partial<Record<'A' | 'B', string>> = {};
    for (const s of ['A', 'B'] as const) {
      const heroes = acting(s === 'A' ? 0 : 1);
      if (!heroes.length) continue;
      const a = next(s);
      if (a === undefined) st.pending.push({ side: s, need: { kind: 'cards', heroes } });
      else cardAns[s] = a;
    }
    if (st.pending.length) return st;
    const sel: { team: number; idx: number; actionIdx: number }[] = [];
    // Who committed first: alternating every round, so no seat owns the ties.
    for (const s of firstSide(e.round)) {
      const a = cardAns[s];
      if (!a) continue;
      for (const part of a.split(',')) {
        const [who, id] = part.split('=').map(x => x.trim());
        const c = fromLabel(e, who)!;
        sel.push({ team: c.team, idx: e.teams[c.team].indexOf(c), actionIdx: c.actions.findIndex(x => x.def.id === id) });
      }
    }
    const before = e.logEntries.length;
    e.planActions(sel);
    let r = e.resolveNextAction();
    let guard = 0;
    while (r.kind !== 'done' && guard++ < 500) {
      if (r.kind === 'target' || r.kind === 'choice') {
        const p = r.prompt;
        const s = sideOf(p.actorTeam);
        const actor = e.teams[p.actorTeam][p.actorIdx];
        const a = next(s);
        if (a === undefined) {
          if (r.kind === 'choice') st.pending.push({ side: s, need: { kind: 'choice', actor, action: p.actionName, options: r.prompt.options } });
          else {
            const planned = e.plannedThisRound().find(x => x.actor === actor && !x.resolved);
            const t = planned?.action.actionType;
            const kind = t === ActionType.Atac ? 'aim' : t === ActionType.Defensa ? 'guard' : 'focus';
            st.pending.push({ side: s, need: { kind, actor, action: p.actionName, requirement: r.prompt.requirement, count: r.prompt.count } });
          }
          st.log = e.logEntries.slice(before).map(l => l.message);
          return st;
        }
        if (r.kind === 'choice') e.setResolveChoice(Number(a));
        else {
          const refs: TargetRef[] = a === 'none' ? [] : a.split(',').map(x => fromLabel(e, x)).filter((c): c is Character => !!c)
            .map(c => ({ team: c.team, idx: e.teams[c.team].indexOf(c) }));
          e.setResolveTarget(refs);
        }
      }
      r = e.resolveNextAction();
    }
    e.finishRound();
    st.log = e.logEntries.slice(before).map(l => l.message);
  }
  st.over = true;
  return st;
}

// --- display ---------------------------------------------------------------------

function heroLine(e: CombatEngine, c: Character): string {
  const st = [...c.statuses].map(([k, v]) => `${k}${v.remaining > 0 ? `(${v.remaining})` : ''}`).join(' ');
  const extras = [c.fatigue ? `fatiga ${c.fatigue}` : '', c.skipTurns ? `perd ${c.skipTurns} torn` : '', st ? `estats: ${st}` : ''].filter(Boolean).join(' · ');
  return `  ${label(e, c)} ${c.name.slice(3)} — ${c.isAlive() ? `${c.currentPV}/${c.maxPV} PV` : 'FORA'}${extras ? ` · ${extras}` : ''}`;
}
function hand(e: CombatEngine, c: Character): string {
  return c.actions.map(a => {
    const d = a.def;
    const legal = e.canPlayActionIdx(c, c.actions.indexOf(a));
    const dice = d.dice ? ` ${d.dice.toString?.() ?? ''}` : '';
    return `     ${legal ? ' ' : 'x'} ${d.id} — ${d.name} [${d.actionType}${d.fast ? ', ràpid' : ''}${dice}]${d.targetCount && d.targetCount > 1 ? ` (${d.targetCount >= 99 ? 'tots els enemics' : `${d.targetCount} objectius`})` : ''}${d.description ? ` — ${d.description}` : ''}`;
  }).join('\n');
}
function board(st: State, side: 'A' | 'B'): string {
  const e = st.engine!;
  const out: string[] = [`Torn ${e.round} · nivell ${st.level}`];
  for (const t of [0, 1]) {
    out.push(`${t === 0 ? 'Bàndol A' : 'Bàndol B'}${sideOf(t) === side ? ' (tu)' : ''}:`);
    for (const c of e.teams[t]) out.push(heroLine(e, c));
  }
  const plan = e.plannedThisRound();
  if (plan.length) {
    out.push(`Cartes revelades aquest torn (dins d'un mateix pas, primer el bàndol ${firstSide(e.round)[0]}):`);
    for (const p of plan) {
      const showAim = p.targets && (p.resolved || p.action.actionType !== ActionType.Atac || sideOf(p.actor.team) === side || st.pending.every(x => x.need.kind !== 'aim'));
      out.push(`  ${label(e, p.actor)} juga ${p.action.name} [${p.action.actionType}${p.action.fast ? ', ràpid' : ''}]${p.cancelled ? ' (cancel·lada)' : ''}${showAim && p.targets?.length ? ` → ${p.targets.map(t => label(e, t)).join(',')}` : ''}${p.resolved ? ' ✓' : ''}`);
    }
  }
  if (st.log.length) out.push('Registre:', ...st.log.map(l => `  ${l}`));
  return out.join('\n');
}

function describe(st: State, side: 'A' | 'B'): string {
  if (!st.engine) {
    const mine = st.pending.find(p => p.side === side);
    return mine
      ? `TU TORN (${side}): tria els teus dos herois, en secret. Resposta: dos kits separats per coma, entre ${KITS.join(', ')} (poden repetir-se).\n` +
        KITS.map(k => `  ${k} = ${KIT_NAMES[k]}`).join('\n') + `\nNivell d'aquesta partida: ${cfg().level} (cada heroi coneix les primeres ${cfg().level} cartes del seu kit).`
      : 'ESPERANT: l\'altre bàndol tria els seus herois.';
  }
  const e = st.engine;
  if (st.over) {
    const w = e.winner();
    return board(st, side) + `\n\nPARTIDA ACABADA: ${w === null ? 'empat' : `guanya el bàndol ${sideOf(w)}`}${w !== null ? (sideOf(w) === side ? ' (TU)' : '') : ''}.`;
  }
  const mine = st.pending.find(p => p.side === side);
  const head = board(st, side);
  if (!mine) return `${head}\n\nESPERANT: l'altre bàndol ha de decidir.`;
  const n = mine.need;
  if (n.kind === 'cards') {
    return `${head}\n\nLes teves mans (x = no jugable ara):\n` + n.heroes.map(c => `  ${label(e, c)}:\n${hand(e, c)}`).join('\n') +
      `\n\nTU TORN (${side}): tria una carta per heroi, en secret. Resposta: ${n.heroes.map(c => `${label(e, c)}=<id>`).join(',')}`;
  }
  if (n.kind === 'pick') return head;
  if (n.kind === 'choice') return `${head}\n\nTU TORN (${side}): ${label(e, n.actor)} «${n.action}» tria una opció: ${n.options.map((o, i) => `${i}=${o}`).join(', ')}. Resposta: el número.`;
  const pool = n.requirement === 'enemy' ? e.enemiesOf(n.actor) : n.requirement === 'ally_other' ? e.alliesOf(n.actor, false)
    : ['ally', 'defense', 'self'].includes(n.requirement) ? e.alliesOf(n.actor, true) : [...e.teams[0], ...e.teams[1]].filter(c => c.isAlive());
  const what = n.kind === 'aim' ? 'apunta l\'atac' : n.kind === 'guard' ? 'tria a qui protegeix la defensa (sempre es protegeix també a si mateix)' : 'tria l\'objectiu del Focus';
  return `${head}\n\nTU TORN (${side}): ${label(e, n.actor)} «${n.action}» — ${what}. ${n.count > 1 ? `Fins a ${n.count} objectius, separats per coma. ` : ''}Opcions: ${pool.map(c => label(e, c)).join(', ')}. Resposta: una etiqueta${n.count > 1 ? ' o més' : ''}.`;
}

// --- validation ------------------------------------------------------------------

function validate(st: State, side: 'A' | 'B', a: string): string | null {
  const mine = st.pending.find(p => p.side === side);
  if (!mine) return 'No és el teu torn.';
  const n = mine.need;
  if (n.kind === 'pick') {
    const ks = a.split(',').map(x => x.trim());
    return ks.length === 2 && ks.every(k => (KITS as readonly string[]).includes(k)) ? null : `Cal dos kits d'entre ${KITS.join(', ')}.`;
  }
  const e = st.engine!;
  if (n.kind === 'cards') {
    const parts = a.split(',').map(p => p.split('=').map(x => x.trim()));
    if (parts.length !== n.heroes.length) return `Cal una carta per a cadascun de: ${n.heroes.map(c => label(e, c)).join(', ')}.`;
    for (const [who, id] of parts) {
      const c = fromLabel(e, who ?? '');
      if (!c || !n.heroes.includes(c)) return `${who}: no és un heroi teu que jugui aquest torn.`;
      const i = c.actions.findIndex(x => x.def.id === id);
      if (i < 0) return `${who}: no té la carta ${id}.`;
      if (!e.canPlayActionIdx(c, i)) return `${who}: ${id} no es pot jugar ara.`;
    }
    return null;
  }
  if (n.kind === 'choice') return Number.isInteger(Number(a)) && Number(a) >= 0 && Number(a) < n.options.length ? null : 'Cal el número d\'una opció.';
  if (a === 'none') return null;
  const labels = a.split(',').map(x => x.trim());
  if (labels.length > Math.max(1, n.count)) return `Com a molt ${n.count} objectius.`;
  return labels.every(l => fromLabel(e, l)) ? null : 'Etiquetes vàlides: A1, A2, B1, B2.';
}

// --- commands --------------------------------------------------------------------

if (cmd === 'rules') { console.log(RULES); process.exit(0); }
if (cmd === 'status') { console.log(describe(replay(), SIDE)); process.exit(0); }
if (cmd === 'wait') {
  const until = Date.now() + 8 * 60_000;
  for (;;) {
    const st = replay();
    if (st.over || st.pending.some(p => p.side === SIDE)) { console.log(describe(st, SIDE)); break; }
    if (Date.now() > until) { console.log('Encara esperant l\'altre bàndol: torna a cridar wait.'); break; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
  }
  process.exit(0);
}
if (cmd === 'move') {
  const a = (opt('answer') ?? '').trim();
  const st = replay();
  if (st.over) { console.log('La partida ja ha acabat.'); process.exit(0); }
  const err = validate(st, SIDE, a);
  if (err) { console.log(`RESPOSTA NO VÀLIDA: ${err}`); process.exit(1); }
  const list = answers(SIDE);
  list.push(a);
  fs.writeFileSync(answersFile(SIDE), JSON.stringify(list));
  console.log('D\'acord. Ara crida wait.');
  process.exit(0);
}
console.log('Ordres: rules | status | wait | move  (--game N --side A|B --answer "...")');
