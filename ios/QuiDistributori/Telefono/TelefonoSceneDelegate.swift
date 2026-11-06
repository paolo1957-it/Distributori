import UIKit
import WebKit

/// Sullo schermo dell'iPhone l'app mostra la web app pubblicata, così resta una sola interfaccia
/// da mantenere. Qui si chiede anche il permesso di posizione che serve a CarPlay.
final class TelefonoSceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = WebAppViewController()
        window.makeKeyAndVisible()
        self.window = window
        Posizione.condivisa.avvia()
    }
}

final class WebAppViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    static let indirizzo = URL(string: "https://quivicino.github.io/Distributori/")!

    private var webView: WKWebView!

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        webView.load(URLRequest(url: Self.indirizzo))
    }

    // I link esterni (navigatore, OpenStreetMap, guida…) si aprono fuori dall'app.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { return decisionHandler(.allow) }
        let interno = url.host == Self.indirizzo.host && url.path.hasPrefix("/Distributori")
        if interno || url.scheme == "about" || url.scheme == "blob" || url.scheme == "data" {
            decisionHandler(.allow)
        } else if navigationAction.targetFrame?.isMainFrame == false {
            decisionHandler(.allow)   // iframe e risorse della pagina
        } else {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        }
    }

    // target="_blank": apre fuori dall'app.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { UIApplication.shared.open(url) }
        return nil
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        mostraErrore()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        mostraErrore()
    }

    private func mostraErrore() {
        let html = """
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <body style="font-family:-apple-system;text-align:center;padding:30vh 24px;color:#555">
        <h2>Nessuna connessione</h2><p>Qui-Distributori ha bisogno di internet per scaricare i prezzi.</p>
        <p><a href="\(Self.indirizzo.absoluteString)">Riprova</a></p></body>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }
}
