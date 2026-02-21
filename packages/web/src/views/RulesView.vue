<script setup lang="ts">
</script>

<template>
  <div class="rules-page">
    <h1 class="screen-title">Regles</h1>
    <p class="screen-subtitle">Mecàniques de combat de Pim Pam Pum</p>

    <div class="rules-content">
      <section>
        <h2>Característiques</h2>
        <p>Cada jugador té les següents característiques base representades amb un número:</p>
        <ul>
          <li><strong>PV</strong> (Punts de vida): vides del personatge abans de morir (de 2 a 8).</li>
          <li><strong>V</strong> (Velocitat): determina l'ordre de resolució de les accions.</li>
          <li><strong>F</strong> (Força): s'utilitza per als atacs físics.</li>
          <li><strong>D</strong> (Defensa): redueix el dany dels atacs rebuts.</li>
          <li><strong>M</strong> (Màgia): s'utilitza per als atacs màgics.</li>
        </ul>
      </section>

      <section>
        <h2>Objectes passius</h2>
        <p>Cada jugador pot portar objectes passius que modifiquin les seves característiques. Hi ha ranures d'equipament: només es pot portar un pantaló, un casc o una armadura de tors.</p>
      </section>

      <section>
        <h2>Fórmula de característiques</h2>
        <p>Sempre que s'hagi de calcular el valor final d'una característica:</p>
        <p class="formula">Característica final = Base + Objectes passius + Modificador d'acció + Modificadors de combat</p>
      </section>

      <section>
        <h2>Rondes de combat</h2>
        <p>El combat consisteix en una sèrie de rondes. Cada jugador tindrà una mà de cartes d'acció (cartes d'objectes i cartes d'habilitats).</p>
        <ol>
          <li>Cada jugador tria una carta de la mà i la posa de cap per vall.</li>
          <li>Es revelen totes les cartes alhora.</li>
          <li>Les cartes es resolen per ordre de velocitat (de més alta a més baixa).</li>
        </ol>
        <p>Cada carta pot tenir modificadors de característica (velocitat, defensa, força, màgia), modificadors permanents per la resta del combat, i efectes especials.</p>
      </section>

      <section>
        <h2>Cartes d'atac</h2>
        <p>Hi ha cartes d'<strong>atac físic</strong> i d'<strong>atac màgic</strong>. Quan es resol una carta d'atac, l'atacant tria un objectiu. L'objectiu perd una vida si:</p>
        <p class="formula">Força (o Màgia) de l'atacant + dau &gt; Defensa de l'objectiu</p>
        <p>Cada impacte fa perdre exactament 1 vida. Un personatge és derrotat quan es queda sense vides. Es recupera si se li cura una vida.</p>
      </section>

      <section>
        <h2>Cartes de defensa</h2>
        <p>Quan es resol una carta de defensa, el defensor tria un aliat a defensar. Tots els atacs que rebi l'aliat triat durant aquesta ronda els rep el defensor en lloc seu.</p>
      </section>

      <section>
        <h2>Cartes de focus</h2>
        <p>Són cartes amb efectes especials. La carta de focus <strong>s'interromp</strong> (es cancel·la) si el jugador rep un atac abans que la carta es resolgui durant la ronda.</p>
      </section>

      <section>
        <h2>Descans</h2>
        <p>Entre combats, els jugadors poden descansar per recuperar vides:</p>
        <ul>
          <li><strong>Descans curt</strong>: cada jugador recupera 1 vida.</li>
          <li><strong>Descans llarg</strong>: cada jugador recupera totes les vides.</li>
        </ul>
        <p>El DM decideix quan els jugadors poden fer un descans curt o llarg.</p>
      </section>

      <section>
        <h2>Fora de combat</h2>
        <p>Fora de combat, els jugadors es poden canviar les cartes actives i intercanviar objectes entre ells. Es poden canviar les habilitats actives per habilitats apreses anteriorment, però no es poden intercanviar habilitats entre jugadors.</p>
      </section>
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
</style>
