Pim Pam Pum has these intentions as a combat system:

- **Builds should be balanced across all team variations.** There are no fixed classes — players build characters by choosing skills and levels. Individual skill-vs-skill matchups can be lopsided (some skills naturally counter others, and that's intended). What matters is that no skill or combination is consistently worse than the others across team compositions of equal total skill level.
- **Balance is measured by total skill-sum parity.** A fight is fair when both teams have a similar sum of skill levels. The simulator's mirror matches (equal-budget random teams) should land near 50/50, and the web setup surfaces the team skill sum so a DM can balance encounters.
- All three action types (Atac, Defensa, Focus) should be good enough to see balanced play.
- No action should be so good that it's the best choice every time, nor so bad it never sees play.
- **Deliberate power tiers are fine, especially for objects.** Some cards and items are simply worse than others (a bastó is worse than a destral — and stays that way). Humble options are part of the fiction and the loot economy; parity is required between *skills* at equal level-sum, not between individual cards or items.
- **Armour is a small tuning lever, never a load-bearing one.** Passive armour should nudge a party's durability, not decide fights. The full range from no armour to a maximal loadout must not swing a combat's outcome by more than ~15 percentage points, and its effect must be even across enemy types — never a hard counter to one archetype (a flat per-hit subtraction silently becomes one against many-small-hits swarms, where it can negate almost everything). Encounter balance must not assume armour the player isn't guaranteed to have. Tune armour so it stays a light passive, not a switch.
- Making good decisions should matter more than winning because of powerful actions.
- Anticipating others' plays should be greatly rewarded.
- Combos between actions played in the same round should be among the best options when set up right (allies can agree on combos beforehand).
- **The game should feel SWINGY, and swing should come from reads rather than from dice.** A round is a bet: everyone commits blind, and the reveal should pay out hard in both directions.
  - **Guessing right must feel like a save.** Playing a defense into the attack it turns out to intercept should visibly rescue someone — the difference between having guessed right and having guessed wrong is a big chunk of a character's health, not a rounding error.
  - **Catching someone undefended must feel brutal.** An attack that lands on a target with no defense up should take a large fraction of them off the table, not chip them. The punishment is what makes the guess matter.
  - **The intended shape is set up → execute.** Focus cards buff, mark or expose; the follow-up attack then hits so hard it can effectively remove an opponent in one blow. A big attack that lands unopposed after a turn of preparation is *supposed* to be a kill, and telegraphing that preparation is what gives the other side its chance to answer.
  - This is deliberately in tension with "prefer many smaller dice": tight dice make the *contest* predictable, which is what lets the READ, rather than the roll, carry the swing. Swing comes from the size of the payoff, not the variance of the roll.
- Combats should be dynamic, not stuck repeating the same move.
- **Combats should not go on for more than ~5 rounds.** This applies to all combats, including symmetric AI-vs-AI mirror matches — they may not stall longer either. The starting PV (provisionally 12) and the dice on the cards are the main levers; tune them via simulation.
- **Speed ordering: most defenses are faster than most attacks, and most focuses are slow.** Exceptions are allowed and interesting (a lightning-fast strike, a heavy slow guard), but the bulk of cards should follow the ordering.
- **At the same skill level, a defense card should be stronger than an attack card.** Attacks always threaten (an undefended target takes the full roll); a defense only pays off when it intercepts, so the card itself gets a premium.
  - **The premium is big, not a nudge: a defense card should beat an attack card of the same level ~80% of the time.** Slightly larger dice is not enough — reading the attack correctly is supposed to shut it down, not shave a couple of points off it. The 80% is the target for the *contest itself* (defense total ≥ attack total, ties held by the defense); getting there is a dice job, and the gap can be closed with defense dice, attack dice or roll bonuses, whichever keeps the felt power curve intact.
  - **Read the 80% as the MEAN across same-level attacks, never as a floor against the worst of them.** This was calibrated the other way on 2026-08-08 — every defense sized so it beat the *strongest* same-level attack 80% of the time — which put the mean at ~90% and made a four-hero party of 85-90% guards effectively invulnerable: the kit analyzer's turtle test then had a defenses-only party beating a thinking one by up to 42pp. One die came back off every defense; the mean is 78% and the turtle collapsed. A guard that stops everything is not a premium, it is a win condition. Measured by `simulator/src/experiment-defense-vs-attack.ts` — re-run it after touching any contest dice, and re-run the turtle test after touching defenses at all.
  - **And a landed block should hurt.** Every defense card carries a payoff that fires when it blocks — damage back, a burn, a debuff, a heal, stone that soaks the next blow. Guessing right pays in more than damage avoided; it is what keeps Protect ahead of Aggro.
- **Prefer many smaller dice over fewer bigger dice** (e.g. 2d4 over 1d8): tighter distributions make contests less swingy. Big single dice (1d12) are reserved as deliberate swingy flavour for wild skills.
- **Dice are the felt power curve.** The weakest attacks roll 1d4; the strongest roll ~3d8. Players should experience progression as lower dice → higher dice. PV is never a design anchor for dice — it's the free knob tuned afterwards so combats hit the duration target.
- **Simplicity over mathematical complexity.** Whenever possible prefer flat modifiers and plain dice over formulas — lower the players' cognitive load at the table. A card should read as "arma +2" or "2d6", not as a computation.
- **Fatigue is the DM's pressure dial, and it is a dice modifier — on the players only.** Five discrete levels (Cansat → Esgotat), each −1 on every roll, assigned from the fiction and cleared only by a 4h+ rest. Playing cards never costs fatigue. Measured 2026-09-13: one level is worth roughly one difficulty tier (a 65% fight is 49% at level 1, 31% at level 2, 6% at level 5), so a level is handed out like a tier, never as flavour; the real decision it creates is *push on or spend four hours*.
  - **Enemies never carry fatigue.** The 2026-07-17 rejection of roll penalties ("they freeze fights") measured them *symmetrically*, accruing inside a mirror match: since damage is the margin, −X on both sides cancels and only the min-0 floor survives, which doubles fight length (3.9 → 7.7 rounds at −5, re-measured). One-sided, the same penalty *shortens* fights (5.0 → 4.2), because the tired side also defends worse. The rejection stands for symmetric penalties; a player-side dial is a different mechanism.
  - **All rolls, not just attacks.** Attack-only penalties cost the same winrate but lengthen fights (the freeze direction); defense-only penalties are nearly free (−5 costs ~2pp, defenses win ~80% of contests and undefended auto-hits never roll one). The all-rolls scope is the only one that bites *and* keeps fights short — and it is the simplest rule.
  - Pacing across a day now comes from the dial, not a budget. The cards the old budget priced above 1 (the "esgotadora" cards, listed in `NEXT-STEPS.md` §11) are unpriced until their replacement cost is decided.

## Strategy Triangle

The system aims for a **Power > Protect > Aggro** triangle, now expressed through the skill mechanics:

- **Power** (focus-heavy play) beats **Protect** (defense-heavy play) — powerful buffs/transformations eventually overwhelm pure defense, which doesn't advance the win condition.
- **Protect** (defense-heavy play) beats **Aggro** (attack-heavy play) — defenses are faster than most attacks and stronger at equal level, so their dice reliably absorb the attack margin; the defender eats penetrating hits so the protected ally stays safe, or blocks a dangerous enemy to force its attacks onto themself.
- **Aggro** (attack-heavy play) beats **Power** (focus-heavy play) — focus actions are slow, so fast attacks land first and interrupt an undefended focus before it resolves.

This emerges because the strongest focus actions are **high risk / high reward**: very powerful but slow, so the best play is often protecting an ally who is committing to a big focus. Lighter, faster focus actions (dodges, small buffs) add variety without demanding full team protection.

**When a corner of the triangle dominates, BUFF THE CORNER THAT BEATS IT.** The
reflex is to nerf whatever is winning; the rule here is the opposite. If Protect
is dominating — the measurable symptom is the kit analyzer's turtle test, a
defenses-only party beating a thinking one — diagnose why, then **buff Focus
cards until the balance returns**, rather than shaving defenses down. Power is
supposed to beat Protect, so Protect running away means Power is too weak, and
cutting Protect would only lower the whole game's power level instead of
restoring the relationship. The same applies around the triangle.

A note on what actually answers a turtle, since not every focus does: buffing an
attack is useless against a wall of guards that holds 85% of everything. The
cards that break a turtle are the ones a guard cannot stop — undefendable
payloads (Guèiser, Riu de lava), reaps that ignore defenses (Mà de la tomba),
and build-ups big enough that no guard survives what they eventually land.
Enemy kits are especially thin here, which is why a turtling party currently
goes unpunished.

Balance levers that maintain the triangle (being tuned via simulation):
- **Focus power** — a resolved high-impact focus should be game-changing (large skill buffs, transformations).
- **Focus speed** — slow enough (low speed values) that most attacks resolve first.
- **Defense speed** — fast enough (high speed values) to reliably intercept attacks.
- **Attack dice vs defense dice and armour** — damage is the margin, so small unbuffed attacks should struggle to get through a defense plus armour; buffs and coordination make them land.
- **PV pools** — low enough that clean hits threaten characters and combats end in time.

## Skill design intentions

- Each skill should have a clear identity, lore, and a unique combination of strengths and weaknesses; actions should feel great and make sense for the skill's theme.
- Each skill should have at least one **signature action** with a distinctive, high-impact effect that breaks the normal action mold.
- Actions unlock at increasing skill levels, so a high-level skill rewards investment with stronger/rarer actions. **The ordinal IS a power ramp: within any skill — player or enemy — later actions should be stronger, and a higher-level character should definitely be stronger than a lower-level one.** Enemy kits order weakest attack at level 1 and signature power late, so a fielded enemy's level is a genuine difficulty lever.
- **Low levels must already offer diverse options.** By level 2-3 a player should be choosing between action TYPES the skill owns (an attack AND a defense/focus), not locked into one move because they aren't "high enough". The ramp orders power *within* each type; it never front-loads one type exclusively. (Kits that deliberately lack a type — the all-attack Berserk, support kits with no attacks — are exempt for the types they don't have.)
- Draw inspiration from D&D and other RPG skills/abilities; design actions around memorable moments.
- New actions should be original (not reskins of existing ones) and balanced against the existing set.

## Out-of-combat challenges

- **`1d20 + the action's dice + skill level` vs a DM difficulty**, meet-or-beat. Card dice alone can't carry these checks: they're calibrated to contest *other cards*, both sides around 7, and a world difficulty is not another card. The d20 sets the scale; the card and level are what training buys on it.
- **Anyone may attempt anything** — no fitting skill, bare d20 (~55% at Normal, 5% at Very hard, never at Heroic). A skill is not permission to try, it's what makes you good. Hence no Perception or Investigation skill, ever.
- **Skill level lands flat here, not as mestratge.** Against the world there's no opposing mestratge to cancel against.
- **The margin is the payload**, as in combat. Never a bare yes/no.
- **Failing by 1 or 2 teaches, including from zero** — the one case a fight can't produce, since in combat you only play cards you know.
- **Reward invention by lowering the difficulty**, never with a bonus: nothing to price, nothing to argue about.

> When simulation results conflict with these intentions, flag the discrepancy and propose fixes.
