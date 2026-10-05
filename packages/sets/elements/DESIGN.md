# Els Quatre Elements — design

A second content set for Pim Pam Pum: a world where water, earth, fire and air
have benders, inspired by *Avatar: The Last Airbender* / *The Legend of Korra*,
with a final villain modelled on Pain (*Naruto*). Same engine, same rules, its
own cards. Names are Catalan and original; the inspirations are listed so the
lore can be checked, not copied.

This file is the **why** of every kit. The numbers live on the cards
(`src/players/skills/`, `src/enemies/creatures/`), and what was measured, and
when, lives in `NEXT-STEPS.md` §42.

## The world in one paragraph

Four peoples, each bending one element through a martial art: water through
flow (tai chi — absorb and redirect), earth through rooted waiting (hung gar —
listen, then strike), fire through breath and drive (northern shaolin — press
forward), air through evasion (baguazhang — circle, never meet force). The air
monasteries are gone. Out of their ruin came **el Senyor de la Por**, who rules
through six borrowed bodies and teaches that only fear keeps the peace. Nobody
alive knows he was once an air novice.

## Design pillars

1. **Each element plays like its martial art.** Water wins the exchange by
   redirecting it; earth stands and outlasts; fire presses and sweeps; air is
   never where the blow lands. You should recognise the element from how its
   cards *behave*, not from their names.
2. **Bending can be cut.** Chi-blockers, archers who pin, stone gloves that
   grab: the world's non-benders fight by *shutting things down*, not by
   out-damaging benders. That is also the villain's language.
3. **Fear divides and silences.** The villain splits the party (nobody can
   protect you; your blows land on your friends) and takes cards out of their
   hands for a turn. Every such effect is short, comes from a card that can be
   read, and has an answer in a player kit built for it (Chakres). A shutdown
   that cannot be answered is not a mechanic, it is a loss screen.
4. **Fights here are short** (a median of three or four rounds), so a card that
   pays later has to pay big and soon. Set up, then execute — never "a little
   bonus for the rest of the fight".

## Player kits

Five mains — the four elements and the chi-blocker — and two complementary
kits, designed as second skills.

### Mestre de l'aigua — `waterbender`
*Flow. You do not stop a wave, you turn it.*
- **Fuet d'aigua** — the quick whip.
- **Desviar el corrent** — tai chi: a blocked blow comes back for the margin
  you won by (capped — a wall of blockers would otherwise return the whole
  wall's margin). The better the read, the harder the return.
- **Aigua sanadora** — water is life; it can stand a fallen ally back up.
- **Presó de gel** — ice round the arms: no attacks next turn.
- **Domini de la sang** — the forbidden art (Hama): an enemy's blows land on
  their own side. Its taboo is paid in the bender's own blood.

### Mestre de la terra — `earthbender` (moved from the fantasy set)
*Wait. Listen. Then answer, head-on.*
- The fantasy set's four cards (Cop de roca, Mur de pedra, Columna de terra,
  Presó de terra), retuned for this set's shorter fights.
- **Dominar el metall** (new) — Toph's answer to a world that wears iron: it
  ignores armour, and an armoured target cannot defend against it.

### Mestre del foc — `firebender`
*Breath. Drive. Never step back.*
- **Puny de foc** — the fast jab.
- **Mur de flames** — even fire's defense burns whoever strikes it.
- **Arc de foc** — a sweep through two.
- **Alè de drac** — the breath is the fire: everyone in front of you burns.
- **Llamp** — the cold-blooded fire. A Focus on purpose: lightning needs calm,
  and a Focus that is hurt before it resolves never leaves the fingers. When it
  does, nothing guards it.

### Mestre de l'aire — `airbender`
*Never be where the blow lands.*
- **Palmell d'aire** — light and very fast. *Its twin is the villain's first
  card.*
- **Esquivar en espiral** — a dodge that leaves you faster next turn.
- **Escúter d'aire** — hit and gone: after the strike, nobody can reach you
  this turn (never two turns running).
- **Cicló** — everyone, lightly.
- **Esfera d'aire** — the signature: one guard over three allies.

### Bloquejador de chi — `chi-blocker` (non-bender)
*Seven points, and the strongest bender is just a person.*
- **Cops de punt** — two blows in one.
- **Salt acrobàtic** — a dodge that leaves the attacker's arm numb.
- **Bloqueig de chi** — slips between guards to the point: no bending (Focus)
  and no defense for two turns.
- **Braç adormit** — no attacks for two turns.
- **Desconnexió** — the whole body: the next turn is lost.
- The ladder separates by *duration*: locks are long and partial, the stun is
  short and total.

### Els set chakres — `chakra` (complementary)
*Guru Pathik's seven pools. Fear blocks the first.*
- **Obrir el chakra de la terra** — strips fear and every harm, and for a turn
  no new one takes hold. The exact opposite of the villain's last card.
- **Obrir el chakra del cor** — love as a body between a friend and the blow.
- **Obrir el chakra del pensament** — the whole party sharper next turn.

### Enginy — `enginy` (complementary, non-bender)
*No bending, so plan better than the benders.*
- **Bumerang** — it always comes back.
- **Bomba de fum** — the party is harder to hit this turn.
- **Pla de batalla** — everyone hits harder next turn.

## Enemies

A creature is a name, an icon, a kit and a bulk (`∛(kg/70)`); PV is solved.

| creature | inspiration | how it fights |
|---|---|---|
| Soldat del foc | fire-nation soldiers | spear lines; every soldier still standing adds to the volley |
| Arquer de la muralla | Yuyan archers | pins you to the wall: no attack, no defense — shutdown, not damage |
| Agent de pedra | Dai Li | stone gloves drag you out of reach of protection; melts into walls |
| Acròbata del chi | Ty Lee | cuts bending for two turns |
| Artiller del tercer ull | Combustion Man | a huge blast — a Focus, so hit his forehead first |
| Shirshu | the shirshu | a paralysing tongue; a pack beast |
| Titellaire de sang | Hama | turns heroes against each other |
| Koh, el lladre de rostres | Koh | punishes everyone who struck at him last turn: show nothing |
| Serp de les marees | the Unagi | a spout over the whole deck; dives out of reach |

A lone monster has to answer a block wall (blocks sum), so the boss-sized
creatures carry a sweep or a punishment a wall cannot stop.

## The villain: el Senyor de la Por and the Sis Rostres

Pain's structure: six bodies, each holding one of his powers, and a hidden,
wasted controller who cannot be reached while any of them stands.

| body | path | what it does |
|---|---|---|
| Rostre de l'Empenta | Deva | pushes everything away (then needs a breath: no guard next turn), pulls one hero out of formation |
| Rostre de Ferro | Asura | iron arms through three, a missile |
| Rostre de l'Ànima | Human | a hand on your head: two turns lost, if it is not hurt first |
| Rostre de les Bèsties | Animal | calls fear-beasts, half as tough as itself |
| Rostre Famolenc | Preta | drinks what it blocks |
| Rostre de l'Infern | Naraka | stands a fallen body back up |
| **El Senyor de la Por** | Nagato | unreachable while a body stands; fear cards |

**His fear:** Palmell del buit (nobody can protect the one it hits) → Onada de
terror (nobody can protect anyone) → Paràlisi de la por (defend, or nothing) →
Desconfiança (your blows land on your friends) → Segellar el chakra de la terra
(no Focus for anyone).

**The standard encounter fields three bodies** — the push, the soul and the
one that raises the others — plus the Senyor. A fight of about five rounds only
holds so much enemy health, and spread over all seven bodies it solved to a
handful of PV each: a horde, not a villain. All six bodies at once is the
nightmare variant (`NIGHTMARE` in `src/bench/shapes.ts`).

**How the heroes win** (Pain's weaknesses, kept): bait the push, then strike
in its gap; kill the Rostre de l'Infern first or the others keep standing back
up; hurt the slow bodies before they resolve; open the earth chakra against the
fear.

**The Easter eggs (he was an air novice):**
- *Palmell del buit* is *Palmell d'aire*'s twin: same icon, speed and dice.
- *Empenta universal* — Shinra Tensei is a repulsion, i.e. airbending — is
  drawn with the air kit's wind icon.
- His last card seals the very chakra the Chakres kit's first card opens.
- His description: a shaved head, and burn scars where the arrows should be.
- He wears the air kit's colour (`classCss: 'aire'`).
