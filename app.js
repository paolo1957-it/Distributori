/*
 * Distributori – interfaccia: mappa, posizione, caricamento prezzi, elenco.
 * Stessa struttura di PostoLibero.
 */
(function () {
  "use strict";
  const cfg = window.DISTRIBUTORI_CONFIG;
  const $ = (id) => document.getElementById(id);
  const PREF = "distributori.";
  const leggiPref = (k, def) => { try { const v = localStorage.getItem(PREF + k); return v === null ? def : v; } catch (e) { return def; } };
  const salvaPref = (k, v) => { try { localStorage.setItem(PREF + k, String(v)); } catch (e) { /* ignora */ } };

  const stato = {
    gps: null,          // ultima posizione GPS {lat, lon, acc}
    centro: null,       // punto della ricerca {lat, lon, daGps}
    raggio: +leggiPref("raggio", cfg.raggioMetri || 5000),
    carburante: leggiPref("carburante", cfg.carburante || "B"),
    modo: leggiPref("modo", cfg.modo || "self"),
    ordine: leggiPref("ordine", "prezzo"),
    tutti: [],          // distributori delle tessere scaricate
    vicini: [],         // distributori entro il raggio, con prezzo e fascia
    filtri: new Set(),
    caricando: false,
    seguiGps: true
  };
  if (![1000, 2000, 5000, 10000].includes(stato.raggio)) stato.raggio = 5000;
  if (!DL.CARBURANTI[stato.carburante]) stato.carburante = "B";
  if (!["self", "servito"].includes(stato.modo)) stato.modo = "self";
  if (!["prezzo", "distanza"].includes(stato.ordine)) stato.ordine = "prezzo";

  // ---------- Mappa ----------
  const mappa = L.map("mappa", { zoomControl: false, attributionControl: true })
    .setView([41.9, 12.5], 6);
  const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/";
  const sfondi = {
    stradale: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Prezzi: MIMIT'
    }),
    // Stessa cartina, ma ogni tessera è disegnata grande il doppio (si usa quella del livello di zoom
    // precedente): così i nomi delle vie si leggono meglio. L'immagine è un po' meno nitida.
    grande: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, tileSize: 512, zoomOffset: -1,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Prezzi: MIMIT'
    }),
    satellite: L.layerGroup([
      L.tileLayer(ESRI + "World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19, maxNativeZoom: 19,
        attribution: "Immagini: Esri, Vantor, Earthstar Geographics, GIS User Community · Strade: Esri, HERE, Garmin, © OpenStreetMap · Prezzi: MIMIT"
      }),
      L.tileLayer(ESRI + "Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, opacity: .8 }),
      L.tileLayer(ESRI + "Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 })
    ])
  };
  let sfondoAttivo = leggiPref("sfondo", "stradale");
  if (!sfondi[sfondoAttivo]) sfondoAttivo = "stradale";
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
    senzaPrezzo: L.layerGroup().addTo(mappa),
    distributori: L.layerGroup().addTo(mappa),
    io: L.layerGroup().addTo(mappa)
  };
  const markerPerId = new Map();
  mappa.on("dragstart", () => { stato.seguiGps = false; });

  const icona = (cls, html) => L.divIcon({ className: "", html: `<div class="mk ${cls}">${html ?? ""}</div>`, iconSize: null });

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
    `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;
  const unita = () => DL.CARBURANTI[stato.carburante].unita;
  const nomeCarburante = () => DL.CARBURANTI[stato.carburante].nome;

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

  // ---------- Prezzi salvati nel sito ----------
  // Più volte al giorno GitHub scarica i file del MIMIT e li salva nella cartella "dati" del sito,
  // divisi in tessere da 0,25 gradi. L'app scarica solo le tessere intorno a te.
  let indice = null, indiceLetto = 0;
  const tessere = new Map();   // nome → { t: quando, lista }
  async function leggiIndice(forza) {
    if (!forza && indice && Date.now() - indiceLetto < 15 * 60000) return indice;
    const nuovo = await fetchJson("dati/indice.json", {}, 10000);
    if (!indice || nuovo.aggiornato !== indice.aggiornato) tessere.clear(); // prezzi nuovi: via le tessere vecchie
    indice = nuovo;
    indiceLetto = Date.now();
    return indice;
  }
  async function caricaDistributori(lat, lon, raggio, forza) {
    const ind = await leggiIndice(forza);
    const esistenti = new Set(ind.tessere || []);
    const nomi = DL.tessereNelRaggio(lat, lon, raggio, ind.passo || 0.25).filter((t) => esistenti.has(t));
    const mancanti = nomi.filter((t) => !tessere.has(t));
    const parti = await Promise.all(mancanti.map((t) => fetchJson("dati/" + t, {}, 15000)));
    mancanti.forEach((t, i) => tessere.set(t, parti[i].d || []));
    return nomi.flatMap((t) => tessere.get(t) || []);
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
  // L'iPhone fa parlare l'app solo dopo che la voce è partita una volta da un tocco:
  // al primo tocco qualsiasi la sblocchiamo in silenzio, così la lettura vocale funziona subito.
  let voceSbloccata = false;
  function sbloccaVoce() {
    const s = window.speechSynthesis;
    if (voceSbloccata || !s) return;
    voceSbloccata = true;
    const u = new SpeechSynthesisUtterance(" ");
    u.lang = "it-IT";
    u.volume = 0;
    const v = vocItaliana();
    if (v) u.voice = v;
    s.speak(u);
  }
  document.addEventListener("touchend", sbloccaVoce, { passive: true });
  document.addEventListener("click", sbloccaVoce, { passive: true });
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
  let giroCarica = 0;
  async function carica(forza, silenzioso) {
    if (!stato.centro) return;
    const giro = ++giroCarica;
    stato.caricando = true;
    $("btn-aggiorna").classList.add("gira");
    const { lat, lon } = stato.centro;
    if (!silenzioso) messaggio("Cerco distributori entro " + DL.formattaDistanza(stato.raggio) + "…");
    let errore = null;
    try {
      const lista = await caricaDistributori(lat, lon, stato.raggio, forza);
      if (giro !== giroCarica) return;
      stato.tutti = lista;
      stato.tentativi = 0;
    } catch (e) {
      errore = e;
      console.warn("Prezzi non disponibili", e);
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
      messaggio(`Non riesco a scaricare i prezzi. Riprovo da solo tra ${sec >= 60 ? sec / 60 + " min" : sec + " secondi"}.`, true);
      return;
    }
    SUONO.aggiornato();
    const ora = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    const dove = stato.centro.daGps ? "dalla tua posizione" : "dal punto cercato";
    let delGiorno = "";
    if (indice && indice.estrazione) {
      const g = DL.giorniDa(indice.estrazione + "T08:00");
      const data = new Date(indice.estrazione + "T08:00").toLocaleDateString("it-IT", { day: "numeric", month: "long" });
      delGiorno = g <= 0 ? " · prezzi di oggi" : g === 1 ? " · prezzi di ieri (" + data + ")" : " · prezzi del " + data;
    }
    messaggio(`Entro ${DL.formattaDistanza(stato.raggio)} ${dove}${delGiorno} · aggiornato alle ${ora}`);
  }

  // Ricalcola distanze, prezzi e colori senza riscaricare (cambio carburante, modo, filtri)
  function ricalcola() {
    if (!stato.centro) return;
    stato.vicini = DL.preparaDistributori(stato.tutti, stato.centro.lat, stato.centro.lon, stato.raggio, stato.carburante, stato.modo)
      .filter(passaFiltri);
    DL.classifica(stato.vicini);
    render();
  }

  function passaFiltri(d) {
    if (stato.filtri.has("autostrada") && d.t) return false;
    if (stato.filtri.has("recenti")) {
      const g = DL.giorniDa(d.dataPrezzo);
      if (g == null || g > (cfg.giorniPrezzoVecchio || 7)) return false;
    }
    return true;
  }
  const vecchio = (d) => { const g = DL.giorniDa(d.dataPrezzo); return g != null && g > (cfg.giorniPrezzoVecchio || 7); };

  // ---------- Rendering ----------
  const OPZ_POPUP = { maxWidth: 360, minWidth: 270, autoPanPadding: [16, 90] };
  function distanzaParlata(m) {
    if (m < 1000) return Math.round(m / 10) * 10 + " metri";
    return (m / 1000).toFixed(1).replace(".", ",") + " chilometri";
  }

  function popupDistributore(d) {
    const tit = DL.titolo(d);
    const ind = DL.indirizzo(d);
    const voce = [tit + ".", ind + "."];
    const righe = [];
    const nome = DL.capitalizza(d.n || "");
    if (nome && nome.toLowerCase() !== tit.toLowerCase()) righe.push(`<p>${esc(nome)}</p>`);
    righe.push(`<p>${esc(ind)}</p>`);
    if (d.t) righe.push('<p><span class="tag autostrada">Autostrada</span></p>');
    const modoTesto = stato.modo === "servito" ? "servito" : "self";
    if (d.prezzo != null) {
      righe.push(`<p class="pop-prezzo ${d.fascia}">${esc(nomeCarburante())} ${modoTesto} <b>${DL.formattaPrezzo(d.prezzo)}</b> €/${unita()}</p>`);
      voce.push(`${nomeCarburante()} ${modoTesto}: ${DL.formattaPrezzo(d.prezzo)} euro al ${unita() === "kg" ? "chilo" : "litro"}.`);
      if (d.fascia === "economico") voce.push("Tra i più economici in zona.");
      else if (d.fascia === "caro") voce.push("Tra i più cari in zona.");
      const quando = DL.quando(d.dataPrezzo);
      righe.push(vecchio(d) ? `<p class="avviso">Prezzo comunicato ${esc(quando)}: potrebbe non essere aggiornato</p>`
        : `<p>Prezzo comunicato ${esc(quando)}</p>`);
      if (vecchio(d)) voce.push("Attenzione: prezzo non aggiornato da " + DL.giorniDa(d.dataPrezzo) + " giorni.");
    } else {
      righe.push(`<p class="avviso">Nessun prezzo ${esc(modoTesto)} comunicato per ${esc(nomeCarburante().toLowerCase())}</p>`);
      voce.push(`Nessun prezzo ${modoTesto} per ${nomeCarburante().toLowerCase()}.`);
    }
    const tab = DL.tabellaPrezzi(d);
    if (tab.length) {
      righe.push(`<table class="pop-tab"><tr><th>Carburante</th><th>Self</th><th>Servito</th></tr>${tab.map((r) =>
        `<tr${r.cat === stato.carburante ? ' class="scelto"' : ""}><td>${esc(r.nome)}</td><td>${DL.formattaPrezzo(r.self)}</td><td>${DL.formattaPrezzo(r.servito)}</td></tr>`).join("")}</table>`);
    }
    righe.push(`<p>${DL.formattaDistanza(d.distanza)} · circa ${DL.minutiInAuto(d.distanza)} min in auto</p>`);
    voce.push(distanzaParlata(d.distanza) + ".");
    righe.push('<p class="fonte">Fonte: MIMIT – Osservatorio prezzi carburanti</p>');
    return `<div class="pop" data-voce="${attr(voce.join(" "))}"><h3>${esc(tit)}</h3>${righe.join("")}
      <a class="pop-vai" href="${linkNavigazione(d.la, d.lo)}" target="_blank" rel="noopener">Portami qui</a></div>`;
  }

  function piuEconomico() {
    return stato.vicini.filter((d) => d.prezzo != null)
      .sort((a, b) => a.prezzo - b.prezzo || a.distanza - b.distanza)[0] || null;
  }
  function piuVicino() {
    return stato.vicini.filter((d) => d.prezzo != null).sort((a, b) => a.distanza - b.distanza)[0] || null;
  }

  function render() {
    Object.entries(livelli).forEach(([k, g]) => { if (k !== "io") g.clearLayers(); });
    markerPerId.clear();
    if (!stato.centro) return;
    const { lat, lon } = stato.centro;

    L.circle([lat, lon], {
      radius: stato.raggio, color: getComputedStyle(document.documentElement).getPropertyValue("--blu").trim() || "#1b4f9c",
      weight: 1.5, opacity: .6, fillOpacity: .04, dashArray: "6 6", interactive: false
    }).addTo(livelli.raggio);
    if (!stato.centro.daGps) {
      L.circleMarker([lat, lon], { radius: 6, color: "#fff", weight: 2, fillColor: "#172033", fillOpacity: 1 }).addTo(livelli.io);
    }

    const migliore = piuEconomico();
    for (const d of stato.vicini) {
      let m;
      if (d.prezzo == null) {
        m = L.marker([d.la, d.lo], { icon: icona("nd"), title: DL.titolo(d) })
          .bindPopup(popupDistributore(d), OPZ_POPUP).addTo(livelli.senzaPrezzo);
      } else {
        const cls = ["prezzo", d.fascia, vecchio(d) ? "vecchio" : "", migliore && migliore.id === d.id ? "top" : ""].join(" ");
        // i più economici sopra gli altri quando si sovrappongono
        const z = d.fascia === "economico" ? 300 : d.fascia === "medio" ? 200 : 100;
        m = L.marker([d.la, d.lo], { icon: icona(cls, DL.formattaPrezzo(d.prezzo)), title: DL.titolo(d), zIndexOffset: z + (migliore && migliore.id === d.id ? 500 : 0) })
          .bindPopup(popupDistributore(d), OPZ_POPUP).addTo(livelli.distributori);
      }
      markerPerId.set(d.id, m);
    }

    const st = DL.statistiche(stato.vicini);
    $("k-min").textContent = st.min != null ? DL.formattaPrezzo(st.min) : "–";
    $("k-media").textContent = st.media != null ? DL.formattaPrezzo(st.media) : "–";
    $("k-n").textContent = st.n;
    $("k-unita").textContent = "€/" + unita();
    $("btn-economico").disabled = !migliore;
    $("btn-vicino").disabled = !migliore;

    renderLista();
  }

  function voceLista(d) {
    const li = document.createElement("li");
    li.className = "voce";
    li.tabIndex = 0;
    const meta = [`<span>${esc(DL.indirizzo(d))}</span>`];
    if (d.t) meta.push('<span class="tag autostrada">Autostrada</span>');
    if (d.prezzo != null) {
      const g = DL.giorniDa(d.dataPrezzo);
      if (vecchio(d)) meta.push(`<span class="tag vecchio">non aggiornato da ${g} giorni</span>`);
      else meta.push(`<span>${g <= 0 ? "aggiornato oggi" : g === 1 ? "aggiornato ieri" : "aggiornato " + g + " giorni fa"}</span>`);
    } else {
      meta.push(`<span>nessun prezzo ${stato.modo === "servito" ? "servito" : "self"}</span>`);
    }
    li.innerHTML = `
      <div class="icona prezzo ${d.prezzo != null ? d.fascia : "nd"}${vecchio(d) ? " vecchio" : ""}">${d.prezzo != null ? DL.formattaPrezzo(d.prezzo) : "–"}</div>
      <div class="voce-testo">
        <div class="voce-titolo">${esc(DL.titolo(d))}</div>
        <div class="voce-meta">${meta.join("")}</div>
      </div>
      <div class="voce-dist"><b>${DL.formattaDistanza(d.distanza)}</b><small>~${DL.minutiInAuto(d.distanza)} min</small></div>`;
    const apri = () => { mostra(d); chiudiElenco(); };
    li.addEventListener("click", apri);
    li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); apri(); } });
    return li;
  }

  function renderLista() {
    const ol = $("lista");
    ol.innerHTML = "";
    const lista = stato.vicini.slice().sort((a, b) => {
      if (stato.ordine === "prezzo") {
        if ((a.prezzo == null) !== (b.prezzo == null)) return a.prezzo == null ? 1 : -1;
        if (a.prezzo != null && a.prezzo !== b.prezzo) return a.prezzo - b.prezzo;
      }
      return a.distanza - b.distanza;
    });
    if (!lista.length) {
      const li = document.createElement("li");
      li.className = "vuoto";
      li.textContent = stato.filtri.size
        ? "Nessun distributore con questi filtri. Prova a toglierne uno o ad allargare il raggio."
        : "Nessun distributore in questo raggio. Prova ad allargarlo.";
      ol.appendChild(li);
      return;
    }
    lista.slice(0, 200).forEach((d) => ol.appendChild(voceLista(d)));
  }

  function mostra(d) {
    if (!d) return;
    stato.seguiGps = false;
    mappa.setView([d.la, d.lo], Math.max(mappa.getZoom(), 15));
    const m = markerPerId.get(d.id);
    if (m) setTimeout(() => m.openPopup(), 250);
  }

  // ---------- Posizione ----------
  let marcatoreIo, cerchioPrecisione;

  function impostaCentro(lat, lon, daGps) {
    const prima = stato.centro;
    stato.centro = { lat, lon, daGps };
    const spostato = !prima || prima.daGps !== daGps ||
      DL.distanza(prima.lat, prima.lon, lat, lon) > (cfg.ricaricaDopoMetri || 300);
    if (spostato) {
      mappa.fitBounds(L.latLng(lat, lon).toBounds(stato.raggio * 2.1));
      carica();
    }
  }

  function suPosizione(p) {
    const { latitude: lat, longitude: lon, accuracy: acc } = p.coords;
    stato.gps = { lat, lon, acc };
    if (!marcatoreIo) {
      marcatoreIo = L.marker([lat, lon], { icon: L.divIcon({ className: "", html: '<div class="io"></div>', iconSize: [18, 18] }), zIndexOffset: 1000, interactive: false }).addTo(livelli.io);
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
  $("btn-economico").addEventListener("click", () => {
    const d = piuEconomico();
    if (d) mostra(d); else toast("Nessun prezzo disponibile in questo raggio.");
  });
  $("btn-vicino").addEventListener("click", () => {
    const d = piuVicino();
    if (d) mostra(d); else toast("Nessun distributore con prezzo in questo raggio.");
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
  $("carburante").value = stato.carburante;
  $("carburante").addEventListener("change", (e) => {
    stato.carburante = e.target.value;
    salvaPref("carburante", stato.carburante);
    mappa.closePopup();
    ricalcola();
    toast("Ora vedi: " + nomeCarburante() + " " + (stato.modo === "servito" ? "servito" : "self"));
  });
  $("modo").value = stato.modo;
  $("modo").addEventListener("change", (e) => {
    stato.modo = e.target.value;
    salvaPref("modo", stato.modo);
    ricalcola();
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
  // Condividi su WhatsApp: messaggio già scritto con il link all'app (?ref=whatsapp per GoatCounter)
  const linkApp = location.origin + location.pathname + "?ref=whatsapp";
  $("btn-condividi").href = "https://wa.me/?text=" + encodeURIComponent(
    "Ti consiglio Distributori: trovi i distributori di carburante vicino a te con i prezzi aggiornati. " +
    "Gratis e senza registrazione: " + linkApp);
  $("btn-condividi").addEventListener("click", () => {
    if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: "condividi-whatsapp", title: "Condividi su WhatsApp", event: true });
  });
  $("btn-elenco").addEventListener("click", apriElenco);
  $("btn-chiudi").addEventListener("click", chiudiElenco);

  // ---------- Guida ----------
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
  // Ogni N secondi torna sulla tua posizione e ricalcola i distributori vicini.
  // I prezzi vengono riscaricati solo se il sito ne ha di nuovi (controllo ogni 15 minuti).
  let timerAuto;
  function autoAggiorna() {
    if (document.hidden || !stato.gps) return;
    stato.seguiGps = true;
    stato.centro = { lat: stato.gps.lat, lon: stato.gps.lon, daGps: true };
    mappa.setView([stato.gps.lat, stato.gps.lon], Math.max(mappa.getZoom(), 13));
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

  // Ogni 15 minuti controlla se il sito ha prezzi nuovi
  setInterval(() => { if (stato.centro && !stato.caricando && !document.hidden) carica(false, true); }, 15 * 60000);

  // Numero di versione nell'ultima riga della pagina Elenco
  $("elenco-versione").textContent = "Versione " + (cfg.versione || "");

  $("btn-economico").disabled = true;
  $("btn-vicino").disabled = true;
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
