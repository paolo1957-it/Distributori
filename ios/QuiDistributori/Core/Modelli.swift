import Foundation

// Dati pubblicati dal sito (cartella "dati/"), nello stesso formato che legge la web app.
// Vedi aggiorna_prezzi.py per come vengono prodotti.

/// Carburanti confrontabili tra distributori (codici del sito).
enum Carburante: String, CaseIterable, Codable {
    case benzina = "B"
    case gasolio = "G"
    case gpl = "L"
    case metano = "M"

    var nome: String {
        switch self {
        case .benzina: return "Benzina"
        case .gasolio: return "Gasolio"
        case .gpl: return "GPL"
        case .metano: return "Metano"
        }
    }

    var unita: String { self == .metano ? "kg" : "l" }
}

enum Modo: String, CaseIterable, Codable {
    case selfService = "self"
    case servito = "servito"

    var nome: String { self == .selfService ? "Self" : "Servito" }
}

/// Una voce di prezzo: nel file è l'array [categoria, nome, prezzo, self 1/0, data ISO].
struct VocePrezzo: Decodable, Equatable {
    let categoria: String      // "B", "G", "L", "M" oppure "X" per i carburanti speciali
    let nome: String           // solo per i carburanti speciali
    let prezzo: Double
    let isSelf: Bool
    let data: String?          // "YYYY-MM-DDTHH:MM", ora italiana

    init(categoria: String, nome: String = "", prezzo: Double, isSelf: Bool, data: String? = nil) {
        self.categoria = categoria
        self.nome = nome
        self.prezzo = prezzo
        self.isSelf = isSelf
        self.data = data
    }

    init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        categoria = try c.decode(String.self)
        nome = (try c.decodeIfPresent(String.self)) ?? ""
        prezzo = try c.decode(Double.self)
        isSelf = (try c.decodeIfPresent(Int.self) ?? 0) == 1
        if c.isAtEnd {
            data = nil
        } else {
            data = try c.decodeIfPresent(String.self)
        }
    }
}

/// Un impianto come sta nelle tessere del sito.
struct Impianto: Decodable, Identifiable, Equatable {
    let id: String
    let bandiera: String
    let nomeImpianto: String
    let via: String
    let comune: String
    let provincia: String
    let lat: Double
    let lon: Double
    let prezzi: [VocePrezzo]
    let autostrada: Bool

    enum CodingKeys: String, CodingKey { case i, b, n, a, c, p, la, lo, f, t }

    init(id: String, bandiera: String = "", nomeImpianto: String = "", via: String = "", comune: String = "",
         provincia: String = "", lat: Double, lon: Double, prezzi: [VocePrezzo] = [], autostrada: Bool = false) {
        self.id = id
        self.bandiera = bandiera
        self.nomeImpianto = nomeImpianto
        self.via = via
        self.comune = comune
        self.provincia = provincia
        self.lat = lat
        self.lon = lon
        self.prezzi = prezzi
        self.autostrada = autostrada
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let numero = try? c.decode(Int.self, forKey: .i) {
            id = String(numero)
        } else {
            id = try c.decode(String.self, forKey: .i)
        }
        bandiera = try c.decodeIfPresent(String.self, forKey: .b) ?? ""
        nomeImpianto = try c.decodeIfPresent(String.self, forKey: .n) ?? ""
        via = try c.decodeIfPresent(String.self, forKey: .a) ?? ""
        comune = try c.decodeIfPresent(String.self, forKey: .c) ?? ""
        provincia = try c.decodeIfPresent(String.self, forKey: .p) ?? ""
        lat = try c.decode(Double.self, forKey: .la)
        lon = try c.decode(Double.self, forKey: .lo)
        prezzi = try c.decodeIfPresent([VocePrezzo].self, forKey: .f) ?? []
        autostrada = (try c.decodeIfPresent(Int.self, forKey: .t) ?? 0) == 1
    }
}

/// File "dati/t_<i>_<j>.json"
struct Tessera: Decodable {
    let d: [Impianto]
}

/// File "dati/indice.json"
struct Indice: Decodable {
    let passo: Double?
    let estrazione: String?
    let aggiornato: String?
    let tessere: [String]?
}

/// Fascia di prezzo rispetto agli altri distributori in zona (come nella web app).
enum Fascia: String {
    case economico, medio, caro, nd
}

/// Un distributore entro il raggio, con distanza e prezzo per il carburante scelto.
struct Distributore: Identifiable, Equatable {
    let impianto: Impianto
    let distanza: Double
    let prezzo: Double?
    let dataPrezzo: String?
    var fascia: Fascia

    var id: String { impianto.id }
}

/// Riga della tabella dei prezzi di un distributore (self e servito per ogni carburante).
struct RigaPrezzi: Equatable {
    let categoria: String
    let nome: String
    var prezzoSelf: Double?
    var prezzoServito: Double?
    var data: String?
}
