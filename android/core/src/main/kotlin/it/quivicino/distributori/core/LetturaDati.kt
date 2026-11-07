package it.quivicino.distributori.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Legge i file JSON del sito (indice e tessere). */
object LetturaDati {

    fun indice(testo: String): Indice {
        val o = Json.parseToJsonElement(testo).jsonObject
        return Indice(
            passo = o.numero("passo"),
            estrazione = o.testo("estrazione"),
            aggiornato = o.testo("aggiornato"),
            tessere = (o["tessere"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull } ?: emptyList()
        )
    }

    /** File "dati/t_<i>_<j>.json": { "d": [ impianti… ] } */
    fun tessera(testo: String): List<Impianto> {
        val o = Json.parseToJsonElement(testo).jsonObject
        val lista = o["d"] as? JsonArray ?: return emptyList()
        return lista.mapNotNull { (it as? JsonObject)?.let(::impianto) }
    }

    private fun impianto(o: JsonObject): Impianto? {
        val id = (o["i"] as? JsonPrimitive)?.contentOrNull ?: return null
        val lat = o.numero("la") ?: return null
        val lon = o.numero("lo") ?: return null
        return Impianto(
            id = id,
            bandiera = o.testo("b") ?: "",
            nomeImpianto = o.testo("n") ?: "",
            via = o.testo("a") ?: "",
            comune = o.testo("c") ?: "",
            provincia = o.testo("p") ?: "",
            lat = lat,
            lon = lon,
            prezzi = (o["f"] as? JsonArray)?.mapNotNull { voce(it as? JsonArray) } ?: emptyList(),
            autostrada = (o["t"] as? JsonPrimitive)?.intOrNull == 1
        )
    }

    private fun voce(a: JsonArray?): VocePrezzo? {
        if (a == null || a.size < 4) return null
        val prezzo = a[2].jsonPrimitive.doubleOrNull ?: return null
        return VocePrezzo(
            categoria = a[0].jsonPrimitive.contentOrNull ?: return null,
            nome = (a[1] as? JsonPrimitive)?.contentOrNull ?: "",
            prezzo = prezzo,
            isSelf = (a[3] as? JsonPrimitive)?.intOrNull == 1,
            data = if (a.size > 4 && a[4] !is JsonNull) (a[4] as? JsonPrimitive)?.contentOrNull else null
        )
    }

    private fun JsonObject.testo(chiave: String): String? {
        val v = this[chiave]
        return if (v is JsonPrimitive && v !is JsonNull) v.contentOrNull else null
    }

    private fun JsonObject.numero(chiave: String): Double? = (this[chiave] as? JsonPrimitive)?.doubleOrNull
}
