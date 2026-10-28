#!/usr/bin/env python3
"""
Confronto a campione: distributori dell'anagrafica MIMIT contro i distributori di OpenStreetMap
(amenity=fuel) in Lombardia. Serve solo come controllo, non tocca il sito.

Stampa un riepilogo e scrive confronto_osm.md e confronto_osm.csv.
Uso: python3 strumenti/confronta_osm.py [anagrafica.csv]   (senza file la scarica dalla release dati-mimit)
"""
import csv, io, json, math, sys, time, urllib.parse, urllib.request

ANAGRAFICA = "https://github.com/paolo1957-it/Distributori/releases/download/dati-mimit/anagrafica_impianti_attivi.csv"
PROVINCE = {"BG", "BS", "CO", "CR", "LC", "LO", "MN", "MI", "MB", "PV", "SO", "VA"}
SERVER = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter",
          "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]
QUERY = '[out:json][timeout:300];area["ISO3166-2"="IT-25"]->.z;nwr(area.z)["amenity"="fuel"];out center tags;'
VICINO, LONTANO = 150, 1000   # metri: stesso distributore / stesso marchio ma spostato
UA = {"User-Agent": "Distributori/1.0 (confronto MIMIT-OSM)"}


def scarica(url, dati=None, ms=600):
    req = urllib.request.Request(url, data=dati, headers=UA)
    with urllib.request.urlopen(req, timeout=ms) as r:
        return r.read()


def mimit(percorso):
    testo = open(percorso, encoding="utf-8", errors="replace").read() if percorso else \
        scarica(ANAGRAFICA).decode("utf-8", errors="replace")
    righe = testo.splitlines()
    estrazione = righe[0].strip() if righe and "idimpianto" not in righe[0].lower() else ""
    while righe and "idimpianto" not in righe[0].lower():
        righe.pop(0)
    sep = "|" if "|" in righe[0] else ";"
    out = []
    for r in csv.DictReader(io.StringIO("\n".join(righe)), delimiter=sep):
        r = {k.strip().lower(): (v or "").strip() for k, v in r.items() if k}
        if r.get("provincia") not in PROVINCE:
            continue
        try:
            lat, lon = float(r["latitudine"].replace(",", ".")), float(r["longitudine"].replace(",", "."))
        except ValueError:
            lat = lon = 0.0
        out.append({"id": r["idimpianto"], "marchio": r.get("bandiera", ""), "nome": r.get("nome impianto", ""),
                    "indirizzo": r.get("indirizzo", ""), "comune": r.get("comune", ""), "prov": r["provincia"],
                    "lat": lat, "lon": lon, "auto": "autostrad" in r.get("tipo impianto", "").lower()})
    return estrazione, out


def osm():
    ultimo = None
    for giro in range(2):
        for url in SERVER:
            try:
                print("Interrogo", url, flush=True)
                d = json.loads(scarica(url, ("data=" + urllib.parse.quote(QUERY)).encode()))
                el = d.get("elements", [])
                if len(el) < 500:
                    raise RuntimeError(f"troppo pochi elementi ({len(el)})")
                out = []
                for e in el:
                    c = e if "lat" in e else e.get("center") or {}
                    if "lat" not in c:
                        continue
                    t = e.get("tags", {})
                    out.append({"id": f"{e['type'][0]}{e['id']}", "marchio": t.get("brand", ""), "nome": t.get("name", ""),
                                "operatore": t.get("operator", ""), "lat": c["lat"], "lon": c["lon"],
                                "orari": t.get("opening_hours", ""), "uta": t.get("payment:uta", "")})
                return out
            except Exception as ex:
                ultimo = ex
                print("  ", ex, flush=True)
                time.sleep(20)
    raise SystemExit(f"Overpass non raggiungibile: {ultimo}")


def metri(a, b):
    dy = (a["lat"] - b["lat"]) * 111320
    dx = (a["lon"] - b["lon"]) * 111320 * math.cos(math.radians(a["lat"]))
    return math.hypot(dx, dy)


ALIAS = {"agip": "eni", "agip eni": "eni", "enilive": "eni", "eni": "eni", "api-ip": "ip", "api": "ip", "ip": "ip",
         "ip gruppo api": "ip", "q8": "q8", "kuwait": "q8", "esso": "esso", "tamoil": "tamoil", "shell": "shell",
         "retitalia": "retitalia", "pompe bianche": ""}


def marchio(s):
    s = (s or "").strip().lower()
    for k in sorted(ALIAS, key=len, reverse=True):
        if s == k or s.startswith(k + " "):
            return ALIAS[k]
    return s


def stesso_marchio(m, o):
    a = marchio(m["marchio"])
    if not a:
        return None   # pompa bianca: non si può confrontare
    testo = " ".join([o["marchio"], o["nome"], o["operatore"]]).lower()
    return a in testo or marchio(o["marchio"]) == a or (a == "eni" and "agip" in testo) or (a == "ip" and "api" in testo)


def main():
    estrazione, mm = mimit(sys.argv[1] if len(sys.argv) > 1 else None)
    oo = osm()
    print(f"MIMIT {estrazione}: {len(mm)} impianti in Lombardia; OSM: {len(oo)} distributori", flush=True)
    griglia = {}
    for i, o in enumerate(oo):
        griglia.setdefault((int(o["lat"] * 100), int(o["lon"] * 100)), []).append(i)

    def vicini(m, raggio):
        k = (int(m["lat"] * 100), int(m["lon"] * 100))
        celle = 1 if raggio <= 700 else 2
        res = []
        for dy in range(-celle, celle + 1):
            for dx in range(-celle, celle + 1):
                for i in griglia.get((k[0] + dy, k[1] + dx), []):
                    d = metri(m, oo[i])
                    if d <= raggio:
                        res.append((d, i))
        return sorted(res)

    usati, abbinati, spostati, senza, coord_errate = set(), [], [], [], []
    for m in mm:
        if not (44.6 <= m["lat"] <= 46.7 and 8.4 <= m["lon"] <= 11.5):
            coord_errate.append(m)
    validi = [m for m in mm if m not in coord_errate]
    # 1° giro: il distributore OSM libero più vicino entro VICINO metri (prima quelli dello stesso marchio)
    resto = []
    for m in validi:
        cand = [(stesso_marchio(m, oo[i]) is False, d, i) for d, i in vicini(m, VICINO) if i not in usati]
        if cand:
            _, d, i = min(cand)
            usati.add(i)
            abbinati.append((m, oo[i], d))
        else:
            resto.append(m)
    # 2° giro: stesso marchio entro LONTANO metri = probabilmente posizione sbagliata in uno dei due
    for m in resto:
        cand = [(d, i) for d, i in vicini(m, LONTANO) if i not in usati and stesso_marchio(m, oo[i])]
        if cand:
            d, i = cand[0]
            usati.add(i)
            spostati.append((m, oo[i], d))
        else:
            vic = vicini(m, 3000)
            senza.append((m, vic[0][0] if vic else None))
    solo_osm = [o for i, o in enumerate(oo) if i not in usati]
    marchio_diverso = [(m, o, d) for m, o, d in abbinati if stesso_marchio(m, o) is False]

    righe = []
    for m, o, d in abbinati:
        righe.append(["abbinato" if stesso_marchio(m, o) is not False else "marchio diverso", m["id"], m["marchio"], m["nome"],
                      m["indirizzo"], m["comune"], m["prov"], m["lat"], m["lon"], o["id"], o["marchio"], o["nome"], o["lat"], o["lon"], round(d)])
    for m, o, d in spostati:
        righe.append(["spostato", m["id"], m["marchio"], m["nome"], m["indirizzo"], m["comune"], m["prov"], m["lat"], m["lon"],
                      o["id"], o["marchio"], o["nome"], o["lat"], o["lon"], round(d)])
    for m, d in senza:
        righe.append(["solo MIMIT", m["id"], m["marchio"], m["nome"], m["indirizzo"], m["comune"], m["prov"], m["lat"], m["lon"],
                      "", "", "", "", "", "" if d is None else round(d)])
    for m in coord_errate:
        righe.append(["coordinate MIMIT errate", m["id"], m["marchio"], m["nome"], m["indirizzo"], m["comune"], m["prov"],
                      m["lat"], m["lon"], "", "", "", "", "", ""])
    for o in solo_osm:
        righe.append(["solo OSM", "", "", "", "", "", "", "", "", o["id"], o["marchio"], o["nome"], o["lat"], o["lon"], ""])
    with open("confronto_osm.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["esito", "mimit_id", "mimit_marchio", "mimit_nome", "indirizzo", "comune", "prov", "mimit_lat", "mimit_lon",
                    "osm_id", "osm_marchio", "osm_nome", "osm_lat", "osm_lon", "distanza_m"])
        w.writerows(righe)

    con_orari = sum(1 for o in oo if o["orari"])
    con_uta = sum(1 for o in oo if o["uta"] == "yes")
    r = [f"# Confronto MIMIT – OSM, Lombardia", "", f"MIMIT: {estrazione or '?'}, {len(mm)} impianti. OSM: {len(oo)} distributori.", "",
         f"- Abbinati entro {VICINO} m: {len(abbinati)} (di cui con marchio diverso: {len(marchio_diverso)})",
         f"- Stesso marchio ma distanti {VICINO}–{LONTANO} m (posizione da controllare): {len(spostati)}",
         f"- Solo nel MIMIT (nessun distributore OSM vicino): {len(senza)}",
         f"- Coordinate MIMIT fuori dalla Lombardia o a zero: {len(coord_errate)}",
         f"- Solo in OSM (non nell'anagrafica MIMIT): {len(solo_osm)}",
         f"- OSM con orari: {con_orari}; con payment:uta=yes: {con_uta}", ""]
    def tab(titolo, elenco, fmt, n=25):
        r.append(f"## {titolo} ({len(elenco)})")
        r.extend("- " + fmt(x) for x in elenco[:n])
        if len(elenco) > n:
            r.append(f"- … altri {len(elenco) - n} nel CSV")
        r.append("")
    tab("Coordinate MIMIT errate", coord_errate, lambda m: f"{m['id']} {m['marchio']} {m['indirizzo']}, {m['comune']} ({m['prov']}): {m['lat']}, {m['lon']}")
    tab("Spostati", sorted(spostati, key=lambda x: -x[2]), lambda x: f"{x[0]['id']} {x[0]['marchio']} {x[0]['indirizzo']}, {x[0]['comune']}: {round(x[2])} m da OSM {x[1]['id']}")
    tab("Marchio diverso", marchio_diverso, lambda x: f"{x[0]['id']} MIMIT «{x[0]['marchio']}» / OSM «{x[1]['marchio'] or x[1]['nome']}» – {x[0]['indirizzo']}, {x[0]['comune']}")
    tab("Solo MIMIT", sorted(senza, key=lambda x: -(x[1] or 99999)), lambda x: f"{x[0]['id']} {x[0]['marchio']} {x[0]['indirizzo']}, {x[0]['comune']} ({x[0]['prov']})" + (f" – OSM più vicino a {round(x[1])} m" if x[1] else " – nessun OSM entro 3 km"))
    tab("Solo OSM", solo_osm, lambda o: f"{o['id']} {o['marchio'] or '-'} «{o['nome'] or '-'}» {o['lat']:.5f},{o['lon']:.5f}")
    open("confronto_osm.md", "w", encoding="utf-8").write("\n".join(r))
    print("\n".join(r))


if __name__ == "__main__":
    main()
