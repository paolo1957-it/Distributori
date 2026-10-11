# Distributori

Web app per il telefono che mostra i distributori di carburante vicino a te con i prezzi
pubblicati dal MIMIT (Osservatorio prezzi carburanti, open data). Stesso aspetto e funzionamento di PostoLibero.

## Come funziona

- Più volte al giorno GitHub esegue `aggiorna_prezzi.py` (workflow `.github/workflows/pubblica.yml`):
  scarica `anagrafica_impianti_attivi.csv` e `prezzo_alle_8.csv` dal sito del MIMIT, li unisce e li salva
  nella cartella `dati/` del sito pubblicato, divisi in tessere da 0,25° (circa 28 × 20 km).
- La cartella `dati/` **non** sta nel repository: viene creata a ogni pubblicazione.
  Se il MIMIT non risponde, lo script ricopia i dati già pubblicati, così il sito non resta mai senza prezzi.
- L'app scarica solo le tessere intorno a te e colora i prezzi rispetto agli altri distributori in zona.

## Pubblicazione

Impostazioni del repository → Pages → Source: **GitHub Actions**.
Per aggiornare i prezzi subito: Actions → *Pubblica sito e aggiorna prezzi* → *Run workflow*.

## File

- `index.html`, `style.css`: interfaccia
- `core.js`: logica (distanze, prezzi, fasce di prezzo)
- `app.js`: mappa, GPS, elenco, impostazioni
- `config.js`: impostazioni iniziali e numero di versione
- `aggiorna_prezzi.py`, `.github/workflows/pubblica.yml`: scaricamento dei prezzi e pubblicazione
- `sw.js`, `manifest.webmanifest`, `icon.svg`: installazione come app

## Fonte dei dati

Prezzi: MIMIT – Osservatorio prezzi carburanti, open data. Mappa: © OpenStreetMap.
I prezzi sono quelli comunicati dai gestori; quello alla pompa è sempre quello che vale.

---

# Salus (cartella `salute/`)

Seconda web app, stesso aspetto e funzionamento di Distributori, che mostra i servizi sanitari vicino a te
presi da OpenStreetMap: farmacie, parafarmacie, pronto soccorso, ospedali, ambulatori e cliniche, medici,
dentisti, defibrillatori (DAE) e altri servizi (laboratori analisi, centri prelievi, fisioterapisti, consultori…).
Viene pubblicata insieme a Distributori, all'indirizzo del sito seguito da `salute/`.

- I segnaposto hanno un colore e un simbolo per tipo; un pallino verde o rosso dice se è aperto adesso,
  calcolato dagli orari (`opening_hours`) scritti su OpenStreetMap.
- Il pulsante rosso **PS** porta al pronto soccorso più vicino, quello verde alla farmacia più vicina aperta.
- A ogni pubblicazione GitHub esegue `salute/aggiorna_salute.js` (Node): scarica da Overpass tutti i punti
  sanitari d'Italia e li salva in `salute/dati/`, divisi in tessere da 0,25° come i prezzi. Per non pesare su
  Overpass li riscarica al massimo una volta ogni 20 ore (o subito con *Run workflow*); nel frattempo ricopia
  quelli già pubblicati. Se il sito non ha i dati, l'app li chiede direttamente a Overpass dal telefono.
- I turni delle farmacie non sono su OpenStreetMap; la guida dell'app lo spiega.

File: `index.html`, `style.css` (interfaccia), `core.js` (logica: tipi, orari, distanze), `app.js` (mappa, GPS,
elenco), `config.js`, `aggiorna_salute.js`, `sw.js`, `manifest.webmanifest`, `icon.svg`.
