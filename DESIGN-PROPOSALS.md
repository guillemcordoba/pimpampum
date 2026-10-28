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

### Gel kit (fantasy): card 1 Atac, card 2 Focus

**The kit rule, printed once:**

> **Glaçat:** el torn següent, la seva carta es resol després de totes les altres.

A frozen enemy's attack lands after your Focus step, and its Defense comes up too late. It's the faithful port of the old −speed.

**Card 1 (Atac):**

| Option | Text | Scene |
|---|---|---|
| **A** · Alè de gebre | «Si fereix, l'objectiu queda glaçat.» | A plume of hoarfrost stiffens its joints; next round it moves after everyone. |
| B · Gebre trencadís | «Si fereix, el proper atac que el fereixi li treu 2 PV més.» | Its flesh goes glassy and brittle. |

**Card 2 (Focus):**

| Option | Text | Scene |
|---|---|---|
| **A** · Paisatge congelat | «Tots els enemics queden glaçats.» | The staff strikes the ground and frost rimes the enemy line. Likely strong; brake with fatigue if so. |
| B · Estàtua de gel | «Un enemic queda de gel fins al final del torn següent: no juga carta i cap atac no el fereix.» | A total lock at card 2, so it probably needs fatigue or a contest. |

The designer cut a third option, Gebre a la gola: dead in fantasy, because focusing enemies are rarely guarded.

### Tombarella de rescat (Acrobàcia, card 5, Defensa)

| Option | Text | Scene |
|---|---|---|
| **A** | «Si aguanta, la resta del torn els atacs contra tu i l'aliat que defenses fallen.» | Cartwheel in, take the first blow, roll your ally away; the next blows hit bare ground. |
| B · Enemic projectil | «Si aguanta, l'atacant i un altre enemic que triïs queden a terra.» | A tomoe nage onto a second enemy. It reads as card 2 plus one. |

### Escut de fusta (the shield everyone may carry; granted Defensa 2d4, must stay mild)

| Option | Text | Notes |
|---|---|---|
| **C** · Embranzida d'escut | «Si aguanta, el teu Atac del torn següent és ràpid.» | Parry, then strike first. May need a word at the table. |
| B · Cop de cantell | «Si aguanta, l'atacant perd 1 PV.» | Plain fallback. |

### Poció de rapidesa (fantasy potion, Focus, single use)

| Option | Text |
|---|---|
| **A** | «Els 3 torns següents, les teves cartes són ràpides. Un sol ús.» (the duration can be tuned to 2–3) |
| B | «La resta del combat, els teus Atacs són ràpids. Un sol ús.» |

### Patinet d'aire (Mestre de l'aire, card 3, Focus)

Keep the concept; only the text changes: «El torn següent, la teva carta és ràpida, i el primer atac contra tu falla.» Update elements/DESIGN.md to match.

### Clause changes

| Card | Pick | Alternative |
|---|---|---|
| Marca de la perdició | «Condemna un enemic (3 torns): tira amb desavantatge.» (drop the clause) | «…i cap carta seva no és ràpida» (what the code does today) |
| Invocar l'ombra de l'infern | «Condemna tots els enemics (3 torns): tiren amb desavantatge.» | — |
| Udol de terror | «Tots els enemics reben {A}−2 i {D}−2 durant 2 torns.» | «…i no poden jugar cartes ràpides» |

**Statuses to price:** Glaçat, Estàtua de gel, the shield's fast next attack, the potion's fast status. Also check that the evaluator values "fast" at all.

**Reviewer verdict:** _pending_.

## Batch D: defenses with no on-block payoff

### Rulings to settle first

- **Walls:** does every card in a wall that holds pay its payoff? The designer assumes yes, once each per held attack.
- **Standing guards are public:** Barricada, Mur de pedra, Cúpula de pedra and Colós de butxaca sit face up on the table. Their payoff makes attacking into them expensive rather than rewarding a read.

### The cards

| Card | Pick | Alternatives |
|---|---|---|
| Barricada (Enginyer d'explosius, card 2) | **A · Barricada explosiva:** «Si aguanta, pots gastar 1 càrrega per fer-la esclatar: l'atacant perd N PV i la barricada cau.» (the charge in the sandbags goes off in its face) | B: «Cada cop que aguanta, el protegit té +N al seu proper atac.» (firing from cover); C · Barricada de filferro: the attacker tangled, +N to attacks against it until the end of next round |
| Mur de pedra (Gòlem de pedra, enemy) | **A:** «Si aguanta, l'atacant té −N als atacs durant 2 torns.» (stone numbs the arms; the user's own third example) | B: stone chips, the attacker loses N PV; C: «El mur es queda dret mentre aguanti; el primer atac que el supera l'esfondra.» |
| Paraigua blindat (Artífex, card 4) | **A:** «Si aguanta, queda obert. Corda 2: cada torn torna a defensar així.» (the ribs click into place and it stays up) | B: the attack spills off the rim onto another enemy, with the same roll |
| Colós de butxaca (Artífex, card 9) | **A:** «Quan s'atura, cau sobre cada enemic que ha aturat (si no n'ha aturat cap, sobre un a l'atzar).» | B: «Un atac que aguanta no li gasta corda.»; C: it hits back, an attack of Nd6 per hold |
| Forma del pop (Mestre de l'aigua, card 4) | **A:** «Defensa tots els aliats. Cada atacant contra qui aguanta té −N als atacs fins al final del torn següent.» (the arm stays wrapped around the attacker) | B: +N to attacks against each held attacker; C: a slap, the attacker loses 1 PV per hold |
| Cúpula de pedra (Mestre de la terra, card 7) | **0:** keep it unchanged; its persistence already depends on holding | A: «Cada atac que aguanta, una punxa de pedra surt contra l'atacant: perd N PV.» |
| Coixí de vent (Mestre de l'aire, card 2) | **A:** «Si aguanta, l'atacant cau en el buit: fins al final del torn següent, els atacs contra ell tenen +N.» (lead into emptiness) | B: «…el torn següent no pot atacar l'aliat que has defensat.» (repeats a gold-card draft) |
| Capbussada (Unagi, enemy) | **A:** «Si aguanta, el torn següent els seus atacs contra l'atacant no es poden defensar.» | B: it drags the attacker under, and the attacker loses its next action |

**Notes:**
- Barricada explosiva needs a "may spend" choice hook.
- Statuses to price: the −N and +N effects, Capbussada's ambush, Colós's list of stopped enemies, the open umbrella.

**Reviewer verdict:** _pending_.
