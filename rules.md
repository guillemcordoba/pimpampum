# Pim Pam Pum

Pim Pam Pum és un sistema de joc de rol de taula amb combat tàctic per equips.

## Característiques

Cada personatge té una sola característica base:

- **PV** (Punts de vida): els punts de vida que té el personatge abans de caure fora de combat. Els d'un heroi no són fixos: depenen del seu nivell i es deriven dels requisits (que els combats acabin a temps i que ningú no mori per un cop que no podia aturar); cada joc en fixa la taula per nivell. Els PV d'una criatura tampoc no són fixos: amb el seu nivell, són el que ajusta la dificultat d'un encontre. Surt de l'escala de daus (la unitat és 1d4: un atac de nivell 1 tira 1d4, i cada nivell en suma un punt de mitjana).

## Habilitats

Cada personatge té un conjunt d'habilitats, cadascuna amb un nivell. Exemples d'habilitats: Esgrima, Piromància, Furtivitat, Geomància, Ninjutsu de Foc, Tir amb Arc...

**Cada nivell d'una habilitat dona una acció nova.** El nivell d'una habilitat és, per tant, el nombre d'accions que el personatge coneix d'aquesta habilitat: un personatge amb Esgrima 3 coneix les 3 primeres accions d'Esgrima.

**Un heroi nou comença amb la seva habilitat principal a nivell 3**: coneix les tres primeres accions —un atac, una defensa i un Focus—, perquè des del primer combat pugui triar entre els tres tipus. Les habilitats que aprèn després comencen a nivell 1 (vegeu *Aprendre*).

## Accions

Les accions són les capacitats que un personatge pot fer servir, tant en combat com fora de combat. Cada acció pertany a una habilitat i s'aprèn quan l'habilitat arriba al seu nivell.

Cada acció té:
- **Habilitat**: l'habilitat associada.
- **Ràpida** (només algunes cartes): es resol abans que totes les altres (vegeu *Resolució de combat*).
- **Tipus**: Atac, Defensa o Focus.
- **Daus**: els daus que es tiren quan l'acció es resol (per exemple, 1d8, 2d6). Les accions d'atac tenen daus d'atac; les accions de defensa tenen daus de defensa.

### El nivell no entra a la tirada

**Tota tirada és els daus de la carta**, més les bonificacions de tirada i menys
la fatiga. El nivell d'una habilitat només diu quines cartes coneixes: un
personatge més entrenat és més fort perquè té més cartes, i les cartes que
s'aprenen més tard són més fortes, no perquè tiri més alt.

Val per a **tota tirada**: un atac, una defensa, un cop extra, una defensa que
s'aixeca sola (un mur), la tirada d'un giny, una tirada de resistència i les
tirades fora de combat.

### Accions d'atac

En revelar les cartes, cada atacant tria el seu objectiu, veient totes les cartes revelades. Quan l'atac es resol, tira els **daus d'atac** de l'acció (més els modificadors que tingui).

**El dany és el marge**: la tirada d'atac menys la tirada de defensa.

- Si l'objectiu està defensat, el defensor tira els **daus de defensa** de la seva acció. Si la defensa iguala o supera l'atac, la defensa aguanta i no passa res. Si l'atac supera la defensa, la diferència és el dany.
- Si l'objectiu no està defensat, l'atac impacta automàticament i el dany és la tirada d'atac sencera.

Del dany se'n resta l'**armadura passiva** de qui el rep (mínim 0), i el resultat es resta dels seus PV.

No hi ha cap tirada de dany separada: els daus de la carta són alhora la precisió i la potència de l'atac.

**Cops extra.** Un cop que no és una carta jugada — un contraatac, un segon atac, una envestida — és un atac com qualsevol altre: la fatiga, els murs i les cartes dels defensors hi compten, gasta les defenses que troba com qualsevol altre cop, i un contraatac en pot provocar un altre. Però no és jugar una carta: els efectes de la carta que l'ha provocat no s'hi tornen a aplicar. Un cop **retornat** (el cop aturat que es llança de nou) es resol amb el mateix total que tenia, sense afegir-hi res.

Quan una carta diu que un atac **fereix**, vol dir que fa dany: treu almenys 1 PV, un cop restada l'armadura. (Les cartes antigues que diuen «encerta» volen dir el mateix.)

### Accions de defensa

Quan una acció de defensa es resol, el defensor tria **a qui protegeix: ell mateix o un aliat**, veient a qui apunta cada atac. **Una defensa cobreix un sol cos**: qui protegeix un aliat queda descobert ell mateix (2026-11-02). El cos protegit queda cobert tot el torn: el defensor tira els daus de defensa **una sola vegada**, i aquesta tirada és la que troben tots els atacs que hi arribin.

- **Defensar un aliat**: els atacs dirigits a l'aliat defensat també es resolen contra la defensa del defensor. Si un atac penetra la defensa de l'aliat defensat, el dany el rep el **defensor**, no l'aliat.
- **Els atacs se sumen** (2026-11-13): cada cop que arriba a un cos **gasta** de les defenses que el cobreixen tant com ha tirat l'atac. El primer cop es resol contra la tirada sencera de la defensa; el següent, contra el que en queda (mai menys de 0), i així fins al final del torn. Dos atacs de 5 contra una defensa de 7: el primer queda aturat, el segon troba una defensa de 2 i fa 3 de dany. Així, els atacs sobre un mateix cos se sumen contra les defenses que el cobreixen: una defensa respon a un atac, no a tots. Compten on arriben de debò: un atac que un bloqueig desvia o que una redirecció canvia gasta la defensa del cos que el rep, i els cops extra també en gasten. El torn següent la defensa torna a ser sencera.
- **Defensa conjunta**: si diverses defenses cobreixen el mateix atac — més d'un defensor defensant el mateix aliat (la defensa pròpia de l'aliat inclosa, si també s'ha defensat) — formen un mur: l'atac es resol contra la **suma** de totes les seves tirades de defensa (o el que en quedi, si altres cops ja l'han gastat). Si l'atac la supera, el dany es **reparteix a parts iguals** entre els defensors del mur (2026-11-13); si no és exacte, el punt que sobra el rep qui ha tret la tirada individual més baixa. Cadascú resta la seva armadura de la seva part. Si el mur perd per 2 o menys, **tots** els defensors del mur poden pujar de nivell: han fallat junts, aprenen junts.

- **Defenses que es queden** (un mur de pedra, una cúpula): les tira qui les ha aixecat, com una defensa jugada — amb les seves bonificacions i la seva fatiga, i gastades pels cops com qualsevol altra —, i s'afegeixen a les altres defenses que cobreixen el cop en un mateix mur. Si el cop les penetra, el dany el rep qui protegeixen. Una defensa **ja tirada** (la bardissa d'acer, una trampa) manté el seu total, i els cops la gasten igual.

Una defensa no afecta les accions que ja s'han resolt abans (les ràpides).

### Accions de focus

Les accions de focus tenen efectes especials. Es resolen després dels atacs, i una acció de focus no es resol si, abans que es resolgui, el jugador rep dany durant aquest torn: qualsevol atac la pot interrompre (una de ràpida, només un atac ràpid).

## Resolució de combat

El combat consisteix en una sèrie de rondes:

1. Tots els jugadors trien una acció de la seva mà, la posen de cap per avall, i es revelen alhora.
2. **Els atacants apunten**: cada atac tria el seu objectiu, veient totes les cartes revelades.
3. Les accions es resolen per **prioritat**: primer les **ràpides** (defenses, després atacs, després focus) i després les altres: **defenses, atacs i focus**.
4. Dins d'un mateix pas, les accions es resolen alhora per a qui cau (dos atacs que es maten l'un a l'altre impacten tots dos); els efectes que una deixa per a una altra (un estat, una guàrdia, una cancel·lació) segueixen l'ordre en què els jugadors han decidit la carta: qui ha triat primer, primer.
5. Cada acció de defensa tria a qui protegeix quan es resol, veient on apunten els atacs, i a partir d'aleshores tira reactivament contra cada atac que arribi al cos que protegeix: ell mateix o l'aliat defensat, mai tots dos.
6. Les accions de focus es cancel·len si el jugador rep dany abans que l'acció es resolgui.
7. **Caure i tornar.** Un personatge que arriba a 0 PV cau fora de combat i, si la seva acció encara no s'ha resolt, no la juga. Una curació pot triar un aliat caigut: el torna al combat amb els PV curats, i si arriba abans que li toqui actuar, juga la seva acció d'aquesta ronda.

Un **efecte negatiu** és qualsevol estat que una carta enemiga t'ha deixat a sobre: penalitzacions, verí, cremades, marques, accions perdudes, son…

## Pujar de nivell

Després de cada tirada enfrontada (atac contra defensa, o una tirada fora de combat), el perdedor comprova el seu marge:

- **Perdre per 2 o menys**: l'habilitat puja un nivell (+1), i el personatge aprèn la següent acció de l'habilitat.

Només s'aprèn dels fracassos ajustats: quedar-te a un pèl de superar el repte és el que més t'ensenya. Guanyar no ensenya res (ja en saps prou), i perdre per molt vol dir que el repte et queda massa gran per treure'n res.

## Fatiga

La fatiga és un **nivell** de 0 a 5 que porta cada jugador. Jugar cartes no cansa — llevat de les poques cartes que ho diuen al seu text (Entrar en Fúria: l'esgotament després de la fúria és el seu preu, i Esgotat no es pot jugar) —: és el **màster** qui decideix quan un personatge puja de nivell, segons la ficció — un segon combat sense respir, una marxa forçada, una nit sense dormir, fred o gana, una ferida sense curar, caure a 0 PV —, i pot fer-lo pujar més d'un nivell de cop. Un nivell mai és el càstig d'una tirada dolenta: és el pes del temps i del desgast.

| Nivell | Nom | Efecte |
|---|---|---|
| 0 | Fresc | — |
| 1 | Cansat | −1 a totes les tirades |
| 2 | Fatigat | −2 |
| 3 | Extenuat | −3 |
| 4 | Exhaust | −4 |
| 5 | Esgotat | −5 |

El nivell resta el seu valor a **totes** les tirades del personatge: atac, defensa, focus i tirades fora de combat. Un sol número, sense excepcions.

Cada nivell fa cada combat aproximadament **un grau més difícil** (mesurat: un combat de 65% per al grup passa a ~49% amb tot el grup Cansat, a ~31% Fatigat i a ~6% Esgotat). No és un detall de color: el màster dóna nivells com qui puja la dificultat.

Només un **descans llarg de 4 hores o més** neteja la fatiga, i la neteja tota de cop. No hi ha recuperació parcial.

**Els enemics no tenen mai fatiga.** És una eina del màster sobre els jugadors.

L'esgotament de cartes no et deixa mai sense opcions: quan no pots jugar cap altra carta (totes consumides o bloquejades), entra a la teva mà el **Cop desesperat**, una carta universal — un atac feble (1d4) que et fa perdre PV després de l'atac, encertis o no (2 al joc de fantasia, 1 a Els Quatre Elements).

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
Armadura de cuir: +2 d'armadura. Armadura de ferro: +3 d'armadura. (Abans costaven velocitat; sense velocitat, el seu preu està pendent de revisar.)

## Canvis d'equipament

Fora de combat, els jugadors es poden intercanviar objectes entre ells i canviar les accions actives per accions que ja havien après anteriorment. Els jugadors no es poden intercanviar habilitats entre ells.

## Fora de combat

Qualsevol acció es pot fer servir per superar un repte fora de combat.

El màster posa una dificultat. Qui l'intenta tira:

> **1d20 + els daus de l'acció**

Igualar-la o superar-la és un èxit. **Sense cap habilitat que hi encaixi, tires
només el 1d20.** La fatiga hi resta, com a totes les tirades.

### Aprendre

**Si falles per 1 o 2, l'habilitat puja un nivell.** Si és una habilitat que no
tenies, la comences a nivell 1.

> En Roc clava cops a un arbre amb una espasa que ha trobat. Dificultat 10, treu
> un 9. L'arbre continua dret; ara té Esgrima 1.
