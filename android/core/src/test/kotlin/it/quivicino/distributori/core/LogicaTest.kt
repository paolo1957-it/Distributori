package it.quivicino.distributori.core

import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Controlla che la logica Kotlin dia gli stessi risultati di core.js (stessi casi dei test iOS). */
class LogicaTest {
    // Una tessera come quelle pubblicate in dati/ da aggiorna_prezzi.py
    private val tessera = """
    {"d":[
     {"i":1001,"b":"Eni","n":"ENI STATION","a":"VIA ROMA 1","c":"TORINO","p":"TO","la":45.07,"lo":7.68,
      "f":[["B","",1.789,1,"2026-11-06T07:10"],["B","",1.899,0,"2026-11-06T07:10"],["G","",1.699,1,"2026-11-05T19:00"],
           ["X","Blue Diesel",1.859,1,null]]},
     {"i":"A12","b":"Pompe Bianche","n":"DISTRIBUTORE DELLA STAZIONE","a":"CORSO FRANCIA 10","c":"TORINO","p":"TO",
      "la":45.08,"lo":7.65,"t":1,"f":[["B","",1.749,1,"2026-11-04T08:00"]]},
     {"i":1003,"b":"Q8","n":"Q8","a":"","c":"COLLEGNO","p":"TO","la":45.077,"lo":7.57,"f":[["B","",1.819,1,"2026-11-06T06:00"]]},
     {"i":1004,"b":"IP","n":"IP","a":"VIA LONTANA","c":"MILANO","p":"MI","la":45.46,"lo":9.19,"f":[["B","",1.5,1,"2026-11-06T06:00"]]}
    ]}
    """.trimIndent()

    private val impianti = LetturaDati.tessera(tessera)

    @Test
    fun letturaTessera() {
        assertEquals(4, impianti.size)
        assertEquals("1001", impianti[0].id)
        assertEquals("A12", impianti[1].id)
        assertTrue(impianti[1].autostrada)
        assertEquals(4, impianti[0].prezzi.size)
        assertEquals(VocePrezzo("X", "Blue Diesel", 1.859, true, null), impianti[0].prezzi[3])
    }

    @Test
    fun letturaIndice() {
        val ind = LetturaDati.indice("""{"passo":0.25,"estrazione":"2026-11-06","aggiornato":"2026-11-06T07:50:00Z","tessere":["t_180_30.json"]}""")
        assertEquals(0.25, ind.passo)
        assertEquals(listOf("t_180_30.json"), ind.tessere)
    }

    @Test
    fun preparaEFasce() {
        val lista = Logica.prepara(impianti, 45.07, 7.66, 10_000.0, Carburante.BENZINA, Modo.SELF)
        assertEquals(3, lista.size, "Milano è fuori dal raggio")
        val ordinati = Logica.ordinaPerPrezzo(lista)
        assertEquals(listOf("A12", "1001", "1003"), ordinati.map { it.id })
        assertEquals(listOf(Fascia.ECONOMICO, Fascia.MEDIO, Fascia.CARO), ordinati.map { it.fascia })

        val servito = Logica.prepara(impianti, 45.07, 7.66, 10_000.0, Carburante.BENZINA, Modo.SERVITO)
        assertEquals(listOf("1001"), servito.filter { it.prezzo != null }.map { it.id })
        assertEquals(Fascia.ECONOMICO, servito.first { it.id == "1001" }.fascia, "un solo prezzo: economico")
        assertEquals(Fascia.ND, servito.first { it.id == "1003" }.fascia)
    }

    @Test
    fun tessereNelRaggio() {
        assertEquals(listOf("t_180_30.json"), Logica.tessereNelRaggio(45.07, 7.66, 5_000.0, 0.25))
        assertEquals(
            setOf("t_179_29.json", "t_179_30.json", "t_180_29.json", "t_180_30.json"),
            Logica.tessereNelRaggio(45.01, 7.51, 5_000.0, 0.25).toSet()
        )
    }

    @Test
    fun testi() {
        assertEquals("Eni", Logica.titolo(impianti[0]))
        assertEquals("Distributore della Stazione", Logica.titolo(impianti[1]))
        assertEquals("Via Roma 1, Torino (TO)", Logica.indirizzo(impianti[0]))
        assertEquals("Collegno (TO)", Logica.indirizzo(impianti[2]))
        assertEquals("Via Dell'Acqua e del Sole", Logica.capitalizza("VIA DELL'ACQUA E DEL SOLE"))
        assertEquals("Già Misto", Logica.capitalizza("Già Misto"))
        assertEquals("1,789", Logica.formattaPrezzo(1.789))
        assertEquals("–", Logica.formattaPrezzo(null))
        assertEquals("230 m", Logica.formattaDistanza(234.0))
        assertEquals("2,3 km", Logica.formattaDistanza(2345.0))
    }

    @Test
    fun tabellaPrezzi() {
        val righe = Logica.tabellaPrezzi(impianti[0])
        assertEquals(listOf("Benzina", "Gasolio", "Blue Diesel"), righe.map { it.nome })
        assertEquals(1.789, righe[0].prezzoSelf)
        assertEquals(1.899, righe[0].prezzoServito)
        assertNull(righe[1].prezzoServito)
    }

    @Test
    fun quando() {
        val oggi = LocalDate.of(2026, 11, 6)
        assertEquals("oggi alle 7:05", Logica.quando("2026-11-06T07:05", oggi))
        assertEquals("ieri alle 19:00", Logica.quando("2026-11-05T19:00", oggi))
        assertEquals("5 giorni fa (1/11)", Logica.quando("2026-11-01T08:00", oggi))
        assertEquals("data non indicata", Logica.quando(null, oggi))
    }
}
