/*
 * Salus – configurazione
 */
window.SALUS_CONFIG = {
  // Versione dell'app, mostrata in diagonale sulla mappa. Aumentala a ogni aggiornamento.
  versione: "1",

  // Raggio di ricerca iniziale in metri (modificabile anche dall'app)
  raggioMetri: 2000,

  // Ricentra e ricalcola quando ti sposti di più di questi metri
  ricaricaDopoMetri: 300,

  // Cosa mostrare all'inizio: "tutto" oppure F farmacie, P parafarmacie, S pronto soccorso, O ospedali,
  // C ambulatori, M medici, D dentisti, A defibrillatori, X altro
  categoria: "tutto",

  // Massimo di segnaposto sulla mappa (i più vicini): oltre, la mappa diventa lenta sul telefono
  maxSegnaposto: 1500,

  // Server Overpass da usare se il sito non ha ancora i dati scaricati (in ordine di preferenza)
  overpass: [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
  ],

  // Auto-refresh predefinito in secondi (0 = spento). Si cambia anche dalla pagina elenco.
  autoRefreshSecondi: 120
};
