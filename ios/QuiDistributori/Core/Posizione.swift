import CoreLocation

/// Posizione GPS condivisa tra iPhone e CarPlay.
/// Il permesso si chiede sull'iPhone: su CarPlay iOS non mostra la richiesta.
@MainActor
final class Posizione: NSObject, CLLocationManagerDelegate {
    static let condivisa = Posizione()

    private let manager = CLLocationManager()
    private(set) var ultima: CLLocation?
    private var osservatori: [UUID: () -> Void] = [:]

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.distanceFilter = 50
    }

    var stato: CLAuthorizationStatus { manager.authorizationStatus }
    var autorizzata: Bool { stato == .authorizedWhenInUse || stato == .authorizedAlways }
    var negata: Bool { stato == .denied || stato == .restricted }

    func chiediPermesso() {
        if stato == .notDetermined { manager.requestWhenInUseAuthorization() }
    }

    func avvia() {
        chiediPermesso()
        if autorizzata { manager.startUpdatingLocation() }
    }

    func ferma() { manager.stopUpdatingLocation() }

    /// Il blocco viene chiamato a ogni nuova posizione e a ogni cambio di permesso.
    @discardableResult
    func osserva(_ blocco: @escaping () -> Void) -> UUID {
        let id = UUID()
        osservatori[id] = blocco
        return id
    }

    func smetti(_ id: UUID) { osservatori[id] = nil }

    private func avvisa() { osservatori.values.forEach { $0() } }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let l = locations.last else { return }
        Task { @MainActor in
            self.ultima = l
            self.avvisa()
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            if self.autorizzata { self.manager.startUpdatingLocation() }
            self.avvisa()
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Nessun segnale per un attimo: si riprova da soli.
    }
}
