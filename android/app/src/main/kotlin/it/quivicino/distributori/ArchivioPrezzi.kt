package it.quivicino.distributori

import android.os.Handler
import android.os.Looper
import it.quivicino.distributori.core.Impianto
import it.quivicino.distributori.core.Indice
import it.quivicino.distributori.core.LetturaDati
import it.quivicino.distributori.core.Logica
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Scarica i prezzi pubblicati dalla web app (GitHub Pages) e li tiene in memoria.
 * Stessa strategia di app.js: l'indice si rilegge ogni 15 minuti e, se i prezzi sono cambiati,
 * le tessere già scaricate vengono buttate. Tutto il lavoro avviene su un solo thread di sfondo;
 * la risposta torna sul thread principale.
 */
object ArchivioPrezzi {
    private const val DATI = "https://quivicino.github.io/Distributori/dati/"

    private val sfondo = Executors.newSingleThreadExecutor()
    private val principale = Handler(Looper.getMainLooper())

    private var indice: Indice? = null
    private var indiceLetto = 0L
    private val tessere = HashMap<String, List<Impianto>>()

    fun impianti(lat: Double, lon: Double, raggio: Double, forza: Boolean = false, risposta: (Result<List<Impianto>>) -> Unit) {
        sfondo.execute {
            val r = runCatching { carica(lat, lon, raggio, forza) }
            principale.post { risposta(r) }
        }
    }

    private fun leggiIndice(forza: Boolean): Indice {
        val attuale = indice
        if (!forza && attuale != null && System.currentTimeMillis() - indiceLetto < 15 * 60_000) return attuale
        val nuovo = LetturaDati.indice(scarica("indice.json", 10_000))
        if (attuale == null || nuovo.aggiornato != attuale.aggiornato) tessere.clear()
        indice = nuovo
        indiceLetto = System.currentTimeMillis()
        return nuovo
    }

    private fun carica(lat: Double, lon: Double, raggio: Double, forza: Boolean): List<Impianto> {
        val ind = leggiIndice(forza)
        val esistenti = ind.tessere.toSet()
        val nomi = Logica.tessereNelRaggio(lat, lon, raggio, ind.passo ?: 0.25).filter { it in esistenti }
        for (nome in nomi) {
            if (!tessere.containsKey(nome)) tessere[nome] = LetturaDati.tessera(scarica(nome, 15_000))
        }
        return nomi.flatMap { tessere[it].orEmpty() }
    }

    private fun scarica(nome: String, attesaMs: Int): String {
        val c = URL(DATI + nome).openConnection() as HttpURLConnection
        c.connectTimeout = attesaMs
        c.readTimeout = attesaMs
        try {
            if (c.responseCode !in 200..299) throw IOException("Il sito ha risposto con l'errore ${c.responseCode}")
            return c.inputStream.bufferedReader().use { it.readText() }
        } finally {
            c.disconnect()
        }
    }
}
