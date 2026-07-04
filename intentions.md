Pim Pam Pum has these intentions as a combat system:

- **Builds should be balanced across all team variations.** There are no fixed classes — players build characters by choosing skills and levels. Individual skill-vs-skill matchups can be lopsided (some skills naturally counter others, and that's intended). What matters is that no skill or combination is consistently worse than the others across team compositions of equal total skill level.
- **Balance is measured by total skill-sum parity.** A fight is fair when both teams have a similar sum of skill levels. The simulator's mirror matches (equal-budget random teams) should land near 50/50, and the web setup surfaces the team skill sum so a DM can balance encounters.
- All three action types (Atac, Defensa, Focus) should be good enough to see balanced play.
- No action should be so good that it's the best choice every time, nor so bad it never sees play.
- Making good decisions should matter more than winning because of powerful actions.
- Anticipating others' plays should be greatly rewarded.
- Combos between actions played in the same round should be among the best options when set up right (allies can agree on combos beforehand).
- Combats should be dynamic, not stuck repeating the same move.
- **Combats should not be longer than ~9 rounds on average.** This target applies to real play (players vs encounters), which sits at ~8-10 rounds with the standard 20 player PV. Symmetric AI-vs-AI mirror matches stall much longer (support skills out-sustain each other); that stat is a diagnostic, not held to the target.

## Strategy Triangle

The system aims for a **Power > Protect > Aggro** triangle, now expressed through the skill mechanics:

- **Power** (focus-heavy play) beats **Protect** (defense-heavy play) — powerful buffs/transformations eventually overwhelm pure defense, which doesn't advance the win condition.
- **Protect** (defense-heavy play) beats **Aggro** (attack-heavy play) — defenders roll d20 + defense skill against each incoming attack and, when they out-speed the attack, reliably block it; the defender eats penetrating hits so the protected ally stays safe.
- **Aggro** (attack-heavy play) beats **Power** (focus-heavy play) — focus actions are slow, so fast attacks land first and interrupt an undefended focus before it resolves.

This emerges because the strongest focus actions are **high risk / high reward**: very powerful but slow, so the best play is often protecting an ally who is committing to a big focus. Lighter, faster focus actions (dodges, small buffs) add variety without demanding full team protection.

Balance levers that maintain the triangle (being tuned via simulation):
- **Focus power** — a resolved high-impact focus should be game-changing (large skill buffs, transformations).
- **Focus speed** — slow enough (low speed values) that most attacks resolve first.
- **Defense speed** — fast enough (high speed values) to reliably intercept attacks.
- **Damage dice vs passive armour** — small unbuffed attacks should struggle against armour; buffs/coordination make them land.
- **PV pools** — low enough that clean hits threaten characters and combats end in time.

## Skill design intentions

- Each skill should have a clear identity, lore, and a unique combination of strengths and weaknesses; actions should feel great and make sense for the skill's theme.
- Each skill should have at least one **signature action** with a distinctive, high-impact effect that breaks the normal action mold.
- Actions unlock at increasing skill levels, so a high-level skill rewards investment with stronger/rarer actions.
- Draw inspiration from D&D and other RPG skills/abilities; design actions around memorable moments.
- New actions should be original (not reskins of existing ones) and balanced against the existing set.

> When simulation results conflict with these intentions, flag the discrepancy and propose fixes.
