# Pim Pam Pum

Pim Pam Pum és un sistema de joc de rol de taula amb combat tàctic per equips.

## Característiques

Cada personatge té una sola característica base:

- **PV** (Punts de vida): els punts de vida que té el personatge abans de morir. Els personatges de jugador comencen amb **20 PV** per defecte (la mida ho modifica).

## Mida

Cada personatge tria una mida en crear-se (per defecte, Mitjà). La mida és una elecció lliure: no compta per a l'equilibri de sumes de nivells d'habilitat.

- **Gran**: +3 PV, −1 de velocitat a totes les accions.
- **Mitjà**: sense modificadors.
- **Petit**: −3 PV, +1 de velocitat a totes les accions.

El modificador de velocitat s'acumula amb les penalitzacions de velocitat de l'armadura.

## Habilitats

Cada personatge té un conjunt d'habilitats, cadascuna amb un nivell entre 1 i 100. Exemples d'habilitats: Esgrima, Piromància, Furtivitat, Geomància, Ninjutsu de Foc, Tir amb Arc...

Quan una habilitat puja de nivell, pot desbloquejar noves accions.

## Accions

Les accions són les capacitats que un personatge pot fer servir, tant en combat com fora de combat. Cada acció pertany a una habilitat i es desbloqueja quan l'habilitat arriba a un cert nivell.

Cada acció té:
- **Habilitat**: l'habilitat associada.
- **Velocitat**: un valor que determina quan es resol l'acció (més alt = es resol primer).
- **Tipus**: Atac, Defensa o Focus.

### Accions d'atac

Les accions d'atac tenen, a més:
- **Daus de dany**: els daus que es tiren quan l'atac impacta (per exemple, 1d8, 2d6).

Quan es resol una acció d'atac, l'atacant tria un objectiu. Es fa una tirada d'habilitat:

- **Atacant**: d20 + nivell d'habilitat + modificadors de l'acció
- **Defensor** (si té una acció de defensa activa): d20 + nivell d'habilitat de defensa + modificadors de defensa
- **Sense defensa**: l'atac impacta automàticament.

Si el total de l'atacant supera el del defensor (o si no hi ha defensa), l'atac impacta. Es tiren els daus de dany de l'acció, es resta l'armadura passiva de l'objectiu, i el resultat (mínim 0) es resta dels PV.

### Accions de defensa

Quan un jugador juga una acció de defensa, tria un aliat a defensar. Tots els atacs dirigits a l'aliat defensat o al defensor es resolen contra la tirada de defensa del defensor (d20 + habilitat de defensa + modificadors).

El defensor tira per separat contra cada atac que rebi ell o l'aliat defensat durant el torn. Si un atac penetra la defensa de l'aliat defensat, el dany el rep el defensor, no l'aliat.

### Accions de focus

Les accions de focus tenen efectes especials. Normalment són lentes (velocitat baixa). Una acció de focus no es resol si, abans que es resolgui, el jugador rep un atac sense defensa durant aquest torn.

## Resolució de combat

El combat consisteix en una sèrie de rondes:

1. Tots els jugadors trien una acció de la seva mà, la posen de cap per avall, i es revelen alhora.
2. Les accions es resolen per ordre de velocitat (de més alta a més baixa). Les penalitzacions de velocitat per armadura pesada i el modificador de mida s'apliquen.
3. En cas d'empat de velocitat, les accions es resolen simultàniament (ambdós impacten).
4. Cada acció de defensa es resol reactivament quan un atac arriba al defensor o al seu aliat defensat.
5. Les accions de focus es cancel·len si el jugador rep un impacte abans que l'acció es resolgui.

## Pujar de nivell

Després de cada tirada d'habilitat (atac, defensa, o fora de combat), es comprova el marge:

- **Fallar per menys de 10**: l'habilitat puja un nivell (+1).

Només s'aprèn dels fracassos ajustats: quedar-te a prop de superar el repte és el que més t'ensenya. Encertar no ensenya res (ja en saps prou), i els fracassos catastròfics (fallar per 10 o més) són massa aclaparadors per aprendre'n.

## Objectes i equipament

Els personatges poden portar objectes passius que modifiquen les seves capacitats. El sistema d'espais d'equipament és:
- **Tors**: armadura de cos
- **Cap**: casc
- **Braços**: bracals, guants
- **Cames**: pantalons, botes
- **Mà principal**: arma principal
- **Mà secundària**: escut, arma secundària

Només es pot portar un objecte per espai. Els objectes poden donar:
- **Armadura passiva**: reducció plana de dany a cada impacte rebut.
- **Bonificacions d'habilitat**: millores al nivell d'habilitat en certes accions.
- **Penalització de velocitat**: les armadures pesades redueixen la velocitat de totes les accions del portador.

La decisió entre armadura pesada (més protecció, més lent) i armadura lleugera (menys protecció, sense penalització) és una elecció tàctica important.

## Canvis d'equipament

Fora de combat, els jugadors es poden intercanviar objectes entre ells i canviar les accions actives per accions que ja havien après anteriorment. Els jugadors no es poden intercanviar habilitats entre ells.

## Fora de combat

Les accions es poden fer servir fora de combat per fer tirades d'habilitat. El director de joc (DM) estableix un nivell de dificultat per a la tasca. Es tira d20 + nivell d'habilitat + modificadors contra la dificultat. Les regles de pujar de nivell s'apliquen igualment.

## Descans

Entre combats, els jugadors poden descansar per recuperar vides:

- **Descans curt**: cada jugador recupera 1 PV.
- **Descans llarg**: cada jugador recupera tots els PV.

El DM decideix quan els jugadors poden fer un descans curt o llarg.
