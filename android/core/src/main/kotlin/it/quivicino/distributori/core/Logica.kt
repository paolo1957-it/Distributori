package it.quivicino.distributori.core

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.asin
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.roundToLong
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Logica pura, tradotta da core.js della web app: distanze, prezzi, fasce, testi.
 * È la stessa di ios/QuiDistributori/Core/Logica.swift: se cambi una regola, cambiala in tutti e tre.
 */
object Logica {
    private const val RAGGIO_TERRA = 6_371_000.0
    private val ROMA: ZoneId = ZoneId.of("Europe/Rome")

    fun distanza(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val rad = Math.PI / 180
        val dLat = (lat2 - lat1) * rad
        val dLon = (lon2 - lon1) * rad
        val a = sin(dLat / 2).pow(2) + cos(lat1 * rad) * cos(lat2 * rad) * sin(dLon / 2).pow(2)
        return 2 * RAGGIO_TERRA * asin(sqrt(a))
    }

    fun formattaDistanza(m: Double): String {
        if (m < 1000) return "${(m / 10).roundToLong() * 10} m"
        return String.format(Locale.US, "%.1f km", m / 1000).replace(".", ",")
    }

    fun formattaPrezzo(p: Double?): String =
        if (p == null) "–" else String.format(Locale.US, "%.3f", p).replace(".", ",")

    /** Minuti in auto, stima prudente in città (circa 30 km/h) */
    fun minutiInAuto(m: Double): Int = max(1, (m / 500).roundToInt())

    // ---------- Prezzi ----------

    fun prezzoDi(imp: Impianto, carburante: Carburante, modo: Modo): VocePrezzo? {
        val vuoleSelf = modo != Modo.SERVITO
        return imp.prezzi.firstOrNull { it.categoria == carburante.codice && it.isSelf == vuoleSelf }
    }

    fun tabellaPrezzi(imp: Impianto): List<RigaPrezzi> {
        val righe = LinkedHashMap<String, RigaPrezzi>()
        for (v in imp.prezzi) {
            val chiave = if (v.categoria == "X") "X:" + v.nome else v.categoria
            var r = righe[chiave] ?: RigaPrezzi(
                categoria = v.categoria,
                nome = if (v.categoria == "X") v.nome else (Carburante.daCodice(v.categoria)?.nome ?: v.nome)
            )
            r = if (v.isSelf) r.copy(prezzoSelf = v.prezzo) else r.copy(prezzoServito = v.prezzo)
            if (v.data != null && (r.data ?: "") < v.data) r = r.copy(data = v.data)
            righe[chiave] = r
        }
        val ordine = listOf("B", "G", "L", "M", "X")
        fun posto(c: String) = ordine.indexOf(c).let { if (it < 0) ordine.size else it }
        return righe.values.sortedWith(compareBy<RigaPrezzi>({ posto(it.categoria) }, { it.nome.lowercase() }))
    }

    // ---------- Distributori nel raggio ----------

    fun prepara(
        lista: List<Impianto>, lat: Double, lon: Double, raggio: Double,
        carburante: Carburante, modo: Modo
    ): List<Distributore> {
        val out = lista.mapNotNull { imp ->
            val dist = distanza(lat, lon, imp.lat, imp.lon)
            if (dist > raggio) return@mapNotNull null
            val p = prezzoDi(imp, carburante, modo)
            Distributore(imp, dist, p?.prezzo, p?.data)
        }
        return classifica(out)
    }

    /** "economico" il terzo più basso, "caro" il terzo più alto, "medio" il resto, "nd" senza prezzo. */
    fun classifica(lista: List<Distributore>): List<Distributore> {
        val prezzi = lista.mapNotNull { it.prezzo }.sorted()
        val n = prezzi.size
        if (n == 0) return lista
        val minimo = prezzi.first()
        val massimo = prezzi.last()
        val soglia1 = prezzi[(n - 1) / 3]
        val soglia2 = prezzi[ceil(2.0 * (n - 1) / 3.0).toInt()]
        return lista.map { d ->
            val p = d.prezzo ?: return@map d
            val fascia = when {
                massimo - minimo < 0.0005 -> Fascia.ECONOMICO
                p <= soglia1 -> Fascia.ECONOMICO
                p >= soglia2 && p > soglia1 -> Fascia.CARO
                else -> Fascia.MEDIO
            }
            d.copy(fascia = fascia)
        }
    }

    /** Prima i distributori con prezzo, dal più economico; a parità di prezzo il più vicino. */
    fun ordinaPerPrezzo(lista: List<Distributore>): List<Distributore> =
        lista.sortedWith(compareBy<Distributore>({ it.prezzo == null }, { it.prezzo ?: 0.0 }, { it.distanza }))

    /** Nomi delle tessere del sito che coprono il cerchio di ricerca. */
    fun tessereNelRaggio(lat: Double, lon: Double, raggio: Double, passo: Double): List<String> {
        val dLat = raggio / 111_320
        val dLon = raggio / (111_320 * cos(lat * Math.PI / 180))
        val nomi = mutableListOf<String>()
        for (i in floor((lat - dLat) / passo).toInt()..floor((lat + dLat) / passo).toInt()) {
            for (j in floor((lon - dLon) / passo).toInt()..floor((lon + dLon) / passo).toInt()) {
                nomi.add("t_${i}_${j}.json")
            }
        }
        return nomi
    }

    // ---------- Date ----------

    fun data(iso: String?): LocalDateTime? = try {
        if (iso == null) null else LocalDateTime.parse(iso.take(16), DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm"))
    } catch (e: Exception) {
        null
    }

    /** Giorni di calendario trascorsi dalla data del prezzo a "oggi" (ora italiana). */
    fun giorniDa(iso: String?, oggi: LocalDate = LocalDate.now(ROMA)): Int? {
        val d = data(iso) ?: return null
        return ChronoUnit.DAYS.between(d.toLocalDate(), oggi).toInt()
    }

    fun quando(iso: String?, oggi: LocalDate = LocalDate.now(ROMA)): String {
        val d = data(iso) ?: return "data non indicata"
        val g = giorniDa(iso, oggi) ?: return "data non indicata"
        val ora = "${d.hour}:" + String.format(Locale.US, "%02d", d.minute)
        return when {
            g <= 0 -> "oggi alle $ora"
            g == 1 -> "ieri alle $ora"
            else -> "$g giorni fa (${d.dayOfMonth}/${d.monthValue})"
        }
    }

    // ---------- Testi ----------

    /** Nome da mostrare: il marchio, oppure il nome dell'impianto per le "pompe bianche". */
    fun titolo(imp: Impianto): String {
        val b = imp.bandiera.trim()
        if (b.isEmpty() || b.lowercase().contains("pompe bianche")) {
            return capitalizza(imp.nomeImpianto.ifEmpty { "Distributore" })
        }
        return b
    }

    private val paroleMinuscole = setOf(
        "di", "de", "del", "dei", "degli", "della", "delle", "dello", "da", "dal", "dalla",
        "al", "alla", "e", "ed", "in", "sul", "sulla", "per"
    )

    /** Da "VIA DELLA REPUBBLICA" a "Via della Repubblica"; il testo già misto resta com'è. */
    fun capitalizza(testo: String): String {
        val s = testo.trim()
        if (s.isEmpty() || s != s.uppercase()) return s
        val separatori = setOf('\'', '’', '.', '-', '/', '(')
        val out = StringBuilder()
        var maiuscola = true
        for (ch in s.lowercase()) {
            if (maiuscola && ch.isLetter()) out.append(ch.uppercase()) else out.append(ch)
            maiuscola = ch.isWhitespace() || ch in separatori
        }
        val parole = out.toString().split(" ").toMutableList()
        if (parole.size > 2) {
            for (k in 1 until parole.size - 1) {
                if (parole[k].lowercase() in paroleMinuscole) parole[k] = parole[k].lowercase()
            }
        }
        return parole.joinToString(" ")
    }

    fun indirizzo(imp: Impianto): String {
        val via = capitalizza(imp.via)
        val comune = capitalizza(imp.comune) + if (imp.provincia.isEmpty()) "" else " (${imp.provincia})"
        return listOf(via, comune).filter { it.isNotBlank() }.joinToString(", ")
    }
}
