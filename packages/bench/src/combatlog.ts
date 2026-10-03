/**
 * READING A FIGHT OUT OF ITS LOG.
 *
 * Some questions need per-BLOW detail the engine does not collect — how much of
 * a hit armour absorbed, how much damage a defense prevented when it did
 * intercept. `CombatStats` counts cards, not blows, and adding a blow-level
 * hook to the engine for two harnesses is a seam the game does not need.
 *
 * So they parse the combat log. That is a fine answer with one sharp edge, and
 * this module exists for the edge: **a regex that stops matching produces an
 * empty table, not an error.** Both harnesses that did this held their own
 * copies of nearly-identical patterns, so a log-format change would have
 * silently emptied two measurements while both kept printing a tidy report with
 * no rows in it.
 *
 * One set of patterns, one parser, and `assertParsed` — which throws when a run
 * played combats and read nothing out of them.
 */
import type { LogEntry } from '@pimpampum/engine';

/**
 * The log lines this module knows how to read.
 *
 * They are the ENGINE's message formats, so they are a coupling — deliberately
 * a loud one. If the engine's wording changes, `assertParsed` fires on the next
 * run rather than the harness quietly reporting nothing.
 */
// Group 1 of the two roll patterns is the ACTOR (everything before the card's
// «quotes», emoji and all), group 2 the card. Some callers want the actor —
// "is the attack after I prepared bigger?" is a question about a character, not
// about a round — so it is captured once here rather than by a second regex in
// a second file.
//
// A CONTEST SIDE is printed by the engine's `fmtContestSide` in one of six
// shapes — `7`, `7+2=9`, `7−2=5`, `7→14`, `7+2→18`, `7−2→10` — where the
// minus is U+2212, not ASCII. The first version allowed only `[\d+]+=`, so every
// line with a NEGATIVE bonus — every fatigued attacker — failed to match and was
// dropped. `assertParsed` could not see it, because it only fires when nothing
// at all parses: a fight with half its blows missing looked fine.
const SIDE = String.raw`(?:\d+(?:[+−]\d+)?[=→])?(\d+)`;
const UNDEFENDED = new RegExp(String.raw`^(.*?)«([^»]+)»: atac ${SIDE} — (.+?) no es defensa(?: \((\d+) armadura\))?`);
const CONTESTED = new RegExp(String.raw`^(.*?)«([^»]+)»: atac ${SIDE} vs (.+?) «([^»]+)»: defensa (\S+)(?: armadura=(\d+))?`);
const HIT = /«([^»]+)» colpeja ([^:]+): (\d+) dany/;
const BLOCKED = /atura l'atac/;

/**
 * The defender's contest total, from the defense side of a line.
 *
 * `fmtDefenseSide` folds passive armour into the DISPLAYED total so that
 * atac − defensa = dany reads straight off the line: `5+1+2 armadura=8`. The
 * contest itself was 6, so the armour comes back off. Without armour it is a
 * plain contest side, and the total is the last number printed.
 */
function defenseTotal(side: string, shownWithArmour: string | undefined): number {
  if (shownWithArmour !== undefined) {
    const armour = Number(/\+(\d+)$/.exec(side)?.[1] ?? 0);
    return Number(shownWithArmour) - armour;
  }
  return Number(side.split(/[=→]/).at(-1));
}

/** Strip the log's leading emoji/spaces from a captured actor name. */
function cleanActor(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} '’·\-]/gu, ' ').trim();
}

/** One attack, as far as the log reveals it. */
export interface AttackEvent {
  /** Who swung, as the log names them. */
  actor: string;
  /** The attacking card's name. */
  card: string;
  /** The attack total that was rolled (before armour). */
  roll: number;
  /** Who it was aimed at, trimmed. */
  target: string;
  /** The defending card's name, when the blow was contested. */
  defenseCard?: string;
  /** The defense total, when contested. */
  defenseRoll?: number;
  /** Damage actually dealt. 0 when the blow was fully stopped or absorbed. */
  damage: number;
  /** A defense held it entirely. */
  blocked: boolean;
  /** Index of the ROLL line in the log. Lets a caller interleave attacks with
   *  other log lines it cares about — "was this swing after I prepared?" is a
   *  question about order — without re-walking the log with its own patterns. */
  at: number;
}

/**
 * Walk a combat's log and pull out every attack.
 *
 * The log interleaves a roll line and then, separately, a damage or block line,
 * so this pairs them: a roll opens a pending attack, the next matching hit or
 * block closes it. An attack whose roll is never followed by either (the target
 * died to something else first, say) is dropped rather than guessed at.
 */
export function parseAttacks(entries: readonly LogEntry[]): AttackEvent[] {
  const out: AttackEvent[] = [];
  let pending: AttackEvent | null = null;

  const close = (): void => { if (pending) out.push(pending); pending = null; };

  entries.forEach((entry, at) => {
    const u = UNDEFENDED.exec(entry.message);
    if (u) {
      close();
      pending = {
        actor: cleanActor(u[1]), card: u[2], roll: Number(u[3]),
        target: u[4].trim(), damage: 0, blocked: false, at,
      };
      return;
    }
    const c = CONTESTED.exec(entry.message);
    if (c) {
      close();
      pending = {
        actor: cleanActor(c[1]), card: c[2], roll: Number(c[3]), target: c[4].trim(),
        defenseCard: c[5], defenseRoll: defenseTotal(c[6], c[7]), damage: 0, blocked: false, at,
      };
      return;
    }
    if (!pending) return;
    const h = HIT.exec(entry.message);
    if (h && h[1] === pending.card) {
      pending.damage = Number(h[3]);
      // The hit line names the real victim, which can differ from the roll
      // line's target when a guard redirected the blow.
      pending.target = h[2].trim();
      close();
      return;
    }
    if (BLOCKED.test(entry.message)) { pending.blocked = true; close(); }
  });
  close();
  return out;
}

/**
 * Fail loudly when a run read nothing.
 *
 * This is the whole reason the module exists. A harness that played 300
 * combats and parsed 0 attacks has not measured "no attacks happened" — its
 * patterns have gone stale, and every number it is about to print is zero for
 * a reason that has nothing to do with the game.
 */
export function assertParsed(parsed: number, combats: number, what = 'atacs'): void {
  if (combats > 0 && parsed === 0) {
    throw new Error(
      `0 ${what} llegits de ${combats} combats. El format del registre de combat ha canviat i `
      + 'els patrons de bench/combatlog.ts ja no hi encaixen — la taula que ve a continuació '
      + 'seria buida sense cap error. Arregla els patrons, no la taula.',
    );
  }
}
