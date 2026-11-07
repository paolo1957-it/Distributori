package it.quivicino.distributori.auto

import androidx.car.app.CarContext
import androidx.car.app.constraints.ConstraintManager
import androidx.car.app.model.CarColor
import androidx.car.app.model.CarIcon
import androidx.car.app.versioning.CarAppApiLevels
import androidx.core.graphics.drawable.IconCompat
import it.quivicino.distributori.R
import it.quivicino.distributori.core.Fascia

/** Colori e icone comuni alle schermate per l'auto, con le fasce di prezzo della web app. */
object Aspetto {
    fun colore(fascia: Fascia): CarColor = when (fascia) {
        Fascia.ECONOMICO -> CarColor.GREEN
        Fascia.MEDIO -> CarColor.YELLOW
        Fascia.CARO -> CarColor.RED
        Fascia.ND -> CarColor.DEFAULT
    }

    fun pompa(ctx: CarContext, fascia: Fascia): CarIcon =
        CarIcon.Builder(IconCompat.createWithResource(ctx, R.drawable.ic_pompa))
            .setTint(colore(fascia))
            .build()

    /** Quante righe l'auto accetta in un elenco (dipende dall'auto; 6 se non lo dice). */
    fun limite(ctx: CarContext, tipo: Int): Int =
        if (ctx.carAppApiLevel >= CarAppApiLevels.LEVEL_2) {
            runCatching { ctx.getCarService(ConstraintManager::class.java).getContentLimit(tipo) }.getOrDefault(6)
        } else {
            6
        }

    fun km(metri: Double): String = "${(metri / 1000).toInt()} km"
}
