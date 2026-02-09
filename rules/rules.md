# Pim Pam Pum

Pim Pam Pum és un sistema de combat per a jocs de rol de taula (DnD). 

Cada jugador té les següents característiques base representades amb un número:
MF: màximes ferides que pot acumular abans de morir. Els MF van des de 2 a 8.
V: velocitat
F: força 
D: defensa
M: màgia

Cada jugador pot portar objectes passius que modifiquin aquestes característiques. Hi ha items que no ocupen espai, i hi ha objectes que sí. Per exemple, només es pot portar un pantaló, un casc, una armadura, i una arma a cada mà. Hi ha armes de doble mà, no se'n pot portar dos alhora.

El combat consisteix en una sèrie de rondes. Cada jugador tindrà una mà de cartes d'acció, que poden ser cartes d'objectes i cartes d'habilitats. Sempre que s'hagi de calcular el valor final d'una característica, es farà de la següent manera:

Característica final = Característica base + modificadors d'objectes passius + modificador d'acció + modificadors de combat

En cada ronda, els jugadors trien una carta de la mà, la posen de cap per vall, i les revelen alhora. Les cartes es resolen per ordre de velocitat. Cada carta pot tenir:
- Modificador de característica:
  - Velocitat
  - Defensa: només cartes de defensa
  - Força i màgia: només cartes d'atac
- Modificador característica a ell mateix o a altres jugadors per la resta del combat.
- Efectes especials.


## Cartes d'atac

Hi ha cartes d'atac físiques i màgiques. Quan es resol una carta d'acció d'atac, el jugador atacant tria el jugador atacat. El jugador atacat rep una ferida si la força o màgia és més gran que la defensa, després de sumar tots els modificadors i daus.


## Cartes de defensa

Quan es resol una carta de defensa, el jugador defensant tria a un jugador defensat. El proper atac que rebi l'aliat triat durant aquest torn el rebràs tu. Si múltiples jugadors defensen al mateix jugador, cada carta de defensa protegeix contra un únic atac (no s'acumulen).


Fora de combat, els jugadors es poden canviar les cartes que porten actives. Es poden intercanviar els objectes entre ells, i canviar les habilitats actives per habilitats que ja havien après anteriorment. Els jugadors no es poden canviar habilitats entre ells.

## Cartes de focus

Són cartes amb efectes especials. La carta de focus no es resol si, abans que es resolgui, el jugador rep un atac durant aquest torn.
