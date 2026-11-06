import Foundation

/// Scelte dell'utente, salvate sul telefono e condivise tra iPhone e CarPlay.
/// I valori iniziali sono quelli di config.js della web app.
struct Preferenze: Equatable {
    var carburante: Carburante
    var modo: Modo
    var raggioMetri: Double

    static let raggiDisponibili: [Double] = [2_000, 5_000, 10_000, 20_000]

    private static let archivio = UserDefaults.standard

    static var attuali: Preferenze {
        get {
            let raggio = archivio.double(forKey: "raggioMetri")
            return Preferenze(
                carburante: Carburante(rawValue: archivio.string(forKey: "carburante") ?? "") ?? .benzina,
                modo: Modo(rawValue: archivio.string(forKey: "modo") ?? "") ?? .selfService,
                raggioMetri: raggio > 0 ? raggio : 5_000
            )
        }
        set {
            archivio.set(newValue.carburante.rawValue, forKey: "carburante")
            archivio.set(newValue.modo.rawValue, forKey: "modo")
            archivio.set(newValue.raggioMetri, forKey: "raggioMetri")
        }
    }

    /// Per esempio "Benzina self"
    var descrizione: String { "\(carburante.nome) \(modo.nome.lowercased())" }
}
