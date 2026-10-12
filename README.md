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

# Pets (cartella `pets/`)

Seconda web app, stesso aspetto e funzionamento di Distributori, che mostra i servizi per gli animali domestici
vicino a te presi da OpenStreetMap: pronto soccorso veterinari, veterinari e cliniche veterinarie, farmacie e
parafarmacie veterinarie, negozi per animali, toelettature, aree cani, canili e rifugi, pensioni per animali e altro
(addestramento, allevamenti). Viene pubblicata insieme a Distributori, all'indirizzo del sito seguito da `pets/`.

- I segnaposto hanno un colore e un simbolo per tipo; un pallino verde o rosso dice se è aperto adesso,
  calcolato dagli orari (`opening_hours`) scritti su OpenStreetMap.
- Il pulsante rosso **PS** porta al pronto soccorso veterinario più vicino, quello verde (la zampa) al veterinario
  più vicino aperto. Un veterinario è "pronto soccorso" se su OSM ha `emergency=yes`, "pronto soccorso" o "h24"
  nel nome, oppure orario `24/7`.
- A ogni pubblicazione GitHub esegue `pets/aggiorna_animali.js` (Node): scarica da Overpass tutti i punti
  d'Italia e li salva in `pets/dati/`, divisi in tessere da 0,25°. Per non pesare su Overpass li riscarica al
  massimo una volta ogni 20 ore (o subito con *Run workflow*); nel frattempo ricopia quelli già pubblicati.
  Se il sito non ha i dati, l'app li chiede direttamente a Overpass dal telefono.

File: `index.html`, `style.css` (interfaccia), `core.js` (logica: tipi, orari, distanze), `app.js` (mappa, GPS,
elenco), `config.js`, `aggiorna_animali.js`, `sw.js`, `manifest.webmanifest`, `icon.svg`.
