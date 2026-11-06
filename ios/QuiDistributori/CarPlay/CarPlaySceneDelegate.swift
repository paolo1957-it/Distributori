import CarPlay

/// Si attiva quando l'iPhone si collega a CarPlay.
final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    private var interfaccia: InterfacciaCarPlay?

    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didConnect interfaceController: CPInterfaceController) {
        let nuova = InterfacciaCarPlay(scena: templateApplicationScene, controller: interfaceController)
        interfaccia = nuova
        nuova.avvia()
    }

    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didDisconnectInterfaceController interfaceController: CPInterfaceController) {
        interfaccia?.ferma()
        interfaccia = nil
    }
}
