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
