package it.quivicino.distributori.auto

import android.content.Intent
import android.net.Uri
import androidx.car.app.CarContext
import androidx.car.app.CarToast
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.CarColor
import androidx.car.app.model.Pane
import androidx.car.app.model.PaneTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import it.quivicino.distributori.Preferenze
import it.quivicino.distributori.core.Distributore
import it.quivicino.distributori.core.Logica

/** Prezzi e dati di un distributore, con il pulsante Naviga. */
class SchermataDettagli(
    carContext: CarContext,
    private val d: Distributore,
    private val pref: Preferenze
) : Screen(carContext) {

    override fun onGetTemplate(): Template {
        val imp = d.impianto
        val altri = Logica.tabellaPrezzi(imp)
            .filter { it.categoria != pref.carburante.codice }
            .joinToString(" · ") { r ->
                val p = r.prezzoSelf ?: r.prezzoServito
                "${r.nome} ${Logica.formattaPrezzo(p)}"
            }
        val pannello = Pane.Builder()
            .addRow(
                Row.Builder()
                    .setTitle("${pref.descrizione}: ${Logica.formattaPrezzo(d.prezzo)} €/${pref.carburante.unita}")
                    .addText("Prezzo comunicato ${Logica.quando(d.dataPrezzo)}")
                    .setImage(Aspetto.pompa(carContext, d.fascia))
                    .build()
            )
            .addRow(
                Row.Builder()
                    .setTitle("${Logica.formattaDistanza(d.distanza)} · circa ${Logica.minutiInAuto(d.distanza)} min in auto")
                    .addText(Logica.indirizzo(imp) + if (imp.autostrada) " · Autostrada" else "")
                    .build()
            )
        if (altri.isNotEmpty()) {
            pannello.addRow(Row.Builder().setTitle("Altri carburanti").addText(altri).build())
        }
        pannello.addAction(
            Action.Builder()
                .setTitle("Naviga")
                .setBackgroundColor(CarColor.BLUE)
                .setOnClickListener { naviga() }
                .build()
        )
        return PaneTemplate.Builder(pannello.build())
            .setTitle(Logica.titolo(imp))
            .setHeaderAction(Action.BACK)
            .build()
    }

    /** Apre il navigatore dell'auto (Google Maps, Waze…) con il percorso verso il distributore. */
    private fun naviga() {
        val imp = d.impianto
        try {
            carContext.startCarApp(Intent(CarContext.ACTION_NAVIGATE, Uri.parse("geo:${imp.lat},${imp.lon}")))
        } catch (e: Exception) {
            CarToast.makeText(carContext, "Nessun navigatore disponibile", CarToast.LENGTH_LONG).show()
        }
    }
}
