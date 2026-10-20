#!/usr/bin/env python3
"""
Distributori – scarica gli open data del MIMIT (Osservatorio prezzi carburanti) e li salva
nel sito, divisi in "tessere" da 0,25 gradi (circa 28 × 20 km).

Lo esegue GitHub da solo più volte al giorno (vedi .github/workflows/pubblica.yml).
I dati NON vengono salvati nel repository: finiscono solo nel sito pubblicato.
Se il MIMIT non risponde, lo script usa la copia dei CSV che il computer di paolo carica
alle 12 sulla release "dati-mimit" (vedi pc/scarica_mimit.ps1), se è più recente dei dati
già pubblicati; altrimenti recupera i dati già pubblicati sul sito, così un aggiornamento
del codice non lascia mai il sito senza prezzi.

File del MIMIT (testo CSV, una riga "Estrazione del …", poi l'intestazione):
  anagrafica_impianti_attivi.csv  idImpianto|Gestore|Bandiera|Tipo Impianto|Nome Impianto|
                                  Indirizzo|Comune|Provincia|Latitudine|Longitudine
  prezzo_alle_8.csv               idImpianto|descCarburante|prezzo|isSelf|dtComu
"""
import csv
import io
import json
import math
import os
import re
import shutil
import sys
import time
import urllib.request
from datetime import datetime, timezone

BASE = "https://www.mimit.gov.it/images/exportCSV/"
ANAGRAFICA = BASE + "anagrafica_impianti_attivi.csv"
PREZZI = BASE + "prezzo_alle_8.csv"
USER_AGENT = "Distributori/1.0 (app web personale; dati MIMIT open data)"
# Da ottobre 2026 il MIMIT lascia scadere le richieste da GitHub Actions:
# ci presentiamo come un browser normale.
INTESTAZIONI_MIMIT = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept": "text/csv,text/plain,*/*",
    "Accept-Language": "it-IT,it;q=0.9",
}

CARTELLA = "dati"
PASSO = 0.25          # lato della tessera in gradi

# Carburanti "normali": l'app li confronta tra distributori. Gli altri (premium, HVO…)
# restano visibili nel riquadro con il loro nome.
CATEGORIE = {"benzina": "B", "gasolio": "G", "gpl": "L", "metano": "M"}


# ---------- Download ----------

def scarica(url, tentativi=3, minimo=1000):
    ultimo = None
    for i in range(tentativi):
        try:
            req = urllib.request.Request(url, headers=INTESTAZIONI_MIMIT)
            with urllib.request.urlopen(req, timeout=120) as r:
                dati = r.read()
            if len(dati) < minimo:
                raise ValueError(f"file troppo piccolo ({len(dati)} byte)")
            return dati
        except Exception as ex:
            ultimo = ex
            print(f"  {url}: {ex}")
            time.sleep(20 * (i + 1))
    raise RuntimeError(f"{url} non raggiungibile: {ultimo}")


def testo(dati):
    for cod in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return dati.decode(cod)
        except UnicodeDecodeError:
            pass
    return dati.decode("latin-1", errors="replace")


def leggi_csv(dati):
    """Restituisce (data estrazione, righe come dizionari). Riconosce da solo il separatore
    e salta la riga 'Estrazione del …'."""
    righe = testo(dati).splitlines()
    estrazione = None
    while righe and "idimpianto" not in righe[0].lower():
        m = re.search(r"(\d{4}-\d{2}-\d{2})|(\d{2}/\d{2}/\d{4})", righe[0])
        if m and not estrazione:
            estrazione = m.group(1) or datetime.strptime(m.group(2), "%d/%m/%Y").strftime("%Y-%m-%d")
        righe.pop(0)
    if not righe:
        raise ValueError("intestazione non trovata")
    intest = righe[0]
    sep = max("|;,\t", key=intest.count)
    lettore = csv.reader(io.StringIO("\n".join(righe)), delimiter=sep, quotechar='"')
    nomi = [n.strip().lower() for n in next(lettore)]
    out = []
    for r in lettore:
        if not r or len(r) < len(nomi) - 1:
            continue
        out.append({nomi[i]: (r[i].strip() if i < len(r) else "") for i in range(len(nomi))})
    return estrazione, out


def numero(s):
    try:
        return float(str(s).replace(",", ".").strip())
    except ValueError:
        return None


def data_iso(s):
    s = (s or "").strip()
    for f in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, f).strftime("%Y-%m-%dT%H:%M")
        except ValueError:
            pass
    return None


def campo(r, *nomi):
    for n in nomi:
        if n in r and r[n] != "":
            return r[n]
    return ""


# ---------- Elaborazione ----------

def costruisci(anagrafica, prezzi):
    impianti = {}
    scartati = 0
    for r in anagrafica:
        idi = campo(r, "idimpianto")
        lat, lon = numero(campo(r, "latitudine")), numero(campo(r, "longitudine"))
        if not idi or lat is None or lon is None:
            scartati += 1
            continue
        if 6 <= lat <= 19 and 35 <= lon <= 48:   # latitudine e longitudine scambiate
            lat, lon = lon, lat
        if not (35 <= lat <= 47.5 and 6 <= lon <= 19):
            scartati += 1
            continue
        imp = {
            "i": int(idi) if idi.isdigit() else idi,
            "b": campo(r, "bandiera"),
            "n": campo(r, "nome impianto", "nome"),
            "a": campo(r, "indirizzo"),
            "c": campo(r, "comune"),
            "p": campo(r, "provincia"),
            "la": round(lat, 6), "lo": round(lon, 6),
            "f": {},
        }
        if "autostrad" in campo(r, "tipo impianto").lower():
            imp["t"] = 1
        impianti[str(idi)] = imp

    for r in prezzi:
        imp = impianti.get(campo(r, "idimpianto"))
        if not imp:
            continue
        nome = campo(r, "desccarburante")
        prezzo = numero(campo(r, "prezzo"))
        if not nome or prezzo is None or not (0.3 <= prezzo <= 5):
            continue
        self_ = 1 if campo(r, "isself").strip() in ("1", "true", "True", "S", "s") else 0
        data = data_iso(campo(r, "dtcomu"))
        cat = CATEGORIE.get(nome.strip().lower(), "X")
        chiave = (cat if cat != "X" else nome, self_)
        prima = imp["f"].get(chiave)
        if prima and (prima[4] or "") >= (data or ""):
            continue       # stesso carburante ripetuto: tiene il prezzo comunicato per ultimo
        # [categoria, nome (solo per i carburanti speciali), prezzo, self 1/0, data comunicazione]
        imp["f"][chiave] = [cat, nome if cat == "X" else "", round(prezzo, 3), self_, data]

    for imp in impianti.values():
        imp["f"] = list(imp["f"].values())
    print(f"  {len(impianti)} distributori, {scartati} senza coordinate valide")
    return impianti


def nome_tessera(lat, lon):
    return f"t_{math.floor(lat / PASSO)}_{math.floor(lon / PASSO)}.json"


def salva(impianti, estrazione):
    if os.path.isdir(CARTELLA):
        shutil.rmtree(CARTELLA)
    os.makedirs(CARTELLA)
    tessere = {}
    for imp in impianti.values():
        tessere.setdefault(nome_tessera(imp["la"], imp["lo"]), []).append(imp)
    for t, lista in tessere.items():
        with open(os.path.join(CARTELLA, t), "w", encoding="utf-8") as f:
            json.dump({"d": lista}, f, separators=(",", ":"), ensure_ascii=False)
    indice = {
        "passo": PASSO,
        "estrazione": estrazione,
        "aggiornato": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "distributori": len(impianti),
        "tessere": sorted(tessere),
        "fonte": "MIMIT – Osservatorio prezzi carburanti (open data)",
    }
    with open(os.path.join(CARTELLA, "indice.json"), "w", encoding="utf-8") as f:
        json.dump(indice, f, indent=1, ensure_ascii=False)
    print(f"  salvate {len(tessere)} tessere, estrazione del {estrazione}")


def recupera_dal_sito(sito):
    """Piano B: copia i dati già pubblicati sul sito (quelli del giorno prima)."""
    if not sito:
        raise RuntimeError("indirizzo del sito non indicato")
    sito = sito.rstrip("/") + "/"
    print(f"Recupero i dati già pubblicati da {sito}{CARTELLA}/ …")
    indice = json.loads(scarica(f"{sito}{CARTELLA}/indice.json", 3, 20).decode("utf-8"))
    if os.path.isdir(CARTELLA):
        shutil.rmtree(CARTELLA)
    os.makedirs(CARTELLA)
    for t in indice["tessere"]:
        dati = None
        for i in range(3):
            try:
                req = urllib.request.Request(f"{sito}{CARTELLA}/{t}", headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=60) as r:
                    dati = r.read()
                break
            except Exception as ex:
                print(f"  {t}: {ex}")
                time.sleep(5)
        if dati is None:
            raise RuntimeError(f"tessera {t} non recuperata")
        with open(os.path.join(CARTELLA, t), "wb") as f:
            f.write(dati)
    with open(os.path.join(CARTELLA, "indice.json"), "w", encoding="utf-8") as f:
        json.dump(indice, f, indent=1, ensure_ascii=False)
    print(f"  recuperate {len(indice['tessere'])} tessere, estrazione del {indice.get('estrazione')}")


def elabora(dati_anagrafica, dati_prezzi):
    est_a, anag = leggi_csv(dati_anagrafica)
    print(f"  {len(anag)} righe (estrazione {est_a})")
    est_p, prezzi = leggi_csv(dati_prezzi)
    print(f"  {len(prezzi)} righe (estrazione {est_p})")
    impianti = costruisci(anag, prezzi)
    if len(impianti) < 1000:
        raise ValueError(f"troppo pochi distributori ({len(impianti)}): file del MIMIT incompleti?")
    return impianti, est_p or est_a or datetime.now().strftime("%Y-%m-%d")


def estrazione_sul_sito(sito):
    try:
        sito = sito.rstrip("/") + "/"
        return json.loads(scarica(f"{sito}{CARTELLA}/indice.json", 2, 20).decode("utf-8")).get("estrazione") or ""
    except Exception as ex:
        print(f"  indice del sito non letto: {ex}")
        return ""


def main():
    try:
        print("Scarico i file dal MIMIT…")
        impianti, estrazione = elabora(scarica(ANAGRAFICA), scarica(PREZZI))
        salva(impianti, estrazione)
        return
    except Exception as ex:
        print(f"MIMIT non disponibile: {ex}")

    copia = os.environ.get("COPIA_PC")
    if copia:
        try:
            copia = copia.rstrip("/") + "/"
            print(f"Provo la copia caricata dal computer: {copia}")
            impianti, estrazione = elabora(scarica(copia + "anagrafica_impianti_attivi.csv", 2),
                                           scarica(copia + "prezzo_alle_8.csv", 2))
            sul_sito = estrazione_sul_sito(os.environ.get("SITO") or "")
            if estrazione >= sul_sito:
                salva(impianti, estrazione)
                return
            print(f"  la copia ({estrazione}) è più vecchia del sito ({sul_sito}): non la uso")
        except Exception as ex:
            print(f"Copia dal computer non disponibile: {ex}")

    try:
        recupera_dal_sito(os.environ.get("SITO"))
    except Exception as ex2:
        print(f"Nessun dato disponibile: {ex2}. Il sito resta com'era.")
        sys.exit(1)


if __name__ == "__main__":
    main()
