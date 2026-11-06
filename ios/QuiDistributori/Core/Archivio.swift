import Foundation

/// Scarica i prezzi pubblicati dalla web app (GitHub Pages) e li tiene in memoria.
/// Stessa strategia di app.js: l'indice si rilegge ogni 15 minuti e, se i prezzi sono
/// cambiati, le tessere già scaricate vengono buttate.
actor ArchivioPrezzi {
    static let condiviso = ArchivioPrezzi()

    /// Cartella "dati/" del sito pubblicato.
    static let indirizzoDati = URL(string: "https://quivicino.github.io/Distributori/dati/")!

    private var indice: Indice?
    private var indiceLetto = Date.distantPast
    private var tessere: [String: [Impianto]] = [:]

    enum Errore: LocalizedError {
        case http(Int)
        var errorDescription: String? {
            switch self {
            case .http(let codice): return "Il sito ha risposto con l'errore \(codice)"
            }
        }
    }

    func leggiIndice(forza: Bool = false) async throws -> Indice {
        if !forza, let indice, Date().timeIntervalSince(indiceLetto) < 15 * 60 { return indice }
        let nuovo: Indice = try await Self.scarica("indice.json", timeout: 10)
        if indice == nil || nuovo.aggiornato != indice?.aggiornato { tessere.removeAll() }
        indice = nuovo
        indiceLetto = Date()
        return nuovo
    }

    /// Impianti delle tessere che coprono il cerchio (da filtrare poi con Logica.prepara).
    func impianti(lat: Double, lon: Double, raggio: Double, forza: Bool = false) async throws -> [Impianto] {
        let ind = try await leggiIndice(forza: forza)
        let esistenti = Set(ind.tessere ?? [])
        let nomi = Logica.tessereNelRaggio(lat: lat, lon: lon, raggio: raggio, passo: ind.passo ?? 0.25)
            .filter { esistenti.contains($0) }
        let mancanti = nomi.filter { tessere[$0] == nil }
        if !mancanti.isEmpty {
            let scaricate = try await withThrowingTaskGroup(of: (String, [Impianto]).self) { gruppo in
                for nome in mancanti {
                    gruppo.addTask {
                        let t: Tessera = try await Self.scarica(nome, timeout: 15)
                        return (nome, t.d)
                    }
                }
                var risultato: [(String, [Impianto])] = []
                for try await coppia in gruppo { risultato.append(coppia) }
                return risultato
            }
            for (nome, lista) in scaricate { tessere[nome] = lista }
        }
        return nomi.flatMap { tessere[$0] ?? [] }
    }

    /// Data dell'estrazione MIMIT dei prezzi in memoria, se nota.
    func estrazione() -> String? { indice?.estrazione }

    private static func scarica<T: Decodable>(_ nome: String, timeout: TimeInterval) async throws -> T {
        var richiesta = URLRequest(url: indirizzoDati.appendingPathComponent(nome))
        richiesta.timeoutInterval = timeout
        richiesta.cachePolicy = .reloadRevalidatingCacheData
        let (dati, risposta) = try await URLSession.shared.data(for: richiesta)
        if let http = risposta as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw Errore.http(http.statusCode)
        }
        return try JSONDecoder().decode(T.self, from: dati)
    }
}
