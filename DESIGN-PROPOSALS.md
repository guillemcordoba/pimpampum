# Design proposals for the priority system (2026-10-28)

These are card concepts from `card-designer`. Each round, a **new** `card-taste` instance judged them, seeing only the cards, and the designer revised until a round found nothing that must change (the loop in `card-designer.md`).

**Nothing here is implemented. The user picks**, and may overrule any verdict.

**Rules they're designed for** (`PRIORITY-MIGRATION.md`):
- a fast step, then Defense → Attack → Focus;
- attacks aim at the reveal;
- defenses guard themselves or one ally, chosen after the aims;
- no generic enemy block;
- every defense pays off when it blocks.

**House convention on these cards:**
- «l'atacant» = each attacker the defense held against;
- «l'atacant que triïs» = one of them, chosen by you.

**Wall rule** (proposed by the batch D designer; to go in `rules.md` if accepted): when defenses on one character sum into a wall and it holds, every card in the wall pays its «si aguanta», once per held attack, in commit order. A breach pays none of them.

---

## Batch B: the 7 enemy-block cards — **closed** (4 review rounds)

| # | Card | Final text | Note |
|---|---|---|---|
| 1 | Pinça entumidora (Mestre del xi 2, Defensa) | «Si aguanta, l'atacant queda entumit.» | It only lost its "Bloqueja un enemic" aiming. |
| 2 | Bloqueig mutu (Mestre del xi 5, Defensa) | «Si aguanta, tu i l'atacant que triïs no jugueu carta el torn següent.» | |
| 3 | **Retorn glaçat** (Mestre de l'aigua 6, Defensa) | «Si aguanta, la tirada més alta que aturis va contra l'enemic que triïs.» | **Renames your title "Gel del mestre"; your call.** Three reviewers in a row said the old title tells a stranger nothing. |
| 4 | Presó de gel (Mestre de l'aigua 8, Defensa) | «Si aguanta, l'atacant que triïs perd les seves 2 accions següents; el primer atac que el fereixi mentrestant fereix el doble i l'allibera.» | The reviewers' favourite of the batch: freeze, then decide whether to shatter it for double. Simulate the shatter (an undefended full hit, doubled). |
| 5 | **Fer-los xocar** (Mestre de l'aire 4, Defensa) | «Si aguanta, l'atacant perd N PV per cada atacant que aturis.» | **Renames your title "Esquivar-los a tots"; your call.** Under priority, "block them all" is what every defense does. The total grows with the square of the crowd, so N is probably 1. "Perd PV" on purpose: armour doesn't stop a collision. |
| 6 | Remolí del mareig (Mestre de l'aire 6, Defensa) | «Si aguanta, l'atacant queda marejat: el torn següent els seus atacs van contra un combatent a l'atzar, ell inclòs.» | |
| 7 | Mur ariet (Mestre de la terra 2, Defensa) | «Si aguanta, envesteixes l'atacant que triïs amb els daus d'aquesta carta.» | One ram, not one per attacker (three free rams at card 2 against a horde was too much). |

**Statuses to price** (`positionValue`): Presó's freeze, Remolí's next-round dizziness.

## Batch A: speed effects that lost their meaning — **closed** (2 rounds; round 2 passed every card)

| Card | Final text |
|---|---|
| Gel kit rule (printed once) | «**Glaçat:** el torn següent, la seva carta es resol després de totes les altres; si és una Defensa, no protegeix ningú.» |
| Alè de gebre (Gel 1, Atac) | «Si fereix, l'objectiu queda glaçat.» |
| **Estàtua de gel** (Gel 2, Focus) | «Un enemic queda de gel fins al final del torn següent: no juga carta i cap atac no el fereix.» It replaces Paisatge congelat. |
| Tombarella de rescat (Acrobàcia 5, Defensa) | «Si aguanta, la resta del torn els atacs contra tu i l'aliat que defenses fallen.» |
| Embranzida d'escut (the card Escut de fusta grants, Defensa) | «Si aguanta, el teu Atac del torn següent és ràpid.» (fallback: Cop de cantell, «Si aguanta, l'atacant perd 1 PV.») |
| Poció de rapidesa (Focus, single use) | «Els 3 torns següents, les teves cartes són ràpides. Un sol ús.» (the duration can be tuned to 2–3) |
| Patinet d'aire (Mestre de l'aire 3, Focus) | «El torn següent, la teva carta és ràpida i el primer atac contra tu falla.» |
| Marca de la perdició | «Condemna un enemic (3 torns): tira amb desavantatge.» |
| Invocar l'ombra de l'infern | «Condemna tots els enemics (3 torns): tiren amb desavantatge.» |
| Udol de terror (bone devil) | «Tots els enemics reben {A}−2 i {D}−2 durant 2 torns.» |

**Set aside for later, not dropped:**
- **Paisatge congelat** («Tots els enemics queden glaçats»): parked word for word for a Gel slot 5–6, when the kit grows. At card 2 it was a horde wipe.
- **Enemic projectil** (the monkey flip): its title and scene are parked for a later Acrobàcia attack that doesn't knock anyone down.

**Optional, from the round-2 reviewer (not blocking):**
- **Rename the keyword Glaçat**, since it sits right next to "queda de gel". ⚠️ The reviewer's suggestion, **Entumit**, is already Mestre del xi's keyword (Pinça entumidora, −3 to attacks). Don't take that one; pick another if you rename.
- **Invocar l'ombra de l'infern → Ombra de la perdició:** "invocar" suggests a summoned creature, and the new name pairs with Marca de la perdició.
- **Udol de terror:** «reben» → «tenen», matching the horned devil's wording.
- **Embranzida d'escut → Escut i endavant:** the old title alone sounds like a shield charge.
- **Define *desavantatge* in `rules.md`:** the necromancer texts now rest on it alone.

**Statuses to price:** Glaçat, Estàtua de gel, the shield's "next attack fast", the potion's fast status.

## Batch C: timing that the fast step doesn't carry — _closing_ (round 4 checks the last title)

| Card | Final text | Note |
|---|---|---|
| Llamp de sang freda (Mestre del foc 9, Atac 4d6) | «Puges 1 nivell de fatiga. Es resol al final del torn; no es pot defensar. Si t'han ferit aquest torn, et fereix a tu en lloc de l'objectiu.» | The reviewers' favourite. Allies see the aims and wall the bender. |
| Salt del meteor (Mestre de l'aire 8, Atac) | «Puges 1 nivell de fatiga. Aquest torn, els atacs contra tu fallen. Es resol al final del torn: afecta tots els enemics.» | The designer kept A over the reviewer's B: A is the scene (in the air until you land), and it can't interrupt a Focus. |
| **Punyals en tenalla** (Soldat del foc 1, Atac) | «+2 si un altre atac apunta el mateix objectiu.» | It was "Punyals de foc". _Title in round-4 review._ |
| Punyalada traïdora (goblin 2, Atac) | «Si un altre atac apunta el mateix objectiu, la defensa contra aquest atac té −3.» | |
| Caiguda de cometa (Mestre del foc 10, Focus) | «Puges 2 nivells de fatiga. No es pot interrompre. Cau a l'inici del torn següent: afecta tots els enemics, i cap aliat no els pot defensar.» | Only killing the bender stops it. A reviewer suggests 4d6 so it feels bigger than card 8; a number, for tuning. |
| Ganxo salvavides (Artífex 5, Defensa) | «Tria un atac contra l'aliat que defenses: no l'impacta.» | Watch it: an uncontested negation every round. If it measures dominant, brake it with fatigue. |

**Rulings needed:**
- `rules.md`: an attack on several targets "apunta" each of them (it counts as «un altre atac»).
- The order of end-of-round events (the Llamp and Salt landings, then gadgets and burns).
- Whether a Cometa that never resolves still costs its fatigue.
- **For the implementer:** the generic `flanking` handler must read this round's **aims**, not resolved history.

## Batch D: defenses with no on-block payoff — _closing_ (round 3 checks the last three texts)

| Card | Final text | Note |
|---|---|---|
| **Barricada explosiva** (Enginyer d'explosius 2, Defensa) | «Queda dreta amb 1d6 de vida i defensa el protegit cada torn. Si aguanta, pots gastar 1 càrrega: esclata i l'atacant perd N PV.» | Needs a "may spend" choice hook. |
| Mur de pedra (Gòlem de pedra, enemy, Defensa) | «Defensa el protegit cada torn fins que un atac el superi.» | The 2d6 life goes; staying up is the payoff. |
| Paraigua blindat (Artífex 4, Defensa) | «Contra els atacs que afecten més d'un de vosaltres, defensa tot el grup. Si aguanta, l'atac regalima sobre un enemic a l'atzar, amb el mateix tir.» | It spills once per held attack, also on single-target attacks, and can hit the attacker. |
| Colós de butxaca (Artífex 9, Defensa) | «Puges 2 nivells de fatiga. Corda 3: els atacs contra vosaltres es resolen contra la seva defensa. Quan s'atura, cau sobre cada enemic contra qui ha aguantat, o sobre un a l'atzar si no n'hi ha cap.» | _In round-3 review._ |
| Forma del pop (Mestre de l'aigua 4, Defensa) | «Defensa tots els aliats. Si aguanta, l'atacant queda agafat: fins al final del torn següent, els atacs contra ell tenen +N.» | _In round-3 review._ |
| Cúpula de pedra (Mestre de la terra 7) | unchanged | Its persistence already depends on holding. |
| Coixí de vent (Mestre de l'aire 2, Defensa) | «Aquest torn, ni tu ni qui defenses podeu baixar d'1 PV. Si aguanta, el torn següent l'atacant no pot atacar qui has defensat.» | _In round-3 review._ The floor must cover the airbender too, since a beaten guard's damage hits the defender. |
| Capbussada (Unagi, enemy, Defensa) | «Si aguanta, el torn següent els seus atacs contra l'atacant no es poden defensar.» | |

**Statuses to price:** "agafat", Capbussada's ambush, Coixí's ban, the Colós's list of stopped enemies.

---

## How the rounds went (in short)

- **B:**
  - round 1 settled the picks and cut the horde-wide options (Mur ariet A, Gel B);
  - round 2 renamed Esquivar-los a tots and asked for Presó to say the shatter frees it;
  - round 3 fixed "tir" → "tirada" and the "aquest" ambiguity;
  - round 4: all pass.
- **A:**
  - round 1 cut Gebre trencadís and Poció B, moved Paisatge congelat out of card 2, and asked to settle what a frozen Defense does (it protects nobody);
  - round 2: all pass.
- **C:**
  - round 1 switched Cometa to "No es pot interrompre" and fixed Ganxo's target;
  - round 2 fixed Punyalada's −3 wording;
  - round 3 asked for a clearer Punyals title.
- **D:**
  - round 1 changed four picks (Golem C, Paraigua B, Pop B, Coixí B) and trimmed Barricada;
  - round 2 fixed Coixí's floor and Colós's double "aturar".
