package it.quivicino.distributori

import android.content.Context
import it.quivicino.distributori.core.Carburante
import it.quivicino.distributori.core.Modo

/** Scelte dell'utente, salvate sul telefono. I valori iniziali sono quelli di config.js della web app. */
data class Preferenze(val carburante: Carburante, val modo: Modo, val raggioMetri: Double) {

    /** Per esempio "Benzina self" */
    val descrizione: String get() = "${carburante.nome} ${modo.nome.lowercase()}"

    companion object {
        val RAGGI = listOf(2_000.0, 5_000.0, 10_000.0, 20_000.0)
        private const val FILE = "preferenze"

        fun leggi(ctx: Context): Preferenze {
            val p = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)
            return Preferenze(
                carburante = Carburante.daCodice(p.getString("carburante", null)) ?: Carburante.BENZINA,
                modo = Modo.daCodice(p.getString("modo", null)) ?: Modo.SELF,
                raggioMetri = p.getFloat("raggioMetri", 5_000f).toDouble()
            )
        }

        fun salva(ctx: Context, pref: Preferenze) {
            ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit()
                .putString("carburante", pref.carburante.codice)
                .putString("modo", pref.modo.codice)
                .putFloat("raggioMetri", pref.raggioMetri.toFloat())
                .apply()
        }
    }
}
