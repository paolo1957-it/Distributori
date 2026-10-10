/*
 * Distributori – configurazione
 */
window.DISTRIBUTORI_CONFIG = {
  // Versione dell'app, mostrata in diagonale sulla mappa. Aumentala a ogni aggiornamento.
  versione: "1",

  // Raggio di ricerca iniziale in metri (modificabile anche dall'app)
  raggioMetri: 5000,

  // Ricentra e ricalcola quando ti sposti di più di questi metri
  ricaricaDopoMetri: 300,

  // Carburante e modalità iniziali: "B" benzina, "G" gasolio, "L" GPL, "M" metano; "self" o "servito"
  carburante: "B",
  modo: "self",

  // Un prezzo non aggiornato da più di questi giorni viene segnalato come "vecchio"
  giorniPrezzoVecchio: 7,

  // Auto-refresh predefinito in secondi (0 = spento). Si cambia anche dalla pagina elenco.
  autoRefreshSecondi: 120
};
