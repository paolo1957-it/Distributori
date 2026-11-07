import CarPlay
import CoreLocation
import MapKit

/// Le schermate di Qui-Distributori su CarPlay (categoria "Fueling").
///
/// Tre schede in basso:
///  1. Mappa: fino a 12 distributori con il prezzo (limite di Apple), colorati per fascia.
///  2. Più economici: elenco ordinato per prezzo; tocca per i dettagli.
///  3. Carburante: carburante, self/servito e raggio di ricerca.
/// Dai dettagli, "Naviga" apre Mappe sul cruscotto con il percorso.
@MainActor
final class InterfacciaCarPlay: NSObject, CPPointOfInterestTemplateDelegate {
    private let scena: CPTemplateApplicationScene
    private let controller: CPInterfaceController

    private var mappa: CPPointOfInterestTemplate!
    private var elenco: CPListTemplate!
    private var impostazioni: CPListTemplate!

    private var osservatore: UUID?
    private var caricamento: Task<Void, Never>?
    private var attesaRegione: Task<Void, Never>?

    /// true: la ricerca segue il GPS. false: l'utente ha spostato la mappa altrove.
    private var seguiPosizione = true
    private var centroRicerca: CLLocation?
    private var ignoraRegioneFinoA = Date.distantPast
    private var avvisoPosizioneMostrato = false
    private var distributori: [Distributore] = []

    /// Ricarica quando ti sposti di più di questi metri (ricaricaDopoMetri in config.js)
    private let ricaricaDopoMetri = 300.0

    init(scena: CPTemplateApplicationScene, controller: CPInterfaceController) {
        self.scena = scena
        self.controller = controller
        super.init()
    }

    // MARK: Avvio e chiusura

    func avvia() {
        mappa = CPPointOfInterestTemplate(title: Preferenze.attuali.descrizione, pointsOfInterest: [], selectedIndex: NSNotFound)
        mappa.pointOfInterestDelegate = self
        mappa.tabTitle = "Mappa"
        mappa.tabImage = UIImage(systemName: "map")
        let qui = CPBarButton(title: "Qui") { [weak self] _ in
            Task { @MainActor in self?.tornaAllaPosizione() }
        }
        mappa.trailingNavigationBarButtons = [qui]

        elenco = CPListTemplate(title: "Più economici", sections: [])
        elenco.tabTitle = "Più economici"
        elenco.tabImage = UIImage(systemName: "list.number")
        elenco.emptyViewTitleVariants = ["Cerco i distributori…"]

        impostazioni = CPListTemplate(title: "Carburante", sections: [])
        impostazioni.tabTitle = "Carburante"
        impostazioni.tabImage = UIImage(systemName: "fuelpump")
        aggiornaImpostazioni()

        let schede = CPTabBarTemplate(templates: [mappa, elenco, impostazioni])
        controller.setRootTemplate(schede, animated: false, completion: nil)

        osservatore = Posizione.condivisa.osserva { [weak self] in self?.posizioneCambiata() }
        Posizione.condivisa.avvia()
        posizioneCambiata()
    }

    func ferma() {
        if let osservatore { Posizione.condivisa.smetti(osservatore) }
        caricamento?.cancel()
        attesaRegione?.cancel()
    }

    // MARK: Posizione e mappa

    private func posizioneCambiata() {
        let pos = Posizione.condivisa
        if pos.negata {
            mostraMessaggio("Posizione non disponibile",
                            "Sull'iPhone: Impostazioni › Qui-Distributori › Posizione › Mentre usi l'app.")
            avvisaPosizione()
            return
        }
        guard seguiPosizione, let qui = pos.ultima else {
            if pos.ultima == nil && !pos.autorizzata {
                mostraMessaggio("Apri Qui-Distributori sull'iPhone", "e consenti l'accesso alla posizione.")
            }
            return
        }
        if let centro = centroRicerca, centro.distance(from: qui) < ricaricaDopoMetri { return }
        carica(attorno: qui, raggio: Preferenze.attuali.raggioMetri)
    }

    private func tornaAllaPosizione() {
        seguiPosizione = true
        centroRicerca = nil
        posizioneCambiata()
    }

    nonisolated func pointOfInterestTemplate(_ pointOfInterestTemplate: CPPointOfInterestTemplate,
                                             didChangeMapRegion region: MKCoordinateRegion) {
        let centro = CLLocation(latitude: region.center.latitude, longitude: region.center.longitude)
        // Metà della diagonale della zona visibile, in metri
        let metaDiagonale = hypot(region.span.latitudeDelta * 111_320,
                                  region.span.longitudeDelta * 111_320 * cos(region.center.latitude * .pi / 180)) / 2
        Task { @MainActor in self.regioneCambiata(centro: centro, metaDiagonale: metaDiagonale) }
    }

    /// L'utente ha spostato o zoomato la mappa: cerca nella nuova zona (con un attimo di attesa).
    private func regioneCambiata(centro: CLLocation, metaDiagonale: Double) {
        // La mappa si sposta da sola quando mostriamo i nuovi distributori: quello non conta.
        guard Date() > ignoraRegioneFinoA else { return }
        let raggio = min(max(Preferenze.attuali.raggioMetri, metaDiagonale), 25_000)
        if let vecchio = centroRicerca, vecchio.distance(from: centro) < max(1_000, raggio * 0.4) { return }
        attesaRegione?.cancel()
        attesaRegione = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 800_000_000)
            guard let self, !Task.isCancelled else { return }
            self.seguiPosizione = false
            self.carica(attorno: centro, raggio: raggio)
        }
    }

    // MARK: Dati

    private func carica(attorno centro: CLLocation, raggio: Double, forza: Bool = false) {
        centroRicerca = centro
        caricamento?.cancel()
        let lat = centro.coordinate.latitude, lon = centro.coordinate.longitude
        caricamento = Task { [weak self] in
            do {
                let impianti = try await ArchivioPrezzi.condiviso.impianti(lat: lat, lon: lon, raggio: raggio, forza: forza)
                guard let self, !Task.isCancelled else { return }
                let pref = Preferenze.attuali
                let lista = Logica.prepara(impianti, lat: lat, lon: lon, raggio: raggio,
                                           carburante: pref.carburante, modo: pref.modo)
                self.mostra(Logica.ordinaPerPrezzo(lista), raggio: raggio)
            } catch {
                guard let self, !Task.isCancelled else { return }
                self.centroRicerca = nil   // al prossimo spostamento si riprova
                self.mostraMessaggio("Prezzi non raggiungibili", "Controlla la connessione dell'iPhone e riprova.")
            }
        }
    }

    private func mostra(_ lista: [Distributore], raggio: Double) {
        distributori = lista
        let pref = Preferenze.attuali
        let conPrezzo = lista.filter { $0.prezzo != nil }

        // Mappa: Apple ne accetta al massimo 12
        let punti = conPrezzo.prefix(12).map(puntoDiInteresse)
        ignoraRegioneFinoA = Date().addingTimeInterval(2)
        mappa.title = pref.descrizione
        mappa.setPointsOfInterest(Array(punti), selectedIndex: NSNotFound)

        // Elenco
        let massimo = min(CPListTemplate.maximumItemCount, 30)
        let voci = conPrezzo.prefix(massimo).map(voceElenco)
        let intestazione = "\(pref.descrizione) · entro \(Logica.formattaDistanza(raggio))"
        elenco.updateSections(voci.isEmpty ? [] : [CPListSection(items: Array(voci), header: intestazione, sectionIndexTitle: nil)])
        if voci.isEmpty {
            elenco.emptyViewTitleVariants = ["Nessun prezzo \(pref.descrizione.lowercased())"]
            elenco.emptyViewSubtitleVariants = ["Prova un raggio più grande nella scheda Carburante."]
        }
    }

    private func mostraMessaggio(_ titolo: String, _ sottotitolo: String) {
        elenco.updateSections([])
        elenco.emptyViewTitleVariants = [titolo]
        elenco.emptyViewSubtitleVariants = [sottotitolo]
    }

    private func avvisaPosizione() {
        guard !avvisoPosizioneMostrato, controller.presentedTemplate == nil else { return }
        avvisoPosizioneMostrato = true
        let ok = CPAlertAction(title: "OK", style: .cancel) { [weak self] _ in
            Task { @MainActor in self?.controller.dismissTemplate(animated: true, completion: nil) }
        }
        let avviso = CPAlertTemplate(titleVariants: ["Consenti la posizione sull'iPhone per vedere i distributori vicini"],
                                     actions: [ok])
        controller.presentTemplate(avviso, animated: true, completion: nil)
    }

    // MARK: Elementi delle schermate

    private func testoPrezzo(_ d: Distributore) -> String {
        "\(Logica.formattaPrezzo(d.prezzo)) €/\(Preferenze.attuali.carburante.unita)"
    }

    private func puntoDiInteresse(_ d: Distributore) -> CPPointOfInterest {
        let imp = d.impianto
        let luogo = MKMapItem(placemark: MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: imp.lat, longitude: imp.lon)))
        luogo.name = Logica.titolo(imp)
        let distanza = Logica.formattaDistanza(d.distanza)
        let punto = CPPointOfInterest(
            location: luogo,
            title: Logica.titolo(imp),
            subtitle: "\(testoPrezzo(d)) · \(distanza)",
            summary: Logica.indirizzo(imp),
            detailTitle: Logica.titolo(imp),
            detailSubtitle: "\(Preferenze.attuali.descrizione) \(testoPrezzo(d))",
            detailSummary: "\(distanza) · \(Logica.indirizzo(imp))\nPrezzo comunicato \(Logica.quando(d.dataPrezzo))",
            pinImage: Disegni.spillo(prezzo: Logica.formattaPrezzo(d.prezzo), fascia: d.fascia)
        )
        punto.selectedPinImage = Disegni.spillo(prezzo: Logica.formattaPrezzo(d.prezzo), fascia: d.fascia, selezionato: true)
        punto.primaryButton = CPTextButton(title: "Naviga", textStyle: .confirm) { [weak self] _ in
            Task { @MainActor in self?.naviga(verso: d) }
        }
        punto.secondaryButton = CPTextButton(title: "Tutti i prezzi", textStyle: .normal) { [weak self] _ in
            Task { @MainActor in self?.mostraDettagli(d) }
        }
        return punto
    }

    private func voceElenco(_ d: Distributore) -> CPListItem {
        let voce = CPListItem(
            text: "\(Logica.titolo(d.impianto)) · \(Logica.formattaPrezzo(d.prezzo)) €",
            detailText: "\(Logica.formattaDistanza(d.distanza)) · \(Logica.indirizzo(d.impianto))",
            image: Disegni.etichetta(Logica.formattaPrezzo(d.prezzo), fascia: d.fascia)
        )
        voce.accessoryType = .disclosureIndicator
        voce.handler = { [weak self] _, fatto in
            Task { @MainActor in
                self?.mostraDettagli(d)
                fatto()
            }
        }
        return voce
    }

    private func mostraDettagli(_ d: Distributore) {
        let imp = d.impianto
        var righe: [CPInformationItem] = [
            CPInformationItem(title: "Distanza",
                              detail: "\(Logica.formattaDistanza(d.distanza)) · circa \(Logica.minutiInAuto(d.distanza)) min in auto"),
            CPInformationItem(title: "Indirizzo", detail: Logica.indirizzo(imp) + (imp.autostrada ? " · Autostrada" : ""))
        ]
        for riga in Logica.tabellaPrezzi(imp) {
            var parti: [String] = []
            if let p = riga.prezzoSelf { parti.append("self \(Logica.formattaPrezzo(p))") }
            if let p = riga.prezzoServito { parti.append("servito \(Logica.formattaPrezzo(p))") }
            righe.append(CPInformationItem(title: riga.nome, detail: parti.joined(separator: " · ")))
        }
        righe.append(CPInformationItem(title: "Prezzo comunicato", detail: Logica.quando(d.dataPrezzo)))

        let naviga = CPTextButton(title: "Naviga", textStyle: .confirm) { [weak self] _ in
            Task { @MainActor in self?.naviga(verso: d) }
        }
        let dettagli = CPInformationTemplate(title: Logica.titolo(imp), layout: .leading,
                                             items: Array(righe.prefix(10)), actions: [naviga])
        controller.pushTemplate(dettagli, animated: true, completion: nil)
    }

    /// Apre Mappe di Apple sul cruscotto con il percorso verso il distributore.
    private func naviga(verso d: Distributore) {
        guard let url = URL(string: "maps://?daddr=\(d.impianto.lat),\(d.impianto.lon)&dirflg=d") else { return }
        scena.open(url, options: nil, completionHandler: nil)
    }

    // MARK: Scheda Carburante

    private func aggiornaImpostazioni() {
        let pref = Preferenze.attuali
        let carburanti = Carburante.allCases.map { c in
            voceScelta(c.nome, attiva: pref.carburante == c) { $0.carburante = c }
        }
        let modi = Modo.allCases.map { m in
            voceScelta(m.nome, attiva: pref.modo == m) { $0.modo = m }
        }
        let raggi = Preferenze.raggiDisponibili.map { r in
            voceScelta("Entro \(Logica.formattaDistanza(r))", attiva: pref.raggioMetri == r) { $0.raggioMetri = r }
        }
        impostazioni.updateSections([
            CPListSection(items: carburanti, header: "Carburante", sectionIndexTitle: nil),
            CPListSection(items: modi, header: "Rifornimento", sectionIndexTitle: nil),
            CPListSection(items: raggi, header: "Raggio di ricerca", sectionIndexTitle: nil)
        ])
    }

    private func voceScelta(_ testo: String, attiva: Bool, cambia: @escaping (inout Preferenze) -> Void) -> CPListItem {
        let voce = CPListItem(text: testo, detailText: nil, image: Disegni.spunta(attiva))
        voce.handler = { [weak self] _, fatto in
            Task { @MainActor in
                var pref = Preferenze.attuali
                cambia(&pref)
                Preferenze.attuali = pref
                self?.preferenzeCambiate()
                fatto()
            }
        }
        return voce
    }

    private func preferenzeCambiate() {
        aggiornaImpostazioni()
        mappa.title = Preferenze.attuali.descrizione
        if seguiPosizione, let qui = Posizione.condivisa.ultima {
            carica(attorno: qui, raggio: Preferenze.attuali.raggioMetri)
        } else if let centro = centroRicerca {
            carica(attorno: centro, raggio: Preferenze.attuali.raggioMetri)
        }
    }
}
