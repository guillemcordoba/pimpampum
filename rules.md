# Pim Pam Pum

Pim Pam Pum és un sistema de joc de rol de taula amb combat tàctic per equips.

## Característiques

Cada personatge té una sola característica base:

- **PV** (Punts de vida): els punts de vida que té el personatge abans de caure fora de combat. El valor inicial per defecte és provisionalment **12**, pendent d'ajustar quan es calibri la durada desitjada dels combats.

## Habilitats

Cada personatge té un conjunt d'habilitats, cadascuna amb un nivell. Exemples d'habilitats: Esgrima, Piromància, Furtivitat, Geomància, Ninjutsu de Foc, Tir amb Arc...

**Cada nivell d'una habilitat dona una acció nova.** El nivell d'una habilitat és, per tant, el nombre d'accions que el personatge coneix d'aquesta habilitat: un personatge amb Esgrima 3 coneix les 3 primeres accions d'Esgrima.

## Accions

Les accions són les capacitats que un personatge pot fer servir, tant en combat com fora de combat. Cada acció pertany a una habilitat i s'aprèn quan l'habilitat arriba al seu nivell.

Cada acció té:
- **Habilitat**: l'habilitat associada.
- **Velocitat**: un valor que determina quan es resol l'acció (més alt = es resol primer).
- **Tipus**: Atac, Defensa o Focus.
- **Daus**: els daus que es tiren quan l'acció es resol (per exemple, 1d8, 2d6). Les accions d'atac tenen daus d'atac; les accions de defensa tenen daus de defensa.

### Accions d'atac

Quan es resol una acció d'atac, l'atacant tria un objectiu i tira els **daus d'atac** de l'acció (més els modificadors que tingui).

**El dany és el marge**: la tirada d'atac menys la tirada de defensa.

- Si l'objectiu està defensat, el defensor tira els **daus de defensa** de la seva acció. Si la defensa iguala o supera l'atac, la defensa aguanta i no passa res. Si l'atac supera la defensa, la diferència és el dany.
- Si l'objectiu no està defensat, l'atac impacta automàticament i el dany és la tirada d'atac sencera.

Del dany se'n resta l'**armadura passiva** de qui el rep (mínim 0), i el resultat es resta dels seus PV.

No hi ha cap tirada de dany separada: els daus de la carta són alhora la precisió i la potència de l'atac.

### Accions de defensa

Quan una acció de defensa es resol, el defensor tria un objectiu: un **aliat** (defensar) o un **enemic** (bloquejar). En tots dos casos, el defensor es defensa a si mateix: tira els daus de defensa per separat contra cada atac que rebi durant el torn.

- **Defensar un aliat**: els atacs dirigits a l'aliat defensat també es resolen contra la defensa del defensor. Si un atac penetra la defensa de l'aliat defensat, el dany el rep el **defensor**, no l'aliat.
- **Bloquejar un enemic**: els enemics bloquejats fan totes les seves tirades d'atac contra el defensor. Els atacs que no trien objectiu (com els que afecten tots els enemics) no en són afectats.
- **Defensa conjunta**: si diverses defenses cobreixen el mateix atac — més d'un defensor defensant el mateix aliat (la defensa pròpia de l'aliat inclosa, si també s'ha defensat), o més d'un bloquejant el mateix enemic — formen un mur: l'atac es resol contra la **suma** de totes les seves tirades de defensa. Si l'atac supera la suma, el dany (el marge menys l'armadura) el rep el defensor que ha tret la tirada individual més baixa. Si el mur perd per 2 o menys, **tots** els defensors del mur poden pujar de nivell: han fallat junts, aprenen junts.

Com que els objectius es trien quan cada acció es resol, una defensa no afecta les accions que ja s'han resolt abans (per ser més ràpides).

### Accions de focus

Les accions de focus tenen efectes especials. Normalment són lentes (velocitat baixa). Una acció de focus no es resol si, abans que es resolgui, el jugador rep dany durant aquest torn.

## Resolució de combat

El combat consisteix en una sèrie de rondes:

1. Tots els jugadors trien una acció de la seva mà, la posen de cap per avall, i es revelen alhora.
2. Les accions es resolen per ordre de velocitat (de més alta a més baixa). Les penalitzacions de velocitat per armadura pesada s'apliquen.
3. En cas d'empat de velocitat, les accions es resolen simultàniament (ambdós impacten).
4. Cada acció de defensa tria el seu objectiu (aliat a defensar o enemic a bloquejar) quan es resol, i a partir d'aleshores tira reactivament contra cada atac que arribi al defensor o al seu aliat defensat.
5. Les accions de focus es cancel·len si el jugador rep dany abans que l'acció es resolgui.

## Pujar de nivell

Després de cada tirada enfrontada (atac contra defensa, o una tirada fora de combat), el perdedor comprova el seu marge:

- **Perdre per 2 o menys**: l'habilitat puja un nivell (+1), i el personatge aprèn la següent acció de l'habilitat.

Només s'aprèn dels fracassos ajustats: quedar-te a un pèl de superar el repte és el que més t'ensenya. Guanyar no ensenya res (ja en saps prou), i perdre per molt vol dir que el repte et queda massa gran per treure'n res.

## Fatiga

Cada acció té un cost de fatiga: **1 per defecte**; les accions esgotadores en costen més (indicat a la carta). Cada cop que jugues una acció, dins o fora de combat, sumes el seu cost al teu comptador de fatiga.

La fatiga màxima és **20** (provisional, pendent d'ajustar perquè un dia aguanti 2-3 combats): no pots jugar una acció que te la faria superar. **Dormir una nit neteja tota la fatiga.**

La fatiga no afecta mai les tirades: és el pressupost d'energia del dia.

L'esgotament no et deixa mai sense opcions: quan no pots jugar cap altra carta, entra a la teva mà el **Cop desesperat**, una carta universal que no costa fatiga — un atac feble (1d4, lent) que et fa perdre 1 PV després de l'atac, encertis o no.

## Objectes i equipament

Els personatges poden portar objectes passius que modifiquen les seves capacitats. El sistema d'espais d'equipament és:
- **Tors**: armadura de cos
- **Cap**: casc
- **Braços**: bracals, guants
- **Cames**: pantalons, botes
- **Mà principal**: arma principal
- **Mà secundària**: escut, arma secundària

Només es pot portar un objecte per espai. Els objectes poden donar:
- **Armadura passiva**: reducció plana del dany a cada impacte rebut.
- **Bonificacions de tirada**: modificadors que se sumen a les tirades d'atac o de defensa de certes accions.
- **Penalització de velocitat**: les armadures pesades redueixen la velocitat de totes les accions del portador.

La decisió entre armadura pesada (més protecció, més lent) i armadura lleugera (menys protecció, sense penalització) és una elecció tàctica important.

## Canvis d'equipament

Fora de combat, els jugadors es poden intercanviar objectes entre ells i canviar les accions actives per accions que ja havien après anteriorment. Els jugadors no es poden intercanviar habilitats entre ells.

## Fora de combat

Les accions es poden fer servir fora de combat per fer tirades d'habilitat. El director de joc (DM) estableix un nivell de dificultat per a la tasca. Es tiren els daus de l'acció (més modificadors) contra la dificultat. Les regles de pujar de nivell s'apliquen igualment.
