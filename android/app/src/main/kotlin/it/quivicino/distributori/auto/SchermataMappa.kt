package it.quivicino.distributori.auto

import android.Manifest
import android.location.Location
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.constraints.ConstraintManager
import androidx.car.app.model.Action
import androidx.car.app.model.ActionStrip
import androidx.car.app.model.CarLocation
import androidx.car.app.model.ItemList
import androidx.car.app.model.Metadata
import androidx.car.app.model.Place
import androidx.car.app.model.PlaceListMapTemplate
import androidx.car.app.model.PlaceMarker
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import it.quivicino.distributori.ArchivioPrezzi
import it.quivicino.distributori.Posizione
import it.quivicino.distributori.Preferenze
import it.quivicino.distributori.core.Distributore
import it.quivicino.distributori.core.Logica

/**
 * Prima schermata in auto: mappa con i distributori più economici vicini (numerati e colorati
 * per fascia di prezzo) e, accanto, il loro elenco con prezzo e distanza.
 * In alto: "Elenco" (tutti, ordinati per prezzo) e "Carburante" (scelte).
 */
class SchermataMappa(carContext: CarContext) : Screen(carContext), DefaultLifecycleObserver {
    private val posizione = Posizione(carContext)
    private var pref = Preferenze.leggi(carContext)
    private var distributori: List<Distributore> = emptyList()
    private var caricamento = true
    private var messaggio: String? = null
    private var centro: Location? = null
    private var richiesta = 0
    private var permessoChiesto = false

    /** Ricarica quando ti sposti di più di questi metri (ricaricaDopoMetri in config.js) */
    private val ricaricaDopoMetri = 300f

    init {
        lifecycle.addObserver(this)
    }

    override fun onStart(owner: LifecycleOwner) {
        if (posizione.autorizzata()) avvia() else chiediPermesso()
    }

    override fun onResume(owner: LifecycleOwner) {
        // Tornando dalla scheda Carburante: se le scelte sono cambiate, ricalcola
        val nuove = Preferenze.leggi(carContext)
        if (nuove != pref) {
            pref = nuove
            (posizione.ultima ?: centro)?.let { carica(it) }
        }
    }

    override fun onStop(owner: LifecycleOwner) {
        posizione.ferma()
    }

    private fun chiediPermesso() {
        if (permessoChiesto) return
        permessoChiesto = true
        carContext.requestPermissions(
            listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        ) { concessi, _ ->
            if (concessi.isNotEmpty()) {
                avvia()
            } else {
                caricamento = false
                messaggio = "Consenti la posizione sul telefono per vedere i distributori vicini"
                invalidate()
            }
        }
    }

    private fun avvia() {
        posizione.avvia { qui ->
            val c = centro
            if (c == null || c.distanceTo(qui) > ricaricaDopoMetri) carica(qui)
        }
        val qui = posizione.ultima
        if (qui != null) {
            carica(qui)
        } else if (caricamento) {
            messaggio = "Cerco la posizione…"
        }
    }

    private fun carica(qui: Location) {
        centro = qui
        val numero = ++richiesta
        val p = pref
        ArchivioPrezzi.impianti(qui.latitude, qui.longitude, p.raggioMetri) { risultato ->
            if (numero != richiesta) return@impianti   // nel frattempo è partita una ricerca più recente
            risultato.onSuccess { impianti ->
                distributori = Logica.ordinaPerPrezzo(
                    Logica.prepara(impianti, qui.latitude, qui.longitude, p.raggioMetri, p.carburante, p.modo)
                )
                messaggio = if (distributori.none { it.prezzo != null }) {
                    "Nessun prezzo ${p.descrizione.lowercase()} entro ${Aspetto.km(p.raggioMetri)}"
                } else {
                    null
                }
            }.onFailure {
                centro = null   // al prossimo spostamento si riprova
                messaggio = "Prezzi non raggiungibili: controlla la connessione del telefono"
            }
            caricamento = false
            invalidate()
        }
    }

    override fun onGetTemplate(): Template {
        val modello = PlaceListMapTemplate.Builder()
            .setTitle(pref.descrizione)
            .setHeaderAction(Action.APP_ICON)
            .setActionStrip(pulsanti())
        if (caricamento && messaggio == null) return modello.setLoading(true).build()
        if (posizione.autorizzata()) modello.setCurrentLocationEnabled(true)

        val massimo = Aspetto.limite(carContext, ConstraintManager.CONTENT_LIMIT_TYPE_PLACE_LIST)
        val elenco = ItemList.Builder()
        val conPrezzo = distributori.filter { it.prezzo != null }.take(massimo)
        if (conPrezzo.isEmpty()) elenco.setNoItemsMessage(messaggio ?: "Cerco i distributori…")
        conPrezzo.forEachIndexed { i, d -> elenco.addItem(riga(i + 1, d)) }
        return modello.setItemList(elenco.build()).build()
    }

    private fun riga(numero: Int, d: Distributore): Row {
        val imp = d.impianto
        val segnaposto = PlaceMarker.Builder()
            .setColor(Aspetto.colore(d.fascia))
            .setLabel(numero.toString())
            .build()
        val luogo = Place.Builder(CarLocation.create(imp.lat, imp.lon)).setMarker(segnaposto).build()
        return Row.Builder()
            .setTitle("${Logica.formattaPrezzo(d.prezzo)} € · ${Logica.titolo(imp)}")
            .addText("${Logica.formattaDistanza(d.distanza)} · ${Logica.indirizzo(imp)}")
            .setMetadata(Metadata.Builder().setPlace(luogo).build())
            .setOnClickListener { screenManager.push(SchermataDettagli(carContext, d, pref)) }
            .build()
    }

    private fun pulsanti(): ActionStrip = ActionStrip.Builder()
        .addAction(
            Action.Builder().setTitle("Elenco").setOnClickListener {
                screenManager.push(SchermataElenco(carContext, distributori, pref))
            }.build()
        )
        .addAction(
            Action.Builder().setTitle("Carburante").setOnClickListener {
                screenManager.push(SchermataCarburante(carContext))
            }.build()
        )
        .build()
}
