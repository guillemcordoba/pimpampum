<script setup lang="ts">
import CardGrid from '../components/cards/CardGrid.vue';
import RulesCard from '../components/cards/RulesCard.vue';
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
          <li><strong>PV</strong> (Punts de vida): els punts de vida abans de morir. Els jugadors comencen amb 20 PV per defecte.</li>
        </ul>
      </section>

      <section>
        <h2>Habilitats i accions</h2>
        <p>Cada personatge té un conjunt d'<strong>habilitats</strong>, cadascuna amb un nivell d'1 a 100. En pujar de nivell, una habilitat desbloqueja noves <strong>accions</strong>.</p>
        <p>Cada acció pertany a una habilitat i té una <strong>velocitat</strong> (determina quan es resol) i un <strong>tipus</strong>: Atac, Defensa o Focus. Les accions d'atac tenen també <strong>daus de dany</strong>.</p>
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
        <p>L'atacant tria un objectiu i fa una tirada d'habilitat:</p>
        <p class="formula">d20 + nivell d'habilitat + modificadors</p>
        <p>Si supera la tirada de defensa de l'objectiu (o si no en té defensa, impacta automàticament), es tiren els daus de dany, es resta l'<strong>armadura passiva</strong> i el resultat (mínim 0) es resta dels PV.</p>
      </section>

      <section>
        <h2>Accions de defensa</h2>
        <p>El defensor tria un aliat a protegir. Cada atac dirigit a l'aliat defensat o al defensor es resol contra la tirada de defensa del defensor. Si un atac penetra, el dany el rep el defensor, no l'aliat.</p>
      </section>

      <section>
        <h2>Accions de focus</h2>
        <p>Efectes especials, normalment lents. Una acció de focus <strong>es cancel·la</strong> si el jugador rep un atac sense defensa abans que es resolgui.</p>
      </section>

      <section>
        <h2>Pujar de nivell</h2>
        <p>Després de cada tirada d'habilitat es comprova el marge:</p>
        <ul>
          <li><strong>Fallar per menys de 10</strong>: l'habilitat puja un nivell.</li>
          <li><strong>Encertar per menys de 5</strong>: l'habilitat puja un nivell.</li>
        </ul>
      </section>

      <section>
        <h2>Objectes i equipament</h2>
        <p>Els objectes passius poden donar <strong>armadura passiva</strong> (reducció plana de dany), <strong>bonificacions d'habilitat</strong> i <strong>penalització de velocitat</strong> (les armadures pesades alenteixen totes les accions). Només un objecte per ranura.</p>
      </section>

      <section>
        <h2>Descans</h2>
        <ul>
          <li><strong>Descans curt</strong>: cada jugador recupera 1 PV.</li>
          <li><strong>Descans llarg</strong>: cada jugador recupera tots els PV.</li>
        </ul>
      </section>
    </div>

    <h2 class="cards-heading no-print">Cartes de regles</h2>
    <CardGrid>
      <RulesCard />
      <RulesCard />
      <RulesCard />
    </CardGrid>
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
</style>
