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
  enables, never two halves stapled together; five per pairing, a crescendo.
  **Power follows the threshold sum** (decided 2026-10-14): a gold card
  needing Foc 5 + Esgrima 5 is as good as card 10 of a single skill, one
  needing 2 + 2 as good as card 4. So the sums run 2-10 like a kit's levels,
  and a gold card is never stronger than the single-skill card its sum names.
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

## Mestre de l'aigua — `waterbender` (redesigned 2026-11-01)

*The defensive, healing bender, fire's opposite.* The user's design ("Maestre
de l'aigua — conceptes de cartes", https://claude.ai/artifact/71tTJ3a6L55VVgNATDCXvE);
dice and small mechanics by the main session.

| # | card | type | what it does |
|---|---|---|---|
| 1 | Fuet d'aigua | Atac | the plain lash |
| 2 | Mur d'aigua | Defensa | the plain wall |
| 3 | Font curativa | Focus | heals an ally and puts out Cremat |
| 4 | Boira | Focus | next round no enemy can aim at your allies |
| 5 | Cúpula de gel | Defensa | the strong shell |
| 6 | Llança de gel | Atac | the strong single blow |
| 7 | Trampa de gel | Focus | the chosen enemy is frozen: it loses its next turn; 1 fatigue |
| 8 | Forma de pop | Defensa | defends every ally |
| 9 | Control de la sang | Focus | next round the chosen enemy's blows land on its own side; 1 fatigue |
| 10 | Tsunami | Atac | every enemy |

## Mestre de la terra — `earthbender` (redesigned 2026-11-01)

*The robust, defensive bender: heavy defense where water's is fluid.* The
user's design ("Maestre de la terra — conceptes de cartes",
https://claude.ai/artifact/FqXxmnJn9npJndCcDcrsCG); dice and small mechanics by
the main session.

| # | card | type | what it does |
|---|---|---|---|
| 1 | Llançament de roca | Atac, fast | the quick throw |
| 2 | Mur de pedra | Defensa | the plain wall, sturdier than water's |
| 3 | Armadura de terra | Focus | an ally has +3 on its defenses for 3 rounds |
| 4 | Túnel | Focus | next round an ally's first attack cannot be defended |
| 5 | Trampa de terra | Defensa | an attacker it holds cannot attack next round |
| 6 | Sorres movedisses | Focus, fast | the chosen enemy's card this round resolves last |
| 7 | Allau | Atac | a wounded target loses its next turn |
| 8 | Búnquer | Defensa | defends every ally; nobody on your side attacks this round |
| 9 | Roca viva | Focus | summons a stone golem (10 PV, attack and defense 2d6); 2 fatigue |
| 10 | Terratrèmol | Atac | every enemy |

## Mestre del foc — `firebender` (redesigned 2026-11-01)

*Fire burns: whoever touches it, crosses it or defies it.* The user's design
("Maestre del foc — conceptes de cartes", https://claude.ai/artifact/2doahvh6T7Rwr3t6YsgkQb),
the pilot of the full card redesign; dice and small mechanics by the main
session. **Cremat** (printed on card 1): 1 PV at the end of this round and the
next; burning again restarts it, never stacks (the engine's damage over time).

| # | card | type | what it does |
|---|---|---|---|
| 1 | Bola de foc | Atac | a wounded target is burned |
| 2 | Mantell de flames | Defensa | whoever attacks someone it defends is burned, held or not |
| 3 | Esclat encegador | Focus, fast | each enemy still to attack rolls 1d20; at 8 or less its attack misses |
| 4 | Tempesta d'espurnes | Atac | every enemy loses 1d4 PV, rolled for each |
| 5 | Cortina de fum | Defensa | it still defends the round after |
| 6 | Alè de drac | Atac | two enemies; the wounded are burned |
| 7 | Foc interior | Focus | +6 on your attacks for the next 2 rounds |
| 8 | Anell de foc | Focus | for the next 2 rounds, every enemy that attacks loses 3 PV and is burned |
| 9 | Llamp | Atac, fast | the big single blow, before normal defenses |
| 10 | Supernova | Atac | every enemy; then the bender drops to 0 PV |

Kept out by the user: Punys encesos (reserved for an Acrobàcia + Foc gold
card), Mur de foc, Dia assolellat, Foc blau / Llança roent. The armour-melting
idea may return elsewhere.

## Mestre de l'aire — `airbender` (redesigned 2026-11-01)

*The utility bender: it decides who acts first, who acts last and whom a blow
can reach.* The user's design ("Maestre de l'aire — conceptes de cartes",
https://claude.ai/artifact/CaegUh49CiqAgnK9LUsVte); dice and small mechanics by
the main session.

| # | card | type | what it does |
|---|---|---|---|
| 1 | Ventada | Atac, fast | every enemy; the wounded act last this round, a Defense excepted |
| 2 | Ràfega desviadora | Defensa | a held blow goes, whole, at an enemy you choose |
| 3 | Asfíxia | Focus | the chosen enemy has −3 on its attacks for 2 rounds |
| 4 | Vent a favor | Focus, fast | an ally's card resolves right after it |
| 5 | Fulles de vent | Atac | ignores armour |
| 6 | Escut d'aire | Defensa | you and whoever you defend take half of what gets through |
| 7 | Coixí d'aire | Focus, fast | every blow on your side this round is 3 softer |
| 8 | Corrent ascendent | Focus, fast | attacks on an ally miss this round; it loses its card |
| 9 | Remolí | Focus | the chosen enemy is out of the fight next round |
| 10 | Tornado | Atac | every enemy; the wounded lose their next turn; 1 fatigue |

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
