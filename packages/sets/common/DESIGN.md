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

## Mestre del xi — `mestre-del-xi` (landed 2026-10-14)

*Kappo / sappo, "cure or kill": the same points switch a body off or back on.*
Unarmed. Kit rule **Entumit**: "Fins al final del torn següent, els seus atacs
tenen −3." — on the attack roll (the contested total), not on the damage after
it; numbed again, it only renews (since 2026-10-14, NEXT-STEPS §50; it used to
halve the damage). The dice are
provisional (tuned in NEXT-STEPS §48); Toc de la mort's rule is being chosen among measured variants
(NEXT-STEPS §47).

| # | card | type · speed · dice | what it does |
|---|---|---|---|
| 1 | Cop al nervi | Atac · 2 · 2d4 | if it wounds, numb |
| 2 | Pinça entumidora | Defensa · 3 · 3d4 | block an enemy; if it holds, the attacker numb |
| 3 | Desbloquejar el cos | Focus · −1 | a standing ally, or you, recovers 4 PV and sheds every efecte negatiu (not a swallowed body) |
| 4 | Poder apagat | Atac · 2 · 2d6 | if it wounds, next round its card is only its dice |
| 5 | Bloqueig mutu | Defensa · 2 · 2d8 | block an enemy; if it holds, next round neither of you plays a card |
| 6 | Ràfega de dits | Atac · 1 · 1d6 ×3 · 1 fatiga | two wounds numb; three cancel its action this round |
| 7 | Tocs en cadena | Atac · 1 · 2d6 | up to three enemies, one roll; the wounded numb |
| 8 | Cop de vida | Focus · 0 | a fallen ally rises with half its starting PV, +1 fatigue |
| 9 | Toc de la mort | Atac · 2 · 2d8 | if it wounds, a delayed death (variant: Ressò by default) |
| 10 | Tempesta de son | Atac · 1 · 3d8 · 2 fatiga | every enemy, no damage; the beaten sleep until they lose PV or roll 11+ |

## Drafts — Acrobàcia, Mestre del xi, Artífex (2026-10-13, NOT picked)

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

### Mestre del xi — draft v4 (named "Punts de pressió" until 2026-10-14; "Punts" in the log below)

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
- Xi + Foc: **Llamp redirigit** — the held blow's whole total strikes an enemy you choose.
- Xi + Aigua: ~~Agulles de gel~~ — cut in the gold-card rounds (stapled Pluja de dagues + numbing).
- Artífex + Foc: **Globus de guerra** — the balloon rises on the bender's own flame.
- Artífex + Aigua: **Submarí d'assalt** · Artífex + Terra: **Rails de terra**.

## Gold cards: shared skill × element (2026-10-15, converged after zero-notes review rounds, NOT picked)

Eighty cards, five per pairing, each needing one shared skill and one bending
element. Power follows the threshold sum (elements/DESIGN.md): a 5+5 card is as
strong as card 10 of a single skill, and each pairing climbs over sums 2-10.
Each set went through `card-designer` drafts and three or four fresh
`card-taste` rounds until a round found nothing that must change. Dice are not
set yet; "N" marks a placeholder. Thresholds are written shared skill + element.

### Esgrima × element (best card: Capa buida)

| pairing | sum | card | type | thr | text | scene |
|---|---|---|---|---|---|---|
| Foc | 2 | Cauteritzar la ferida | Focus | 1+1 | Recuperes els PV que vas perdre el torn anterior, fins a N. | You heat the flat of your blade with your own fire and press it to last round's wound; it hisses shut. |
| Foc | 4 | Fogonada a la cara | Atac | 2+2 | Si fereix, el torn següent l'objectiu juga una carta a l'atzar, contra combatents a l'atzar. | Your cut ends in a burst of flame off the blade into its face; blinded next round, it lashes out at anything, at anyone. |
| Foc | 5 | Xocs ardents | Focus | 3+2 | La resta del combat, cada enemic que toqui una carta teva que requereixi Esgrima, atacant o defensant, perd 1 PV, guanyis o perdis. | You set your blade burning for the rest of the fight; every clash of steel, won or lost, scorches whoever it meets. |
| Foc | 7 | Revés de foc | Atac | 4+3 | Si no fereix, l'enemic que triïs rep un atac de Nd6; no es pot defensar. | When your sword is stopped, you turn with the block and backhand a jet of fire from your free hand at any enemy you choose. |
| Foc | 10 | Sabre de tro | Atac | 5+5 | Puges 2 nivells de fatiga. Ignora l'armadura. Si fereix, el llamp salta a cada altre enemic amb el mateix tir; els que fereix perden la seva acció d'aquest torn. | You run lightning down your sabre and drive it through armour; the bolt leaps from that body to every foe, locking the muscles of any that haven't moved yet. |
| Terra | 2 | Arma arrelada | Defensa | 1+1 | Aquest torn, cap atac no fa perdre més de 3 PV ni a tu ni a qui defenses. | You drive your blade into the ground and the stone roots it there; braced behind it, you and your ally take only grazes. |
| Terra | 4 | Broquer de basalt | Defensa | 2+2 | Aquest tir et torna a defensar el torn següent. | You rip a basalt buckler from the ground onto your off arm and parry with blade and stone; the shield is still there next round. |
| Terra | 6 | Ensartar la filera | Atac | 2+4 | Afecta fins a tres enemics. | You shift the ground so three enemies stumble into a row, then lunge and skewer the whole file on one thrust. |
| Terra | 8 | Cimitarra soterrània | Atac | 2+6 | Puges 1 nivell de fatiga. No es pot defensar, tret que l'objectiu jugui una Defensa igual o més ràpida. | You sink your scimitar into the earth; it runs underground and bursts up beneath the target, which only a quicker guard sees coming. |
| Terra | 10 | Sembra d'espases | Defensa | 5+5 | Puges 2 nivells de fatiga. Al final del torn, cada enemic que hagi atacat el teu bàndol aquest torn rep un atac d'aquests daus. | You stab your sword into the earth and stone blades sprout across the field; at round's end they spear every enemy who attacked. |
| Aire | 2 | Gir de penell | Atac | 1+1 | Quan es resol, tria'n l'objectiu. | Mid-lunge you leap into the wind and it swings you like a weathervane; your sword lands on whoever you pick at the last instant. |
| Aire | 4 | Fora d'abast | Defensa | 2+2 | Bloqueja un enemic. Si aguanta, l'atacant surt llançat: el torn següent no et pot atacar. | You parry its blow on your blade and a gust behind the parry flings it far back, too far to reach you next round. |
| Aire | 6 | Capa buida | Defensa | 3+3 | Bloqueja un enemic: si t'ataca aquest torn, falla, i tu l'ataques amb aquests daus; no es pot defensar. | Its blow cuts through your cloak, left hanging on a puff of air; you are already behind it, thrusting where it can't guard. |
| Aire | 8 | Sense mans | Focus | 3+5 | Puges 1 nivell de fatiga. Al final de cada torn, la teva arma ataca sola l'enemic que triïs amb aquests daus, fins que juguis una altra carta que requereixi Esgrima o algú et fereixi. | You release your sword and currents of air wield it; each round's end it flies at whoever you point to, until you take it back or a wound breaks your focus. |
| Aire | 10 | Ratxa esmolada | Atac | 5+5 | Puges 2 nivells de fatiga. Cinc atacs contra els enemics que triïs, com a màxim dos contra el mateix. | Sword out, you ride a whetted gust across the field, and it carries five cuts wherever you send them, never more than two at one foe. |
| Aigua | 3 | Nus de gebre | Defensa | 1+2 | Bloqueja un enemic. Si aguanta, fins al final del torn següent l'atacant i tu només us podeu atacar l'un a l'altre. | Your blade meets its blow and frost freezes the contact into a rope of ice binding you two: neither can turn on anyone else. |
| Aigua | 5 | Contracorrent | Atac | 3+2 | Si l'objectiu t'ataca aquest torn, tots dos atacs es resolen alhora, i el teu suma el tir del seu. | You take its blow full on and ride its force into your counter-cut, like a counter-current; you both bleed, it bleeds twice. |
| Aigua | 6 | Fulla assedegada | Atac | 2+4 | Si fereix, un aliat, o tu, recupera tants PV com li ha tret. | Your blade drinks the water from the wound it opens, and you pour that water as healing over an ally, or yourself. |
| Aigua | 8 | Onada trinxadora | Atac | 3+5 | Puges 1 nivell de fatiga. Tres atacs, cadascun contra un enemic a l'atzar. | You ride a churning wave into their ranks, sword flailing as it tumbles you; three cuts land wherever the water throws you. |
| Aigua | 10 | Marioneta escarlata | Atac | 5+5 | Puges 2 nivells de fatiga. Si fereix, el torn següent tries la carta que juga l'objectiu i contra qui, ell mateix inclòs. | Your sword opens a cut and you bend the body through its blood; next round it moves as your puppet, even against itself. |

### Mestre del xi × element (best card: Espina clavada)

| pairing | sum | card | type | thr | text | scene |
|---|---|---|---|---|---|---|
| Aigua | 3 | Verí rebotat | Focus | 1+2 | Un aliat, o tu, perd tots els efectes negatius, que passen a l'enemic que triïs. | You press an ally's points and draw every ailment out as a dark bead of water, then flick it into an enemy's points. |
| Aigua | 4 | Transvasar el vigor | Atac | 2+2 | Si fereix, l'objectiu queda entumit, i un aliat, o tu, té +3 als atacs fins al final del torn següent. | You jab a point and siphon its strength out as a stream of water, its limb going numb, then pour that strength into an ally's. |
| Aigua | 6 | Hivernació | Defensa | 3+3 | Un aliat: fins al final del torn següent cap atac no l'afecta, i el torn següent no juga carta. | You press the points that slow a heart and seal an ally in a shell of ice; nothing reaches them, but they sleep a round. |
| Aigua | 8 | Lligam de dolor | Atac | 4+4 | Afecta fins a tres enemics. Després, fins al final del torn següent, quan un atac fereix un dels que has ferit, els altres que has ferit perden els mateixos PV. | You strike three foes' points and thread water through their blood, linking them; for a round, a wound to one hurts them all. |
| Aigua | 10 | Venes de vidre | Defensa | 5+5 | Puges 2 nivells de fatiga. Bloqueja tots els enemics. Els atacants contra qui aguantis queden de vidre: fins al final del torn següent, cada atac que els fereixi els treu el doble de PV. | You meet every attacker with a fingertip and freeze the water in their veins to glass; any wound now cracks them twice as deep. |
| Terra | 2 | Segell de fang | Defensa | 1+1 | Defensa un aliat, o tu. Aquest torn, cap carta enemiga no li pot deixar efectes negatius. | You stand guard and press mud over an ally's points, sealing them; whatever the enemy lands, nothing sticks. |
| Terra | 4 | Cantar els punts | Focus | 1+3 | El torn següent, cada atac del teu bàndol que fereixi deixa l'objectiu entumit. | Feeling their stances through the ground, you call out each enemy's open point; next round every wounding blow of your side lands there and numbs. |
| Terra | 6 | Espina clavada | Atac | 3+3 | Si fereix, l'objectiu queda entumit fins que passi un torn sense atacar. | You drive a stone thorn into a pressure point and leave it lodged; it stays numb until it rests a whole round without attacking. |
| Terra | 8 | Fer-lo estàtua | Defensa | 4+4 | Bloqueja un enemic. Si aguanta, els 2 torns següents l'atacant no juga carta, fins que un atac el fereixi. | You catch its blow, press its points, and stone creeps over it; it stands a statue until a wound cracks it free, or the stone crumbles. |
| Terra | 10 | Presa de terra | Atac | 5+5 | Puges 2 nivells de fatiga. Afecta tots els enemics. Els que fereix es descarreguen a terra: la resta del combat, les seves cartes no tenen cap efecte, només en compten els daus. | You strike every enemy's points and slap the ground; their power drains into the earth like lightning to ground, leaving only bare force, for good. |
| Foc | 2 | Espurnes a les juntures | Atac | 1+1 | Si fereix, fins al final del torn següent cada atac que faci li fa perdre 1 PV. | Your fingertips leave sparks lodged in its joints; until next round ends, every swing it makes grinds them and burns it. |
| Foc | 4 | Cauteritzar | Focus | 2+2 | Un aliat dret, o tu, recupera els PV que li va treure l'últim atac que el va ferir. | You heat your fingers in a living flame and press the points around an ally's last wound, sealing it as if it never landed. |
| Foc | 6 | Fondre el cansament | Focus | 3+3 | Un aliat, o tu: la resta del combat, la fatiga amb què ha començat el combat no li resta a les tirades; en acabar el combat, puja 1 nivell de fatiga. No s'acumula. | You kindle an ally's points and burn off the weariness they came in with; it stops weighing on them, and returns once it's over. |
| Foc | 8 | Raig redirigit | Defensa | 3+5 | Puges 1 nivell de fatiga. Aquest torn, el primer atac contra tu, aguantis o no, també fereix l'enemic que triïs, l'atacant inclòs, amb el total d'aquell atac, sense defensa. | You take the first blow in through your fingertips, run it down your channels like lightning, and fire its whole force out at any enemy. |
| Foc | 10 | Fornal humana | Atac | 5+5 | Tria quants nivells de fatiga puges, com a mínim 2 i sense passar d'Esgotat (no es pot jugar a Exhaust o més): +3 a aquesta tirada per cadascun, i els puges després de tirar. Afecta tots els enemics; els que fereix queden entumits. | You stoke your own points like a forge, burning as much strength as you dare, then sweep every enemy with blazing, numbing fingertips. |
| Aire | 2 | Buidar els pulmons | Atac | 1+1 | Si fereix, el torn següent no pot jugar Focus. | Your two-finger strike under the ribs bends the air right out of its lungs; breathless, it can't focus next round. |
| Aire | 5 | Fals cadàver | Focus | 3+2 | El torn següent, si jugues un Atac, cap atac no t'afecta i el teu atac no es pot defensar. | You press your points and bend the breath out of your body, dropping like a corpse; ignored next round, you rise striking where nobody guards. |
| Aire | 6 | Força de ploma | Defensa | 3+3 | Bloqueja un enemic. Si aguanta, fins al final del torn següent els seus atacs no fereixen. | You catch its blow, touch the points of its limbs and blow its strength away like down; its next blows land light as feathers. |
| Aire | 8 | Boca a boca robat | Atac | 4+4 | Si fereix, un aliat caigut s'aixeca amb tants PV com li ha tret. | You hit an enemy's breath point, pull the air from its chest and breathe it into a fallen ally's mouth; they rise on stolen life. |
| Aire | 10 | Asfíxia | Atac | 5+5 | Puges 2 nivells de fatiga. Afecta tots els enemics. Els que fereix s'ofeguen: al final de cada torn perden PV, el doble cada cop (1, 2, 4…), fins que algú et fereixi. Qui ja s'ofega continua on era. | You seal every enemy's breath points with a touch and bend the air out of their lungs; they choke harder each round, until a blow breaks your hold. |

Rulings: an *efecte negatiu* is only a state an enemy card left (the turn Hivernació costs is your own card's price, like the master's half of Bloqueig mutu). Entumit set again never shortens one already running (it keeps the later end), so Espina clavada's thorn stays; a turn without playing a card also counts as a turn without attacking. A harm passed to an enemy that can't act on it is lost; a pending lost action (e.g. the shirshu's paralysis) is an efecte negatiu and can be passed. "Els mateixos PV" (Lligam de dolor) means what the wounded one actually lost, doubled if it is glass. Raig redirigit's bolt is an undefended attack: it doubles against glass, breaks the statue and triggers the Lligam (a passed Lligam loss is not an attack, so no loop).

### Artífex × element (best card: Titella hidràulica)

Corda as in the landed kit.

| pairing | sum | card | type | thr | text | scene |
|---|---|---|---|---|---|---|
| Foc | 3 | Escarabat incandescent | Atac | 1+2 | Si fereix, s'hi enganxa. Corda 3: al final de cada torn qui el porta perd 1 PV; si qui el porta cau, salta a l'enemic que triïs, amb la corda que li queda. | You flick a red-hot clockwork beetle; it latches on, burning each round, and scuttles to a host you pick when its victim drops. |
| Foc | 5 | Braçal de guspires | Focus | 2+3 | Un aliat, o tu. Corda 3: quan un atac seu fereix, un cop per atac, un enemic a l'atzar perd 2 PV. | You clamp a wound-up flint bracer, fed by your flame, on an ally's arm; every blow that lands sprays sparks onto a random enemy. |
| Foc | 6 | Fanal enlluernador | Focus | 3+3 | Apunta un enemic. Corda 2: els seus atacs només fereixen la meitat, arrodonit avall; la corda baixa al final de cada torn. | You aim a clockwork lantern, blazing with your fire, into one enemy's eyes; dazzled, its blows land half-blind and half as hard. |
| Foc | 8 | Caldera explosiva | Focus | 4+4 | Puges 1 nivell de fatiga. Corda 3: al final de cada torn tria: la caldera guanya un dau, o esclata (ataca tots els enemics i s'atura). Si se li acaba la corda, esclata. | You wind a copper boiler and stoke it with your fire; each round you build the pressure or let the steam burst over every enemy. |
| Foc | 10 | Globus segrestador | Atac | 5+5 | Puges 2 nivells de fatiga. Si fereix, s'hi lliga i l'enlaira. Corda 3: mentre penja no pot actuar ni ser atacat; quan s'atura, cau sobre tots els enemics: ataca'ls amb els daus de la carta; ell no es pot defensar. | Your harpoon hooks a patchwork balloon onto the enemy and your flame fills it; it hangs helpless aloft, then crashes down among its friends. |
| Aigua | 2 | Xeringa de neu | Atac | 1+1 | Si fereix, queda fràgil: el proper atac que el fereixi li fa perdre 2 PV més. | You jab in a brass syringe and bend its water to snow inside the wound; the frozen flesh turns brittle and cracks deeper on the next hit. |
| Aigua | 4 | Campana de busseig | Defensa | 2+2 | Un aliat entra a la campana: aquest torn no pot actuar ni ser atacat; al final del torn en surt i recupera tants PV com treguin els daus de la carta. | You drop a brass diving bell over an ally and fill it with healing water you bend; sealed in for a round, they step out mended. |
| Aigua | 6 | Dipòsit de pressió | Defensa | 3+3 | Defensa un aliat i guarda el tir del primer atac que aguanti: al final del torn que triïs, ataca amb aquell tir fins a tres enemics. | A pressure tank on your back swallows the blow aimed at an ally, force and all; whenever you choose, its water jet hoses three foes. |
| Aigua | 8 | Cor de sínia | Focus | 4+4 | Puges 1 nivell de fatiga. Un aliat caigut s'aixeca amb 1 PV. Corda 3: al final de cada torn recupera 2 PV. | You strap a tiny waterwheel to a fallen ally's chest and bend water through it; it jolts them up, then mends them each round. |
| Aigua | 10 | Titella hidràulica | Atac | 5+5 | Puges 2 nivells de fatiga. Si fereix, s'hi tanca l'arnès. Corda 3: cada torn tries la carta que juga i els seus objectius, ell inclòs. | Your harness of hoses snaps shut around it and you drive water through its pistons; it fights as your puppet, even against itself. |
| Terra | 3 | Vagoneta desbocada | Atac | 1+2 | Si fereix, el mateix tir ataca un enemic a l'atzar, ell inclòs. | You bend a rail out of the ground and launch a loaded mine cart down it; it smashes the target and careens on, maybe back into it. |
| Terra | 4 | Cuirassa reactiva | Defensa | 2+2 | La cuirassa és teva. Corda 3: quan t'ataquen, aguantis o no, una placa de roca salta i ataca l'atacant amb els daus de la carta. | You strap on a clockwork cuirass plated with bent stone; whenever something strikes you, a plate springs off and slams back at the attacker. |
| Terra | 6 | Grilló i bola | Atac | 3+3 | Si fereix, li tanques el grilló. Corda 4: arrossega la bola de roca: cada torn actua l'últim i els seus atacs tenen −N. | You snap an iron shackle on it, chained to a boulder you tear from the ground; dragging it, it moves last and swings weakly. |
| Terra | 8 | Talp de ferro | Focus | 4+4 | Puges 1 nivell de fatiga. Corda 2: cada torn, just abans que es resolgui la carta de l'enemic que triïs, li surt de sota i l'ataca; si fereix, la carta no es resol. | You wind an iron mole and soften the earth ahead of it; each round it bursts under your chosen enemy mid-move and spoils it. |
| Terra | 10 | Martell de terratrèmols | Focus | 5+5 | Puges 2 nivells de fatiga. Corda 2: a l'inici de cada torn ataca tots els enemics; els que fereix, aquell torn juguen Cop desesperat en lloc de la seva carta. | You wind a piston hammer and earthbend through each blow; every round opens with a quake underfoot, and whoever it shakes drops their move and flails. |
| Aire | 2 | Libèl·lula de bambú | Atac | 1+1 | Corda 2: després plana sobre vosaltres; al final de cada torn ataca un enemic que triïs dels que us hagin atacat aquest torn. | You spin a bamboo dragonfly off your palm on a puff of air; after its strike it hovers over the group, diving at whoever attacked you. |
| Aire | 5 | Manxa de ginys | Focus | 3+2 | Cada giny teu que ataca o fa perdre PV a cada torn ho fa ara un cop més, sense gastar corda. | You pump a gust through your gadgets like a bellows; every one that fights spins its gears and acts once more, right now, without unwinding. |
| Aire | 7 | Estel de guerra | Defensa | 3+4 | Un aliat s'hi penja: aquest torn no el poden atacar, i el seu atac d'aquest torn fereix el doble. | You launch a war kite on a gust and an ally grabs the line; carried overhead out of reach, they dive in for a doubled blow. |
| Aire | 8 | Ales de rellotgeria | Defensa | 4+4 | Puges 1 nivell de fatiga. Un aliat. Corda 3: cada torn, els atacs contra ell fallen. | You strap clockwork wings on an ally and fill them with wind; they flit above every blow, and each one misses. |
| Aire | 10 | Tifó de manovella | Focus | 5+5 | Puges 2 nivells de fatiga. Corda 2: al final de cada torn, el tifó fa xocar l'enemic que triïs contra cadascun dels altres: per cada xoc, ell i l'altre reben un atac amb els daus de la carta; si està sol, en rep dos. | You crank a typhoon into life and steer it; each round it slams one enemy into all the others, or, alone, into the ground twice. |

### Acrobàcia × element (best card: Bola de bitlles)

| pairing | sum | card | type | thr | text | scene |
|---|---|---|---|---|---|---|
| Aigua | 2 | Bassal relliscós | Focus (fast) | 1+1 | Aquest torn, el primer enemic que ataqui queda a terra, i aquell atac té −2. | Cartwheeling, you fling a slick puddle across the floor; the first enemy to lunge at anyone slips and hits the ground before its blow lands. |
| Aigua | 4 | Dòmino | Defensa | 1+3 | Bloqueja un enemic. Si aguanta, l'atacant i un altre enemic que triïs queden a terra. | You roll under its blow and sweep a sheet of water at its feet; it skids into the enemy you pick and both go down. |
| Aigua | 7 | Bola de bitlles | Atac | 3+4 | Si l'objectiu és a terra, afecta també tots els altres enemics; els que fereix queden a terra. | You kick a downed enemy across a floor you slicken with water; it spins like a bowling ball and knocks every other enemy flat. |
| Aigua | 8 | Vuit sobre l'aigua | Atac | 5+3 | Puges 1 nivell de fatiga. Afecta dos enemics, i al final del torn els tornes a atacar; els que fereix queden a terra. | You skate a figure eight across bent water, kicking two enemies as you pass and again on the loop back; whoever you hit falls. |
| Aigua | 10 | Pirueta glaçada | Atac | 5+5 | Puges 2 nivells de fatiga. Afecta tots els enemics; els que ja eren a terra, si els fereix, perden les seves 2 accions següents. Després, tots queden a terra. | You pirouette across the field, freezing the ground in a spreading sheet; anyone already down is frozen fast, and everyone else skids flat. |
| Terra | 2 | Llosa basculant | Defensa | 1+1 | Bloqueja un enemic. L'atacant queda a terra, aguantis o no. | You flip backward off a slab you tilt under its feet; as it lunges, the slab tips and drops it, hit or miss. |
| Terra | 4 | Enterrar fins al coll | Atac | 2+2 | Si fereix un objectiu que és a terra, perd la seva acció següent. | You somersault onto a downed enemy and stamp the earth closed over it, burying it to the neck; it spends its next turn digging out. |
| Terra | 6 | Pilar ressort | Atac | 4+2 | No es pot defensar. L'objectiu i tu quedeu a terra. | A stone pillar springs you up and you crash down onto the target from above; nothing blocks it, and you both end up sprawled. |
| Terra | 8 | Corró esclafador | Atac | 3+5 | Puges 1 nivell de fatiga. Afecta l'objectiu i tots els enemics que són a terra; els que fereix queden a terra. | You curl inside a rolling stone drum and tumble over the target and every enemy already down, flattening whoever it catches. |
| Terra | 10 | Aliat projectil | Focus (very fast) | 5+5 | Puges 2 nivells de fatiga. Un aliat que encara no hagi atacat aquest torn surt volant: fins al final del torn no el poden atacar; llavors cau, el seu atac es resol contra tots els enemics i tots els enemics queden a terra. | You vault an ally onto a stone pillar that hurls them up; out of reach, they come down striking, splitting the ground under every enemy. |
| Foc | 2 | Doble de fum | Focus (fast) | 1+1 | Aquest torn, el primer atac contra tu falla, i el seu atacant perd 1 PV. | You backflip out of a puff of smoke that keeps your shape; the first blow strikes the smoke double, and its embers sting the attacker. |
| Foc | 4 | Flic-flacs explosius | Atac | 3+1 | Dos atacs, cadascun contra un enemic a l'atzar; els que fereix queden a terra. | You chain back handsprings, each landing blasting fire from your feet; the blasts throw two random enemies off their feet. |
| Foc | 6 | Llit de caliu | Atac | 2+4 | Si fereix, queda a terra; mentre hi sigui, perd 3 PV al final de cada torn. | You hook-kick it down onto a bed of embers you rake across the floor; every round it stays down, it burns. |
| Foc | 8 | Molinet de torxes | Defensa | 4+4 | Puges 1 nivell de fatiga. Bloqueja tots els enemics; els que t'ataquen queden a terra i perden 2 PV, aguantis o no. | You cartwheel through their blows with a torch in each hand; anyone who swings at you is swept down and scorched by the wheel of fire. |
| Foc | 10 | Catifa de foc | Atac | 5+5 | Puges 2 nivells de fatiga. Afecta tots els enemics; els que són a terra en reben el doble. | You cartwheel across the field unrolling a carpet of fire along the floor; it licks everyone, and anyone lying on it burns twice. |
| Aire | 2 | Patada en ventall | Atac | 1+1 | Afecta dos enemics, sense dany; els que supera queden a terra. | You spin a fan kick through two enemies; the gust off your heel knocks both off their feet without a scratch. |
| Aire | 4 | Estavellada | Defensa | 1+3 | Bloqueja un enemic. Si aguanta, l'atacant s'estavella: queda a terra i perd 2 PV. | You flip over its lunge and a gust at your back sends its charge on past you, slamming it into the ground. |
| Aire | 6 | Pilota humana | Atac | 4+2 | Afecta un enemic a l'atzar; si fereix, el mateix tir rebota a un altre a l'atzar, fins a 3 enemics. L'últim que fereix queda a terra. | You curl into a ball and a gust fires you at a random enemy; you ricochet from body to body, flattening the last one you hit. |
| Aire | 8 | Esmaixada al vol | Atac | 4+4 | Puges 1 nivell de fatiga. Si fereix, torna a perdre els mateixos PV i queda a terra. | You ride an updraft with it in your grip and spike it into the ground; the landing hurts as much as the blow. |
| Aire | 10 | Penjats del cel | Atac (fast) | 5+5 | Puges 2 nivells de fatiga. Afecta tots els enemics, sense dany; els que supera perden la seva acció d'aquest torn, i al final del torn perden N PV i queden a terra. | You swing on a trapeze of wind, snatching every enemy up into the air; dangling, they can't act, then the wind drops them hard. |

### Decisions for the user

- **One bloodbending puppet, or two?** Marioneta escarlata (Esgrima × Aigua) and Titella hidràulica (Artífex × Aigua) are the same play.
- **Cautery twice:** Cauteritzar la ferida (Esgrima × Foc, self) and Cauteritzar (Xi × Foc, ally; Segellar's old rule with fire as its lore).
- **Revives:** Boca a boca robat (Xi × Aire) and Cor de sínia (Artífex × Aigua) join Cop de vida.
- **Estel de guerra** (Artífex × Aire) plays like Aliat projectil (Acrobàcia × Terra): an ally flies out of reach and lands a bigger blow.
- **Campana de busseig** (Artífex × Aigua) sits close to Hivernació (Xi × Aigua).
- **A blast in Artífex:** Caldera explosiva (steam, not powder).
- **Reviewer-written images to confirm:** Pilar ressort's rider (target and you both floored).
- **Rulings:** is being swallowed an efecte negatiu (Segell de fang vs Engolir)?
- **For implementation:** the AI prices "a terra" at −0.1, so every Acrobàcia setup card will read as weak until that rises. Many of these statuses need `positionValue`. Finishers whose blows can't be defended (Martell de terratrèmols, Tifó de manovella, Sabre de tro) need small dice. Martell needs a round-start hook.

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
- *Mestre del xi:* Llegir el cos cut (title promised reading, card extended
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
- *Across kits:* Artífex 5 and Mestre del xi both reached for "ban that
  card"; Artífex keeps it (the gears eat it, literally), Punts owns body parts.

**Round 2 (v1 → v2).**
- *Acrobàcia:* Número de circ → Pirueta enlluernadora (a show is not a
  technique); Escalar els defensors breaks the climbed Defenses for the round
  instead of a bonus (it was fire's Vol propulsat plus a bonus); Cavalcar
  l'enemic trimmed (its "undefendable" clause was Esgrima's Bloqueig
  d'escorpí); Salt mortal's height declared at the reveal from a fixed menu
  (chosen at resolution it was a free max bonus against any unguarded target);
  Torre humana adds the dice of the Defenses covering you.
- *Mestre del xi:* rules.md §6 lets any heal raise the fallen, so card 3
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
- *Mestre del xi:* Tempesta de son decided a horde in round 1 and gave free
  setup rounds against a boss → sleepers wake on a coin flip each round, and
  sleep starts at round's end; Ofegar l'atac and Cop de vida swapped (raise,
  kill, sleep at the top); Desbloquejar doesn't free the swallowed or hung.
- *Artífex:* Trepant incansable inverted (it felt bad on a good roll and was
  dead against hordes: now it stays in while it wounds); Ballesta sentinella
  guards one ally (it read as a second Autòmat); Escut d'engranatges →
  Escut mastegador; Colós → Colós de butxaca; device rules written once.
- *For the user (Esgrima, approved, not changed):* a reviewer notes that
  **Punt feble** literally names the Mestre del xi skill and **Braç mort**
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

**Scene-test pass (2026-10-14).** The user could not picture Llançar un
aliat, Pirueta d'esquer or Cavalcar l'enemic, though they survived four review
rounds: every card must now pass the scene test (card-taste.md). Redesigns:

*Acrobàcia v5* — the acrobat floors bodies and plays on them. Kit rule **A
terra**: until the end of next round, attacks against it get +2.
Escombrada (A: if it wounds, on the ground) · Esquiva i traveta (D: if it
holds, the attacker on the ground) · Trampolí de mans (F, fast: an ally's Atac
this round resolves now; whoever it wounds on the ground — rule B, below) · Puntada d'espagat (A: two enemies) · Tombarella de
rescat (D: the first ally attacked) · Cavalcar l'enemic (A: if it wounds, next
round it can't attack you) · Trepitjar caps (A: every enemy; the last, chosen,
on the ground) · Salt mortal (A, 1 fatiga: height +2/+4/+6; if it's still
standing you lose that) · Malabars a puntades (A, 1 fatiga: while it wounds,
again, up to 4; then on the ground) · Capbussó suïcida (A, 2 fatiga: every
enemy; the wounded on the ground, and you too).

*Mestre del xi v5* — Cop al nervi (A: its next attack half damage) ·
Tancar la ferida (D: at round's end recover half the PV lost in it) ·
Despertar la força (F: an ally's or your next attack double damage) · Poder
apagat (A) · Abraçada paralitzant (D) · Ràfega de dits (A: three attacks; its
cards only roll dice one round per wound) · Cos titella (A: if it wounds, you
choose its next attack's target, itself included) · Cop de vida (F) · Toc de
la mort (A, 1 fatiga: at the end of next round it falls if under half PV) ·
Tempesta de son (A, 2 fatiga). Cut: Adormir el dolor, Ofegar l'atac.

*Artífex v5* — Bumerang (A) · Parany de molla (D) · Autòmat de corda (F) ·
Escut viu (A, fast: if it wounds, you haul it in front of you; the next attack
of another enemy on you this round hits it) · Paraigua d'acer (D: defends every
ally, but only from attacks that hit you all) · Ballesta sentinella (F: covers
an ally; shoots its first attacker each round, before the blow; three bolts) ·
Urpa elevadora (A) · Trepant incansable (A, 1 fatiga: jams on a 1 in 1d6) ·
Baldufa de ganivets (A, 1 fatiga: every enemy; it passes again each round's
end with one die less, until it falls) · Colós de butxaca (A, 2 fatiga: lands
on an enemy and stands before the group, taking every attack on you until it
falls, then crushes a random enemy). Cut: Escut mastegador, Xarxa de cadenes.
Device rules cut to two lines: the card stays face up while it works; one of
each device.

**The loop (2026-10-14): card-designer + a fresh card-taste per round.**

*Mestre del xi — final after three rounds* (round 3 found nothing structural).
Kit rule **Entumit**: until the end of next round, the damage it does is
halved (rounded down); if already numb, it only renews.
Cop al nervi (A: if it wounds, numb) · Pinça entumidora (D: block; if it
holds, the attacker numb) · Despertar el cop (F: you or an ally, next attack
double damage) · Poder apagat (A: if it wounds, next round its card has no
effect, only dice) · Dits clavats (D: block; if it holds, next round neither
of you plays a card) · Ràfega de dits (A: three attacks; two wounds numb,
three cancel its action this round) · Tocs en cadena (A: up to three enemies,
one roll; the wounded numb) · Cop de vida (F: a fallen ally rises with half
its starting PV, +1 fatigue) · Toc de la mort (A, 1 fatiga: if it wounds, at
the end of next round it falls if under half its starting PV) · Tempesta de
son (A, 2 fatiga: every enemy, no damage; the beaten fall asleep at round's
end until they lose PV or roll 11+ on a d20 at a round's start).

*Artífex — final (v8) after two rounds* (round 2 found no concept to change).
Kit rule **Corda N**: the card stays on the table with a die at N and can be
played again (rewinds it). The gadget attacks with the card's dice; each time
it acts, playing it included, it uses what the die shows, then the die drops
1; at 0 it stops. Self-running gadgets act at round's end; traps when sprung.
Bumerang (A: at round's end it returns onto a random enemy) · Parany de molla
(D: at an ally's feet until attacked; defends that attack, the attacker loses
3 PV) · Autòmat de corda (F: Corda 2, attacks a random enemy each round's end)
· Paraigua blindat (D: against attacks hitting several of you, defends the
whole group) · Escut viu (A, fast: if it wounds, this round other enemies'
attacks on you hit it, undefended) · Ballesta sentinella (F: aimed at an
enemy, Corda 3, shoots it just before each card it plays) · Trepant
incansable (A: ignores armour; if it wounds it sticks; Corda 3, wounds again
each round's end, undefended) · Baldufa de ganivets (A, 1 fatiga: every
enemy, dice = corda; Corda 3) · Colós de butxaca (D, 2 fatiga: Corda 3,
attacks on you resolve against its defense and spend 1; when it stops it
falls on a random enemy) · Taller desfermat (F, 2 fatiga: every corda gadget
onto the table, full, aimed as you choose, the drill already stuck; the
attackers attack now).

*Mestre del xi — cheap heal (2026-10-14, user request).* **Segellar la ferida**
(F, card 3, no fatigue) replaces Despertar el cop (parked): "Cura un aliat
dret, o tu, tants PV com li va treure l'últim cop que l'ha ferit." It undoes
one wound (big against a boss's blow, small against a horde's chip), and can't
raise the fallen, so Cop de vida (8) stays the only revive. A fresh reviewer
passed it.

*Artífex — round 3 (whole set at once): all ten pass.* Final Corda rule:
"la carta es queda a la taula amb un dau a N. Cada cop que el giny actua
(amb els daus de la carta), el dau baixa 1, també amb l'atac que fa en
jugar-la, si és un Atac; a 0, s'atura. Tornar-la a jugar li torna la corda.
Els ginys que van sols actuen al final del torn; els paranys, quan salten."
Ballesta sentinella: "Apunta un enemic. Corda 3: li dispara just abans que es
resolgui cada carta seva." Escut viu's art shows a spring grappling claw.
Approved by the user (2026-10-14).

*Artífex — slots 5 and 10 redone (user: "about the hook"; the finisher "should
be a gadget"):* **Ganxo salvavides** (D, picked by the user over the
reviewer's Ganxo arrossegador): "El primer atac contra un aliat aquest torn no
l'impacta: l'has estirat fora." **Boa mecànica** (A, 2 fatiga; name picked by
the user): "Puges 2 nivells de fatiga. Corda 4. Si fereix, s'hi enrosca:
mentre l'estreny no es pot defensar, i al final de cada torn l'ataca amb un
dau més que l'anterior." Parked: Bessó de llautó (a brass double copying your
cards: too many rulings), Estrebada de ganxo (air's Catapulta de vent).
Watch in simulation: Ganxo salvavides' guaranteed miss next to Paraigua
blindat's contested guard.

**Decision (2026-10-14): shared skills above level 6 in fantasy are accepted
unmeasured.** Fantasy's measurement caps heroes at HERO_LEVEL 6 (its longest
native kit), so a shared skill's cards 7-10 are measured only in elements. At a
real fantasy table a hero may still reach them; the encounter solver simulates
the real party, so each fight is fair even if the scoreboard doesn't cover it.
The native fantasy kits (4-6 cards) are to be filled to ten later.

*Mestre del xi — card 5 renamed by the user:* Dits clavats → **Bloqueig mutu**
(both of you are trapped). Toc de la mort's half-PV threshold is to be
replaced: variants are being simulated (user: "amazing concept").

*Acrobàcia — Trampolí de mans needs a rule (2026-10-14, awaiting the user).*
Numbers can't fix it (§45, §48). card-designer proposed A (the ally lands
and floors it, you strike after), B (the launched ally's attack resolves now;
if it wounds, the target is floored) and C (cannonball through two). The fresh
reviewer picks **B**: "Un aliat: el seu atac d'aquest torn es resol ara; si
fereix, l'objectiu queda a terra." (A stapled two effects and is dominant; C
fights its own title and copies cards 4, 7, 10.)

*Mestre del xi — user decisions (2026-10-14):*
- **Entumit** becomes a flat penalty: "Fins al final del torn següent, els
  seus atacs tenen −3." (N tuned by simulation; it only renews.) Replaces the
  halving.
- **Card 3: Desbloquejar el cos** replaces Segellar la ferida (whose rule had
  no lore): "Un aliat dret, o tu, recupera N PV i perd tots els efectes
  negatius." N below Bàlsam de lluna's ~7. Lore: the healer unblocks the flow
  and the body heals itself (acupressure, Avatar's chi paths, wuxia unsealing,
  Hokuto). rules.md gains "efecte negatiu": any state an enemy card left on you.
  Parked: Vida prestada (give your PV to an ally).
- **Tempesta de son:** a loss in the storm's own round doesn't wake (kept).
**The user picked B (2026-10-14), implemented as written** (NEXT-STEPS §49):
one ally, not yourself; when the Focus resolves, that ally's Atac this round,
if it has not resolved, resolves right after it, ahead of its own speed slot
(joining the launch's speed tier), with its own targets and dice; every target
it wounds (area attacks: each) is on the ground. Anything else — a Defensa, a
Focus, an attack already thrown — and the launch is wasted; a wounded acrobat
never launches (a Focus). The old +4 is gone.
