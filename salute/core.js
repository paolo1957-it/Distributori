/*
 * Salus – logica pura (nessun accesso a DOM o rete).
 * Funziona sia nel browser (window.SL) sia in Node (module.exports): la usano anche
 * lo script che scarica i dati da OpenStreetMap e i test.
 */
(function (root) {
  "use strict";

  const R_TERRA = 6371000;

  function distanza(lat1, lon1, lat2, lon2) {
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R_TERRA * Math.asin(Math.sqrt(a));
  }

  function formattaDistanza(m) {
    if (m < 1000) return Math.round(m / 10) * 10 + " m";
    return (m / 1000).toFixed(1).replace(".", ",") + " km";
  }

  // Minuti in auto, stima prudente in città (circa 30 km/h); a piedi circa 5 km/h
  function minutiInAuto(m) { return Math.max(1, Math.round(m / 500)); }
  function minutiAPiedi(m) { return Math.max(1, Math.round(m / 80)); }

  // ---------- Tipi di punti ----------
  // Ogni punto ha un codice "k". L'ordine qui è quello del menu e della guida.
  const TIPI = {
    F: { nome: "Farmacia", plurale: "Farmacie" },
    P: { nome: "Parafarmacia", plurale: "Parafarmacie" },
    S: { nome: "Pronto soccorso", plurale: "Pronto soccorso" },
    O: { nome: "Ospedale", plurale: "Ospedali" },
    C: { nome: "Ambulatorio o clinica", plurale: "Ambulatori e cliniche" },
    M: { nome: "Medico", plurale: "Medici" },
    D: { nome: "Dentista", plurale: "Dentisti" },
    A: { nome: "Defibrillatore (DAE)", plurale: "Defibrillatori" },
    X: { nome: "Altro servizio sanitario", plurale: "Altri servizi sanitari" }
  };

  // Nomi italiani dei valori di healthcare=* che finiscono in "Altro" e delle specialità mediche
  const ALTRI = {
    laboratory: "Laboratorio analisi", sample_collection: "Centro prelievi", blood_donation: "Donazione sangue",
    blood_bank: "Banca del sangue", physiotherapist: "Fisioterapista", rehabilitation: "Riabilitazione",
    psychotherapist: "Psicoterapeuta", counselling: "Consultorio", optometrist: "Optometrista",
    audiologist: "Audioprotesista", podiatrist: "Podologo", speech_therapist: "Logopedista",
    occupational_therapist: "Terapista occupazionale", nurse: "Infermiere", midwife: "Ostetrica",
    dialysis: "Centro dialisi", hospice: "Hospice", vaccination_centre: "Centro vaccinale",
    birthing_centre: "Centro nascite", alternative: "Medicina alternativa", nutrition_counselling: "Nutrizionista",
    psychologist: "Psicologo", radiology: "Radiologia", diagnostics: "Centro diagnostico"
  };
  const SPECIALITA = {
    general: "medicina generale", paediatrics: "pediatria", gynaecology: "ginecologia", cardiology: "cardiologia",
    dermatology: "dermatologia", ophthalmology: "oculistica", orthopaedics: "ortopedia", otolaryngology: "otorinolaringoiatria",
    psychiatry: "psichiatria", neurology: "neurologia", urology: "urologia", radiology: "radiologia",
    dentistry: "odontoiatria", orthodontics: "ortodonzia", physiotherapy: "fisioterapia", emergency: "emergenza",
    gastroenterology: "gastroenterologia", endocrinology: "endocrinologia", oncology: "oncologia",
    occupational: "medicina del lavoro", sports: "medicina dello sport", allergology: "allergologia",
    biology: "analisi", blood_check: "prelievi", vaccination: "vaccinazioni", diagnostic_radiology: "radiologia"
  };

  /** Codice del tipo di punto a partire dai tag OSM, oppure null se non è un punto sanitario. */
  function tipoDaTag(t) {
    t = t || {};
    const am = t.amenity, hc = t.healthcare, em = t.emergency, nome = t.name || "";
    if (em === "defibrillator") return "A";
    if (em === "emergency_ward_entrance") return "S";
    if (am === "hospital" || hc === "hospital") return t.emergency === "yes" ? "S" : "O";
    if (hc === "emergency") return "S";
    const parafarm = /parafarm/i.test(nome);
    if (am === "pharmacy" || hc === "pharmacy" || (t.shop === "chemist" && parafarm)) {
      return (t.dispensing === "no" || parafarm || t.shop === "chemist") ? "P" : "F";
    }
    if (am === "dentist" || hc === "dentist") return "D";
    if (am === "doctors" || hc === "doctor") return "M";
    if (am === "clinic" || hc === "clinic" || hc === "centre") return "C";
    if (hc && hc !== "no") return "X";
    return null;
  }

  // Punto compatto per i file del sito: solo i campi che servono all'app
  function compatta(el) {
    const t = el.tags || {};
    const k = tipoDaTag(t);
    if (!k) return null;
    const la = el.lat ?? (el.center && el.center.lat);
    const lo = el.lon ?? (el.center && el.center.lon);
    if (la == null || lo == null) return null;
    const p = { i: el.type[0] + el.id, k, la: +la.toFixed(6), lo: +lo.toFixed(6) };
    const metti = (chiave, v) => { v = (v || "").trim(); if (v) p[chiave] = v; };
    metti("n", t.name || t["name:it"] || t.brand);
    metti("a", [t["addr:street"] || t["addr:place"], t["addr:housenumber"]].filter(Boolean).join(" "));
    metti("c", t["addr:city"] || t["addr:village"] || t["addr:town"] || "");
    metti("h", t.opening_hours);
    metti("t", t.phone || t["contact:phone"] || t["contact:mobile"]);
    metti("w", t.website || t["contact:website"] || t.url);
    metti("o", t.operator);
    if (k === "X") metti("x", ALTRI[t.healthcare] || t.healthcare.replace(/_/g, " "));
    if (k === "M" || k === "C" || k === "S" || k === "O") {
      const sp = (t["healthcare:speciality"] || "").split(";").map((s) => s.trim()).filter(Boolean)
        .map((s) => SPECIALITA[s] || s.replace(/_/g, " "));
      if (sp.length) p.x = sp.slice(0, 4).join(", ");
    }
    if (k === "S" && (t.amenity === "hospital" || t.healthcare === "hospital")) p.e = 1;  // ospedale con pronto soccorso
    if (k === "A") metti("l", t["defibrillator:location"] || t.description);
    if (k === "A" && t.indoor === "yes") p.d = 1;  // al chiuso: accessibile solo negli orari dell'edificio
    return p;
  }

  // Il punto passa il filtro della categoria scelta in alto ("tutto" o un codice; gli ospedali includono i pronto soccorso)
  function nellaCategoria(d, cat) {
    if (!cat || cat === "tutto") return true;
    if (cat === "O") return d.k === "O" || !!d.e;
    return d.k === cat;
  }

  // ---------- Orari di apertura (opening_hours di OSM) ----------
  // Capisce i casi più comuni ("Mo-Fr 08:30-12:30,15:30-19:30; Sa 09:00-12:30; Su off", "24/7").
  // Per orari più complicati (mesi, settimane, alba e tramonto…) restituisce null: l'app mostra il testo così com'è.
  const GIORNI = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const GIORNI_IT = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
  const GIORNI_BREVI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
  const RE_GIORNO = "(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)";

  function leggiOrari(testo) {
    let s = String(testo || "").trim();
    if (!s) return null;
    if (/^24\/7$/.test(s) || /^Mo-Su 00:00-24:00$/.test(s)) return GIORNI.map(() => [[0, 1440]]);
    if (/["\[\]|]|sunrise|sunset|dawn|dusk|easter|week|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b|\d\+/i.test(s)) return null;
    s = s.replace(/[–—]/g, "-").replace(/\s+/g, " ");
    // una virgola dopo un orario (o "off") seguita da un giorno inizia una nuova regola
    const regole = s.split(";").flatMap((r) =>
      r.split(new RegExp("(?<=\\d|off|closed)\\s*,\\s*(?=" + RE_GIORNO + "\\b)"))).map((r) => r.trim()).filter(Boolean);
    const settimana = GIORNI.map(() => []);
    for (let regola of regole) {
      if (/^24\/7\b/.test(regola)) regola = regola.replace(/^24\/7/, "Mo-Su 00:00-24:00");
      const m = regola.match(new RegExp("^(" + RE_GIORNO + "(?:-" + RE_GIORNO + ")?(?:\\s*,\\s*" + RE_GIORNO + "(?:-" + RE_GIORNO + ")?)*)?\\s*(.*)$"));
      if (!m) return null;
      let giorni;
      if (m[1]) {
        giorni = new Set();
        let soloFestivi = true;
        for (const parte of m[1].split(/\s*,\s*/)) {
          const [a, b] = parte.split("-");
          if (a === "PH" || a === "SH") continue;
          soloFestivi = false;
          const i = GIORNI.indexOf(a), j = b ? GIORNI.indexOf(b) : i;
          if (i < 0 || j < 0) return null;
          for (let g = i; ; g = (g + 1) % 7) { giorni.add(g); if (g === j) break; }
        }
        if (soloFestivi) continue;      // regole solo per i festivi: ignorate
      } else {
        giorni = new Set([0, 1, 2, 3, 4, 5, 6]);
      }
      const corpo = m[2].trim();
      let fasce;
      if (/^(off|closed)$/i.test(corpo)) fasce = [];
      else if (corpo === "" || /^open$/i.test(corpo)) fasce = [[0, 1440]];
      else {
        fasce = [];
        for (const f of corpo.split(/\s*,\s*/)) {
          const t = f.match(/^(\d{1,2})[:.](\d{2})\s*-\s*(\d{1,2})[:.](\d{2})$/);
          if (!t) return null;
          const ini = +t[1] * 60 + +t[2];
          let fin = +t[3] * 60 + +t[4];
          if (ini > 1440 || fin > 1440 * 2) return null;
          if (fin <= ini) fin += 1440;   // dopo mezzanotte
          fasce.push([ini, fin]);
        }
      }
      // una regola con i giorni sostituisce gli orari di quei giorni
      for (const g of giorni) settimana[g] = fasce.slice();
    }
    return settimana;
  }

  const giornoSettimana = (data) => (data.getDay() + 6) % 7;   // 0 = lunedì
  const hhmm = (min) => { min = ((min % 1440) + 1440) % 1440; return Math.floor(min / 60) + ":" + String(min % 60).padStart(2, "0"); };

  /**
   * Stato di apertura in un certo momento.
   * { aperto: true, sempre?, chiude: minuti } | { aperto: false, apre: { giorni, min } | null } | null (orari non capiti)
   */
  function statoApertura(orari, quando) {
    const sett = typeof orari === "string" ? leggiOrari(orari) : orari;
    if (!sett) return null;
    const ora = quando ? new Date(quando) : new Date();
    const g = giornoSettimana(ora), min = ora.getHours() * 60 + ora.getMinutes();
    if (sett.every((f) => f.length === 1 && f[0][0] === 0 && f[0][1] >= 1440)) return { aperto: true, sempre: true };
    // fasce di oggi e quelle di ieri che continuano dopo mezzanotte
    const candidati = [
      ...sett[g].map(([a, b]) => [a, b]),
      ...sett[(g + 6) % 7].filter(([, b]) => b > 1440).map(([a, b]) => [a - 1440, b - 1440])
    ];
    for (const [a, b] of candidati) {
      if (min >= a && min < b) {
        // se chiude a mezzanotte e domani riapre a mezzanotte, resta aperto
        return { aperto: true, chiude: b };
      }
    }
    for (let d = 0; d < 8; d++) {
      const fasce = sett[(g + d) % 7].filter(([a]) => d > 0 || a > min).sort((x, y) => x[0] - y[0]);
      if (fasce.length) return { aperto: false, apre: { giorni: d, giorno: (g + d) % 7, min: fasce[0][0] } };
    }
    return { aperto: false, apre: null };
  }

  function testoApertura(st) {
    if (!st) return "";
    if (st.aperto) return st.sempre ? "Aperto 24 ore su 24" : "Aperto ora · chiude alle " + hhmm(st.chiude);
    if (!st.apre) return "Chiuso";
    const { giorni, giorno, min } = st.apre;
    const q = giorni === 0 ? "alle " : giorni === 1 ? "domani alle " : GIORNI_IT[giorno] + " alle ";
    return "Chiuso · apre " + q + hhmm(min);
  }

  // Orari scritti in italiano, una riga per regola
  function orariLeggibili(testo) {
    const s = String(testo || "").trim();
    if (!s) return [];
    if (s === "24/7") return ["Sempre aperto"];
    return s.split(";").map((r) => r.trim()).filter(Boolean).map((r) => r
      .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, (x) => GIORNI_BREVI[GIORNI.indexOf(x)])
      .replace(/\bPH\b/g, "festivi").replace(/\bSH\b/g, "vacanze scolastiche")
      .replace(/\b(off|closed)\b/gi, "chiuso").replace(/(\d)\s*-\s*(\d)/g, "$1–$2")
      .replace(/,(?=\S)/g, ", "));
  }

  // ---------- Tessere (file del sito) ----------
  function tessereNelRaggio(lat, lon, raggio, passo) {
    const dLat = raggio / 111320, dLon = raggio / (111320 * Math.cos(lat * Math.PI / 180));
    const nomi = [];
    for (let i = Math.floor((lat - dLat) / passo); i <= Math.floor((lat + dLat) / passo); i++) {
      for (let j = Math.floor((lon - dLon) / passo); j <= Math.floor((lon + dLon) / passo); j++) {
        nomi.push(`t_${i}_${j}.json`);
      }
    }
    return nomi;
  }
  function nomeTessera(lat, lon, passo) {
    return `t_${Math.floor(lat / passo)}_${Math.floor(lon / passo)}.json`;
  }
  // Riquadro (sud, ovest, nord, est) che contiene il cerchio di ricerca
  function riquadro(lat, lon, raggio) {
    const dLat = raggio / 111320, dLon = raggio / (111320 * Math.cos(lat * Math.PI / 180));
    return [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map((x) => +x.toFixed(5));
  }

  // Interrogazione Overpass per i punti sanitari, in un riquadro o in un'area già definita (".zona")
  function queryOverpass(filtro, timeout) {
    const f = filtro;
    return `[out:json][timeout:${timeout || 25}];(` +
      `nwr${f}[amenity~"^(pharmacy|hospital|clinic|doctors|dentist)$"];` +
      `nwr${f}[healthcare];` +
      `nwr${f}[emergency~"^(defibrillator|emergency_ward_entrance)$"];` +
      `nwr${f}[shop=chemist][name~"parafarm",i];` +
      `);out center tags;`;
  }

  // ---------- Punti vicini ----------
  function preparaPunti(lista, lat, lon, raggio, cat, quando) {
    const out = [];
    const visti = new Set();
    for (const d of lista || []) {
      if (visti.has(d.i)) continue;
      visti.add(d.i);
      if (!nellaCategoria(d, cat)) continue;
      const dist = distanza(lat, lon, d.la, d.lo);
      if (dist > raggio) continue;
      out.push({ ...d, distanza: dist, apertura: d.h ? statoApertura(d.h, quando) : null });
    }
    return out;
  }

  function statistiche(lista) {
    const aperti = lista.filter((d) => d.apertura && d.apertura.aperto).length;
    const ps = lista.filter((d) => d.k === "S").sort((a, b) => a.distanza - b.distanza)[0];
    return { n: lista.length, aperti, distanzaPs: ps ? ps.distanza : null };
  }

  // ---------- Testi ----------
  function capitalizza(s) {
    s = String(s || "").trim();
    if (s && s === s.toUpperCase() && /[A-Z]/.test(s)) {
      const minuscole = /^(di|de|del|dei|degli|della|delle|dello|da|dal|dalla|al|alla|e|ed|in|sul|sulla|per)$/;
      return s.toLowerCase().replace(/(^|[\s'’.\-/(])([a-zà-ù])/g, (m, a, b) => a + b.toUpperCase())
        .replace(/(\s)([A-ZÀ-Ù][a-zà-ù]*)(?=\s)/g, (m, sp, w) => minuscole.test(w.toLowerCase()) ? sp + w.toLowerCase() : m);
    }
    return s;
  }
  function titolo(d) {
    return capitalizza(d.n) || TIPI[d.k].nome;
  }
  function indirizzo(d) {
    return [capitalizza(d.a || ""), capitalizza(d.c || "")].filter((x) => x.trim()).join(", ");
  }
  function nomeTipo(d) {
    if (d.k === "X" && d.x) return d.x.charAt(0).toUpperCase() + d.x.slice(1);
    return TIPI[d.k].nome;
  }

  const API = {
    distanza, formattaDistanza, minutiInAuto, minutiAPiedi, TIPI, tipoDaTag, compatta, nellaCategoria,
    leggiOrari, statoApertura, testoApertura, orariLeggibili, tessereNelRaggio, nomeTessera, riquadro,
    queryOverpass, preparaPunti, statistiche, capitalizza, titolo, indirizzo, nomeTipo, GIORNI_IT
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.SL = API;
})(typeof window !== "undefined" ? window : globalThis);
