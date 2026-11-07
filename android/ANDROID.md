# Qui-Distributori per Android e Android Auto

È la versione Android dell'app iOS/CarPlay in `ios/`, fatta allo stesso modo:

- **Sul telefono** si vede la web app pubblicata (`MainActivity`), così l'interfaccia resta una sola.
- **In auto** (`app/…/auto/`) si usano i modelli di schermata di Google per la categoria
  **Carburante** (*Fuel*):
  1. **Mappa** (`PlaceListMapTemplate`): i distributori più economici vicini, numerati e colorati
     (verde, giallo, rosso) come nella web app, con l'elenco accanto. Il prezzo sta nell'elenco,
     perché Android Auto accetta solo 2 o 3 caratteri dentro i segnaposto.
  2. **Elenco** (`ListTemplate`): tutti, ordinati per prezzo.
  3. **Carburante** (`ListTemplate`): carburante, self/servito, raggio.
  4. **Dettagli** (`PaneTemplate`): prezzi, distanza, indirizzo e **Naviga**, che apre il
     navigatore dell'auto (Google Maps, Waze…).
- **Dati**: le stesse tessere JSON che `aggiorna_prezzi.py` pubblica su GitHub Pages.
- `core/` è la logica pura (Kotlin), cioè la traduzione di `core.js`, con i test.
  È uguale a `ios/QuiDistributori/Core/Logica.swift`: se cambi una regola, cambiala in tutti e tre.

Il workflow **App Android (Android Auto)** compila l'app su un computer di GitHub e ne prova
la logica. Non serve un Mac né Android Studio.

## Provarla subito (senza Google Play)

Serve un telefono Android.

1. Apri l'ultima esecuzione verde di *App Android (Android Auto)* in
   https://github.com/quivicino/Distributori/actions/workflows/android.yml
2. In fondo, alla voce **Artifacts**, scarica `qui-distributori-prova-apk`. È uno zip con dentro `app-debug.apk`.
3. Copia l'APK sul telefono e aprilo. Android chiede di consentire l'installazione da questa fonte.
4. Abilita le app di prova in Android Auto:
   - Impostazioni del telefono › App › Android Auto › *Impostazioni aggiuntive nell'app*
     (oppure apri Android Auto).
   - Tocca 10 volte **Versione** per attivare le *Impostazioni sviluppatore*.
   - Nel menu ⋮ › *Impostazioni sviluppatore*, attiva **Origini sconosciute**.
5. Collega il telefono all'auto: Qui-Distributori compare tra le app.

Ogni versione di prova è firmata con una chiave diversa: prima di installarne una nuova
bisogna disinstallare quella vecchia.

Senza auto si può provare sul PC con il **Desktop Head Unit** di Google, che fa parte di
Android Studio (*SDK Manager › SDK Tools › Android Auto Desktop Head Unit Emulator*).

## Pubblicarla su Google Play (più avanti)

1. Account **Google Play Console**: 25 $ una volta sola (https://play.google.com/console).
   Va intestato alla stessa persona o società scelta per Apple.
2. Crea una chiave di firma per il caricamento (*upload key*) e mettila nei secret del
   repository. La prepariamo insieme quando serve.
3. Si aggiunge un workflow che produce il pacchetto firmato `.aab`. Il primo caricamento su Play
   Console si fa a mano, in un test chiuso.
4. Google controlla le app per l'auto prima di approvarle (regole di qualità per Android Auto).

## File

- `settings.gradle.kts`, `build.gradle.kts`, `gradle.properties`, `gradlew*`, `gradle/`: progetto Gradle
- `core/`: dati, lettura dei JSON e logica, con i test in `core/src/test`
- `app/src/main/AndroidManifest.xml`: categoria Android Auto *Fuel*, permessi di posizione e internet
- `app/src/main/kotlin/…/MainActivity.kt`: web app sul telefono
- `app/src/main/kotlin/…/auto/`: schermate per l'auto
- `app/src/main/kotlin/…/ArchivioPrezzi.kt`, `Posizione.kt`, `Preferenze.kt`: dati, GPS, scelte
