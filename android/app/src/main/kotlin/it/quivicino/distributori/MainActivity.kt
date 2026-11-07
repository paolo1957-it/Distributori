package it.quivicino.distributori

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.GeolocationPermissions
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Sul telefono l'app mostra la web app pubblicata, così resta una sola interfaccia da mantenere.
 * Qui si chiede anche il permesso di posizione che serve ad Android Auto.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.setGeolocationEnabled(true)
        web.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                callback.invoke(origin, true, false)
            }
        }
        web.webViewClient = object : WebViewClient() {
            // I link esterni (navigatore, OpenStreetMap, guida…) si aprono fuori dall'app.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == INDIRIZZO.host && (url.path ?: "").startsWith("/Distributori")) return false
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                } catch (e: ActivityNotFoundException) {
                    // nessuna app per aprirlo
                }
                return true
            }
        }
        setContentView(web)
        if (savedInstanceState == null) web.loadUrl(INDIRIZZO.toString()) else web.restoreState(savedInstanceState)

        requestPermissions(
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), 1
        )
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    @Deprecated("Gestione semplice del tasto Indietro")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    companion object {
        val INDIRIZZO: Uri = Uri.parse("https://quivicino.github.io/Distributori/")
    }
}
