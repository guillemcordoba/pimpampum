# Goals

The one list of what is still to do. **The owner** writes and orders it, on
walks; **the goals night run** (`scripts/night/`) works it while the owner sleeps and
opens at most one pull request a morning. Delete an item when it is done.
Findings go into the doc they change (`rules.md`, `intentions.md`,
`ARCHITECTURE.md`) or the commit message, never into a growing log.

## Night goals, in order

The night takes the FIRST goal it has not finished, and works only on it. Each
goal states its done-check: something the night can run and read on its own.
A goal without one is not ready for the night; it stays with the owner.

Since 2026-11-13 attacks add up against defenses (`rules.md`, ed19411). Every
number measured before that day (the calibration, each `KNOWN` list, what the
AI was tuned on) was measured under another rule. The goals below measure them
again, in the order they stand on each other. The heroes' PV came first
(2026-11-14): the elements table is derived under the rule and pinned, on the
owner's reading of fight length (the median within 6 rounds, stalls under 2%,
the slow tenth shown), the line aiming a round under that limit and no class
past it, the flat PV amounts on cards halved with it (the owner, that
morning; `intentions.md`). The table was pinned from one derivation, with an AI that
still read its opponent; without the read its line is still inside every
level's window (2026-11-15, goal 1). The calibration and the `KNOWN`
lists still describe 26-PV heroes and the old length bar until goal 2, which
waits for goal 1.

- **Every finding in the report is a chain:** rule → decision → symptom, each
  link with where it comes from and at most one number, so the owner sees
  which link to change (the owner, 2026-11-13).
- **A slow fight of a class against itself is not a failure** (the owner,
  2026-11-13; `intentions.md`). Fight length is read on mixed teams.

1. **How defenses meet attacks: no rule yet makes the dumb strategies lose at
   every level.** B2, B26.
   The owner, 2026-11-14: "explore why the spam attacker is so strong,
   exploring alternative rules that tune how defense cards go against
   attacks, so that we can find a PV that fulfills both quick fights and no
   one hit ko". The owner's rulings of 2026-11-15, which the candidates and
   the instruments below follow:
   - of "the loser of a contest takes the margin", which the night of
     2026-11-15 had proposed (the AI clearly ahead of spam and of attacks
     alone at all eight levels): "This is so anti lore, we can't do it. And
     we had the previous rule to make playing defense worth it" (the rule
     meant: Envoltat). Deleted from the engine;
   - of an opening, the initiative, an attacker off balance or staggered
     for whoever holds a blow: "All of these could be unique card effects,
     I don't like any of them as general rules"; a guard nobody attacked
     gets nothing;
   - "Playing a defense should feel awesome as well, like you're not just
     cancelling an attack, you're gaining an upside if you do. Spam can't be
     beat by reading it, it needs to be beaten by another strat";
   - the triangle is a claim about one round: "if the enemy played an
     attack, you wished you played a defense, if the enemy played a defense,
     you wished to have played a focus, if the enemy plays a focus, you
     wished you had attack"; scored on the rest of the fight, pure and mixed
     plays, and it replaces the leans;
   - "we need the strategy pool ai … we are happy when the strategy pool
     converges to a player that reads the opponent and does the winning play
     against it"; "a test or requirement that goes red when the best strat
     is a dumb one … control tests to that requirement with mock engines";
     each set gets the test, in two tiers ("Great yeah sounds great");
     strategies come from families with numbers to turn, without the
     counter-reader family ("Remove counter reader").
   **The instruments** (2026-11-15; `packages/tools/README.md`):
   - the round table (`round-table.ts`, bench `round-table.ts`, playtest
     `roundTriangle`): round starts from ordinary fights, the round replayed
     for every pair of plans (a side's two card types), the fight played
     out. Three levels in 3 to 4 minutes at 24 lanes;
   - the strategy pool (`strategy-pool.ts`, bench `pool.ts`, playtest
     `growPool`): the double oracle over strategies (tables of answers,
     fixed odds, state players, scripts), from always-attack, always-defend
     and always-Focus. One level in 20 minutes to 2 h 20;
   - the requirement (playtest `poolVerdict`): red when the pool's
     equilibrium mix is mostly strategies that play the same whatever
     happens, or when one of the three dumbest does not clearly lose to
     that mix. Its controls are mock games (`playtest/test/pool.test.ts`):
     attack, defense or Focus simply winning, and nothing mattering, are
     each red; a clean triangle is green.
   **What they found**, elements kits, every hero on the pinned PV. The
   candidates are four ways a guard meets several blows (today: a blow uses
   up what it threw; half; whole: every blow meets the whole roll; Envoltat)
   each alone, with a guard that covers both bodies ("both"), and with every
   Defense card a rung higher ("rung"); playtest `DEFENSE_RULES`.
   - The round table, 240 round starts a cell, ±3, levels 3 / 6 / 10, today's
     rule: into both attacking, both defending scores 61% / 47% / 37% against
     58% / 53% / 50% for attacking back; into a defense a Focus scores 89% /
     67% / 69%; into a Focus an attack 75% / 66% / 88%. One edge is broken,
     the same at every level: a defense is not the answer to an attack.
   - Under every other candidate a defense is clearly the answer at level 3
     (a lead of 10 to 27 points); under none at levels 6 and 10 (at best
     +6.7 ±4.5 at level 6, whole + rung; +2.9 ±4.2 at level 10, whole +
     both). The best reply there is often mixed (one attacks, one defends),
     which the verdict on pure replies does not credit.
   - The pool at level 6, 200 fights a duel, always-attack against the final
     mix: today 49% (red); today + both 50.1% ±2.2 (red, still growing at 14
     members); whole + rung 50.0% ±2.1 (red, the same); Envoltat 40.3% ±1.9
     (green); Envoltat + both 38.1% ±2.6 (green); whole + both 36.6% ±1.8
     (green). So at level 6 it is attacks adding up that lets spam play
     even with the best: both rules where every blow meets a whole roll pass,
     and a guard covering both bodies does not pass on its own. The strategy
     that beats spam there opens with one attack and one defense.
   - Why Envoltat does it at level 6 (always-attack against always one
     attack and one defense, 15 PV, 1200 fights, round 1, the same positions
     under both rules): the defender chooses whom to cover after the aims,
     so about one of the two attackers' cards meets a defense either way. A
     blow that meets a defense another blow already met takes 3.6 PV today
     and 2.2 under Envoltat, so piling on stops paying; the attackers then
     throw fewer big slow cards (Fúria de flames, Allau) and more fast 1d4
     ones that land before the guard (Ventada, Llançament de roca), and a
     blow on an undefended body takes 3.7 PV where it took 4.4. The side
     that defends loses 5.2 PV in the round where it lost 6.1; the
     all-attack side loses 5.7 either way, 8% to 9% of it paid back by the
     guard. A race the attackers led by 0.4 PV a round, they trail by 0.5:
     always-attack scores 33% where it scored 44%. The defense wins by
     costing the attackers a card, not by what a block pays.
   - Envoltat + both at the other levels: level 3 red, by the turtle
     (always-defend 46.5% ±2.3 against the mix, always-attack 29.5%); level
     10 red, by spam (always-attack 50.2% ±1.6).
   - The production AI against the final mix: 52% to 62%; the pool plays
     about as well as it does.
   - The pools of 2026-11-22: each rule on its own PV for quick fights (the
     PV the `defense-rules.ts` screen found on 2026-11-20; elements, 200
     fights a duel; always-attack against the pool's final mix; ✓ green, ✗
     red; "ends at n": nothing new beats the mix of n members; "cap":
     stopped at 14 members, still growing; "cut": the night ran out, still
     growing). This block is placed to merge
     beside the open pull requests of 2026-11-17 (#15, the pools on the
     pinned PV) and 2026-11-20 (#16, the level-10 pools at 7 members).

     | rule | level 3 | level 6 | level 10 |
     |---|---|---|---|
     | today | 12 PV: ✓ 27.9% ±1.9, cap | 15 PV: ✗ 45.8% ±3.5, ends at 4 | 41 PV: ✗ the pool never leaves spam (11-20) |
     | Envoltat | 5 PV: ✓ 38.4% ±1.9, ends at 10 | 13 PV: ✓ 35.5% ±3.1, ends at 11 | 34 PV: ✗ 50.0% ±1.5, cap |
     | whole + both | 11 PV: ✓ 16.9% ±2.2, cap | 13 PV: ✓ 32.6% ±2.8, ends at 6 | 30 PV: ✗ 46.8% ±2.3, cut at 9 |

     Both candidates pass levels 3 and 6 as they do on the pinned PV, and
     the pool passes nothing at level 10. One verdict moves with the PV:
     today's rule at level 3 is green on 12 PV (the mix all tables that
     answer) where it is red on the pinned 5 to 8 (spam 50.0%, 11-17); at
     level 6, on the 15 PV the pinned line already gives, it stays red.
   - Envoltat at level 10 on 34 PV, grown from the 7 members of 2026-11-20
     to the cap: always-attack holds 29% of the mix and scores 50.0% ±1.5
     against it (the 45.0% ±3.5 read at 7 members was a pool half grown).
     The last two members gained 4.2 and 3.6 points on the mix: the
     families have little left to add.
   - But at level 10 the production AI beats everything the pool finds, and
     under both candidates, on their own PV, it beats always-attack. The AI
     against always-attack, level 10, each rule on its own PV, 400 fights
     (two of the pool's sets of fights): Envoltat 57.3% ±2.5; whole + both
     58.4% ±2.5; today 50.4% ±2.5. Under Envoltat the AI beats each of the
     pool's 14 members (57% to 97%): counted as a fifteenth it is the whole
     mix, and always-attack scores 42.5% ±3.5 against that mix; under whole
     + both (the pool at 9 members) it is 94% of the mix and always-attack
     scores 42.5% ±3.3; under today's rule the mix stays always-attack, and
     at level 6 on 15 PV always-attack is 50.0% ±1.9 against the mix with
     the AI in it. So at level 10 on its own PV each candidate has a
     strategy that clearly beats spam, and today's rule has none.
   - On the pinned PV it does not: the AI is again nearly the whole mix
     (51% to 96% against the members of the pools of 2026-11-17), but
     always-attack scores 46.5% ±3.5 against it under Envoltat and 47.2%
     ±3.5 under whole + both, neither clearly under an even duel. The
     chain: the PV is a line, 2.5 a level (`hero-pv.ts`) → a level-10 hero
     holds 25 where each candidate's fights stay quick up to 30 or 34 → the
     AI's fight against always-attack lasts 2.4 rounds on average (4.1 on
     34 PV) → a guard has no round left to pay in. Level 10 is red on the
     pinned PV for its PV, whichever candidate; the pool's verdict hides
     that, being red on both.
   - Why the pool does not find it. A pool strategy names card TYPES, by a
     table, by a script or by its side's lowest PV (bench `pool.ts`) → one
     that guards does it every round, in set rounds, or for as long as one
     of its own is hurt → under Envoltat on 34 PV the AI plays 1.3 Defense
     cards a fight against spam, each stopping 19.7 PV where the attack it
     gave up deals 11.9 (`hand-worth.ts --levels 10 --pv 34 --envoltat
     --spend 0 --why`, 400 fights; under today's rule on 41 PV: 10.9
     against 12.3, 2026-11-20). The night's reading, not measured further:
     what beats spam at level 10 is choosing the one round to guard, and no
     family holds that. The requirement (`poolVerdict`) reads the mix of
     the families alone, so at level 10 it reads red where the AI is the
     counter-example.
   - What a pool costs. A duel is one job on one lane (bench `poolDuel`
     plays its 200 fights in a row) and the search asks for one context's
     duels and waits for the slowest → a pool alone holds 1 to 8 of the 24
     lanes (Envoltat at level 10, alone for its first half hour: load 2.0,
     153 duels) → pools run side by side for nothing until the lanes fill
     (six at once: 2 300 duels an hour), and a pool is as long as its
     slowest duels. Two sides that guard fight to the round cap: under
     whole + both on 30 PV a level-10 duel takes 2 to 4 minutes, and a
     step of that pool about 20 minutes on free lanes; on lanes five other
     pools were filling it did not finish one in an hour, and was stopped
     until they ended. Cutting a duel into chunks, as the card values were
     (f7079c8), would shorten every step; it is a change to bench, which
     throws the cache away.
   - Left after the night of 2026-11-22: whole + both at level 10 on 30 PV
     from 9 members to the end (about 2 hours on free lanes); and a family,
     or a member, that holds what the AI does at level 10, before the
     pool's red there is read as the game's (the owner's call: the
     families follow the rulings of 2026-11-15).
   - The morning's screen, the question as it was asked before the pool (the
     AI against spam and against attacks alone at the PV where the median
     fight ends within 5 rounds, levels 3 to 10): every candidate alone
     fails level 6; whole + both, whole + rung and Envoltat + both pass all
     eight. Two of those three are red on the pool at some level.
   - What each Defense card takes back off the attackers when it blocks
     (`hand-worth.ts --why`, PV a play): Mantell de flames 3.1, Retruc
     d'acer 2.4, Búnquer 5.7; every other one 0.0 to 0.6. On the vanilla
     twins, whose payoff defenses riposte, the AI was clearly ahead of spam
     under every rule.
   **Left, in this order:**
   a. each set's balance test in two tiers, with its list of known
      failures: the round table every slow run; the pool at levels 3, 6 and
      10 nightly;
   b. the round table in the leans' place wherever the triangle is read
      (playtest `gate.ts` and `triangle.ts`, `fixes.ts`, both sets' triangle
      tests, `kit-analyzer.ts --triangle`), and its verdict crediting a
      mixed reply that holds the counter;
   c. control kits on the real engine for the requirement: one that
      obviously favours a play must be red, one built as a triangle green;
   d. the pools not grown yet: Envoltat alone at levels 3 and 10, whole +
      both at 3 and 10, and each at its own PV for quick fights (all of the
      above are at the pinned PV; a stronger guard asks for less);
   e. level 10, where no candidate makes spam lose: how much a block must
      pay (`defense-rules.ts --payoffs`, on the twins, not run), as a target
      for the Defense cards the owner redesigns.
   *Done when:* both sets hold the two-tier test and the slow tier fails
   nothing outside its lists (a, b); the control kits read as they must
   (c); and the report holds, for Envoltat alone and for whole + both, the
   pool's verdict at levels 3, 6 and 10 (d). Item e and the choice of rule
   are the owner's, from those numbers.
   Nothing is switched on: the engine's options are off, and `rules.md`,
   `intentions.md`, the cards and the pinned PV are as they were.
2. **One re-baseline.** B17, B28, B30, C4.
   WAITING: not before goal 1 has a rule, which may move what this
   baseline is taken on.
   `pnpm calibration:refresh` once, on the pinned PV. Then the gate's `KNOWN`
   (`sets/elements/test/gate.slow.test.ts`) and the kit suites' `KNOWN` and
   `KNOWN_BLIND` (`test/kits/known.ts`) written again from fresh runs, each
   entry with its reason. The report names the hordes whose solved PV fell
   most: many weak attacks on one guard now sum.
   What it cost before the rule, cold, at 24 lanes: the calibration 12.5 min
   and six of the eight kit suites 3 h 48 min (2026-11-13), the gate 67 min
   alone (2026-11-11, before the card values got 1.44× cheaper). The night's
   cache outlives its worktree (`BENCH_CACHE_DIR`, f633ceb): what one night
   does not finish, the next reads back and continues, while the sources of
   engine, ai, bench, combat-balancer and the kits do not change. Order: the
   calibration, the gate, the kit suites.
   *Done when:* `pnpm test:slow` fails nothing outside lists written under
   the new rule, and the report counts each list before → after, by reason.
3. **The lists shrink: one cell a night, the largest miss first.** B25, B17.
   A number on a card is the night's to change (`kit-gate.ts --quick` to
   search, the full run to confirm). What a card does goes to the owner as a
   proposal, written as a chain.
   *Done when:* the gate's `KNOWN` and the kit suites' `KNOWN` and
   `KNOWN_BLIND` are empty, or every cell left in them is a question the
   owner has been asked.

The "Work" list below is not the night's until one of its items is moved up
here with a done-check.

## Decided, to implement

- **Every card is redesigned** (2026-11-01): the player kits (same skills, 10 cards each), the enemies, the gold cards and the item cards, each from a design doc the user writes (CLAUDE.md, "The user designs each kit"). Pilot: the firebender, from the user's concept doc ("Maestre del foc — conceptes de cartes", https://claude.ai/artifact/2doahvh6T7Rwr3t6YsgkQb): all ten concepts kept, in the order 1 Bola de foc · 2 Mantell de flames · 3 Esclat · 4 Tempesta d'espurnes · 5 Pell d'obsidiana · 6 Alè de drac · 7 Foc interior · 8 Anell de foc · 9 Llamp · 10 Supernova.
- **Old cards until their kit is redesigned:** mechanical changes only (no design or balance edits).
- **Encounter-speed test:** stays red until fights shorten.

## Decisions for the owner

- A12. Contingencies from the agent playtests (2026-11-02, same harness, Cremat at 2 PV and Tornado at 2 fatigue: both players 3/10, games 2.4 rounds on average; still Llamp, Tempesta d'espurnes, Ventada and the level-10 finishers; Alè de drac plus a 2-PV burn became a near-wipe at 12 PV, so Cremat went back to 1; a 1v2 is hopeless; ask whether Mantell de flames should burn a Tempesta caster). From 2026-11-01, 10 games of 2v2 benders through `tools/agent-duel`, both players 4/10: ~5–6 at level 6, ~2 at level 10): hero-vs-hero fights at level 10 end on the first reveal (the top dice outgrow 12 PV, and the area finishers cost nothing); damage that ignores defense (Tempesta d'espurnes) makes defending pointless; nothing answers a fast card (no fast defense; fast Focus resolves after fast attacks); the order inside a step is commit speed at a real table; rules players had to discover: a guard takes the hit for the ally it protects, a hero felled earlier in a step still plays its card, Mantell de flames does not burn a Tempesta (not a contested attack).
- A2. Rulings for `rules.md`, when a redesigned card needs them: the wall rule (every card in a holding wall pays its payoff), what "apunta" means for an area attack, the end-of-round order.
- A3. Interim defaults: a vanished aim retargets; no slow keyword; Cop desesperat is a normal card.
- A4. Balance direction: fights 4.3 → 6.0 rounds, Aggro > Power at 22.6% (Cures de camp), Guard +28.9 in card value. Report's advice: the AI first, then numbers.
- A6. Armour's price now that speed is gone (default: keep).
- A7. The equilibrium player: (a) its decision leaf; (b) when it replaces today's AI; (c) whether the balancer and bench switch too (about 160× today's cost on 3v3).
  The leaf run (2026-11-01, 300 duplicate pairs a cell, before the level left the roll), points over `margin`, ±1σ:
  'settled' +3.6 ±2.5 (2v2 archetypes), +2.0 ±2.8 (2v2 composed), +7.6 ±5.6 (3v3 archetypes);
  'adaptive' +4.3 ±2.5, +3.4 ±3.1, +2.4 ±6.2. Both ahead in every cell, none alone significant
  (pooled, settled ≈ +4.4 ±2.3, adaptive ≈ +3.4 ±2.5); the two are indistinguishable. Recommendation: 'settled', the cheaper.
- A8. Today's AI knobs (`continuation`, 9 samples): drop if A7b lands.
- A10. The web app playing the elements set (19 web files import set-fantasy).
- A14. A kit's 600 card fights are 200 fights priced three times (found 2026-11-13): the chunk's seed names the cell and the chunk, not the opponent model, and the real fight is played by the same AI under all three, so every model prices the same positions (the same decisions per fight, fight by fight, in the cache). The pooled choice cost counts them as 600 independent fights: its ± is up to a quarter too narrow (fire 9.51 ±0.63, ±0.77 clustered by the real fight; air 11.99 ±0.47, ±0.59; water 8.42 ±0.64, ±0.75; earth 6.92 ±0.54, ±0.61; acrobacia 6.62 ±0.42, ±0.46; mestre-armes 2.81 ±0.32 either way). The models do disagree card by card (six air cards are never right under one model, none under all three), so the three are not redundant. Either seed each model's fights apart (600 different fights at the same price, the ± right as it is; every card value moves once), or keep the pairing and cluster the pooled ± by the real fight.
- A15. Three choices inside the attacks-add-up rule (2026-11-13, ed19411), the assistant's until ruled: the odd point of a shared breach goes to the lowest roller; each member of a broken wall takes its own armour off its share; an absorbing guard (Berserk's) takes a broken wall's damage alone. Two consequences to know: once a blow breaks a guard, the later blows on that body that round land whole, second strikes included; a punishing defense (Remolí) punishes only the blows it still holds.

## Work, in order

- B29. [S] A hero's PV is derived per level, never fixed (the user, 2026-11-06; intentions.md). The elements set pins its table (`sets/elements/src/players/hero-pv.ts`, `tools/src/derive-pv.ts`), derived again under "attacks add up" on 2026-11-14; the tool keeps a pinned table while it still fits, because the table feeds back into the fights it is derived from (Roca viva's golem takes a level-7 earthbender's PV) and a fresh fit of the same game lands on another line. Left: the fantasy set's own table (its `heroPV` is one value until then; its cards are being redesigned first), and the pinned calibration copies, which still read set-common's `BODY_PV` until the next `pnpm calibration:refresh` re-pins them; then `BODY_PV` goes.
- B28. [S] The slow tier, measured 2026-11-05 (without the kit suites, B27): green except: the fantasy balancer's calibration (three rats asked for 50%, delivered 57.9% ±1.1, the bar 7.3 points); the fantasy balancer's realistic parties (every request came back clamped or capped by fight length, so nothing was asserted: its creatures, B20); the fantasy triangle (Protect > Aggro 24.8%, Aggro > Power 49.1%, now in its known list until the fantasy redesign, C1); and `ai/test/audit.slow.test.ts`, whose seed test (61 s) blocked its vitest worker past the RPC timeout (fixed that day: it yields between positions). The elements triangle test passes while the kit gate finds Protect > Aggro broken at levels 3, 6 and 10: the two measure different fights (the calibration party, the gate's random pairs), to reconcile. The smoke tier (`pnpm test:smoke`, 2026-11-12: 29 min at full lanes, 58 before the lane budget and the smaller scopes below): fails only `derive-pv.ts` (fantasy orders no classes by bulk: B29), `kit-analyzer.ts` (no usable cell on fantasy, every calibration shape saturated at that size: B20) and the encounter-speed test (B18); the dynamics report reads the band inconclusive in that case instead of failing. `main.ts`, `kit-tuner.ts`, `dynamics-report.ts` and `kit-gate.ts` passed the harness test's 10-minute limit at GAMES=2 (a card value is whole rollouts, a solve ~25 s, whatever the sample) and now measure a smaller scope under `BENCH_SMOKE` (668356e): two creatures a row, one tuning step, one kit, two kits. Inside the tier `dynamics-report.ts` still takes 500 s of its 600 (47 s alone: it shares the lanes with the kit suites), the next one to pass the limit.
- B27. [M] What a kit's card values cost (found 2026-11-05: a rollout of the rest of the fight per legal card per decision, the continuation played by the depth-1 AI with fictitious play; a job did not finish in 3.5 hours at 14 lanes). The owner keeps the 600 card fights a kit (2026-11-12): one set a night, the first night goal until 2026-11-13; since then the re-baseline (night goal 2) runs over as many nights as it takes, from the cache. Done: chunks of ten fights, each a job (f7079c8); the forced round planned once per sample and the engine's hottest paths cut, 1.44× cheaper on a full machine with every number the same to the bit (2026-11-13, 7708a7c). Rejected: a cheaper continuation, measured on the gate's 24 card cells (numbers at `RegretOptions.rolloutDepth`). Leads, none taken (2026-11-13, one fixed piece of card-value work, 24 copies at once):
  - The machine is bound by what its E-cores take from its P-cores, not by its cores: the eight P-cores alone finish 12.0 copies a minute (40 s a copy), all 24 cores 14.6 with one worker pinned to each (a P-core's copy 71 s, an E-core's 121 s), 13.4 left to the scheduler. With the sixteen E-cores only spinning on nothing (no memory touched) a P-core's copy still takes 64 s, its clock reading 5.2 GHz either way: power or heat, not the cache (the package limits read 253 W; 75 to 86 °C under load). A larger or smaller young generation (`--max-semi-space-size`) changes nothing. For the owner, as root on a quiet machine: `turbostat` during that test. Were the P-cores to keep their 40 s, the machine would finish about 22 a minute: 1.5×, and the set in one night.
  - A lane pinned to a core: +9% (14.6 against 13.4). Thirty lanes instead of 24: +4%.
  - `lanes.ts`, `parallel.ts` and `isolate.ts` are hashed into every cache key (all of bench is), though they cannot move a number: a change to how jobs are scheduled throws the cache away.
  - The three opponent models price the SAME 200 fights (the owner's call, in "Decisions for the owner", A14).
- B26. [M] The tuning process, top down (the user, 2026-11-04: tune the process, not today's cards; PV is DERIVED from the constraints, never chosen). Built: layer 1, the feasibility arithmetic (playtest `feasibility.ts`); layer 3, vanilla fights (playtest `vanilla.ts`; both CLIs deleted 2026-11-10); hero PV derived per level on vanilla kits (`tools/src/derive-pv.ts`: floors — survive the level's best blow, survive round 1; ceiling — fights end in time) and the structure derived too (`tools/src/derive-structure.ts`: Focus strength × defense rung × `CombatEngineOptions.chipDamage`); the quick gate and a finer cache. Found (2026-11-04, 60-120 vanilla fights a cell): on today's structure no level has a PV window; "survive the AIMED blow" fails in every structure searched; "survive the PLAIN blow" works in 11 of 36, all with a Focus worth a 3-4× blow — the widest keeping defenses on their rung add chip damage (half a held blow lands): PV ≈ 16 / 18 / 36 at levels 3 / 6 / 10. A finer search (all levels, 120 fights) is running. Decisions for the user: the burst reading, the structure (chip damage as a rule, or softer defense), the Focus rule. Then: pin PV(level) as a derived table in `sets/common` with a slow test that re-derives it, and wire it everywhere hero PV is read today (the sets' `PLAYER_PV`/`BODY_PV`/`hero()`/parties, `GameSet.playerPV`, the web app's party builder, the agent duel, the docs); real kits read against vanilla; the tuner in batches.
- B24. [S] The AI's model of its opponents — landed 2026-11-04 (3056c10): fictitious play with a read (`DEFAULT_LOOKAHEAD.fictitiousPlay`), checked by the AI match (better), the referee audit (level), the bot ladder (all green), the gate's model column and puzzle (l); the audit deals the crack archetype (738c670). Left: Esquerda still under-played (the gate's one blind spot). Not noise (2026-11-05, a one-off on the gate's level-6 earthbender fights): where Esquerda was the replays' best card (31% of the 422 decisions it was legal in) the AI played it 7.5% of the time, and still 8% with four times the samples; the replays draw the opponents' cards from the AI itself, so they are no clairvoyant bias either. The AI's estimate of the position is off: next, its model's predicted defense by the targeted enemy at those positions against what that enemy played, then a generic puzzle and the fix (the referee and the gate's dumb play no worse); the encounter creator is ~3× slower (its speed test, already red, now 9-18 s a solve): accept, a cheaper balancer setting, more workers, or revert — the user's call.
- B25. [M] The kit gate (`tools/src/kit-gate.ts`, `--quick` for iterating: the checkpoints, a quarter of the fights, no card values, ~1 min): the livable zone as one grid with WHY lines, and a ratchet slow test (`sets/elements/test/gate.slow.test.ts`). Since 2026-11-04 (the user, restoring two of the old requirements): dumb play loses (the turtle, spam and random cards, each against the AI; it replaced the bot ladder) and no kit dominates the field (65%). Left: the strength band after B20; the number tuner (`tools/src/kit-tuner.ts`) only after B26's structure is settled.
- B30. [S] The gate's card verdicts are noise at 30 fights a cell (2026-11-11). The gate ratchet (`sets/elements/test/gate.slow.test.ts`) was already red on main: two card cells it does not list (Retruc d'acer blind, Tocs en cadena never right) and three that do not touch card values (airbender L10 p90 7, airbender L5 dominates at 73%, firebender L6 no longer dominates: drift since 2026-11-05). Resampling 20 of each cell's 30 fights (the chunked card values, f7079c8) moved the card cells again: blind Esquerda, Coixí d'aire, Finta traïdora, Retruc d'acer, Bloqueig d'escorpí; waterbender L3 and acrobacia L3 choice now pass (0.7, 1.1 PV a decision; were 0.3, 0.2). Resampling only the rollouts' dice already flips 4 of the 5 card verdicts. KNOWN left as it was: noise does not belong in a ratchet. Needs the owner: more card fights (90 a cell triples the gate's card values; the full gate took 67 min cold at 24 lanes), or a verdict pooled over the levels.
- B2. [M] The AI's estimates from the engine's contest (the engine side landed 2026-11-01, rulings in `rules.md`): the weapon bonus only with `weapon_damage`, a diceless attack is 0 not 3, attacks adding up (2026-11-13, in Envoltat's place; night goal 1), roll modes, the status roll hooks, standing walls, `onlyAgainst` guards; then the gate's dumb play and the referee audit.
- B1. [M] The status vocabulary landed 2026-11-01 (`status-kinds.ts`, prices, `fieldValue`, `harmful`, the pricing test). Left: move the audit's statuses onto the kinds; drop `expectedIncomingDamage` and `unpricedChange` once nothing needs them; the 33 unused generic handlers. (Real cards move onto the kinds in C1.)
- B16. [M] The AI's misplays on the new benders. **Landed 2026-11-02 (40cb399):** the rollouts' aim (`pickResolveTargets`) piled every blow on one body and never saw a body fall by its own card, so Supernova looked free; it now counts allies' aimed blows (no overkill), skips a body whose own card fells it (`EffectHandler.aiFellsItsPlayer`) and weighs danger as a tie-break. Checked: audit unchanged (its 1v1/2v1 positions never pile on), new vs old head to head 51.0% ±2.9, vs old-aim spam 76.3% vs 75.2%, the depth-0 heuristic vs spam 57.5% vs 47.0%; puzzles (h) and (i) (a sacrifice: (i) is the referee's PV currency, like (g)). The elements spread fell from 24pp to 13pp with it (B17). **Landed 2026-11-02, second:** the leaf capped next round's threat at the other side's whole health, so once a horde's raw blows exceeded the party's health a stun or a kill that took one blow away was worth nothing there; uncapped (puzzle (j)). Checked: the audit and the AI match unchanged (none of their positions reaches the cap: the match's 16-pair duplicates never differed), the ladder not worse (production vs spam 96.2% ±1.0, was 96.8% ±0.9; vs the heuristic 97.4%, was 94.9%; vs uniform 93.4%, was 91.3%). **Landed 2026-11-02, third:** the untargetable kind priced each holder as a blow dodged (`0.5 × threatOn × turns`), though while someone else on its side can still be hit the foes' blows only move there; Boira's whole worth is that next-round price, and the AI played it on 46.9% of the waterbender's turns though it was the best play on 8% (B17). Now worth nothing then (puzzle (k): a slow veil that lands — the foes locked, the veiler armoured against desperate blows — over twins). Checked: audit unchanged, the fantasy ladder untouched by construction (no fantasy hero hides; its depth-1 cells move ±3pp from run to run), new vs old price on the elements mirror party (with Boira and Remolí) 51.0% ±2.0 over 600 fights. **Open: the Focus stuns (Trampa de gel, Remolí) are still almost never played** though often the best play. Measured 2026-11-02 at each real decision where the trap was legal (a scratch probe, deleted): not how often the AI expects its Focus broken — once the allies play the joint plan (one guards the bender) its rollouts expect the trap to land 71-78% of the time, real play 78-81%; and not the threat cap — in the elements fights it rarely binds (the trap's mean rank 4.8 → 4.2 uncapped, still never picked). Re-measured with the untargetable price: Trampa de gel is played on 6.6% of the turns (best 17%) and left the blind list; Boira swung from overplayed to underplayed (0.4%, best 9%): worth nothing whenever the bender stays targetable, it no longer counts the fragile ally it shields. Remolí stayed blind on those 19 cells; on the one cell usable today it is not (2026-11-13: played on 10.1% of its legal turns, the best play on 22%; `KNOWN_BLIND` is empty). A slow Focus is also a lightning rod in the rollouts (their aim adds +3 to hitting any pending Focus), worth something in health fractions: the currency of (g). Playing more rounds before the leaf (`continuation`) flips puzzle (i) and breaks (d), (e1) and the hide control.
- B17. [M] Balance of the new elements set (kit analyzer on the calibration with the patrol of 7 soldiers and three unagis, the AI's uncapped threat and the untargetable price; 2026-11-02, 798 combats a kit, 19 of 32 calibration cells usable where 7 were): every kit inside the ±15pp band — air +8.5, water +2.4, Acrobàcia +0.6, earth +0.1, Mestre del xi −3.1, Artífex −4.0, fire −8.3, Esgrima −10.1 (the benders 17pp apart, fire now the weakest). Boira's price moved water from −6.0 to +2.4 and ended its stalls (p90 11 → 9, 0.9% stalled → 0). The patrol cell of the Mestre del xi row has air as its stand-in, and against seven soldiers air (Tornado's area stun, fast Ventada) is worth 30-70pp more there than most kits, so every other kit pays several points for that one cell; single-target kits (Esgrima) lose most against the hordes, and so does fire (−41 in both patrol cells). Fights run long for six kits (p90 9-10, in `KNOWN`); fire and Acrobàcia end. Blind spots left (`KNOWN_BLIND`): Remolí. The mixed line still measures in one cell of eight. Next: retune the numbers (fire up, air down) with the user's docs. **2026-11-13, the first card values on the one cell usable today** (bèsties/c5: three unagis; 600 card fights a kit, every hand at its full ten cards): a random pick costs air 12.0 ±0.5 PV a decision, fire 9.5 ±0.6, water 8.4 ±0.6, earth 6.9 ±0.5, Acrobàcia 6.6 ±0.4, Esgrima 2.8 ±0.3 (the bar is 1); never the right play under every opponent model: Bola de foc and Fúria de flames (fire's first and sixth cards), Fuet d'aigua (water's first), Salt mortal (Acrobàcia's eighth) — the two first cards are a 1d4 in a level-10 hand; one card carries each bender: Esclat encegador is the best play on 41% of fire's decisions and played on 48% of its turns, Tornado 33% and 48%, Forma de pop 25% and 25%, Búnquer 25% and 32% (Acrobàcia's Capbussó suïcida 27% and 28%, Esgrima's Tall rere tall 21% and 18%); no blind spot (Remolí de vent: best on 22%, played on 10%; Esquerda: 4% and 1.4%).
- B21. [M] The benders, finished card by card with the user (2026-11-02; DESIGN.md has each table). Left: the kit analyzer, once creatures are on the ladder (B20). (Water 3 is Portes al mar, earth 3 stays Esquerda: the user, 2026-11-03.)
- B22. [S] Stalls: measured by the kit gate now (B25). The shared kits' first Focus landed 2026-11-03 (Retirada sagnant, Punts de la guàrdia, Rodes de mareig); with water's sustain back down, the scratch autopsy (bare heroes) fell from 39% to 8% stalled at level 3 and from 36% to 14% at level 6.
- B23. [M] The agent duel on the final kits (2026-11-02, 4 games, fun 5-6/10, up from 3-4): Ventada feels mandatory (fast, every enemy, cancels every Focus, pushes cards), fast attacks keep slow Focus from resolving, Foc interior + Tempesta d'espurnes deals 1d4+10 undefendable to each enemy, Búnquer + a fast attack dodges Búnquer's drawback, Allau chains stuns; level 10 collapses to one loop per game; many cards never played (Marea alta, Font curativa, Marea de vida, Asfíxia, Remolí, Tornado, Contracorrent, Anell de foc, Incendi…). Its bugs were fixed 2026-11-03 (stun turns, the guard prompt, Fulles de vent's aims, Mantell's log, "none" as an aim).
- B18. [S] `sets/fantasy/test/encounter-speed.test.ts` is red in the fast tier: the goblin horde and the mixed band solve in 6-12 s on a quiet machine, the bone devils near the 3 s bar (measured 2026-11-02; already at 08900e0, before that night's AI changes). Likely the longer fights since the level left the rolls; the fantasy content is to be redesigned anyway (C1), so retune the bar or the test fights then.
- B19. [M] Lethality at hero scale: the kit analyzer, against creatures of 30-120 PV, cannot see it; the dynamics report's "a fresh hero survives one blow" and "nobody falls in round 1" measure it (the hero-scale suite and its fast-attack rule were deleted 2026-11-04, the user: the best-blow rule covers every card). Open from the suite's last run (2026-11-02): Ràfega de dits (Mestre del xi, three fast 1d6 blows) 0.15 KOs a play at level 6, 0.22 at level 10; at level 10 the slow area finishers fell heroes in round 1 (Supernova ~1 KO a play, Capbussó suïcida 0.60, Terratrèmol 0.53, Tsunami 0.45, Tornado 0.29).
- B20. [L] Creatures onto the dice ladder (the user, 2026-11-02; revised 2026-11-03): creature cards rolled by THE CARD'S level like the players' (effects paid in dice, the ladder test extended to creature skills, flat-PV effects scaled like the players'), and the encounter balancer solving each group's LEVEL and PV — a creature's PV is not fixed, it is one of the two main levers with level; count stays the DM's input. One target, two knobs: the tie-break is to be proposed (e.g. the level whose solved PV lands nearest 26 × bulk). Touches (`combat-balancer`, bench's solved shapes and calibration, the web encounter creator, the balancer and enemy-threat tests). The players and their cards moved first (dice remapped by level, PV 26, flat-PV effects doubled, armour 1 and 2); until this lands, creatures keep their solved PV and their old dice. When it lands: un-skip the fantasy kit suites (`WAITS_FOR` in `sets/fantasy/test/kits/suite.ts`) and measure the elements `KNOWN` lists again (written 2026-11-12 on the one usable cell: every kit fails fights-end, p90 7-10 against 6, and five read 30-47pp below the band, where all eight were inside it on 19 cells, B17).
- B10. [S] Close the decision-leaf measurement (needs A7a); delete the losing leaves.
- B3. [M–L] The round as a first-class value (one prompt loop, no public `roundPrepared`, no seat remapping, a referee that branches instead of replaying).
- B4. [S] `isBlindSpot` requires a gain when best; empties `KNOWN_BLIND`.
- B5. [M] Pin calibration data, not code; drop `speed`/`speedPenalty`; the control kits' "fastest" cards become `fast`.
- B6. [S] Card legality from one engine source.
- B12. [M] Re-run the content-free slow tests never run under priority (bench pipeline, card value, playtest controls) and fix the instrument.
- B13. [S] Check the web app in a real browser.
- B14. [S] `bench/combatlog.ts` from structured log events; the balancer's `HETEROGENEITY` from a clustered error bar.
- B8. [M] Before the switch: dumb-play (the gate's duels) and benchmark rows for the equilibrium player, puzzles as "the mix weighs the right card", the bench columns the plan names.
- B9. [M–L] 4v4 rounds from 12 s toward 5 s.
- B7. [L] After A7b: delete depth 0 and its constants, and `continuation`.
- B15. [S] After A7: keep only the standing equilibrium harnesses.

## Waits for the card migration (real cards are frozen)

- C1. Redesign kit by kit, firebender first: the user's design doc → mechanics and dice on the ramp (`intentions.md`) → implement, statuses from the engine's kinds (`applyKind`) or priced bespoke → `/analyze` and tuning → one fresh `card-taste` read → the results into the user's doc. Along the way: the `harm`/`bodyOut` marks onto `harmful`, the duplicated `status-behaviors.ts` into `sets/common`, delete the enemy-block machinery, and check that the old cards' bugs (`silenced` never read, putrefacció's uncloned `WeakSet`, 15 behaviour-less status keys), their `TODO(balance)` constants and the 28 unpriced statuses in `status-pricing.test.ts` all went with them.
- C4. One recalibration for the migration and the AI switch (`calibration:refresh`; the pinned copies still add a level by hand in places, and `skillLevelBonus` lives on for them until then), then the kit suites, both triangles, the armour bound, `/analyze`, and tuning per A4.
- C5. Elements questions: the unagi as boss or creature (needs a cards-per-round seam), the Cop i fuga ★ text, the lopsided calibration cells, the shirshu and the puppeteer alone.
- C6. The 80 gold cards, redesigned with the rest (`sets/common/DESIGN.md`).
- C7. Toc de la mort's rule, re-decided after C4.

## Last

- Retire `NEXT-STEPS.md` (cited by § from code comments and `ARCHITECTURE.md`): move what is still true into the doc it belongs to, drop the citations, delete it, and drop it from `CLAUDE.md`.
