# Installare l'app sull'iPhone con TestFlight (senza Mac)

L'app viene firmata e caricata su TestFlight da un Mac di GitHub, con il workflow
**Pubblica su TestFlight**. Dal tuo lato bastano il browser (anche sul PC Windows) e l'iPhone.
Tutti i passi da A a F si fanno una volta sola.

## A. Account Apple Developer

Iscriviti all'Apple Developer Program (99 €/anno). Il modo più semplice è dall'app
**Apple Developer** sull'iPhone, alla voce *Account › Iscriviti*.
L'attivazione può richiedere da qualche ora a un paio di giorni.

## B. Registra l'identificativo dell'app

1. Apri https://developer.apple.com/account/resources/identifiers/list
2. Premi **+**, scegli **App IDs** e poi **App**.
3. Description: `Qui-Distributori`. Bundle ID: **Explicit**, `it.quivicino.distributori`
4. Premi **Continue** e poi **Register**.

## C. Crea l'app in App Store Connect

1. Apri https://appstoreconnect.apple.com/apps, premi **+** e poi **Nuova app**.
2. Compila così:
   - Piattaforma: **iOS**
   - Nome: `Qui-Distributori`. Il nome deve essere unico su tutto l'App Store: se è già preso, prova per esempio `Qui-Distributori Italia`.
   - Lingua principale: **Italiano**
   - ID pacchetto: `it.quivicino.distributori`
   - SKU: `quidistributori`
   - Accesso utente: **Accesso completo**

## D. Chiave API per GitHub

1. In App Store Connect vai su **Utenti e accessi › Integrazioni › App Store Connect API › Chiavi del team**.
   La prima volta potrebbe chiederti di richiedere l'accesso alle API: accetta.
2. Premi **+** (Genera chiave API). Nome: `GitHub`. Accesso: **Admin**.
   L'accesso Admin serve perché Apple crei da sola il certificato di firma.
3. Scarica il file `AuthKey_XXXXXXXXXX.p8`. **Si può scaricare una volta sola**: conservalo.
4. Annota il **Key ID** (riga della chiave) e l'**Issuer ID** (in alto nella pagina).

## E. Team ID

Su https://developer.apple.com/account, alla voce **Membership details**, trovi il **Team ID**:
10 caratteri, per esempio `AB12CD34EF`.

## F. Secret su GitHub

Apri https://github.com/quivicino/Distributori/settings/secrets/actions e crea con
**New repository secret** questi quattro secret:

| Nome | Valore |
|---|---|
| `APPLE_TEAM_ID` | il Team ID del passo E |
| `ASC_KEY_ID` | il Key ID del passo D |
| `ASC_ISSUER_ID` | l'Issuer ID del passo D |
| `ASC_KEY_P8` | il contenuto del file `.p8`: aprilo con Blocco note e copia tutto, comprese le righe `-----BEGIN PRIVATE KEY-----` e `-----END PRIVATE KEY-----` |

I secret non si vedono da nessuna parte, neanche se il repository è pubblico.

## G. Avvia la pubblicazione

1. Vai su https://github.com/quivicino/Distributori/actions/workflows/testflight.yml
2. Premi **Run workflow** e lascia **CarPlay spento**, poi conferma.
3. Il lavoro dura circa 10 minuti. Se mancano dei secret, l'errore dice quali.

## H. Installa sull'iPhone

1. In App Store Connect apri l'app, vai su **TestFlight › Tester interni**, premi **+** e aggiungi te stesso.
2. Sull'iPhone installa **TestFlight** dall'App Store e apri l'invito che ti arriva per email.
3. Quando Apple ha elaborato la build (di solito 10-30 minuti), premi **Installa**.

Per pubblicare una versione nuova basta ripetere il passo G.

## I. Quando Apple concede l'autorizzazione CarPlay

Apple non inserisce l'autorizzazione CarPlay nella firma automatica. Servono quindi un
certificato di distribuzione e un profilo creato a mano, con **CarPlay Fueling** scelto alla
voce *Additional Entitlements*. Questo passo lo facciamo insieme dal NUC64, e alla fine ci
saranno tre secret in più:

| Nome | Valore |
|---|---|
| `DIST_CERT_P12` | il certificato `.p12`, convertito in testo base64 |
| `DIST_CERT_PASSWORD` | la password del `.p12` |
| `CARPLAY_PROFILE` | il profilo `.mobileprovision`, convertito in testo base64 |

Poi si avvia **Run workflow** con **CarPlay acceso**.
