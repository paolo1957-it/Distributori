import Foundation

/// Logica pura, tradotta da core.js della web app: distanze, prezzi, fasce, testi.
/// Se cambi una regola in core.js, cambiala anche qui (i test in QuiDistributoriTests aiutano).
enum Logica {
    static let raggioTerra = 6_371_000.0

    static func distanza(_ lat1: Double, _ lon1: Double, _ lat2: Double, _ lon2: Double) -> Double {
        let rad = Double.pi / 180
        let dLat = (lat2 - lat1) * rad
        let dLon = (lon2 - lon1) * rad
        let a = pow(sin(dLat / 2), 2) + cos(lat1 * rad) * cos(lat2 * rad) * pow(sin(dLon / 2), 2)
        return 2 * raggioTerra * asin(sqrt(a))
    }

    static func formattaDistanza(_ m: Double) -> String {
        if m < 1000 { return "\(Int((m / 10).rounded()) * 10) m" }
        return String(format: "%.1f km", locale: Locale(identifier: "en_US_POSIX"), m / 1000)
            .replacingOccurrences(of: ".", with: ",")
    }

    static func formattaPrezzo(_ p: Double?) -> String {
        guard let p else { return "–" }
        return String(format: "%.3f", locale: Locale(identifier: "en_US_POSIX"), p)
            .replacingOccurrences(of: ".", with: ",")
    }

    /// Minuti in auto, stima prudente in città (circa 30 km/h)
    static func minutiInAuto(_ m: Double) -> Int { max(1, Int((m / 500).rounded())) }

    // MARK: Prezzi

    static func prezzo(di impianto: Impianto, carburante: Carburante, modo: Modo) -> VocePrezzo? {
        let vuoleSelf = modo != .servito
        return impianto.prezzi.first { $0.categoria == carburante.rawValue && $0.isSelf == vuoleSelf }
    }

    static func tabellaPrezzi(_ impianto: Impianto) -> [RigaPrezzi] {
        var righe: [String: RigaPrezzi] = [:]
        var ordineInserimento: [String] = []
        for v in impianto.prezzi {
            let chiave = v.categoria == "X" ? "X:" + v.nome : v.categoria
            if righe[chiave] == nil {
                let nome = v.categoria == "X" ? v.nome : (Carburante(rawValue: v.categoria)?.nome ?? v.nome)
                righe[chiave] = RigaPrezzi(categoria: v.categoria, nome: nome)
                ordineInserimento.append(chiave)
            }
            if v.isSelf { righe[chiave]?.prezzoSelf = v.prezzo } else { righe[chiave]?.prezzoServito = v.prezzo }
            if let d = v.data, (righe[chiave]?.data ?? "") < d { righe[chiave]?.data = d }
        }
        let ordine = ["B", "G", "L", "M", "X"]
        return ordineInserimento.compactMap { righe[$0] }.sorted {
            let a = ordine.firstIndex(of: $0.categoria) ?? ordine.count
            let b = ordine.firstIndex(of: $1.categoria) ?? ordine.count
            return a != b ? a < b : $0.nome.localizedCompare($1.nome) == .orderedAscending
        }
    }

    // MARK: Distributori nel raggio

    static func prepara(_ lista: [Impianto], lat: Double, lon: Double, raggio: Double,
                        carburante: Carburante, modo: Modo) -> [Distributore] {
        var out: [Distributore] = []
        for imp in lista {
            let dist = distanza(lat, lon, imp.lat, imp.lon)
            if dist > raggio { continue }
            let p = prezzo(di: imp, carburante: carburante, modo: modo)
            out.append(Distributore(impianto: imp, distanza: dist, prezzo: p?.prezzo, dataPrezzo: p?.data, fascia: .nd))
        }
        return classifica(out)
    }

    /// "economico" il terzo più basso, "caro" il terzo più alto, "medio" il resto, "nd" senza prezzo.
    static func classifica(_ lista: [Distributore]) -> [Distributore] {
        let prezzi = lista.compactMap(\.prezzo).sorted()
        let n = prezzi.count
        guard n > 0 else { return lista }
        let minimo = prezzi[0], massimo = prezzi[n - 1]
        let soglia1 = prezzi[(n - 1) / 3]
        let soglia2 = prezzi[Int((2.0 * Double(n - 1) / 3.0).rounded(.up))]
        return lista.map { d in
            var d = d
            guard let p = d.prezzo else { return d }
            if massimo - minimo < 0.0005 { d.fascia = .economico }
            else if p <= soglia1 { d.fascia = .economico }
            else if p >= soglia2 && p > soglia1 { d.fascia = .caro }
            else { d.fascia = .medio }
            return d
        }
    }

    /// Prima i distributori con prezzo, dal più economico; a parità di prezzo il più vicino.
    static func ordinaPerPrezzo(_ lista: [Distributore]) -> [Distributore] {
        lista.sorted { a, b in
            switch (a.prezzo, b.prezzo) {
            case let (pa?, pb?): return pa != pb ? pa < pb : a.distanza < b.distanza
            case (.some, .none): return true
            case (.none, .some): return false
            case (.none, .none): return a.distanza < b.distanza
            }
        }
    }

    /// Nomi delle tessere del sito che coprono il cerchio di ricerca.
    static func tessereNelRaggio(lat: Double, lon: Double, raggio: Double, passo: Double) -> [String] {
        let dLat = raggio / 111_320
        let dLon = raggio / (111_320 * cos(lat * .pi / 180))
        var nomi: [String] = []
        let i0 = Int(floor((lat - dLat) / passo)), i1 = Int(floor((lat + dLat) / passo))
        let j0 = Int(floor((lon - dLon) / passo)), j1 = Int(floor((lon + dLon) / passo))
        for i in i0...i1 {
            for j in j0...j1 { nomi.append("t_\(i)_\(j).json") }
        }
        return nomi
    }

    // MARK: Date

    private static let formatoData: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Europe/Rome")
        f.dateFormat = "yyyy-MM-dd'T'HH:mm"
        return f
    }()

    static func data(_ iso: String?) -> Date? {
        guard let iso else { return nil }
        return formatoData.date(from: String(iso.prefix(16)))
    }

    /// Giorni di calendario trascorsi dalla data del prezzo a "oggi".
    static func giorniDa(_ iso: String?, oggi: Date = Date()) -> Int? {
        guard let d = data(iso) else { return nil }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Europe/Rome") ?? .current
        return cal.dateComponents([.day], from: cal.startOfDay(for: d), to: cal.startOfDay(for: oggi)).day
    }

    static func quando(_ iso: String?, oggi: Date = Date()) -> String {
        guard let g = giorniDa(iso, oggi: oggi), let d = data(iso) else { return "data non indicata" }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Europe/Rome") ?? .current
        let c = cal.dateComponents([.hour, .minute, .day, .month], from: d)
        let ora = "\(c.hour ?? 0):" + String(format: "%02d", c.minute ?? 0)
        if g <= 0 { return "oggi alle " + ora }
        if g == 1 { return "ieri alle " + ora }
        return "\(g) giorni fa (\(c.day ?? 0)/\(c.month ?? 0))"
    }

    // MARK: Testi

    /// Nome da mostrare: il marchio, oppure il nome dell'impianto per le "pompe bianche".
    static func titolo(_ imp: Impianto) -> String {
        let b = imp.bandiera.trimmingCharacters(in: .whitespaces)
        if b.isEmpty || b.lowercased().contains("pompe bianche") {
            return capitalizza(imp.nomeImpianto.isEmpty ? "Distributore" : imp.nomeImpianto)
        }
        return b
    }

    private static let paroleMinuscole: Set<String> = [
        "di", "de", "del", "dei", "degli", "della", "delle", "dello", "da", "dal", "dalla",
        "al", "alla", "e", "ed", "in", "sul", "sulla", "per"
    ]

    /// Da "VIA DELLA REPUBBLICA" a "Via della Repubblica"; il testo già misto resta com'è.
    static func capitalizza(_ testo: String) -> String {
        let s = testo.trimmingCharacters(in: .whitespaces)
        guard !s.isEmpty, s == s.uppercased() else { return s }
        let separatori: Set<Character> = ["'", "’", ".", "-", "/", "("]
        var out = ""
        var maiuscola = true
        for ch in s.lowercased() {
            if maiuscola && ch.isLetter { out += String(ch).uppercased() } else { out.append(ch) }
            maiuscola = ch.isWhitespace || separatori.contains(ch)
        }
        var parole = out.components(separatedBy: " ")
        if parole.count > 2 {
            for k in 1..<(parole.count - 1) where paroleMinuscole.contains(parole[k].lowercased()) {
                parole[k] = parole[k].lowercased()
            }
        }
        return parole.joined(separator: " ")
    }

    static func indirizzo(_ imp: Impianto) -> String {
        let via = capitalizza(imp.via)
        let comune = capitalizza(imp.comune) + (imp.provincia.isEmpty ? "" : " (\(imp.provincia))")
        return [via, comune].filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.joined(separator: ", ")
    }
}
