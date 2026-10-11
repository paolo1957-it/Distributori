/*
 * Salus – interfaccia: mappa, posizione, caricamento dei punti, elenco.
 * Stessa struttura di Distributori.
 */
(function () {
  "use strict";
  const cfg = window.SALUS_CONFIG;
  const $ = (id) => document.getElementById(id);
  const PREF = "salus.";
  const leggiPref = (k, def) => { try { const v = localStorage.getItem(PREF + k); return v === null ? def : v; } catch (e) { return def; } };
  const salvaPref = (k, v) => { try { localStorage.setItem(PREF + k, String(v)); } catch (e) { /* ignora */ } };

  const RAGGI = [1000, 2000, 5000, 10000, 25000];
  const stato = {
    gps: null,          // ultima posizione GPS {lat, lon, acc}
    centro: null,       // punto della ricerca {lat, lon, daGps}
    raggio: +leggiPref("raggio", cfg.raggioMetri || 2000),
    categoria: leggiPref("categoria", cfg.categoria || "tutto"),
    ordine: leggiPref("ordine", "distanza"),
    tutti: [],          // punti scaricati intorno al centro
    vicini: [],         // punti entro il raggio, della categoria scelta, con distanza e apertura
    filtri: new Set(),
    caricando: false,
    seguiGps: true
  };
  if (!RAGGI.includes(stato.raggio)) stato.raggio = 2000;
  if (stato.categoria !== "tutto" && !SL.TIPI[stato.categoria]) stato.categoria = "tutto";
  if (!["distanza", "nome"].includes(stato.ordine)) stato.ordine = "distanza";

  // ---------- Mappa ----------
  const mappa = L.map("mappa", { zoomControl: false, attributionControl: true, preferCanvas: false })
    .setView([41.9, 12.5], 6);
  const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/";
  const sfondi = {
    stradale: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: 'Mappa e dati © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }),
    satellite: L.layerGroup([
      L.tileLayer(ESRI + "World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19, maxNativeZoom: 19,
        attribution: "Immagini: Esri, Vantor, Earthstar Geographics, GIS User Community · Strade: Esri, HERE, Garmin · Dati © OpenStreetMap"
      }),
      L.tileLayer(ESRI + "Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, opacity: .8 }),
      L.tileLayer(ESRI + "Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 })
    ])
  };
  let sfondoAttivo = leggiPref("sfondo", "stradale") === "satellite" ? "satellite" : "stradale";
  function impostaSfondo(nome) {
    Object.values(sfondi).forEach((l) => mappa.removeLayer(l));
    sfondoAttivo = sfondi[nome] ? nome : "stradale";
    sfondi[sfondoAttivo].addTo(mappa);
    $("mappa").classList.toggle("satellite", sfondoAttivo === "satellite");
    salvaPref("sfondo", sfondoAttivo);
  }
  impostaSfondo(sfondoAttivo);

  const livelli = {
    raggio: L.layerGroup().addTo(mappa),
    punti: L.layerGroup().addTo(mappa),
    io: L.layerGroup().addTo(mappa)
  };
  const markerPerId = new Map();
  mappa.on("dragstart", () => { stato.seguiGps = false; });

  // Simbolo dentro il segnaposto, uno per tipo
  const CROCE = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="currentColor"/></svg>';
  const CUORE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.3-9.4C1.4 8.2 3.6 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.7 1.2-1.6 2.8-2.7 4.8-2.7 3.6 0 5.8 3.7 4.5 7.1C19.5 16.4 12 21 12 21Z" fill="currentColor"/><path d="M12.8 7.5 9.6 12.6h2.6l-1 4.2 3.4-5.4H12l.8-3.9Z" style="fill:var(--mk-sfondo,#e85d04)"/></svg>';
  const SIMBOLO = { F: CROCE, P: "P", S: "PS", O: "H", C: "A", M: "Dr", D: "Dt", A: CUORE, X: "+" };
  const icona = (cls, html) => L.divIcon({ className: "", html: `<div class="mk ${cls}">${html ?? ""}</div>`, iconSize: null });
  const LARGHI = new Set(["S", "M", "D"]);
  const classiMarker = (d) => `tipo-${d.k}${LARGHI.has(d.k) ? " largo" : ""}${classiApertura(d)}`;
  const classiApertura = (d) => !d.apertura ? "" : d.apertura.aperto ? " aperto" : " chiuso";

  // ---------- Utilità UI ----------
  function messaggio(testo, errore) {
    const el = $("stato");
    el.textContent = testo;
    el.classList.toggle("errore", !!errore);
    if (errore && $("pannello").hidden) toast(testo);
  }
  let timerToast;
  function toast(testo) {
    const t = $("toast");
    t.textContent = testo;
    t.hidden = false;
    clearTimeout(timerToast);
    timerToast = setTimeout(() => { t.hidden = true; }, 3200);
  }
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const attr = (t) => String(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const linkNavigazione = (lat, lon) =>
    `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
  const linkOsm = (d) => {
    const tipo = { n: "node", w: "way", r: "relation" }[d.i[0]];
    return tipo ? `https://www.openstreetmap.org/${tipo}/${d.i.slice(1)}` : `https://www.openstreetmap.org/?mlat=${d.la}&mlon=${d.lo}#map=19/${d.la}/${d.lo}`;
  };
  const sitoWeb = (w) => /^https?:\/\//i.test(w) ? w : "https://" + w;
  const telefoni = (t) => String(t || "").split(/[;,]/).map((x) => x.trim()).filter(Boolean);
  const nomeCategoria = () => stato.categoria === "tutto" ? "servizi sanitari" : SL.TIPI[stato.categoria].plurale.toLowerCase();

  // Scarica e legge il JSON entro "ms" millisecondi in tutto (risposta + dati)
  async function fetchJson(url, opts, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { ...opts, signal: ctrl.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }

  // ---------- Dati ----------
  // Ogni giorno GitHub scarica da OpenStreetMap i punti sanitari di tutta Italia e li salva nella cartella "dati"
  // del sito, divisi in tessere da 0,25 gradi. L'app scarica solo le tessere intorno a te.
  // Se il sito non ha (ancora) i dati, l'app li chiede direttamente a un server Overpass.
  let indice = null, indiceLetto = 0, senzaIndice = false;
  const tessere = new Map();   // nome → lista
  async function leggiIndice(forza) {
    if (!forza && indice && Date.now() - indiceLetto < 30 * 60000) return indice;
    const nuovo = await fetchJson("dati/indice.json", { cache: "no-cache" }, 10000);
    if (!indice || nuovo.aggiornato !== indice.aggiornato) tessere.clear(); // dati nuovi: via le tessere vecchie
    indice = nuovo;
    indiceLetto = Date.now();
    return indice;
  }
  async function dalSito(lat, lon, raggio, forza) {
    const ind = await leggiIndice(forza);
    const esistenti = new Set(ind.tessere || []);
    const nomi = SL.tessereNelRaggio(lat, lon, raggio, ind.passo || 0.25).filter((t) => esistenti.has(t));
    const mancanti = nomi.filter((t) => !tessere.has(t));
    const parti = await Promise.all(mancanti.map((t) => fetchJson("dati/" + t, {}, 20000)));
    mancanti.forEach((t, i) => tessere.set(t, parti[i].d || []));
    return nomi.flatMap((t) => tessere.get(t) || []);
  }

  let ultimoOverpass = null;   // { lat, lon, raggio, lista, quando }
  async function daOverpass(lat, lon, raggio, forza) {
    const u = ultimoOverpass;
    if (!forza && u && Date.now() - u.quando < 30 * 60000 &&
        SL.distanza(lat, lon, u.lat, u.lon) + raggio <= u.raggio) return u.lista;
    // un po' più largo del raggio, così piccoli spostamenti non richiedono un'altra richiesta
    const largo = Math.min(raggio * 1.3 + 500, 30000);
    const [s, w, n, e] = SL.riquadro(lat, lon, largo);
    const query = SL.queryOverpass(`(${s},${w},${n},${e})`, 25);
    let ultimoErrore;
    for (const url of cfg.overpass || []) {
      try {
        const dati = await fetchJson(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "data=" + encodeURIComponent(query)
        }, 30000);
        const lista = (dati.elements || []).map(SL.compatta).filter(Boolean);
        ultimoOverpass = { lat, lon, raggio: largo, lista, quando: Date.now() };
        return lista;
      } catch (e) {
        ultimoErrore = e;
        console.warn("Overpass", url, e);
      }
    }
    throw ultimoErrore || new Error("nessun server Overpass");
  }

  async function caricaPunti(lat, lon, raggio, forza) {
    if (!senzaIndice) {
      try {
        return { lista: await dalSito(lat, lon, raggio, forza), fonte: "sito" };
      } catch (e) {
        // indice assente (sito appena pubblicato o app aperta in locale): da qui in poi Overpass
        if (!indice) senzaIndice = true;
        else throw e;
        console.warn("Dati del sito non disponibili, uso Overpass", e);
      }
    }
    return { lista: await daOverpass(lat, lon, raggio, forza), fonte: "overpass" };
  }

  // ---------- Suoni ----------
  let audio = null;
  let suoniAttivi = leggiPref("suoni", "1") !== "0";
  function sbloccaAudio() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state !== "running") audio.resume();
    } catch (e) { /* audio non disponibile */ }
  }
  document.addEventListener("pointerdown", sbloccaAudio, { passive: true });
  document.addEventListener("touchend", sbloccaAudio, { passive: true });
  function suona(note, volume) {
    if (!suoniAttivi || !audio || document.hidden) return;
    if (audio.state !== "running") { audio.resume().catch(() => {}); if (audio.state !== "running") return; }
    const t0 = audio.currentTime + 0.02;
    for (const [freq, inizio, durata] of note) {
      const osc = audio.createOscillator(), g = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + inizio);
      g.gain.exponentialRampToValueAtTime(volume || 0.35, t0 + inizio + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + inizio + durata);
      osc.connect(g).connect(audio.destination);
      osc.start(t0 + inizio);
      osc.stop(t0 + inizio + durata + 0.05);
    }
  }
  const SUONO = {
    aggiornato: () => suona([[1318.5, 0, 0.6], [2637, 0, 0.25]], 0.3),   // "bing"
    errore: () => suona([[392, 0, 0.25], [311, 0.22, 0.45]], 0.3)        // due note che scendono
  };

  // ---------- Caricamento ----------
  let giroCarica = 0, fonteDati = null;
  async function carica(forza, silenzioso) {
    if (!stato.centro) return;
    const giro = ++giroCarica;
    stato.caricando = true;
    $("btn-aggiorna").classList.add("gira");
    const { lat, lon } = stato.centro;
    if (!silenzioso) messaggio("Cerco " + nomeCategoria() + " entro " + SL.formattaDistanza(stato.raggio) + "…");
    let errore = null;
    try {
      const { lista, fonte } = await caricaPunti(lat, lon, stato.raggio, forza);
      if (giro !== giroCarica) return;
      stato.tutti = lista;
      fonteDati = fonte;
      stato.tentativi = 0;
    } catch (e) {
      errore = e;
      console.warn("Dati non disponibili", e);
    }
    if (giro !== giroCarica) return;
    stato.caricando = false;
    $("btn-aggiorna").classList.remove("gira");
    ricalcola();

    clearTimeout(stato.timerRiprova);
    if (errore) {
      const attese = [30, 60, 120, 300];
      const sec = attese[Math.min(stato.tentativi || 0, attese.length - 1)];
      stato.tentativi = (stato.tentativi || 0) + 1;
      stato.timerRiprova = setTimeout(() => carica(true), sec * 1000);
      SUONO.errore();
      messaggio(`Non riesco a scaricare i dati. Riprovo da solo tra ${sec >= 60 ? sec / 60 + " min" : sec + " secondi"}.`, true);
      return;
    }
    SUONO.aggiornato();
    aggiornaMessaggio();
  }

  function aggiornaMessaggio() {
    const ora = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    const dove = stato.centro.daGps ? "dalla tua posizione" : "dal punto cercato";
    let dati = "";
    if (fonteDati === "sito" && indice && indice.aggiornato) {
      const d = new Date(indice.aggiornato);
      dati = " · dati OpenStreetMap aggiornati: " + d.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
    } else if (fonteDati === "overpass") {
      dati = " · dati OpenStreetMap in tempo reale";
    }
    messaggio(`Entro ${SL.formattaDistanza(stato.raggio)} ${dove}${dati} · aggiornato alle ${ora}`);
  }

  // Ricalcola distanze, aperture e filtri senza riscaricare (cambio categoria, filtri, orologio)
  function ricalcola() {
    if (!stato.centro) return;
    stato.vicini = SL.preparaPunti(stato.tutti, stato.centro.lat, stato.centro.lon, stato.raggio, stato.categoria)
      .filter(passaFiltri);
    render();
  }

  function passaFiltri(d) {
    if (stato.filtri.has("aperti") && !(d.apertura && d.apertura.aperto)) return false;
    if (stato.filtri.has("orari") && !d.h) return false;
    return true;
  }

  // ---------- Rendering ----------
  // largo al massimo quanto lo schermo meno la colonna dei pulsanti a destra, così non ci finisce sotto
  const OPZ_POPUP = {
    get maxWidth() { return Math.min(360, window.innerWidth - 120); },
    get minWidth() { return Math.min(270, window.innerWidth - 120); },
    autoPanPaddingTopLeft: [16, 90], autoPanPaddingBottomRight: [76, 90]
  };
  function distanzaParlata(m) {
    if (m < 1000) return Math.round(m / 10) * 10 + " metri";
    return (m / 1000).toFixed(1).replace(".", ",") + " chilometri";
  }

  function popupPunto(d) {
    const tit = SL.titolo(d);
    const tipo = SL.nomeTipo(d);
    const ind = SL.indirizzo(d);
    const voce = [tit + "."];
    const righe = [];
    if (tit.toLowerCase() !== tipo.toLowerCase()) voce.push(tipo + ".");
    righe.push(`<p class="pop-tipo tipo-${d.k}">${esc(tipo)}${d.x && d.k !== "X" ? " · " + esc(d.x) : ""}</p>`);
    if (ind) { righe.push(`<p>${esc(ind)}</p>`); voce.push(ind + "."); }
    if (d.k === "A" && d.l) righe.push(`<p>${esc(d.l)}</p>`);
    if (d.k === "A" && d.d) righe.push('<p class="avviso">Al chiuso: utilizzabile solo quando l\'edificio è aperto</p>');
    if (d.k === "S") righe.push('<p class="avviso">In emergenza chiama il <a href="tel:112">112</a></p>');
    if (d.apertura) {
      const t = SL.testoApertura(d.apertura);
      righe.push(`<p class="pop-apertura ${d.apertura.aperto ? "aperto" : "chiuso"}">${esc(t)}</p>`);
      voce.push(t.replace(" · ", ", ") + ".");
    }
    const orari = SL.orariLeggibili(d.h);
    if (orari.length) {
      righe.push(`<div class="pop-orari"><b>Orari</b>${orari.map((o) => `<span>${esc(o)}</span>`).join("")}</div>`);
      if (!d.apertura) righe.push('<p class="fonte">Orari scritti in un modo che l\'app non sa interpretare: leggili qui sopra.</p>');
    }
    if (d.o) righe.push(`<p>Gestito da ${esc(d.o)}</p>`);
    const tel = telefoni(d.t);
    if (tel.length) righe.push(`<p>Tel. ${tel.map((n) => `<a href="tel:${attr(n.replace(/[^\d+]/g, ""))}">${esc(n)}</a>`).join(" · ")}</p>`);
    if (d.w) righe.push(`<p><a href="${attr(sitoWeb(d.w))}" target="_blank" rel="noopener">Sito web</a></p>`);
    righe.push(`<p>${SL.formattaDistanza(d.distanza)} · ${d.distanza < 2500 ? "circa " + SL.minutiAPiedi(d.distanza) + " min a piedi" : "circa " + SL.minutiInAuto(d.distanza) + " min in auto"}</p>`);
    voce.push(distanzaParlata(d.distanza) + ".");
    righe.push(`<p class="fonte">Fonte: OpenStreetMap · <a href="${attr(linkOsm(d))}" target="_blank" rel="noopener">Vedi su OpenStreetMap</a></p>`);
    const pulsanti = [`<a class="pop-vai" href="${linkNavigazione(d.la, d.lo)}" target="_blank" rel="noopener">Portami qui</a>`];
    if (tel.length) pulsanti.push(`<a class="pop-vai pop-chiama" href="tel:${attr(tel[0].replace(/[^\d+]/g, ""))}">Chiama</a>`);
    return `<div class="pop" data-voce="${attr(voce.join(" "))}"><h3>${esc(tit)}</h3>${righe.join("")}
      <div class="pop-pulsanti">${pulsanti.join("")}</div></div>`;
  }

  // Per i pulsanti in basso: cercano tra tutti i punti nel raggio, qualunque sia la categoria scelta
  function tuttiNelRaggio() {
    if (!stato.centro) return [];
    return SL.preparaPunti(stato.tutti, stato.centro.lat, stato.centro.lon, stato.raggio, "tutto");
  }

  // Ordine sulla mappa: pronto soccorso e ospedali sopra, poi farmacie, poi il resto; gli aperti sopra i chiusi
  const PESO = { S: 900, O: 700, F: 600, A: 500, P: 400, C: 300, M: 200, D: 200, X: 100 };

  function render() {
    livelli.raggio.clearLayers();
    livelli.punti.clearLayers();
    markerPerId.clear();
    if (!stato.centro) return;
    const { lat, lon } = stato.centro;

    L.circle([lat, lon], {
      radius: stato.raggio, color: getComputedStyle(document.documentElement).getPropertyValue("--blu").trim() || "#0e5e57",
      weight: 1.5, opacity: .6, fillOpacity: .04, dashArray: "6 6", interactive: false
    }).addTo(livelli.raggio);
    if (!stato.centro.daGps) {
      L.circleMarker([lat, lon], { radius: 6, color: "#fff", weight: 2, fillColor: "#172033", fillOpacity: 1 }).addTo(livelli.raggio);
    }

    const daMostrare = stato.vicini.slice().sort((a, b) => a.distanza - b.distanza).slice(0, cfg.maxSegnaposto || 1500);
    for (const d of daMostrare) {
      const cls = classiMarker(d);
      const z = (PESO[d.k] || 0) + (d.apertura && !d.apertura.aperto ? -100 : 0);
      const m = L.marker([d.la, d.lo], { icon: icona(cls, SIMBOLO[d.k]), title: SL.titolo(d), zIndexOffset: z })
        .bindPopup(() => popupPunto(d), OPZ_POPUP).addTo(livelli.punti);
      markerPerId.set(d.i, m);
    }
    if (stato.vicini.length > daMostrare.length) {
      toast(`Sulla mappa i ${daMostrare.length} più vicini su ${stato.vicini.length}: scegli un tipo o riduci il raggio.`);
    }

    const st = SL.statistiche(tuttiNelRaggio());
    const stCat = SL.statistiche(stato.vicini);
    $("k-n").textContent = stCat.n;
    $("k-aperti").textContent = stCat.aperti;
    $("k-ps").textContent = st.distanzaPs != null ? SL.formattaDistanza(st.distanzaPs) : "–";
    const badge = $("badge-elenco");
    badge.hidden = !stCat.n;
    badge.textContent = stCat.n > 999 ? "999+" : stCat.n;

    renderLista();
  }

  function voceLista(d) {
    const li = document.createElement("li");
    li.className = "voce";
    li.tabIndex = 0;
    const meta = [];
    if (SL.titolo(d) !== SL.nomeTipo(d)) meta.push(`<span>${esc(SL.nomeTipo(d))}</span>`);
    const ind = SL.indirizzo(d) || (d.k === "A" ? d.l : "");
    if (ind) meta.push(`<span>${esc(ind)}</span>`);
    if (d.apertura) meta.push(`<span class="tag ${d.apertura.aperto ? "aperto" : "chiuso"}">${esc(SL.testoApertura(d.apertura))}</span>`);
    li.innerHTML = `
      <div class="icona-tipo"><span class="mk ${classiMarker(d)}">${SIMBOLO[d.k]}</span></div>
      <div class="voce-testo">
        <div class="voce-titolo">${esc(SL.titolo(d))}</div>
        <div class="voce-meta">${meta.join("")}</div>
      </div>
      <div class="voce-dist"><b>${SL.formattaDistanza(d.distanza)}</b><small>${d.distanza < 2500 ? "~" + SL.minutiAPiedi(d.distanza) + " min a piedi" : "~" + SL.minutiInAuto(d.distanza) + " min in auto"}</small></div>`;
    const apri = () => { mostra(d); chiudiElenco(); };
    li.addEventListener("click", apri);
    li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); apri(); } });
    return li;
  }

  function renderLista() {
    const ol = $("lista");
    ol.innerHTML = "";
    const lista = stato.vicini.slice().sort((a, b) => stato.ordine === "nome"
      ? SL.titolo(a).localeCompare(SL.titolo(b), "it") || a.distanza - b.distanza
      : a.distanza - b.distanza);
    if (!lista.length) {
      const li = document.createElement("li");
      li.className = "vuoto";
      li.textContent = stato.filtri.size
        ? "Nessun punto con questi filtri. Prova a toglierne uno o ad allargare il raggio."
        : "Nessun punto di questo tipo in questo raggio. Prova ad allargarlo o a scegliere “Tutto”.";
      ol.appendChild(li);
      return;
    }
    lista.slice(0, 200).forEach((d) => ol.appendChild(voceLista(d)));
  }

  function mostra(d) {
    if (!d) return;
    stato.seguiGps = false;
    mappa.setView([d.la, d.lo], Math.max(mappa.getZoom(), 16));
    let m = markerPerId.get(d.i);
    if (!m) {
      // fuori dalla categoria scelta: segnaposto temporaneo
      m = L.marker([d.la, d.lo], { icon: icona(classiMarker(d), SIMBOLO[d.k]), zIndexOffset: 2000 })
        .bindPopup(() => popupPunto(d), OPZ_POPUP).addTo(livelli.punti);
      markerPerId.set(d.i, m);
    }
    setTimeout(() => m.openPopup(), 250);
  }

  // ---------- Posizione ----------
  let marcatoreIo, cerchioPrecisione;

  function impostaCentro(lat, lon, daGps) {
    const prima = stato.centro;
    stato.centro = { lat, lon, daGps };
    const spostato = !prima || prima.daGps !== daGps ||
      SL.distanza(prima.lat, prima.lon, lat, lon) > (cfg.ricaricaDopoMetri || 300);
    if (spostato) {
      mappa.fitBounds(L.latLng(lat, lon).toBounds(stato.raggio * 2.1));
      carica();
    }
  }

  function suPosizione(p) {
    const { latitude: lat, longitude: lon, accuracy: acc } = p.coords;
    stato.gps = { lat, lon, acc };
    if (!marcatoreIo) {
      marcatoreIo = L.marker([lat, lon], { icon: L.divIcon({ className: "", html: '<div class="io"></div>', iconSize: [18, 18] }), zIndexOffset: 3000, interactive: false }).addTo(livelli.io);
      cerchioPrecisione = L.circle([lat, lon], { radius: acc, color: "#2f7cf6", weight: 0, fillOpacity: .12, interactive: false }).addTo(livelli.io);
    } else {
      marcatoreIo.setLatLng([lat, lon]);
      cerchioPrecisione.setLatLng([lat, lon]).setRadius(acc);
    }
    if (stato.seguiGps) impostaCentro(lat, lon, true);
  }

  function erroreGps(e) {
    const testi = {
      1: "Posizione non autorizzata. Consenti l'accesso alla posizione oppure cerca un indirizzo.",
      2: "Posizione non disponibile. Cerca un indirizzo qui sopra.",
      3: "Il GPS non risponde. Cerca un indirizzo qui sopra."
    };
    if (!stato.gps) messaggio(testi[e.code] || testi[2], true);
  }

  function avviaGps() {
    if (!("geolocation" in navigator)) {
      messaggio("Questo browser non fornisce la posizione. Cerca un indirizzo qui sopra.", true);
      return;
    }
    if (!window.isSecureContext) {
      messaggio("Il GPS funziona solo su HTTPS. Pubblica l'app su un sito https o cerca un indirizzo.", true);
    }
    navigator.geolocation.watchPosition(suPosizione, erroreGps, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
  }

  // ---------- Ricerca indirizzo ----------
  $("form-cerca").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = $("cerca-indirizzo").value.trim();
    if (!q) return;
    messaggio("Cerco “" + q + "”…");
    try {
      const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=it&accept-language=it&q=" + encodeURIComponent(q);
      const [primo] = await fetchJson(url, { headers: { Accept: "application/json" } }, 12000);
      if (!primo) { messaggio("Indirizzo non trovato. Prova ad aggiungere la città.", true); return; }
      stato.seguiGps = false;
      $("cerca-indirizzo").blur();
      impostaCentro(+primo.lat, +primo.lon, false);
    } catch (err) {
      messaggio("Ricerca non riuscita. Controlla la connessione.", true);
    }
  });

  // ---------- Controlli ----------
  $("btn-centra").addEventListener("click", () => {
    stato.seguiGps = true;
    if (stato.gps) {
      impostaCentro(stato.gps.lat, stato.gps.lon, true);
      mappa.fitBounds(L.latLng(stato.gps.lat, stato.gps.lon).toBounds(stato.raggio * 2.1));
    } else toast("Posizione non ancora disponibile.");
  });
  $("btn-aggiorna").addEventListener("click", () => carica(true));
  $("btn-ps").addEventListener("click", () => {
    const tutti = tuttiNelRaggio();
    const d = tutti.filter((x) => x.k === "S").sort((a, b) => a.distanza - b.distanza)[0];
    if (d) mostra(d);
    else toast(`Nessun pronto soccorso entro ${SL.formattaDistanza(stato.raggio)}: allarga il raggio. In emergenza chiama il 112.`);
  });
  $("btn-farmacia").addEventListener("click", () => {
    const farmacie = tuttiNelRaggio().filter((x) => x.k === "F").sort((a, b) => a.distanza - b.distanza);
    const aperta = farmacie.find((x) => x.apertura && x.apertura.aperto);
    if (aperta) { mostra(aperta); return; }
    if (farmacie[0]) { mostra(farmacie[0]); toast("Nessuna farmacia risulta aperta adesso: ecco la più vicina. Controlla i turni."); return; }
    toast(`Nessuna farmacia entro ${SL.formattaDistanza(stato.raggio)}: allarga il raggio.`);
  });

  $("raggio").value = String(stato.raggio);
  $("raggio").addEventListener("change", (e) => {
    stato.raggio = +e.target.value;
    salvaPref("raggio", stato.raggio);
    if (stato.centro) {
      mappa.fitBounds(L.latLng(stato.centro.lat, stato.centro.lon).toBounds(stato.raggio * 2.1));
      carica();
    }
  });
  $("categoria").value = stato.categoria;
  $("categoria").addEventListener("change", (e) => {
    stato.categoria = e.target.value;
    salvaPref("categoria", stato.categoria);
    mappa.closePopup();
    ricalcola();
    toast("Ora vedi: " + (stato.categoria === "tutto" ? "tutti i servizi sanitari" : SL.TIPI[stato.categoria].plurale.toLowerCase()));
  });
  function aggiornaChipOrdine() {
    document.querySelectorAll(".chip.ordine").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.ordine === stato.ordine)));
  }
  aggiornaChipOrdine();
  document.querySelectorAll(".chip.ordine").forEach((c) => c.addEventListener("click", () => {
    stato.ordine = c.dataset.ordine;
    salvaPref("ordine", stato.ordine);
    aggiornaChipOrdine();
    renderLista();
  }));
  document.querySelectorAll(".chip.filtro").forEach((c) => c.addEventListener("click", () => {
    const f = c.dataset.filtro;
    const on = !stato.filtri.has(f);
    on ? stato.filtri.add(f) : stato.filtri.delete(f);
    c.setAttribute("aria-pressed", String(on));
    ricalcola();
  }));
  function apriElenco() {
    $("pannello").hidden = false;
    $("btn-elenco").setAttribute("aria-expanded", "true");
    $("btn-chiudi").focus();
  }
  function chiudiElenco() {
    if ($("pannello").hidden) return;
    $("pannello").hidden = true;
    $("btn-elenco").setAttribute("aria-expanded", "false");
    $("btn-elenco").focus();
  }
  $("btn-elenco").addEventListener("click", apriElenco);
  $("btn-chiudi").addEventListener("click", chiudiElenco);

  // ---------- Guida ----------
  $("g-legenda").innerHTML = Object.entries(SL.TIPI).map(([k, t]) =>
    `<li><span class="g-segno"><span class="mk tipo-${k}${LARGHI.has(k) ? " largo" : ""}">${SIMBOLO[k]}</span></span><div><b>${esc(t.nome)}</b>${{
      S: ": ospedale con pronto soccorso o ingresso del pronto soccorso.",
      O: " senza pronto soccorso indicato.",
      P: ": vende prodotti per la salute ma non medicinali con ricetta.",
      C: ": poliambulatori, cliniche, guardie mediche, centri medici.",
      A: ": defibrillatore automatico esterno, da usare in caso di arresto cardiaco.",
      X: ": laboratori analisi, centri prelievi, fisioterapisti, consultori e altro."
    }[k] || "."}</div></li>`).join("");

  let tornaA = null;
  function apriGuida(e) {
    tornaA = e && e.currentTarget ? e.currentTarget : $("btn-guida");
    $("guida").hidden = false;
    $("guida").querySelector(".pannello-corpo").scrollTop = 0;
    $("btn-guida").setAttribute("aria-expanded", "true");
    $("btn-chiudi-guida").focus();
  }
  function chiudiGuida() {
    if ($("guida").hidden) return false;
    $("guida").hidden = true;
    $("btn-guida").setAttribute("aria-expanded", "false");
    if (tornaA && tornaA.offsetParent) tornaA.focus();
    return true;
  }
  $("btn-guida").addEventListener("click", apriGuida);
  $("btn-guida-elenco").addEventListener("click", apriGuida);
  $("btn-chiudi-guida").addEventListener("click", chiudiGuida);
  $("guida").querySelectorAll(".g-indice a").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    const dest = $("guida").querySelector(a.getAttribute("href"));
    if (dest) dest.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  $("guida-versione").textContent = "Versione " + (cfg.versione || "");
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !chiudiGuida()) chiudiElenco(); });

  // ---------- Lettura vocale dei riquadri ----------
  let letturaAttiva = leggiPref("lettura", "1") !== "0";
  const sintesi = window.speechSynthesis;
  function vocItaliana() {
    const voci = sintesi ? sintesi.getVoices() : [];
    return voci.find((v) => /^it[-_]IT/i.test(v.lang) && v.localService) || voci.find((v) => /^it/i.test(v.lang)) || null;
  }
  function leggi(testo) {
    if (!sintesi || !testo) return;
    sintesi.cancel();
    const u = new SpeechSynthesisUtterance(testo);
    u.lang = "it-IT";
    const v = vocItaliana();
    if (v) u.voice = v;
    u.rate = 1;
    sintesi.speak(u);
  }
  mappa.on("popupopen", (e) => {
    if (!letturaAttiva) return;
    const el = e.popup.getElement && e.popup.getElement();
    const pop = el ? el.querySelector(".pop") : null;
    if (pop) leggi(pop.dataset.voce);
  });
  mappa.on("popupclose", () => { if (sintesi) sintesi.cancel(); });
  if (!sintesi) { $("riga-lettura").hidden = true; }
  $("lettura").value = letturaAttiva ? "1" : "0";
  $("lettura").addEventListener("change", (e) => {
    letturaAttiva = e.target.value === "1";
    salvaPref("lettura", letturaAttiva ? "1" : "0");
    if (letturaAttiva) leggi("Lettura vocale attiva.");
    else if (sintesi) sintesi.cancel();
  });

  // ---------- Auto-refresh ----------
  // Ogni N secondi torna sulla tua posizione e ricalcola i punti vicini e chi è aperto.
  // I dati vengono riscaricati solo se il sito ne ha di nuovi.
  let timerAuto;
  function autoAggiorna() {
    if (document.hidden || !stato.gps) return;
    stato.seguiGps = true;
    stato.centro = { lat: stato.gps.lat, lon: stato.gps.lon, daGps: true };
    mappa.setView([stato.gps.lat, stato.gps.lon], Math.max(mappa.getZoom(), 14));
    carica(false, true);
  }
  function impostaAuto(sec) {
    clearInterval(timerAuto);
    if (sec > 0) timerAuto = setInterval(autoAggiorna, sec * 1000);
    autoAttivo = sec > 0;
    aggiornaSchermoAcceso();
    salvaPref("auto", sec);
  }

  // ---------- Schermo sempre acceso (Wake Lock) ----------
  let autoAttivo = false, bloccoSchermo = null, richiestaInCorso = false;
  function mostraOcchio() { $("occhio").hidden = !bloccoSchermo; }
  async function aggiornaSchermoAcceso() {
    const vuole = autoAttivo && document.visibilityState === "visible";
    if (!vuole) {
      if (bloccoSchermo) { const b = bloccoSchermo; bloccoSchermo = null; b.release().catch(() => {}); }
      mostraOcchio();
      return;
    }
    if (bloccoSchermo || richiestaInCorso || !("wakeLock" in navigator)) { mostraOcchio(); return; }
    richiestaInCorso = true;
    try {
      const b = await navigator.wakeLock.request("screen");
      b.addEventListener("release", () => { if (bloccoSchermo === b) { bloccoSchermo = null; mostraOcchio(); } });
      if (autoAttivo && document.visibilityState === "visible") bloccoSchermo = b;
      else b.release().catch(() => {});
    } catch (e) { /* non supportato o negato: l'app funziona lo stesso */ }
    richiestaInCorso = false;
    mostraOcchio();
  }
  document.addEventListener("visibilitychange", aggiornaSchermoAcceso);
  document.addEventListener("pointerdown", () => { if (autoAttivo && !bloccoSchermo) aggiornaSchermoAcceso(); }, { passive: true });
  $("occhio").addEventListener("click", () => toast("Schermo sempre acceso finché l'AUTO-REFRESH è attivo"));

  let secAuto = cfg.autoRefreshSecondi ?? 120;
  const salvato = leggiPref("auto", null);
  if (salvato !== null && ["0", "30", "60", "120"].includes(salvato)) secAuto = +salvato;
  $("auto-refresh").value = String(secAuto);
  impostaAuto(secAuto);
  $("auto-refresh").addEventListener("change", (e) => {
    impostaAuto(+e.target.value);
    toast(+e.target.value ? `Auto-refresh ogni ${e.target.value} secondi` : "Auto-refresh disattivato");
  });
  $("sfondo").value = sfondoAttivo;
  $("sfondo").addEventListener("change", (e) => impostaSfondo(e.target.value));
  $("suoni").value = suoniAttivi ? "1" : "0";
  $("suoni").addEventListener("change", (e) => {
    suoniAttivi = e.target.value === "1";
    salvaPref("suoni", suoniAttivi ? "1" : "0");
    sbloccaAudio();
    if (suoniAttivi) setTimeout(SUONO.aggiornato, 150); // prova
  });

  // Ogni minuto ricalcola chi è aperto; ogni 30 minuti controlla se il sito ha dati nuovi
  setInterval(() => { if (stato.centro && !stato.caricando && !document.hidden && $("pannello").hidden && !mappa._popup) ricalcola(); }, 60000);
  setInterval(() => { if (stato.centro && !stato.caricando && !document.hidden) carica(false, true); }, 30 * 60000);

  // Numero di versione lungo la diagonale della mappa
  $("filigrana-testo").textContent = "Versione " + (cfg.versione || "");
  function posizionaFiligrana() {
    const f = $("filigrana"), w = f.clientWidth, h = f.clientHeight;
    if (!w || !h) return;
    const diag = Math.hypot(w, h);
    f.style.setProperty("--fil-ang", (Math.atan2(h, w) * 180 / Math.PI).toFixed(1) + "deg");
    f.style.setProperty("--fil-size", Math.round(diag / 10.5) + "px");
  }
  posizionaFiligrana();
  window.addEventListener("resize", posizionaFiligrana);

  avviaGps();

  if ("serviceWorker" in navigator && window.isSecureContext) {
    const cerano = !!navigator.serviceWorker.controller;
    let ricaricata = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (cerano && !ricaricata) { ricaricata = true; location.reload(); }
    });
    navigator.serviceWorker.register("sw.js").then((reg) => reg.update()).catch(() => {});
  }
})();
