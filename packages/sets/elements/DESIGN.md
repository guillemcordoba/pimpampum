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

1. The `card-taste` agent (`.claude/agents/card-taste.md`) designs each card's
   concept: it researches the lore and crafts the card on its own, offering
   two or three options per slot. The concepts come from it, not from the
   main session.
2. The user picks, slot by slot, kit by kit.
3. The main session turns the picks into mechanics and dice.
4. The agent reviews the final cards (text, crescendo, finishers).
5. Build, then simulate (`/analyze`).

## For the designer (`card-taste`): this set's sources and bar

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

- **One skill per hero.** No second or complementary skills.
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
