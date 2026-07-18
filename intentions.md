Pim Pam Pum has these intentions as a combat system:

- **Builds should be balanced across all team variations.** There are no fixed classes — players build characters by choosing skills and levels. Individual skill-vs-skill matchups can be lopsided (some skills naturally counter others, and that's intended). What matters is that no skill or combination is consistently worse than the others across team compositions of equal total skill level.
- **Balance is measured by total skill-sum parity.** A fight is fair when both teams have a similar sum of skill levels. The simulator's mirror matches (equal-budget random teams) should land near 50/50, and the web setup surfaces the team skill sum so a DM can balance encounters.
- All three action types (Atac, Defensa, Focus) should be good enough to see balanced play.
- No action should be so good that it's the best choice every time, nor so bad it never sees play.
- **Deliberate power tiers are fine, especially for objects.** Some cards and items are simply worse than others (a bastó is worse than a destral — and stays that way). Humble options are part of the fiction and the loot economy; parity is required between *skills* at equal level-sum, not between individual cards or items.
- Making good decisions should matter more than winning because of powerful actions.
- Anticipating others' plays should be greatly rewarded.
- Combos between actions played in the same round should be among the best options when set up right (allies can agree on combos beforehand).
- Combats should be dynamic, not stuck repeating the same move.
- **Combats should not go on for more than ~5 rounds.** This applies to all combats, including symmetric AI-vs-AI mirror matches — they may not stall longer either. The starting PV (provisionally 12) and the dice on the cards are the main levers; tune them via simulation.
- **Speed ordering: most defenses are faster than most attacks, and most focuses are slow.** Exceptions are allowed and interesting (a lightning-fast strike, a heavy slow guard), but the bulk of cards should follow the ordering.
- **At the same skill level, a defense card should be stronger than an attack card.** Attacks always threaten (an undefended target takes the full roll); a defense only pays off when it intercepts, so the card itself gets a premium.
- **Prefer many smaller dice over fewer bigger dice** (e.g. 2d4 over 1d8): tighter distributions make contests less swingy. Big single dice (1d12) are reserved as deliberate swingy flavour for wild skills.
- **Dice are the felt power curve.** The weakest attacks roll 1d4; the strongest roll ~3d8. Players should experience progression as lower dice → higher dice. PV is never a design anchor for dice — it's the free knob tuned afterwards so combats hit the duration target.
- **Simplicity over mathematical complexity.** Whenever possible prefer flat modifiers and plain dice over formulas — lower the players' cognitive load at the table. A card should read as "arma +2" or "2d6", not as a computation.
- **Fatigue is the day's budget, never a dice modifier.** Its jobs: price heroic cards (rage, adrenalina) in a shared currency, and cap daily action spam (no healing the whole party to full for free). The maximum (provisionally 15) is the pacing knob: a day should sustain ~2-3 combats. Roll penalties from fatigue are permanently rejected — they freeze fights instead of ending them (measured).

## Strategy Triangle

The system aims for a **Power > Protect > Aggro** triangle, now expressed through the skill mechanics:

- **Power** (focus-heavy play) beats **Protect** (defense-heavy play) — powerful buffs/transformations eventually overwhelm pure defense, which doesn't advance the win condition.
- **Protect** (defense-heavy play) beats **Aggro** (attack-heavy play) — defenses are faster than most attacks and stronger at equal level, so their dice reliably absorb the attack margin; the defender eats penetrating hits so the protected ally stays safe, or blocks a dangerous enemy to force its attacks onto themself.
- **Aggro** (attack-heavy play) beats **Power** (focus-heavy play) — focus actions are slow, so fast attacks land first and interrupt an undefended focus before it resolves.

This emerges because the strongest focus actions are **high risk / high reward**: very powerful but slow, so the best play is often protecting an ally who is committing to a big focus. Lighter, faster focus actions (dodges, small buffs) add variety without demanding full team protection.

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

> When simulation results conflict with these intentions, flag the discrepancy and propose fixes.
