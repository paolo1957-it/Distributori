import UIKit

/// Spilli e etichette colorate per CarPlay, con i colori della web app (style.css).
@MainActor
enum Disegni {
    static func colore(_ fascia: Fascia) -> UIColor {
        switch fascia {
        case .economico: return UIColor(red: 0x15 / 255, green: 0x80 / 255, blue: 0x5a / 255, alpha: 1)
        case .medio: return UIColor(red: 0xb8 / 255, green: 0x79 / 255, blue: 0x00 / 255, alpha: 1)
        case .caro: return UIColor(red: 0xc2 / 255, green: 0x3a / 255, blue: 0x2f / 255, alpha: 1)
        case .nd: return .systemGray
        }
    }

    /// Lato massimo che Apple concede ai segnaposto della mappa CarPlay (40 × 40 punti).
    static let latoSpillo: CGFloat = 40

    /// Segnaposto per la mappa: etichetta colorata con il prezzo (come nella web app) e,
    /// sotto, il punto esatto del distributore. "selezionato" aggiunge il bordo blu.
    static func spillo(prezzo: String, fascia: Fascia, selezionato: Bool = false) -> UIImage {
        let lato = latoSpillo
        return UIGraphicsImageRenderer(size: CGSize(width: lato, height: lato)).image { _ in
            // Etichetta con il prezzo, in alto
            let etichetta = CGRect(x: 1, y: 3, width: lato - 2, height: 21)
            let bordo = UIBezierPath(roundedRect: etichetta, cornerRadius: 6)
            colore(fascia).setFill()
            bordo.fill()
            (selezionato ? UIColor.systemBlue : UIColor.white).setStroke()
            bordo.lineWidth = selezionato ? 2.5 : 1.5
            bordo.stroke()
            let stile = NSMutableParagraphStyle()
            stile.alignment = .center
            let attributi: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedDigitSystemFont(ofSize: 11, weight: .heavy),
                .foregroundColor: UIColor.white,
                .paragraphStyle: stile
            ]
            let altezza = (prezzo as NSString).size(withAttributes: attributi).height
            (prezzo as NSString).draw(in: CGRect(x: etichetta.minX, y: etichetta.midY - altezza / 2,
                                                 width: etichetta.width, height: altezza),
                                      withAttributes: attributi)
            // Punto sulla posizione, in basso al centro
            let punto = CGRect(x: lato / 2 - 5, y: 28, width: 10, height: 10)
            UIColor.white.setFill()
            UIBezierPath(ovalIn: punto).fill()
            colore(fascia).setFill()
            UIBezierPath(ovalIn: punto.insetBy(dx: 2, dy: 2)).fill()
        }
    }

    /// Riquadro colorato con il prezzo, come le icone dell'elenco della web app.
    static func etichetta(_ testo: String, fascia: Fascia) -> UIImage {
        let lato: CGFloat = 44
        return UIGraphicsImageRenderer(size: CGSize(width: lato, height: lato)).image { _ in
            let riquadro = CGRect(x: 0, y: 8, width: lato, height: lato - 16)
            colore(fascia).setFill()
            UIBezierPath(roundedRect: riquadro, cornerRadius: 6).fill()
            let stile = NSMutableParagraphStyle()
            stile.alignment = .center
            let attributi: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedDigitSystemFont(ofSize: 12, weight: .bold),
                .foregroundColor: UIColor.white,
                .paragraphStyle: stile
            ]
            let altezza = (testo as NSString).size(withAttributes: attributi).height
            (testo as NSString).draw(in: CGRect(x: 0, y: riquadro.midY - altezza / 2, width: lato, height: altezza),
                                     withAttributes: attributi)
        }
    }

    static func spunta(_ attiva: Bool) -> UIImage? {
        UIImage(systemName: attiva ? "checkmark.circle.fill" : "circle")
    }
}
