/**
 * SCRATCH (2026-11-28, the ranking experiments): plays any list of matchups,
 * in child processes on bench's lanes, and hands back who won. A matchup is
 * two sides; a side is heroes (each a kit at a level, with cards taken out or
 * a PV of its own) or creatures, and the way it is played.
 *
 * Control kits cross the process boundary as recipes (`ControlKitSpec`): a
 * list of cards in a tiny vocabulary whose ranking is known by construction.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ActionInstance, ActionType, CombatEngine, DiceRoll, random, ROUND_CAP, setAIControlled, withSeed,
  type ActionDefinition, type Character, type EffectHandler, type StatusBehavior,
} from '@pimpampum/engine';
import { aiPolicy, DEFAULT_LOOKAHEAD, lookaheadChooser } from '@pimpampum/ai';
import {
  CELL_AI, depth1x, feeble, firstLegal, heuristic, inLanes, isolated, leaning, planChooser, planFor, planPlayed, spam, STYLE_SHARE,
  theRegistry, theSet, uniform, useSet,
  type Chooser, type FieldedGroup, type GameSet, type Plan, type Strategy, type SubjectKit,
} from '@pimpampum/bench';
import { withVanillaSet } from '@pimpampum/playtest';

// --- control kits, as recipes -------------------------------------------------

export interface ControlCard {
  type: 'A' | 'D' | 'F';
  dice?: string;
  /** aim: a Focus after which the holder's next attack adds `fxDice`.
   *  bane: an attack that adds `fxDice` against a hero of the kit `prey`.
   *  duo: an attack that adds `fxDice` while an ally of the kit `prey` stands.
   *  riposte: a Defense that, when it holds, hits the attacker back for `fxDice`, past any guard.
   *  blast: a Focus that takes its `dice` off an enemy, past any guard.
   *  noop: nothing at all. */
  /** (boost: a Focus after which the holder's attack rolls add the mean of `fxDice` for two rounds.) */
  fx?: 'aim' | 'bane' | 'duo' | 'boost' | 'riposte' | 'blast' | 'noop';
  fxDice?: string;
  prey?: string;
  fast?: boolean;
}
export interface ControlKitSpec { id: string; cards: ControlCard[] }

const AIMED = 'rank-aimed';

export function controlKit(spec: ControlKitSpec): SubjectKit {
  const effects: Record<string, EffectHandler> = {};
  const aims = spec.cards.filter(c => c.fx === 'aim');
  if (aims.length) {
    effects[`${spec.id}-strike`] = {
      modifyAttack(ctx) {
        const dice = ctx.source.getStatus(AIMED)?.data?.dice as string | undefined;
        if (!dice || !ctx.attackMods) return;
        ctx.attackMods.extraDamageDice.push(DiceRoll.parse(dice));
        ctx.source.clearStatus(AIMED);
      },
    };
  }
  const actions = spec.cards.map((c, i): ActionDefinition => {
    const own = `${spec.id}-${i + 1}`;
    const fx: { type: string }[] = [];
    if (c.type === 'A' && aims.length) fx.push({ type: `${spec.id}-strike` });
    if (c.fx === 'aim') {
      const extra = DiceRoll.parse(c.fxDice!);
      /** Priced as the blow's mean share of a body, the currency the evaluator reads. */
      const behavior: StatusBehavior = { positionValue: ref => extra.average() / Math.max(1, ref.holder.maxPV) };
      effects[`${own}-aim`] = { onResolve(ctx) { ctx.source.setStatus(AIMED, 1, -1, { dice: c.fxDice }, behavior); } };
      fx.push({ type: `${own}-aim` });
    }
    if (c.fx === 'bane') {
      const extra = DiceRoll.parse(c.fxDice!);
      effects[`${own}-bane`] = {
        modifyAttack(ctx) { if (ctx.target && ctx.attackMods && c.prey!.split(',').some(k => ctx.target!.getSkillLevel(k) > 0)) ctx.attackMods.extraDamageDice.push(extra); },
      };
      fx.push({ type: `${own}-bane` });
    }
    if (c.fx === 'duo') {
      const extra = DiceRoll.parse(c.fxDice!);
      effects[`${own}-duo`] = {
        modifyAttack(ctx) {
          const partner = ctx.engine.alliesOf(ctx.source, true).some(a => a !== ctx.source && a.isAlive() && a.getSkillLevel(c.prey!) > 0);
          if (partner && ctx.attackMods) ctx.attackMods.extraDamageDice.push(extra);
        },
      };
      fx.push({ type: `${own}-duo` });
    }
    if (c.fx === 'boost') {
      const bonus = Math.round(DiceRoll.parse(c.fxDice!).average());
      // Any attack the holder makes, whatever kit it is from: the vanilla Focus must work in a real hand.
      const behavior: StatusBehavior = { attackRollOfHolder: () => bonus, positionValue: ref => bonus / Math.max(1, ref.holder.maxPV) };
      effects[`${own}-boost`] = { onResolve(ctx) { ctx.source.setStatus(`${own}-boost`, bonus, 2, undefined, behavior); } };
      fx.push({ type: `${own}-boost` });
    }
    if (c.fx === 'riposte') {
      const back = DiceRoll.parse(c.fxDice!);
      effects[`${own}-riposte`] = {
        onDefend(ctx) { if (ctx.target?.isAlive()) ctx.engine.performExtraAttack(ctx.source, ctx.target, back, { ignoreDefense: true, label: `${ctx.source.name} riposte` }); },
      };
      fx.push({ type: `${own}-riposte` });
    }
    if (c.fx === 'blast') {
      effects[`${own}-blast`] = {
        getTargetRequirement: () => 'enemy',
        onResolve(ctx) {
          const t = ctx.targets[0];
          if (t?.isAlive() && ctx.action.dice) ctx.engine.applyPvLoss(t, ctx.engine.rollDiceFor(ctx.source, ctx.action.dice), ctx.source);
        },
      };
      fx.push({ type: `${own}-blast` });
    }
    return {
      id: own, name: `${c.type}${i + 1}`, skillId: spec.id, unlockLevel: i + 1,
      actionType: c.type === 'A' ? ActionType.Atac : c.type === 'D' ? ActionType.Defensa : ActionType.Focus,
      ...(c.dice ? { dice: DiceRoll.parse(c.dice) } : {}), ...(c.fast ? { fast: true } : {}),
      effects: fx, description: '', iconPath: '',
    } as ActionDefinition;
  });
  return { id: spec.id, actions, effects };
}

// --- a matchup ------------------------------------------------------------------

export interface HeroSpec {
  kit: string; level: number;
  pv?: number;
  /** Control-kit card ids put in the hand, whatever the hero's kit. */
  add?: string[];
  /** Card ids taken out of the hand. */
  drop?: string[];
}
/**
 * How a side is played: `ai` (production), `ai2x`, `heuristic`, `spam`,
 * `feeble`, `first`, `random`, `turtle`, `attacks`, `attacks+focus`,
 * `attacks+defense`, `Power`, `Protect`, `Aggro`, or `S:` + a pool strategy as JSON.
 */
export interface SideSpec { heroes?: HeroSpec[]; creatures?: FieldedGroup[]; style?: string }
export interface Match { a: SideSpec; b: SideSpec; seed: number }
export interface Played { s: number; rounds: number; capped: boolean }
export interface SetRef { module: string; export: string }
export interface Job { set: SetRef; controls: ControlKitSpec[]; matches: Match[] }

/** The cards of the control kits in play, by id: what `HeroSpec.add` puts in a hand. */
const extraCards = new Map<string, ActionDefinition>();

function build(side: SideSpec, tag: string): Character[] {
  const set = theSet();
  if (side.creatures) return set.buildEncounter(side.creatures);
  const team = set.buildParty({ characters: side.heroes!.map((h, i) => ({ ...set.hero(`${tag}${i + 1}`, h.kit, h.level), ...(h.pv ? { pv: h.pv } : {}) })) });
  side.heroes!.forEach((h, i) => {
    if (h.drop?.length) team[i].actions = team[i].actions.filter(x => !h.drop!.includes(x.def.id));
    for (const id of h.add ?? []) {
      const def = extraCards.get(id);
      if (!def) throw new Error(`rank/play: no control card ${id}`);
      team[i].actions.push(new ActionInstance(def));
    }
  });
  return team;
}

function chooserOf(named: string, side: number, shown: (Plan | null)[]): Chooser {
  // `ai#twin`: the same play under another name.
  const style = named.split('#')[0];
  if (style.startsWith('noisy:')) {
    // The production AI, but each card is a random legal one with these odds.
    const p = Number(style.slice(6)), ai = lookaheadChooser(CELL_AI);
    return (engine, actor) => (random() < p ? uniform : ai)(engine, actor);
  }
  if (style.startsWith('S:')) {
    const m = JSON.parse(style.slice(2)) as Strategy;
    return planChooser(engine => planFor(m, engine, side, shown[1 - side]));
  }
  const only = (...types: ActionType[]) => lookaheadChooser({ ...DEFAULT_LOOKAHEAD, restrictTo: types });
  switch (style) {
    case 'ai': return lookaheadChooser(CELL_AI);
    case 'ai2x': return depth1x;
    case 'heuristic': return heuristic;
    case 'spam': return spam;
    case 'feeble': return feeble;
    case 'first': return firstLegal;
    case 'random': return uniform;
    case 'turtle': return only(ActionType.Defensa);
    case 'attacks': return only(ActionType.Atac);
    case 'attacks+focus': return only(ActionType.Atac, ActionType.Focus);
    case 'attacks+defense': return only(ActionType.Atac, ActionType.Defensa);
    case 'Power': return leaning(ActionType.Focus, STYLE_SHARE);
    case 'Protect': return leaning(ActionType.Defensa, STYLE_SHARE);
    case 'Aggro': return leaning(ActionType.Atac, STYLE_SHARE);
    default: throw new Error(`rank/play: unknown style '${style}'`);
  }
}

const TARGETS = aiPolicy(CELL_AI).targetChooser;

function playMatch(m: Match): Played {
  return withSeed(m.seed, () => {
    const teams = [build(m.a, 'A'), build(m.b, 'B')];
    for (const t of teams) setAIControlled(t);
    const shown: (Plan | null)[] = [null, null];
    const choosers = [chooserOf(m.a.style ?? 'ai', 0, shown), chooserOf(m.b.style ?? 'ai', 1, shown)];
    const e = new CombatEngine(teams[0], teams[1], {
      registry: theRegistry(), maxRounds: ROUND_CAP, targetChooser: TARGETS,
      actionChooser: (en, c) => choosers[c.team](en as CombatEngine, c),
    });
    while (!e.isOver() && e.round < e.maxRounds) {
      e.prepareRound();
      e.planActions([]);
      const now = [planPlayed(e, 0), planPlayed(e, 1)];
      for (let step = e.resolveNextAction(); step.kind !== 'done'; step = e.resolveNextAction()) {
        if (step.kind === 'target') e.setResolveTarget([]);
        else if (step.kind === 'choice') e.setResolveChoice();
      }
      e.finishRound();
      for (const side of [0, 1]) if (now[side]) shown[side] = now[side];
    }
    const capped = !e.isOver(), w = e.winner();
    return { s: capped || w === null ? 0.5 : w === 0 ? 1 : 0, rounds: e.round, capped };
  });
}

/** The child's half: install the set and the controls, play, return. */
export async function playJob(job: Job): Promise<Played[]> {
  const url = job.set.module.startsWith('file:') ? job.set.module : `file://${path.resolve(job.set.module)}`;
  useSet((await import(url))[job.set.export] as GameSet);
  const kits = job.controls.map(controlKit);
  extraCards.clear();
  for (const k of kits) for (const a of k.actions) extraCards.set(a.id, a);
  return withVanillaSet(kits, () => job.matches.map(playMatch));
}

// --- the parent's half ------------------------------------------------------------

const SELF = fileURLToPath(import.meta.url);
const CACHE = process.env.RANK_CACHE ?? path.join(process.env.CLAUDE_JOB_DIR ?? '/tmp', 'tmp', 'rank-cache');
/** Bumped by hand when the content or the engine changes under a cached run. */
const SALT = 'v1';

export const ELEMENTS: SetRef = { module: import.meta.resolve('@pimpampum/set-elements/bench'), export: 'ELEMENTS' };

/** Play `matches` across the lanes; results in order. Cached on the matchups themselves. */
export async function play(matches: readonly Match[], controls: readonly ControlKitSpec[] = [], set: SetRef = ELEMENTS, chunk = 60): Promise<Played[]> {
  const jobs: Job[] = [];
  for (let i = 0; i < matches.length; i += chunk) jobs.push({ set, controls: [...controls], matches: matches.slice(i, i + chunk) });
  fs.mkdirSync(CACHE, { recursive: true });
  let done = 0;
  const started = Date.now();
  const out = await inLanes(jobs.map(job => async () => {
    const file = path.join(CACHE, `${crypto.createHash('sha1').update(SALT + JSON.stringify(job)).digest('hex')}.json`);
    let res: Played[];
    if (fs.existsSync(file)) res = JSON.parse(fs.readFileSync(file, 'utf8')) as Played[];
    else {
      res = await isolated<Played[]>(SELF, 'playJob', [job]);
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(res));
      fs.renameSync(`${file}.tmp`, file);
    }
    done++;
    if (done % 50 === 0 || done === jobs.length) process.stderr.write(`  played ${done}/${jobs.length} chunks, ${((Date.now() - started) / 1000).toFixed(0)}s\n`);
    return res;
  }));
  return out.flat();
}
