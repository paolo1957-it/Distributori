package it.quivicino.distributori.auto

import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.constraints.ConstraintManager
import androidx.car.app.model.Action
import androidx.car.app.model.ItemList
import androidx.car.app.model.ListTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import it.quivicino.distributori.Preferenze
import it.quivicino.distributori.core.Distributore
import it.quivicino.distributori.core.Logica

/** Tutti i distributori trovati, dal più economico. Tocca una riga per i dettagli. */
class SchermataElenco(
    carContext: CarContext,
    private val distributori: List<Distributore>,
    private val pref: Preferenze
) : Screen(carContext) {

    override fun onGetTemplate(): Template {
        val massimo = Aspetto.limite(carContext, ConstraintManager.CONTENT_LIMIT_TYPE_LIST)
        val elenco = ItemList.Builder()
        val conPrezzo = distributori.filter { it.prezzo != null }.take(massimo)
        if (conPrezzo.isEmpty()) elenco.setNoItemsMessage("Nessun prezzo ${pref.descrizione.lowercase()} qui vicino")
        val unita = pref.carburante.unita
        for (d in conPrezzo) {
            elenco.addItem(
                Row.Builder()
                    .setTitle("${Logica.formattaPrezzo(d.prezzo)} €/$unita · ${Logica.titolo(d.impianto)}")
                    .addText("${Logica.formattaDistanza(d.distanza)} · ${Logica.indirizzo(d.impianto)}")
                    .setImage(Aspetto.pompa(carContext, d.fascia))
                    .setOnClickListener { screenManager.push(SchermataDettagli(carContext, d, pref)) }
                    .build()
            )
        }
        return ListTemplate.Builder()
            .setTitle("Più economici · ${pref.descrizione}")
            .setHeaderAction(Action.BACK)
            .setSingleList(elenco.build())
            .build()
    }
}
