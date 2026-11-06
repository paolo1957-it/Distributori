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

    private static var spilli: [Fascia: UIImage] = [:]

    /// Pallino colorato con la pompa di benzina, per la mappa.
    static func spillo(_ fascia: Fascia) -> UIImage {
        if let fatto = spilli[fascia] { return fatto }
        let lato: CGFloat = 32
        let immagine = UIGraphicsImageRenderer(size: CGSize(width: lato, height: lato)).image { _ in
            let cerchio = CGRect(x: 1, y: 1, width: lato - 2, height: lato - 2)
            UIColor.white.setFill()
            UIBezierPath(ovalIn: cerchio).fill()
            colore(fascia).setFill()
            UIBezierPath(ovalIn: cerchio.insetBy(dx: 2.5, dy: 2.5)).fill()
            let config = UIImage.SymbolConfiguration(pointSize: 13, weight: .bold)
            if let simbolo = UIImage(systemName: "fuelpump.fill", withConfiguration: config)?
                .withTintColor(.white, renderingMode: .alwaysOriginal) {
                simbolo.draw(at: CGPoint(x: (lato - simbolo.size.width) / 2, y: (lato - simbolo.size.height) / 2))
            }
        }
        spilli[fascia] = immagine
        return immagine
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
