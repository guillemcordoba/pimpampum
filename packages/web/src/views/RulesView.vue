<script setup lang="ts">
import CardGrid from '../components/cards/CardGrid.vue';
import RulesCard from '../components/cards/RulesCard.vue';
import CharacterSheet from '../components/cards/CharacterSheet.vue';
</script>

<template>
  <div class="rules-page">
    <h1 class="screen-title no-print">Regles</h1>
    <p class="screen-subtitle no-print">Mecàniques de combat de Pim Pam Pum</p>

    <div class="rules-content no-print">
      <section>
        <h2>Característica base</h2>
        <p>Cada personatge té una sola característica base:</p>
        <ul>
          <li><strong>PV</strong> (Punts de vida): els punts de vida abans de caure fora de combat. Els jugadors comencen amb 12 PV per defecte.</li>
        </ul>
      </section>

      <section>
        <h2>Habilitats i accions</h2>
        <p>Cada personatge té un conjunt d'<strong>habilitats</strong>. Cada nivell d'una habilitat dona una <strong>acció</strong> nova: el nivell és el nombre d'accions que el personatge coneix d'aquesta habilitat (Esgrima 3 = les 3 primeres accions d'Esgrima).</p>
        <p>Cada acció pertany a una habilitat i té una <strong>velocitat</strong> (determina quan es resol), un <strong>tipus</strong> (Atac, Defensa o Focus) i uns <strong>daus</strong>: daus d'atac per a les accions d'atac, daus de defensa per a les de defensa.</p>
      </section>

      <section>
        <h2>Rondes de combat</h2>
        <ol>
          <li>Cada jugador tria una acció i la posa de cap per avall.</li>
          <li>Es revelen totes les accions alhora.</li>
          <li>Es resolen per ordre de velocitat (de més alta a més baixa). En cas d'empat, es resolen simultàniament.</li>
        </ol>
      </section>

      <section>
        <h2>Accions d'atac</h2>
        <p>L'atacant tria un objectiu i tira els daus d'atac de l'acció (més els modificadors). <strong>El dany és el marge</strong>:</p>
        <p class="formula">dany = tirada d'atac − tirada de defensa</p>
        <p>Si l'objectiu està defensat, el defensor tira els seus daus de defensa: si iguala o supera l'atac, la defensa aguanta i no passa res; si l'atac supera la defensa, la diferència és el dany. Si l'objectiu <strong>no</strong> està defensat, l'atac impacta automàticament i el dany és la tirada d'atac sencera.</p>
        <p>Del dany se'n resta l'<strong>armadura passiva</strong> de qui el rep (mínim 0), i el resultat es resta dels seus PV. No hi ha tirada de dany separada: els daus de la carta són alhora la precisió i la potència de l'atac.</p>
      </section>

      <section>
        <h2>Accions de defensa</h2>
        <p>El defensor tria un objectiu: un <strong>aliat</strong> (defensar) o un <strong>enemic</strong> (bloquejar). En tots dos casos es defensa a si mateix: tira els daus de defensa per separat contra cada atac que rebi durant el torn.</p>
        <ul>
          <li><strong>Defensar un aliat</strong>: els atacs dirigits a l'aliat defensat també es resolen contra la defensa del defensor. Si un atac penetra, el dany el rep el <strong>defensor</strong>, no l'aliat.</li>
          <li><strong>Bloquejar un enemic</strong>: els enemics bloquejats fan totes les seves tirades d'atac contra el defensor. Els atacs que no trien objectiu (com els que afecten tots els enemics) no en són afectats.</li>
        </ul>
        <p>Com que els objectius es trien quan cada acció es resol, una defensa no afecta les accions que ja s'han resolt abans (per ser més ràpides).</p>
      </section>

      <section>
        <h2>Accions de focus</h2>
        <p>Efectes especials, normalment lents. Una acció de focus <strong>es cancel·la</strong> si el jugador rep dany abans que es resolgui.</p>
      </section>

      <section>
        <h2>Pujar de nivell</h2>
        <p>Després de cada tirada enfrontada, el perdedor comprova el seu marge:</p>
        <ul>
          <li><strong>Perdre per 2 o menys</strong>: l'habilitat puja un nivell (+1) i el personatge aprèn la següent acció de l'habilitat.</li>
        </ul>
        <p>Només s'aprèn dels fracassos ajustats: guanyar no ensenya res, i perdre per molt vol dir que el repte et queda massa gran.</p>
      </section>

      <section>
        <h2>Fatiga</h2>
        <p>Cada acció té un <strong>cost de fatiga</strong>: 1 per defecte; les accions esgotadores en costen més (indicat a la carta). Cada cop que jugues una acció, dins o fora de combat, sumes el seu cost al teu comptador.</p>
        <p>La fatiga màxima és <strong>20</strong>: no pots jugar una acció que te la faria superar. <strong>Dormir una nit</strong> neteja tota la fatiga. La fatiga no afecta mai les tirades: és el pressupost d'energia del dia.</p>
        <p>Quan no pots jugar cap altra carta, entra a la teva mà el <strong>Cop desesperat</strong>: un atac feble (1d4, lent) que no costa fatiga i et fa perdre 1 PV després de l'atac, encertis o no.</p>
      </section>

      <section>
        <h2>Objectes i equipament</h2>
        <p>Els objectes passius poden donar <strong>armadura passiva</strong> (reducció plana del dany a cada impacte), <strong>bonificacions de tirada</strong> (modificadors a les tirades d'atac o de defensa de certes accions) i <strong>penalització de velocitat</strong> (les armadures pesades alenteixen totes les accions). Només un objecte per ranura.</p>
      </section>
    </div>

    <h2 class="cards-heading no-print">Cartes de regles</h2>
    <CardGrid>
      <RulesCard />
      <RulesCard />
      <RulesCard />
    </CardGrid>

    <div class="fitxa-wrap">
      <CharacterSheet />
    </div>
  </div>
</template>

<style scoped>
.rules-page {
  padding: 1rem;
  text-align: center;
}

.rules-content {
  max-width: 700px;
  margin: 2rem auto 0;
  text-align: left;
}

.rules-content section {
  margin-bottom: 2rem;
}

.rules-content h2 {
  font-family: 'Cinzel Decorative', serif;
  font-size: 1.2rem;
  color: var(--parchment);
  margin-bottom: 0.75rem;
}

.rules-content p {
  font-family: 'Crimson Text', Georgia, serif;
  font-size: 1.05rem;
  color: var(--parchment-dark);
  line-height: 1.6;
  margin-bottom: 0.5rem;
}

.rules-content ul,
.rules-content ol {
  font-family: 'Crimson Text', Georgia, serif;
  font-size: 1.05rem;
  color: var(--parchment-dark);
  line-height: 1.6;
  margin: 0.5rem 0 0.5rem 1.5rem;
}

.rules-content li {
  margin-bottom: 0.3rem;
}

.rules-content strong {
  color: var(--parchment);
}

.formula {
  font-family: 'MedievalSharp', serif;
  font-style: italic;
  background: rgba(232, 220, 196, 0.08);
  border: 1px solid rgba(232, 220, 196, 0.15);
  border-radius: 6px;
  padding: 0.5rem 1rem;
  text-align: center;
}

.cards-heading {
  font-family: 'Cinzel Decorative', serif;
  font-size: 1.2rem;
  color: var(--parchment);
  margin: 2.5rem 0 1rem;
}

@media print {
  .no-print { display: none !important; }
}
.fitxa-wrap { margin-top: 2rem; overflow-x: auto; }
</style>
