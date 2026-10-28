# Design proposals for the priority system (2026-10-28)

These are card concepts from `card-designer`, judged by fresh `card-taste` reviewers. **Nothing here is implemented**; the user picks. Each batch shows the designer's options, their recommended pick, and the reviewer's verdict once it's in.

**Rules they're designed for** (`PRIORITY-MIGRATION.md`):
- a fast step, then Defense → Attack → Focus;
- attacks aim at the reveal;
- defenses guard themselves or one ally, chosen after the aims;
- no generic enemy block;
- every defense pays off when it blocks;
- Focus effects pump attacks.

---

## Batch B: the 7 enemy-block cards

**The designer's finding:** five of the seven already paid off when they held. "Bloqueja un enemic" was only how they aimed. Only Esquivar-los a tots and Remolí del mareig lose their idea.

**Scope rule:** because guards now see the aims, on-block payoffs fire much more often.
- "L'atacant" means each attacker held.
- Where that would freeze, lock or throw a whole horde, the text says "l'atacant que triïs" or names one blow.

### 1. Pinça entumidora (Mestre del xi, card 2, Defensa)

**Now:** «Bloqueja un enemic. Si aguanta, l'atacant queda entumit.»

| Option | Text | Scene |
|---|---|---|
| **A** (designer's pick) | «Si aguanta, l'atacant queda entumit.» | Two fingers catch the striking limb and pinch the nerve; it goes dead. |
| B | «Si aguanta, l'atacant queda entumit; si ja ho estava, perd la seva acció següent.» | A second pinch on a numb nerve; the limb goes out completely. It's a lock at card 2, so flag it for the simulator. |

### 2. Bloqueig mutu (Mestre del xi, card 5, Defensa)

**Now:** «Bloqueja un enemic. Si aguanta, el torn següent cap dels dos juga carta.»

| Option | Text | Scene |
|---|---|---|
| **A** | «Si aguanta, tu i l'atacant que triïs no jugueu carta el torn següent.» | You catch its blow and lock the limb in a hold; next round you're both stuck. |
| B | «Si aguanta, tu i l'atacant que triïs no jugueu carta durant 2 torns, fins que algú el fereixi.» | You keep it pinned until a friend's blow knocks it out of your grip. |

### 3. Gel del mestre (Mestre de l'aigua, card 6, Defensa)

**Now:** «Bloqueja un enemic. Si aguanta, el tir de l'atacant va contra l'enemic que triïs.»

| Option | Text | Scene |
|---|---|---|
| **A** | «Si aguanta, el tir més alt que aturis va contra l'enemic que triïs.» | The strongest blow is stopped in ice, whole, and hurled at an enemy. |
| B | «Si aguanta, cada tir que aturis va contra l'enemic que triïs.» | Every blow freezes mid-air and is sent flying. It takes over card 10's role (Ira de l'oceà). |

### 4. Presó de gel (Mestre de l'aigua, card 8, Defensa)

**Now:** «Bloqueja un enemic. Si t'ataca aquest torn, perd les seves 2 accions següents.»

| Option | Text | Scene |
|---|---|---|
| **A** | «Si aguanta, l'atacant que triïs queda glaçat 2 torns sense jugar carta; el primer atac que el fereixi trenca el gel i fereix el doble.» | The ice climbs up the attacker into a statue; the first blow shatters it. The party decides: freeze, Focus up, shatter for double. |
| B | «Si aguanta, l'atacant que triïs perd les seves 2 accions següents.» | Frozen in place as it strikes. |
| C | «Aguantis o no, el primer enemic que ataqui qui defenses perd les seves 2 accions següents.» | The ice grabs whatever touches it. It fires whether or not the defense holds, which goes against "pays off when it blocks". |

**Collision:** the unpicked gold card Fer-lo estàtua (Xi × Terra) also freezes until a wound cracks it free.

### 5. Esquivar-los a tots (Mestre de l'aire, card 4, Defensa)

**Now:** «Bloqueja tots els enemics.» It loses its whole idea.

| Option | Text | Scene |
|---|---|---|
| **A** | «Si aguanta contra dos atacants o més, xoquen entre ells: cadascun perd N PV.» | They rush you from every side; you spin out and they crash into each other. Against a lone beast it's a plain defense. |
| B | «Els atacants contra qui aguantis xoquen entre ells, o contra el terra si n'hi ha un de sol: cadascun perd N PV.» | Always live, but closer to a generic damage-back payoff. |
| C | «Aquest torn, tots els atacs enemics van contra tu.» | The old taunt as the card's own effect. It has no on-block payoff; shown only for reference. |

N is a placeholder for the main session.

### 6. Remolí del mareig (Mestre de l'aire, card 6, Defensa)

**Now:** «Bloqueja un enemic. Aquest torn, els seus atacs van contra un combatent a l'atzar.»

| Option | Text | Scene |
|---|---|---|
| **A** | «Si aguanta, l'atacant queda marejat: el torn següent els seus atacs van contra un combatent a l'atzar, ell inclòs.» | Its lunge is spun into a whirlwind and it staggers out dizzy, swinging at anyone, even itself. |
| B | «Cada atac que aguantis surt girant i fereix un combatent a l'atzar amb el seu tir.» | The blow is flung off anywhere. Shaped like water's redirect. |

### 7. Mur ariet (Mestre de la terra, card 2, Defensa)

**Now:** «Bloqueja un enemic. Si aguanta, l'ataques un cop amb els daus d'aquesta carta.»

| Option | Text | Scene |
|---|---|---|
| **A** | «Si aguanta, envesteixes l'atacant amb els daus d'aquesta carta.» (each attacker held) | The wall takes the blows, then slams forward into everyone who struck it. |
| B | «Si aguanta, envesteixes l'atacant que triïs amb els daus d'aquesta carta.» | One ram. |

**For the simulator and implementer:**
- Payoffs fire far more often now. Walls on one ally fire every payoff together, so Pinça + Gel + Mur on one ally is a combo to measure.
- New statuses to price (`positionValue`): Presó's breakable freeze, Remolí's next-round dizziness, and Bloqueig mutu B's hold.
- Nothing here needs the enemy-block machinery any more.

**Reviewer verdict:** _pending_.

---

## Batch C: timing that the fast step doesn't carry

The designer's picks are 1A–6A. All six keep their titles and slots.

### 1. Llamp de sang freda (Mestre del foc, card 9, Atac 4d6)

**Now:** «… Si algú et fereix abans que es resolgui, el llamp et fereix a tu …» It was a slow attack; now the risk is just commit order.

| Option | Text | Scene |
|---|---|---|
| **A** | Atac: «Puges 1 nivell de fatiga. Es resol al final del torn i no es pot defensar. Si aquest torn t'han ferit, et fereix a tu en lloc de l'objectiu.» | You stand still splitting the energies; at the round's end the bolt leaps, unless a blow broke your calm and it bursts in your hands. Allies see the aims and wall the bender. |
| B | Focus: «Puges 1 nivell de fatiga. Ataca l'enemic que triïs; no es pot defensar. Si aquest torn t'han ferit, et fereix a tu.» | The same scene. The Focus step already comes last. Atiar les brases no longer feeds it. |

### 2. Salt del meteor (Mestre de l'aire, card 8, Atac 2d6, every enemy)

| Option | Text | Scene |
|---|---|---|
| **A** | «Puges 1 nivell de fatiga. Aquest torn, els atacs contra tu fallen. Es resol al final del torn: afecta tots els enemics.» | Up on a column of air while blows hit empty sky; down like a meteor at the round's end. It can't interrupt a Focus. |
| B | «Puges 1 nivell de fatiga. Afecta tots els enemics. Aquest torn, els atacs contra tu fallen.» | Simpler, lands in the normal Attack step, closer to Cop i fuga. |
| C | A, plus «els que t'han atacat no es poden defensar». | Wordier, and the clause seldom fires. |

### 3. Punyals de foc (Soldat del foc, elements enemy, card 1)

| Option | Text | Notes |
|---|---|---|
| **A** | «+2 si un altre atac també apunta l'objectiu.» | The pile-on is visible at the reveal; heroes wall the target. |
| B | «+2 si l'objectiu va perdre PV el torn anterior.» | Nearly always on after round 1. |
| C | keep the text | It works through commit order, which is luck in the simulator. |

### 4. Punyalada traïdora (goblin, fantasy enemy, card 2)

| Option | Text | Notes |
|---|---|---|
| **A** | «Si un altre goblin també ataca l'objectiu aquest torn, l'objectiu té −3 {D}.» | One word changed; it reads the aims. |
| B | «Si l'objectiu ataca un altre goblin aquest torn, l'objectiu té −3 {D}.» | Always on in a horde. |

3A and 4A share a shape, in different sets.

### 5. Caiguda de cometa (Mestre del foc, card 10 finisher, Focus)

| Option | Text | Notes |
|---|---|---|
| **A** | «Ràpida. Puges 2 nivells de fatiga. Cau a l'inici del torn següent: …» | Only a fast attack can stop it. Against a bestiary with no fast attacks it's close to unanswerable. |
| B | «… No es pot interrompre. …» | Only killing the bender stops it. It rhymes with 1A. |
| C | keep it a plain Focus | A third "guard the caster" shape. |

### 6. Ganxo salvavides (Artífex, card 5, Defensa)

| Option | Text | Notes |
|---|---|---|
| **A** | «Un atac que triïs contra un aliat no l'impacta.» | Chosen after seeing every aim. May dominate other guards; brake with fatigue if so. |
| B | «Si aguanta un atac contra un aliat, l'estires fora: la resta del torn, els atacs contra ell fallen.» | Pays off on a block. |

**Rulings needed:**
- the order of end-of-round events (the Llamp and Salt landings, gadgets, burns);
- whether an interrupted Cometa still costs its fatigue;
- whether Llamp's backfire includes Atiar les brases' +5.

**Reviewer verdict:** _pending_.

---

## Batch A: speed effects that lost their meaning

_Pending_ (designer).

## Batch D: defenses with no on-block payoff

_Pending_ (designer).
