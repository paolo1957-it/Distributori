# Qui-Distributori per iPhone e CarPlay

Una web app non può comparire su CarPlay: Apple mostra in auto solo app native installate
sull'iPhone, e solo con un'autorizzazione speciale. Questa cartella contiene quindi un'app iOS
piccola che fa da "guscio" alla web app e aggiunge le schermate per l'auto.

## Come è fatta

```
                 GitHub Pages (già esistente)
          quivicino.github.io/Distributori/dati/
          indice.json + tessere t_<i>_<j>.json
                 ▲                       ▲
                 │ stessi file           │ stessi file
     ┌───────────┴─────────┐   ┌─────────┴──────────────────┐
     │ Web app (Safari)    │   │ App iOS (questa cartella)  │
     │ index.html, app.js  │   │                            │
     └─────────────────────┘   │ iPhone: mostra la web app  │
                               │   in una WKWebView         │
                               │ CarPlay: schermate native  │
                               │   con i modelli di Apple   │
                               └────────────────────────────┘
```

- **Nessun server nuovo.** L'app legge gli stessi file JSON che `aggiorna_prezzi.py` pubblica
  più volte al giorno. Se il formato dei dati cambia, va aggiornato anche `Core/Modelli.swift`.
- **Sull'iPhone** si vede la web app vera (`Telefono/`), così l'interfaccia del telefono resta una sola.
- **Su CarPlay** (`CarPlay/`) si usano solo i modelli di Apple ammessi per la categoria
  *Fueling* (carburanti), che è quella giusta per quest'app:
  1. **Mappa** (`CPPointOfInterestTemplate`): fino a 12 distributori (limite di Apple) con il
     prezzo, pallini verdi/arancio/rossi come nella web app. Il pulsante *Qui* riporta la ricerca
     sulla tua posizione; spostando la mappa si cerca nella nuova zona.
  2. **Più economici** (`CPListTemplate`): elenco ordinato per prezzo, tocca per i dettagli.
  3. **Carburante** (`CPListTemplate`): benzina/gasolio/GPL/metano, self/servito, raggio.
  - **Dettagli** (`CPInformationTemplate`): tutti i prezzi, distanza, data del prezzo e
    pulsante **Naviga**, che apre Mappe sul cruscotto con il percorso.
- **Niente tastiera né Siri** su CarPlay, per ora: si tocca e basta.
- `Core/Logica.swift` è la traduzione di `core.js` (distanze, fasce di prezzo, nomi, indirizzi);
  i test in `QuiDistributoriTests/` controllano che dia gli stessi risultati.

Ogni modifica a questa cartella viene compilata e provata da GitHub su un Mac
(workflow *App iOS (CarPlay)*), senza firmare l'app.

## Cosa serve per provarla davvero (passi di paolo)

1. **Account Apple Developer** (99 €/anno): https://developer.apple.com/programs/
2. **Chiedere ad Apple l'autorizzazione CarPlay**, categoria *Fueling*:
   https://developer.apple.com/contact/carplay/ — descrizione suggerita:
   *"Qui-Distributori shows nearby fuel stations with official prices from the Italian Ministry
   (MIMIT open data), sorted by price, and starts navigation to the chosen station."*
   La risposta di Apple può richiedere da qualche giorno a qualche settimana.
3. **Un Mac con Xcode** (anche in prestito o a noleggio per qualche ora). Poi, in questa cartella:
   ```
   brew install xcodegen
   xcodegen generate
   open QuiDistributori.xcodeproj
   ```
   In Xcode › *Signing & Capabilities* scegli il tuo Team. Il bundle id proposto è
   `it.quivicino.distributori` (si può cambiare in `project.yml`).
4. **Prova senza auto**: in Xcode avvia l'app sul simulatore iPhone, poi dal menu del simulatore
   *I/O › External Displays › CarPlay*. Sul simulatore funziona anche prima della risposta di Apple.
5. **Prova in auto**: serve l'autorizzazione di Apple attiva sul profilo dell'app; poi
   l'app si installa sull'iPhone da Xcode o con TestFlight.

Se non hai un Mac, si può far firmare e caricare l'app su TestFlight direttamente da GitHub
(un Mac di GitHub lo fa al posto tuo): serve aggiungere i certificati Apple come *secret* del
repository. È un passo successivo, da fare quando Apple avrà concesso l'autorizzazione.

## File

- `project.yml`: descrizione del progetto per XcodeGen (il file `.xcodeproj` non si salva nel repository)
- `QuiDistributori/Info.plist`: scene iPhone e CarPlay, testo della richiesta di posizione
- `QuiDistributori/QuiDistributori.entitlements`: autorizzazione CarPlay *Fueling*
- `QuiDistributori/Core/`: dati, logica, posizione, preferenze (condivise tra iPhone e CarPlay)
- `QuiDistributori/CarPlay/`: schermate per l'auto
- `QuiDistributori/Telefono/`: avvio dell'app e web app sull'iPhone
