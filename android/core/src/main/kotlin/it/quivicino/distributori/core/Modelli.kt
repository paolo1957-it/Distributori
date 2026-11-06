package it.quivicino.distributori.core

// Dati pubblicati dal sito (cartella "dati/"), nello stesso formato che legge la web app.
// Vedi aggiorna_prezzi.py per come vengono prodotti. Stessi modelli di ios/…/Core/Modelli.swift.

/** Carburanti confrontabili tra distributori (codici del sito). */
enum class Carburante(val codice: String, val nome: String, val unita: String) {
    BENZINA("B", "Benzina", "l"),
    GASOLIO("G", "Gasolio", "l"),
    GPL("L", "GPL", "l"),
    METANO("M", "Metano", "kg");

    companion object {
        fun daCodice(codice: String?): Carburante? = entries.firstOrNull { it.codice == codice }
    }
}

enum class Modo(val codice: String, val nome: String) {
    SELF("self", "Self"),
    SERVITO("servito", "Servito");

    companion object {
        fun daCodice(codice: String?): Modo? = entries.firstOrNull { it.codice == codice }
    }
}

/** Una voce di prezzo: nel file è l'array [categoria, nome, prezzo, self 1/0, data ISO]. */
data class VocePrezzo(
    val categoria: String,      // "B", "G", "L", "M" oppure "X" per i carburanti speciali
    val nome: String = "",      // solo per i carburanti speciali
    val prezzo: Double,
    val isSelf: Boolean,
    val data: String? = null    // "YYYY-MM-DDTHH:MM", ora italiana
)

/** Un impianto come sta nelle tessere del sito. */
data class Impianto(
    val id: String,
    val bandiera: String = "",
    val nomeImpianto: String = "",
    val via: String = "",
    val comune: String = "",
    val provincia: String = "",
    val lat: Double,
    val lon: Double,
    val prezzi: List<VocePrezzo> = emptyList(),
    val autostrada: Boolean = false
)

/** File "dati/indice.json" */
data class Indice(
    val passo: Double?,
    val estrazione: String?,
    val aggiornato: String?,
    val tessere: List<String>
)

/** Fascia di prezzo rispetto agli altri distributori in zona (come nella web app). */
enum class Fascia { ECONOMICO, MEDIO, CARO, ND }

/** Un distributore entro il raggio, con distanza e prezzo per il carburante scelto. */
data class Distributore(
    val impianto: Impianto,
    val distanza: Double,
    val prezzo: Double?,
    val dataPrezzo: String?,
    val fascia: Fascia = Fascia.ND
) {
    val id: String get() = impianto.id
}

/** Riga della tabella dei prezzi di un distributore (self e servito per ogni carburante). */
data class RigaPrezzi(
    val categoria: String,
    val nome: String,
    val prezzoSelf: Double? = null,
    val prezzoServito: Double? = null,
    val data: String? = null
)
