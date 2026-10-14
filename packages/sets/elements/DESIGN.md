# Els Quatre Elements — design

A second content set for Pim Pam Pum: a world where water, earth, fire and air
have benders, inspired by *Avatar: The Last Airbender* / *The Legend of Korra*,
with villains drawn from *Naruto* (Pain, the Akatsuki) and the Sith of *Star
Wars*. Same engine, same rules, its own cards.

**Every card was removed on 2026-10-06** to be redesigned from scratch, kit by
kit, with the process below. This file holds the world and the decisions that
stand; each kit's section is written back as the kit lands. What was measured,
and when, lives in `NEXT-STEPS.md` §42.

## How cards are made here

1. The `card-designer` agent (`.claude/agents/card-designer.md`) designs each
   card's concept: it researches the lore, then builds every card from its
   scene (the one sentence a player pictures, with the effect as its obvious
   consequence), offering two or three options per slot. The concepts come
   from it, not from the main session.
2. Review rounds: each round a NEW `card-taste` agent sees only the cards
   (title, type, text, scene), says whether it sees and likes each one, and
   the designer revises, until a round finds nothing that must change.
3. The user picks, slot by slot, kit by kit.
4. The main session turns the picks into mechanics and dice.
5. A fresh `card-taste` reviews the final cards (text, crescendo, finishers).
6. Build, then simulate (`/analyze`).

## For the designers (`card-designer`, `card-taste`): this set's sources and bar

- **Sources.** Heroes and the world: *Avatar: The Last Airbender* (prefer
  the original series; *The Legend of Korra* and later material, such as
  lavabending, can read as off-lore unless the image is iconic on its own).
  Villains: *Naruto* (Pain, the Six Paths, the Akatsuki) and the Sith of
  *Star Wars*, rebuilt for this world. Check them on the web.
- **The bar is the water kit** (below): Fuet d'aigua, Braços d'aigua, Pluja de
  dagues, Forma del pop, Bàlsam de lluna, Ira de l'oceà — each title is the
  element + the form it takes or what it does, a power a bender would want.
- **What failed here** (2026-10-06), so it is not repeated: titles built on
  characters or places (Propulsió d'Azula, Alè del drac de l'Oest, Tempesta
  del Si Wong); titles that need the show explained (Xiulet de bisó, Còdol de
  repte, Tui i La); one-off scenes as cards (Haru's pebble on the warden,
  Bumi toppling Omashu's statue, Gyatso's last stand, an Agni Kai as a duel
  situation). Each kit asks: what can a bender of this element DO, every
  fight?

## The frame every kit follows

- **A hero trains several skills** (decided 2026-10-13, replacing "one skill
  per hero"). Bending is a skill like any other; two heroes who share one
  skill differ by the rest.
- **Cards can require N skills** (a "gold" card, after MTG's multicolour
  doctrine): it opens once every listed skill reaches its threshold, and sits
  outside each skill's "first N" list. Its roll adds the **sum** of those
  levels (Ars Magica's Technique + Form), so a hybrid matches a specialist on
  its gold cards and the fairness rule (similar total skill-level sum) still
  holds. On a close loss the player chooses which of its skills grows (the
  simulator picks the lowest). A gold card is ONE effect only the overlap
  enables, never two halves stapled together; one or two per pairing. The
  sum grows fast with N, so the thresholds keep these rare and the card's own
  dice modest.
- **Ten cards per kit.** Level N knows the first N. Cards 1-3 are one Atac,
  one Defensa and one Focus.
- **Crescendo.** Power rises with the level: card 1 is what a novice can do,
  card 10 what only a master can.
- **Finishers.** The last cards are fight-ending set pieces (Shinra Tensei,
  Sozin's Comet).
- **Card titles** are names that evoke the action, never sentences, never
  with a leading article. Each title is the skill itself — a stranger reads it
  and knows what the card does; names of people and places rarely manage that.
- **Card text** is brief and mechanical; it says *fereix* (the attack deals
  damage, rules.md).
- **Randomness is welcome.**

## The world in one paragraph

Four peoples, each bending one element through a martial art: water through
flow (tai chi — absorb and redirect), earth through rooted waiting (hung gar —
listen, then strike), fire through breath and drive (northern shaolin — press
forward), air through evasion (baguazhang — circle, never meet force). The air
monasteries are gone. Out of their ruin came **el Mestre de la Por**, who rules
through six borrowed bodies and teaches that only fear keeps the peace. Nobody
alive knows he was once an air novice.

## Design pillars

1. **Each element plays like its martial art.** Water wins the exchange by
   redirecting it; earth stands and outlasts; fire presses and sweeps; air is
   never where the blow lands. You should recognise the element from how its
   cards *behave*, not from their names.
2. **Bending can be cut.** The world's non-benders fight by *shutting things
   down*, not by out-damaging benders. That is also the villain's language.
3. **Fights here are short** (a median of three or four rounds), so a card
   that pays later has to pay big and soon. Set up, then execute.

## Decisions that stand

- **Kits:** the four element benders. A fifth kit will be something new (the
  chi-blocker was dropped on 2026-10-06; to be designed later).
- **El Mestre de la Por** stands on three pillars: black rods (Pain's chakra
  receivers), shutdown and madness (random madness welcome), and raw Sith
  power. His cards climb **Por → Ira → Odi → Sofriment**. He hides behind his
  bodies (Pain's Six Paths); once they fall, the Sith comes out. The heroes'
  kits answer him naturally — there is no dedicated counter mechanic.
- **The chakras are not a mechanic.** Tried and dropped ("feels meh").
- **L'Orde de la Cendra:** an order inspired by the Akatsuki, rebuilt for this
  world, serving the Mestre; they hunt the great spirits.
- **Easter eggs** that he was once an air novice are wanted (the air kit's
  first card and his first card as twins, and the like).

## Mestre de l'aigua — `waterbender` (landed 2026-10-06)

*Tai chi: water does not fight with its own force, it takes the enemy's and
sends it somewhere else.* The redirect is the spine and grows with the level:
the leftover of a blow turned aside (2), the whole blow frozen and thrown back
(6), the enemy's blows aimed for him (9), every blow of a round swallowed and
returned (10). Healing, ice and the moon sit around it. Concepts by the
`card-taste` agent, picked by the user.

| # | card | the scene |
|---|---|---|
| 1 | Fuet d'aigua | Katara's first lash: a miss snaps back into a guard |
| 2 | Cop desviat | push and pull: the blade turned aside into another foe |
| 3 | Bàlsam de lluna | the glowing water over a wound |
| 4 | Forma del pop | eight arms over the whole party |
| 5 | Braços d'aigua | Ming-Hua's arms: a blade or a shield, chosen as it lands |
| 6 | Gel del mestre | Pakku freezes the blow and throws it back whole |
| 7 | Pluja de dagues | the rain stopped mid-air and turned to daggers |
| 8 | Presó de gel | an attacker locked in ice the moment it strikes |
| 9 | Sang sota la lluna | bloodbending under the full moon |
| 10 | Ira de l'oceà | the ocean rises, swallows the round and breaks on everyone (costs 2 fatigue levels) |

## Mestre de la terra — `earthbender` (landed 2026-10-07)

*Hung gar: stand, take the blow, answer it with your own weight at the same
attacker* (water sends the force elsewhere). Threads: stone on the body (1, 4,
7), the answer (2, 9), the ground that holds the enemy (5, 8, 10), listening (3).

| # | card | what it does |
|---|---|---|
| 1 | Guant de pedra | punch; the rock defends you for the rest of the round |
| 2 | Mur ariet | block; if it holds, ram the attacker with the card's dice |
| 3 | Sentit sísmic | next round your side chooses after the enemies reveal |
| 4 | Armadura de roca | +1 armour for the fight, up to +3 |
| 5 | Sorra movedissa | a wounded target can't play Defenses next turn |
| 6 | Doblegar el metall | ignores armour; a wound strips it for good |
| 7 | Cúpula de pedra | a dome over the party that holds until beaten |
| 8 | Mà de la terra | the target is hurled into another enemy of your choice |
| 9 | Puny de la muntanya | +1 per attack aimed at you this fight; 1 fatigue |
| 10 | Partir la terra | every enemy; the wounded lose 2 actions; 2 fatigue |

## Mestre del foc — `firebender` (landed 2026-10-07)

*Northern shaolin: fire uses only its own force and keeps raising it, and
whatever touches it burns.* One Defensa only: fire does not step back.

| # | card | what it does |
|---|---|---|
| 1 | Punys encesos | +2 if you attacked last round |
| 2 | Escut roent | every attack on whoever you defend costs the attacker 2 PV |
| 3 | Atiar les brases | your next attack +5 |
| 4 | Anell de flames | a wounded target burns 3 as the next round opens |
| 5 | Vol propulsat | the target's allies can't defend it |
| 6 | Foc blau | ignores armour; the defense −3 |
| 7 | Esclat del tercer ull | also hits everyone defending the target |
| 8 | Alè de drac | every enemy, burning next round; 1 fatigue |
| 9 | Llamp de sang freda | undefendable; wounded first, it strikes you; 1 fatigue |
| 10 | Caiguda de cometa | fastest; every enemy, no ally guards, the wounded lose next round's action; 2 fatigue |

## Mestre de l'aire — `airbender` (landed 2026-10-07)

*Baguazhang: circle, never meet force, never be where the blow lands.* Threads:
throwing (1, 5, 9, 10) and evading (3, 4, 7, 8). Card 1 twins the Mestre de la
Por's first card.

| # | card | what it does |
|---|---|---|
| 1 | Palmell d'aire | very fast; a wounded target acts last |
| 2 | Coixí de vent | the defended ally (and you) can't drop below 1 PV this round |
| 3 | Patinet d'aire | next round you act first and the first attack on you misses |
| 4 | Esquivar-los a tots | block every enemy |
| 5 | Catapulta de vent | a wounded target loses this round's action |
| 6 | Remolí del mareig | block; the enemy's attacks go at random combatants |
| 7 | Cop i fuga | after the strike, attacks on you miss this round |
| 8 | Salt del meteor | untouchable until it lands, then every enemy |
| 9 | Ull de l'huracà | every enemy; the wounded lose this round's action; 2 fatigue |
| 10 | Bosc de tornados | every enemy hurled into another; alone, into the ground; 2 fatigue |

## Creatures (landed 2026-10-07)

Each takes a different thing away from a hero.

| creature | shape | takes away | how the heroes beat it |
|---|---|---|---|
| Soldat del foc | horde (4-6) | PV, by numbers | kill fast; meet the volley with a wall; interrupt Calar foc |
| Shirshu | control (2-3) | actions (paralysis) | interrupt the scent; hit hard or not at all (its slobber) |
| Unagi | lone beast | the guard (its jet goes through) | don't stack guards; 6 PV in one round frees the swallowed |
| Arquer yuyan | support (1-2 in the line) | defense (pins) | reach the back line; interrupt the signal arrow |

## Ideas parked for later skills (2026-10-13)

Card concepts the user loved that did not fit the kit they were designed for.

- **Mirall de l'enemic** (Focus): after the reveal, this card becomes a copy of
  a card an enemy revealed this round. "Super cool", but not Esgrima.
- **Doble ritme** (Focus): next round you play two cards instead of one. Wants
  a kit whose cards combine in pairs (Acrobàcia?), not one whose cards each pay
  on their own.
