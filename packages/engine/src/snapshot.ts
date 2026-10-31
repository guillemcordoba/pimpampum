/**
 * A COMBAT STATE AS PLAIN DATA — to carry it where objects cannot go (another
 * thread), and rebuild it there (`CombatEngine.snapshot` / `CombatEngine.restore`).
 *
 * Almost everything in a state is data: cards, dice, statuses' numbers and
 * payloads, guards, the round's queue. What is not — a status's behaviour,
 * anything else holding functions — the engine cannot copy and must not know
 * by name, so the CONTENT names it (`ContentRefOf`) and finds it again from
 * that name (`ContentDeref`). The engine still never knows a status or a card.
 *
 * The output survives a structured clone (`postMessage`): no class instances,
 * no functions; Maps, Sets and undefined are kept as they are.
 */
import { ActionInstance } from './action.js';
import { Character, StatusMap } from './character.js';
import { DiceRoll } from './dice.js';
import { CombatModifier } from './modifier.js';
import type { StatusBehavior } from './status.js';
import type { ActionDefinition, ActionType, EquipmentDefinition } from './types.js';

/** A name for an object the engine cannot copy (a status behaviour…), or
 *  undefined to have it copied as data. */
export type ContentRefOf = (o: object) => string | undefined;
/** The object a `ContentRefOf` name stands for. */
export type ContentDeref = (ref: string) => object;

/** A value in a snapshot: data, or a tagged reference. */
export type Encoded = unknown;

export interface CharacterSnapshot {
  name: string; characterClass: string; category: 'player' | 'enemy'; iconPath: string;
  team: number; aiControlled: boolean; maxPV: number; currentPV: number;
  skills: [string, number][];
  equipment: number[];
  actions: { def: number; consumed: boolean }[];
  modifiers: Encoded[];
  statuses: [string, { value: number; remaining: number; data: Encoded; behavior: string | undefined }][];
  guards: Encoded; blockers: Encoded;
  skipTurns: number; hitThisTurn: boolean; hitThisCombat: boolean;
  playedActionIdx: number | null; setAsideActions: [number, number][]; fatigue: number;
}

/** Encodes values against one state: its characters, its cards, the content's names. */
export class SnapshotEncoder {
  /** Every card and item the state holds, once each: identity survives the
   *  copy (two fighters sharing one item still share it). */
  readonly shared: object[] = [];
  private readonly sharedIndex = new Map<object, number>();
  private readonly charRefs = new Map<Character, [number, number]>();

  constructor(teams: readonly Character[][], private readonly refOf: ContentRefOf) {
    teams.forEach((team, t) => team.forEach((c, i) => this.charRefs.set(c, [t, i])));
  }

  /** A card or an item: its place in `shared`. */
  share(o: ActionDefinition | EquipmentDefinition): number {
    let i = this.sharedIndex.get(o);
    if (i === undefined) { i = this.shared.length; this.shared.push(o); this.sharedIndex.set(o, i); }
    return i;
  }

  char(c: Character): [number, number] {
    const r = this.charRefs.get(c);
    if (!r) throw new Error('snapshot: a character outside the teams');
    return r;
  }

  name(o: object): string {
    const ref = this.refOf(o);
    if (ref === undefined) throw new Error('snapshot: the content gave no name for an object holding functions');
    return ref;
  }

  value(v: unknown): Encoded {
    if (typeof v === 'function') throw new Error('snapshot: a function outside any named object');
    if (v === null || typeof v !== 'object') return v;
    if (v instanceof Character) return { $c: this.char(v) };
    const d = this.sharedIndex.get(v);
    if (d !== undefined) return { $d: d };
    const ref = this.refOf(v);
    if (ref !== undefined) return { $r: ref };
    if (v instanceof DiceRoll) return { $dice: [v.numDice, v.sides, v.modifier] };
    if (Array.isArray(v)) return v.map(x => this.value(x));
    if (v instanceof Map) return { $map: [...v].map(([k, x]) => [this.value(k), this.value(x)]) };
    if (v instanceof Set) return { $set: [...v].map(x => this.value(x)) };
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) throw new Error(`snapshot: cannot copy a ${proto?.constructor?.name ?? 'class instance'}`);
    if (Object.values(v).some(x => typeof x === 'function')) throw new Error('snapshot: the content gave no name for an object holding functions');
    return { $o: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, this.value(x)])) };
  }

  /** A shared card or item by value (a card's dice, its effects' params). */
  sharedValue(o: object): Encoded {
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, this.value(x)]));
  }

  character(c: Character): CharacterSnapshot {
    return {
      name: c.name, characterClass: c.characterClass, category: c.category, iconPath: c.iconPath,
      team: c.team, aiControlled: c.aiControlled, maxPV: c.maxPV, currentPV: c.currentPV,
      skills: [...c.skills],
      equipment: c.equipment.map(e => this.share(e)),
      actions: c.actions.map(a => ({ def: this.share(a.def), consumed: a.consumed })),
      modifiers: c.modifiers.map(m => this.value({
        stat: m.stat, value: m.value, duration: m.duration, dice: m.dice, source: m.source, condition: m.condition, data: m.data,
      })),
      statuses: [...c.statuses].map(([k, e]) => [k, {
        value: e.value, remaining: e.remaining, data: this.value(e.data), behavior: e.behavior ? this.name(e.behavior) : undefined,
      }]),
      guards: this.value(c.guards), blockers: this.value(c.blockers),
      skipTurns: c.skipTurns, hitThisTurn: c.hitThisTurn, hitThisCombat: c.hitThisCombat,
      playedActionIdx: c.playedActionIdx, setAsideActions: [...c.setAsideActions], fatigue: c.fatigue,
    };
  }
}

/** Decodes a snapshot's values: characters and cards first, then everything pointing at them. */
export class SnapshotDecoder {
  shared: object[] = [];
  teams: Character[][] = [];

  constructor(private readonly deref: ContentDeref) {}

  /** The cards and items, by value — before any character, which holds them. */
  readShared(shared: Encoded[]): void {
    this.shared = shared.map(d => Object.fromEntries(Object.entries(d as Record<string, unknown>).map(([k, x]) => [k, this.value(x)])));
  }

  def(i: number): ActionDefinition { return this.shared[i] as ActionDefinition; }

  value(v: Encoded): unknown {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(x => this.value(x));
    const o = v as Record<string, unknown>;
    if ('$c' in o) { const [t, i] = o.$c as [number, number]; return this.teams[t][i]; }
    if ('$d' in o) return this.shared[o.$d as number];
    if ('$r' in o) return this.deref(o.$r as string);
    if ('$dice' in o) { const [n, s, m] = o.$dice as [number, number, number]; return new DiceRoll(n, s, m); }
    if ('$map' in o) return new Map((o.$map as [Encoded, Encoded][]).map(([k, x]) => [this.value(k), this.value(x)]));
    if ('$set' in o) return new Set((o.$set as Encoded[]).map(x => this.value(x)));
    if ('$o' in o) return Object.fromEntries(Object.entries(o.$o as Record<string, Encoded>).map(([k, x]) => [k, this.value(x)]));
    // Plain data the encoder left as is (a card's own fields).
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, this.value(x)]));
  }

  /** Every character's own state, before the references between them. */
  characters(snaps: CharacterSnapshot[][]): Character[][] {
    this.teams = snaps.map(team => team.map(s => {
      const c = new Character(s.name, s.maxPV, new Map(s.skills),
        s.actions.map(a => { const inst = new ActionInstance(this.def(a.def)); inst.consumed = a.consumed; return inst; }),
        s.characterClass, s.category, s.iconPath);
      c.team = s.team;
      c.aiControlled = s.aiControlled;
      c.currentPV = s.currentPV;
      c.skipTurns = s.skipTurns;
      c.hitThisTurn = s.hitThisTurn;
      c.hitThisCombat = s.hitThisCombat;
      c.playedActionIdx = s.playedActionIdx;
      c.setAsideActions = new Map(s.setAsideActions);
      c.fatigue = s.fatigue;
      return c;
    }));
    // References between characters (guards, payloads) once every one exists.
    snaps.forEach((team, t) => team.forEach((s, i) => {
      const c = this.teams[t][i];
      c.equipment = s.equipment.map(i => this.shared[i] as EquipmentDefinition);
      c.modifiers = s.modifiers.map(e => {
        const m = this.value(e) as Record<string, unknown>;
        const mod = new CombatModifier(m.stat as string, m.value as number, m.duration as CombatModifier['duration']);
        mod.dice = m.dice as DiceRoll | null;
        mod.source = m.source as string;
        mod.condition = m.condition as string | null;
        if (m.data !== undefined) mod.data = m.data as Record<string, unknown>;
        return mod;
      });
      const statuses = new StatusMap();
      for (const [k, e] of s.statuses) {
        statuses.set(k, {
          value: e.value, remaining: e.remaining,
          data: this.value(e.data) as Record<string, unknown> | undefined,
          behavior: e.behavior === undefined ? undefined : this.deref(e.behavior) as StatusBehavior,
        });
      }
      c.statuses = statuses;
      c.guards = this.value(s.guards) as Character['guards'];
      c.blockers = this.value(s.blockers) as Character['blockers'];
    }));
    return this.teams;
  }
}

type Ref = [number, number];

/** A whole `CombatEngine` as data (`CombatEngine.snapshot`). */
export interface EngineSnapshot {
  teams: CharacterSnapshot[][];
  /** Every card and item in the state, by value; everything else points here by index. */
  shared: Encoded[];
  maxRounds: number; aiSharpness: number; round: number;
  history: Encoded;
  plays: { team: number; actionId: string; actionType: ActionType }[];
  blowSeq: number;
  pending: { actor: Ref; hand: number; def: number; key: number; as?: ActionType; targets: Ref[] | null; cancelled?: boolean; option?: number }[];
  pendingIndex: number; tierKey: number | null; revealSettled: boolean;
  tierAlive: Ref[]; tierInterrupted: Ref[]; skippingThisRound: Ref[];
  revealedPlan: { team: number; idx: number; actionIdx: number }[];
  aimingIdx: number | null; choosingIdx: number | null; roundPrepared: boolean;
}
