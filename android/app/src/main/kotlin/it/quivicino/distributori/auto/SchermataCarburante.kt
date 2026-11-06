package it.quivicino.distributori.auto

import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.ItemList
import androidx.car.app.model.ListTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.SectionedItemList
import androidx.car.app.model.Template
import it.quivicino.distributori.Preferenze
import it.quivicino.distributori.core.Carburante
import it.quivicino.distributori.core.Modo

/** Scelta di carburante, self/servito e raggio. Tornando alla mappa la ricerca si aggiorna. */
class SchermataCarburante(carContext: CarContext) : Screen(carContext) {

    override fun onGetTemplate(): Template {
        val pref = Preferenze.leggi(carContext)
        return ListTemplate.Builder()
            .setTitle("Carburante")
            .setHeaderAction(Action.BACK)
            .addSectionedList(
                sezione("Carburante", Carburante.entries.map { it.nome }, Carburante.entries.indexOf(pref.carburante)) {
                    pref.copy(carburante = Carburante.entries[it])
                }
            )
            .addSectionedList(
                sezione("Rifornimento", Modo.entries.map { it.nome }, Modo.entries.indexOf(pref.modo)) {
                    pref.copy(modo = Modo.entries[it])
                }
            )
            .addSectionedList(
                sezione(
                    "Raggio di ricerca",
                    Preferenze.RAGGI.map { "Entro ${Aspetto.km(it)}" },
                    Preferenze.RAGGI.indexOf(pref.raggioMetri).coerceAtLeast(0)
                ) { pref.copy(raggioMetri = Preferenze.RAGGI[it]) }
            )
            .build()
    }

    private fun sezione(titolo: String, voci: List<String>, scelta: Int, cambia: (Int) -> Preferenze): SectionedItemList {
        val elenco = ItemList.Builder()
        voci.forEach { elenco.addItem(Row.Builder().setTitle(it).build()) }
        elenco.setSelectedIndex(scelta)
        elenco.setOnSelectedListener { indice ->
            Preferenze.salva(carContext, cambia(indice))
            invalidate()
        }
        return SectionedItemList.create(elenco.build(), titolo)
    }
}
