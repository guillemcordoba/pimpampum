# Shared skills — design

Skills fielded by more than one set (`sets/fantasy`, `sets/elements`). Every
title and effect must work in every world that fields them; a source may
inspire a card, never name it. The frame, the title rules and the card-text
house style are the ones in `packages/sets/elements/DESIGN.md` and
`.claude/agents/card-taste.md`.

## Esgrima — `mestre-armes` (landed 2026-10-13)

*The duel: it wins by answering the card the enemy chose* — reads it (3),
provokes it (4), catches it (2, 5, 6, 7), finds its weak spot (8), and
finishes with the thrust nobody has seen (9) or a run of cuts through the line
(10). Attacks add the wielded weapon's bonus. Picked by the user slot by slot
after five naming rounds.

| # | card | type · speed · dice | what it does |
|---|---|---|---|
| 1 | Finta traïdora | Atac · 2 · 1d6 + arma | if the target revealed a Defensa, its defense −4 |
| 2 | Retruc d'acer | Defensa · 3 · 3d4 | if it holds, an unguardable riposte 1d6 + arma |
| 3 | Guàrdia camaleó | Focus · 1 | rest of combat: swap your card after the reveal |
| 4 | Bufetada insolent | Atac · 2 · 2d6 + arma | if it wounds, next round the target can attack only you |
| 5 | Bloqueig d'escorpí | Defensa · 3 · 2d8 | if it holds, your next attack on it can't be defended |
| 6 | Braç mort | Defensa · 2 · 4d4 | if it holds, the attacker can't play Atacs next round |
| 7 | Bardissa d'acer | Atac · 1 · 3d6 + arma | its roll also defends you from every attack of the target this round |
| 8 | Punt feble | Focus · 1 | an enemy: your side's attacks on it face −3 defense, rest of combat |
| 9 | Estocada fantasma | Atac · 2 · 3d8 + arma · 1 fatiga | undefendable, ignores armour, unless the target already received it |
| 10 | Tall rere tall | Atac · 1 · 3d6 + arma · 2 fatiga | while it wounds, attacks another random enemy not yet hit |

Weapons (shared): bastó +0 · Espasa lleugera +1 attack and +1 Defensa, only
with Esgrima 2+ (an experiment) · destral +2 · gran destral +4, −1 speed.

## Drafts — Acrobàcia, Punts de pressió, Artífex (2026-10-13, NOT picked)

Drafted by `card-taste` while the user was away, then put through four review
rounds (log below). **Nothing here is approved**: the user picks slot by slot,
as for every kit. The tables show the designer's current pick per slot; the
alternatives are in the round log.

### Acrobàcia — draft v4 (= v3, no must-fix)

*The acrobat uses bodies as terrain*: enemies, allies and the defenders' wall
are things to climb, ride, vault and spring off.

| # | card | type | what it does |
|---|---|---|---|
| 1 | Puntada d'espagat | Atac | a flying split kick: one roll against two enemies |
| 2 | Tombarella de rescat | Defensa · fast | guards the first ally attacked after it resolves (vs every-hero attacks, you choose) |
| 3 | Doble ritme | Focus · speed 2-3 | next round you play two cards, each at its own speed |
| 4 | Llançar un aliat | Defensa · very fast | defend an ally; its card resolves right after this one, with +N |
| 5 | Escalar els defensors | Atac | no Defensa covering the target, its own included, defends against it, and all end this round |
| 6 | Pirueta d'esquer | Focus | one roll vs every enemy; the beaten can attack only you next round (sets up 7 and 10) |
| 7 | Cavalcar l'enemic | Defensa | block; if it holds, you ride it until next round's end: it can't attack you (not even with every-hero attacks), each attack on you has 50% to hit it instead, same roll |
| 8 | Trepitjar caps | Atac · 1 fatiga | every enemy, same roll; you choose the last head, +N per other enemy |
| 9 | Salt mortal | Atac · 1 fatiga | at the reveal declare a height (+X/+Y/+Z); if the target doesn't fall, you lose that many PV |
| 10 | Torre humana | Atac · 2 fatiga · slow | every enemy; each ally whose Defensa covers you adds its defense dice (its base dice alone beat card 8) |

Alternative at 6: **Cos de goma** (Defensa: strip every hold from you and the one you defend), anti-control nobody else has; Pirueta d'esquer sits close to air's Esquivar-los a tots for a hero holding both.

### Punts de pressió — draft v4

*Kappo / sappo, "cure or kill": the same points switch a body off or back on.*
Everything that moves has points: a golem's joints, a devil's bones. The kit
never names a card to ban (that is Artífex's Escut mastegador); what goes dead
is a part of the body. The top three close on the thesis: raise (8), kill (9),
sleep (10). Total locks are rare and paid for (NEXT-STEPS §42.4), and no
finisher takes a whole side's round away for certain (§43.4).

| # | card | type | what it does |
|---|---|---|---|
| 1 | Nus a la gola | Atac | if it wounds, next round the target can't play Focus |
| 2 | Adormir el dolor | Defensa | a guard; this round damage doesn't cancel the defended ally's Focus |
| 3 | Desbloquejar el cos | Focus | you or a standing ally lose every effect stopping you acting (not swallowed/hung), and recover a few PV |
| 4 | Poder apagat | Atac | if it wounds, next round its cards have no effect, only their dice |
| 5 | Abraçada paralitzant | Defensa | if it holds against its first attack, next round neither of you acts |
| 6 | Ofegar l'atac | Defensa | block; if it holds, that attack reaches nobody else and has no effect (the anti-sweep card) |
| 7 | Ràfega de dits | Atac | three attacks on one target; each wound closes, lightest first, Focus → Defensa → Atac next round |
| 8 | Cop de vida | Focus | a fallen ally gets up with a good chunk of PV and +1 fatigue (the only revive) |
| 9 | Toc de la mort | Atac · 1 fatiga | if it wounds, at the end of next round it loses as many PV as it is missing |
| 10 | Tempesta de son | Atac · 2 fatiga | every enemy, no damage; the beaten fall asleep at round's end: they wake when they lose PV, or on their own coin flip each round |

Alternatives at 1: **Cames de drap** / **Cos encongit** (if it wounds, next round the target can defend only itself) — dead in practice, since almost no enemy guards another.

### Artífex — draft v4

*The tinkerer whose work keeps going after the card is played*, at the scale of
what one person carries, winds or springs. Not the explosives engineer (no
mines, smoke or blasts).

**Device rules.** A device's card stays face up as its token. One of each
device at a time; playing it again rebuilds or moves it (one object, not a
power cap). Timed devices act as the round opens (Bumerang) or ends (Autòmat,
Trepant); triggered devices act when their trigger fires (the trap, the
sentinel). A device's attack faces whatever Defensa is up at that moment. The
colossus takes precedence over blocks and the hook.

| # | card | type | what it does |
|---|---|---|---|
| 1 | Bumerang | Atac | as the next round opens, it returns and strikes a random enemy with 1d4 |
| 2 | Parany de molla | Defensa | set at an ally's feet until sprung by the first attack on them (joins any wall); if it holds, bites the attacker for the margin |
| 3 | Autòmat de corda | Focus | at the end of this round and the next, it attacks a random enemy |
| 4 | Llançaganxos | Atac · fast | if it wounds, the first attack on you this round, from anyone, hits the hooked enemy |
| 5 | Escut mastegador | Defensa | if it holds, the attacker can't play that card again this combat (Cop desesperat excepted) |
| 6 | Ballesta sentinella | Focus | aimed at an ally until a blow wounds them: each round it shoots the first enemy attacking that ally, before the blow lands |
| 7 | Urpa elevadora | Atac | if it wounds, next round the target hangs (no action, can't be attacked), then falls for 2d6 |
| 8 | Trepant incansable | Atac · 1 fatiga | ignores armour; if it wounds, the drill stays: each round's end it re-attacks, +2 cumulative, until it fails to wound or jams (a die after each re-attack) |
| 9 | Xarxa de cadenes | Atac · 1 fatiga | every enemy; until next round's end the wounded are netted: a single-target attack on one hits all, same roll |
| 10 | Colós de butxaca | Atac · 2 fatiga | a pocket device unfolds onto one enemy; then takes every targeted enemy attack until it falls, and crashes on a random enemy |

### Cards that require N skills (ideas, not designed)

- Acrobàcia + Aigua: **Lliscada de gel** — slide on your own ice through every enemy's legs.
- Acrobàcia + Terra: **Pilar trampolí** — a pillar hurls you over the line, unblockable.
- Punts + Foc: **Llamp redirigit** — the held blow's whole total strikes an enemy you choose.
- Punts + Aigua: **Agulles de gel** — ice needles into every enemy's points.
- Artífex + Foc: **Globus de guerra** — the balloon rises on the bender's own flame.
- Artífex + Aigua: **Submarí d'assalt** · Artífex + Terra: **Rails de terra**.

## Review rounds (log)

Each round: a fresh `card-taste` reviewer per kit (one that did not design it),
then the kit's designer revises, accepting or arguing each point.

**Round 1 (v0 → v1).**
- *Acrobàcia:* Escalar el mur → Escalar els defensors (flat bonus per
  defender; the designer kept the bypass against the review, since climbing
  is why they can't stop you); Trepitjar caps no longer a random chain (it
  echoed Tall rere tall); Salt sense xarxa → Salt mortal (you choose the
  height, the stake); Torre humana hits every enemy (it mirrored card 5);
  Cavalcar l'enemic gains "your attacks on the mount can't be defended", the
  deliberate Doble ritme pair. Best card: Cavalcar l'enemic.
- *Punts de pressió:* Llegir el cos cut (title promised reading, card extended
  durations, doubled every lock); Ràfega de dits closes lightest types first,
  so one jab never locks a soldier; Mans per tot arreu cut (a third "defend
  everyone" in the set); Tots a terra → Tempesta de son. Best card: Toc de la
  mort.
- *Artífex:* scale brought down to one tinkerer (Ganxo d'abordatge →
  Llançaganxos, Urpa de grua → Urpa elevadora, Trepant de setge → Trepant
  incansable); Torre d'assalt cut (a situation, and a dominant team buff);
  Truc robat cut (Mirall de l'enemic stays parked for a mimic/illusionist
  skill); Parany de molla re-rooted on persistence (it copied Bloqueig
  d'escorpí). Best card: Autòmat de corda.
- *Across kits:* Artífex 5 and Punts de pressió both reached for "ban that
  card"; Artífex keeps it (the gears eat it, literally), Punts owns body parts.

**Round 2 (v1 → v2).**
- *Acrobàcia:* Número de circ → Pirueta enlluernadora (a show is not a
  technique); Escalar els defensors breaks the climbed Defenses for the round
  instead of a bonus (it was fire's Vol propulsat plus a bonus); Cavalcar
  l'enemic trimmed (its "undefendable" clause was Esgrima's Bloqueig
  d'escorpí); Salt mortal's height declared at the reveal from a fixed menu
  (chosen at resolution it was a free max bonus against any unguarded target);
  Torre humana adds the dice of the Defenses covering you.
- *Punts de pressió:* rules.md §6 lets any heal raise the fallen, so card 3
  (heal) dominated card 6: Desbloquejar el cos now affects standing allies
  only, and Revifar el caigut → Cop de vida, the kit's only revive (twin of Toc
  de la mort); Cop ofegat cancelled an attack with no roll (dominant) → Ofegar
  l'atac, a block; Pessic al nervi → Cames de drap. Despertar/dispel flag closed.
- *Artífex:* Doble de llauna cut (a third redirect, and Cavalcar's coin) →
  Ballesta sentinella; Xarxa de cadenes copies the attack instead of the PV
  loss (shared PV multiplied with every area attack); Colós de rellotgeria →
  Gegant plegable (one-person scale), landing on one enemy; Escut
  d'engranatges can't eat Cop desesperat.

**Round 3 (v2 → v3) — the player at the table** (each reviewer imagined a horde
fight and a lone-beast/boss fight).
- *Key fact:* no enemy in the elements bestiary defends another, so every
  "whoever guards the target" payoff is dead there today.
- *Acrobàcia:* Puntada de rebot → Puntada d'espagat (its clause was dead in
  both fights, and it blurred with Bumerang); Escalar els defensors climbs the
  target's own Defensa too; Pirueta enlluernadora → Pirueta d'esquer (the
  never-picked card becomes the setup for 7 and 10); Salt mortal's stake is
  "if the target doesn't fall" (against non-defenders "if it doesn't wound"
  never happened).
- *Punts de pressió:* Tempesta de son decided a horde in round 1 and gave free
  setup rounds against a boss → sleepers wake on a coin flip each round, and
  sleep starts at round's end; Ofegar l'atac and Cop de vida swapped (raise,
  kill, sleep at the top); Desbloquejar doesn't free the swallowed or hung.
- *Artífex:* Trepant incansable inverted (it felt bad on a good roll and was
  dead against hordes: now it stays in while it wounds); Ballesta sentinella
  guards one ally (it read as a second Autòmat); Escut d'engranatges →
  Escut mastegador; Colós → Colós de butxaca; device rules written once.
- *For the user (Esgrima, approved, not changed):* a reviewer notes that
  **Punt feble** literally names the Punts de pressió skill and **Braç mort**
  reads like a pressure-point card.

**Round 4 (v3 → v4) — one reviewer over all four kits.** Three must-fixes, applied:
Punts 1 Cames de drap → **Nus a la gola** (no Focus next round; "can defend
only itself" was dead, since almost no enemy guards another, and it assumed
legs); Ballesta sentinella lasts until a blow wounds its ally (it was never
breakable as written); Trepant incansable can jam on a die after each
re-attack (most enemies never defend, so "until it fails to wound" never
came and the drill grew forever). Verdict: all three kits ready to pick.
- *Cross-kit:* Cavalcar l'enemic and Llançaganxos both make attacks on you hit
  your attached enemy (accepted; no third such card). "mort" three times
  (Braç mort, Toc de la mort, Salt mortal); Salt mortal near air's Salt del
  meteor. Esgrima's Punt feble and Braç mort read as Punts cards (flagged only).
- *Brakes watch-list for the simulator* (fatigue or numbers, never caps):
  Acrobàcia — Doble ritme (doubles other skills' finishers too), Llançar un
  aliat's +N, Trepitjar caps' +N per enemy, Salt mortal's heights, Torre
  humana with three guards. Punts — Abraçada vs a lone boss, Ràfega, Cop de
  vida's PV, Toc de la mort vs a half-dead boss, Tempesta's coin odds.
  Artífex — Escut mastegador's bans piling up on small hands, Urpa elevadora
  (a lock with no cost), Trepant's jam odds, Colós' PV, and above all **Xarxa
  de cadenes**: it copies every single-target attack to the whole net,
  on-wound locks included (net + Urpa could take a whole side's round, §43.4).
- *For the implementer:* sleep, hanging, the net, riding and the devices all
  need `positionValue`, or the AI measures them as dead.
