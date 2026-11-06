import XCTest
@testable import QuiDistributori

/// Controlla che la logica Swift dia gli stessi risultati di core.js.
final class LogicaTests: XCTestCase {
    // Una tessera come quelle pubblicate in dati/ da aggiorna_prezzi.py
    let tessera = """
    {"d":[
     {"i":1001,"b":"Eni","n":"ENI STATION","a":"VIA ROMA 1","c":"TORINO","p":"TO","la":45.07,"lo":7.68,
      "f":[["B","",1.789,1,"2026-11-06T07:10"],["B","",1.899,0,"2026-11-06T07:10"],["G","",1.699,1,"2026-11-05T19:00"],
           ["X","Blue Diesel",1.859,1,null]]},
     {"i":"A12","b":"Pompe Bianche","n":"DISTRIBUTORE DELLA STAZIONE","a":"CORSO FRANCIA 10","c":"TORINO","p":"TO",
      "la":45.08,"lo":7.65,"t":1,"f":[["B","",1.749,1,"2026-11-04T08:00"]]},
     {"i":1003,"b":"Q8","n":"Q8","a":"","c":"COLLEGNO","p":"TO","la":45.077,"lo":7.57,"f":[["B","",1.819,1,"2026-11-06T06:00"]]},
     {"i":1004,"b":"IP","n":"IP","a":"VIA LONTANA","c":"MILANO","p":"MI","la":45.46,"lo":9.19,"f":[["B","",1.5,1,"2026-11-06T06:00"]]}
    ]}
    """.data(using: .utf8)!

    func testLetturaTessera() throws {
        let t = try JSONDecoder().decode(Tessera.self, from: tessera)
        XCTAssertEqual(t.d.count, 4)
        XCTAssertEqual(t.d[0].id, "1001")
        XCTAssertEqual(t.d[1].id, "A12")
        XCTAssertTrue(t.d[1].autostrada)
        XCTAssertEqual(t.d[0].prezzi.count, 4)
        XCTAssertEqual(t.d[0].prezzi[3], VocePrezzo(categoria: "X", nome: "Blue Diesel", prezzo: 1.859, isSelf: true, data: nil))
    }

    func testPreparaEFasce() throws {
        let t = try JSONDecoder().decode(Tessera.self, from: tessera)
        let lista = Logica.prepara(t.d, lat: 45.07, lon: 7.66, raggio: 10_000, carburante: .benzina, modo: .selfService)
        XCTAssertEqual(lista.count, 3, "Milano è fuori dal raggio")
        let ordinati = Logica.ordinaPerPrezzo(lista)
        XCTAssertEqual(ordinati.map(\.id), ["A12", "1001", "1003"])
        XCTAssertEqual(ordinati.map(\.fascia), [.economico, .medio, .caro])

        let servito = Logica.prepara(t.d, lat: 45.07, lon: 7.66, raggio: 10_000, carburante: .benzina, modo: .servito)
        XCTAssertEqual(servito.filter { $0.prezzo != nil }.map(\.id), ["1001"])
        XCTAssertEqual(servito.first { $0.id == "1001" }?.fascia, .economico, "un solo prezzo: economico")
        XCTAssertEqual(servito.first { $0.id == "1003" }?.fascia, .nd)
    }

    func testTessereNelRaggio() {
        // Stesso calcolo di DL.tessereNelRaggio(45.07, 7.66, 5000, 0.25)
        let nomi = Logica.tessereNelRaggio(lat: 45.07, lon: 7.66, raggio: 5_000, passo: 0.25)
        XCTAssertEqual(nomi, ["t_180_30.json"])
        let bordo = Logica.tessereNelRaggio(lat: 45.01, lon: 7.51, raggio: 5_000, passo: 0.25)
        XCTAssertEqual(Set(bordo), ["t_179_29.json", "t_179_30.json", "t_180_29.json", "t_180_30.json"])
    }

    func testTesti() throws {
        let t = try JSONDecoder().decode(Tessera.self, from: tessera)
        XCTAssertEqual(Logica.titolo(t.d[0]), "Eni")
        XCTAssertEqual(Logica.titolo(t.d[1]), "Distributore della Stazione")
        XCTAssertEqual(Logica.indirizzo(t.d[0]), "Via Roma 1, Torino (TO)")
        XCTAssertEqual(Logica.indirizzo(t.d[2]), "Collegno (TO)")
        XCTAssertEqual(Logica.capitalizza("VIA DELL'ACQUA E DEL SOLE"), "Via Dell'Acqua e del Sole")
        XCTAssertEqual(Logica.capitalizza("Già Misto"), "Già Misto")
        XCTAssertEqual(Logica.formattaPrezzo(1.789), "1,789")
        XCTAssertEqual(Logica.formattaPrezzo(nil), "–")
        XCTAssertEqual(Logica.formattaDistanza(234), "230 m")
        XCTAssertEqual(Logica.formattaDistanza(2345), "2,3 km")
    }

    func testTabellaPrezzi() throws {
        let t = try JSONDecoder().decode(Tessera.self, from: tessera)
        let righe = Logica.tabellaPrezzi(t.d[0])
        XCTAssertEqual(righe.map(\.nome), ["Benzina", "Gasolio", "Blue Diesel"])
        XCTAssertEqual(righe[0].prezzoSelf, 1.789)
        XCTAssertEqual(righe[0].prezzoServito, 1.899)
        XCTAssertNil(righe[1].prezzoServito)
    }

    func testQuando() {
        let oggi = Logica.data("2026-11-06T12:00")!
        XCTAssertEqual(Logica.quando("2026-11-06T07:05", oggi: oggi), "oggi alle 7:05")
        XCTAssertEqual(Logica.quando("2026-11-05T19:00", oggi: oggi), "ieri alle 19:00")
        XCTAssertEqual(Logica.quando("2026-11-01T08:00", oggi: oggi), "5 giorni fa (1/11)")
        XCTAssertEqual(Logica.quando(nil, oggi: oggi), "data non indicata")
    }
}
