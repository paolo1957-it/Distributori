package it.quivicino.distributori

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper

/** Posizione GPS. Il permesso si chiede sul telefono (anche quando lo chiede l'auto). */
class Posizione(private val ctx: Context) {
    private val manager = ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private var ascoltatore: LocationListener? = null

    var ultima: Location? = null
        private set

    fun autorizzata(): Boolean =
        ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ctx.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission")
    fun avvia(aggiornamento: (Location) -> Unit) {
        if (!autorizzata()) return
        ferma()
        val l = LocationListener { loc ->
            ultima = loc
            aggiornamento(loc)
        }
        ascoltatore = l
        val fornitori = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
            .filter { runCatching { manager.isProviderEnabled(it) }.getOrDefault(false) }
        for (f in fornitori) {
            manager.requestLocationUpdates(f, 5_000L, 50f, l, Looper.getMainLooper())
            val nota = manager.getLastKnownLocation(f)
            if (nota != null && (ultima == null || nota.time > (ultima?.time ?: 0))) ultima = nota
        }
    }

    fun ferma() {
        ascoltatore?.let { manager.removeUpdates(it) }
        ascoltatore = null
    }
}
