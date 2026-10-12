#!/usr/bin/env node
/*
 * Pets – scarica da OpenStreetMap (Overpass API) veterinari, pronto soccorso veterinari,
 * farmacie veterinarie, negozi per animali, toelettature, aree cani, canili e pensioni in Italia
 * e li salva nel sito, divisi in "tessere" da 0,25 gradi (circa 28 × 20 km).
 *
 * Lo esegue GitHub a ogni pubblicazione (vedi .github/workflows/pubblica.yml). I dati finiscono nella cartella dati/ del sito.
 * I dati NON vengono salvati nel repository: finiscono solo nel sito pubblicato.
 * Per non pesare su Overpass, se i dati pubblicati hanno meno di ORE_VALIDI ore li ricopia dal sito
 * (FORZA=1 li riscarica comunque). Se Overpass non risponde, ricopia quelli già pubblicati.
 *
 * Uso: node aggiorna_animali.js   (variabili d'ambiente: SITO, FORZA)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const PT = require("./core.js");

const CARTELLA = path.join(__dirname, "dati");
const PASSO = 0.25;
const ORE_VALIDI = 20;
const USER_AGENT = "Pets/1.0 (app web personale; dati OpenStreetMap)";
const SERVER = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
];
const QUERY = PT.queryOverpass("", 900)
  .replace("[out:json][timeout:900];", '[out:json][timeout:900];area["ISO3166-1"="IT"][admin_level=2]->.zona;')
  .replace(/nwr\[/g, "nwr(area.zona)[");

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

async function scarica(url, opz, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...opz, headers: { "User-Agent": USER_AGENT, ...(opz && opz.headers) }, signal: ctrl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r;
  } finally {
    clearTimeout(t);
  }
}

async function daOverpass() {
  let ultimo;
  for (let giro = 0; giro < 2; giro++) {
    for (const url of SERVER) {
      try {
        console.log(`Interrogo ${url} …`);
        const r = await scarica(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "data=" + encodeURIComponent(QUERY)
        }, 16 * 60000);
        const dati = await r.json();
        if (dati.remark && /error|runtime/i.test(dati.remark)) throw new Error(dati.remark);
        const n = (dati.elements || []).length;
        console.log(`  ${n} elementi`);
        if (n < 5000) throw new Error(`troppo pochi elementi (${n}): risposta incompleta?`);
        return dati.elements;
      } catch (e) {
        ultimo = e;
        console.log(`  ${url}: ${e.message}`);
        await attendi(30000);
      }
    }
  }
  throw new Error("Overpass non raggiungibile: " + (ultimo && ultimo.message));
}

function salva(elementi) {
  const visti = new Set();
  const tessere = new Map();
  const conta = {};
  for (const el of elementi) {
    const p = PT.compatta(el);
    if (!p || visti.has(p.i)) continue;
    visti.add(p.i);
    if (!(p.la >= 35 && p.la <= 47.5 && p.lo >= 6 && p.lo <= 19)) continue;
    const t = PT.nomeTessera(p.la, p.lo, PASSO);
    if (!tessere.has(t)) tessere.set(t, []);
    tessere.get(t).push(p);
    conta[p.k] = (conta[p.k] || 0) + 1;
  }
  fs.rmSync(CARTELLA, { recursive: true, force: true });
  fs.mkdirSync(CARTELLA, { recursive: true });
  for (const [t, lista] of tessere) fs.writeFileSync(path.join(CARTELLA, t), JSON.stringify({ d: lista }));
  const indice = {
    passo: PASSO,
    aggiornato: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    punti: visti.size,
    perTipo: conta,
    tessere: [...tessere.keys()].sort(),
    fonte: "© OpenStreetMap contributors (ODbL)"
  };
  fs.writeFileSync(path.join(CARTELLA, "indice.json"), JSON.stringify(indice, null, 1));
  console.log(`  salvate ${tessere.size} tessere, ${visti.size} punti`, conta);
}

async function indicePubblicato(sito) {
  if (!sito) throw new Error("indirizzo del sito non indicato");
  const base = sito.replace(/\/?$/, "/") + "dati/";
  const r = await scarica(base + "indice.json", {}, 20000);
  return { base, indice: await r.json() };
}

async function recuperaDalSito(sito) {
  const { base, indice } = await indicePubblicato(sito);
  console.log(`Ricopio i dati già pubblicati da ${base} (aggiornati ${indice.aggiornato}) …`);
  fs.rmSync(CARTELLA, { recursive: true, force: true });
  fs.mkdirSync(CARTELLA, { recursive: true });
  const coda = indice.tessere.slice();
  async function lavoratore() {
    while (coda.length) {
      const t = coda.shift();
      let ok = false;
      for (let i = 0; i < 3 && !ok; i++) {
        try {
          const r = await scarica(base + t, {}, 60000);
          fs.writeFileSync(path.join(CARTELLA, t), Buffer.from(await r.arrayBuffer()));
          ok = true;
        } catch (e) {
          console.log(`  ${t}: ${e.message}`);
          await attendi(3000);
        }
      }
      if (!ok) throw new Error(`tessera ${t} non recuperata`);
    }
  }
  await Promise.all(Array.from({ length: 8 }, lavoratore));
  fs.writeFileSync(path.join(CARTELLA, "indice.json"), JSON.stringify(indice, null, 1));
  console.log(`  ricopiate ${indice.tessere.length} tessere`);
}

async function main() {
  const sito = process.env.SITO;
  const forza = process.env.FORZA === "1" || process.env.FORZA === "true";
  if (!forza) {
    try {
      const { indice } = await indicePubblicato(sito);
      const ore = (Date.now() - Date.parse(indice.aggiornato)) / 3600000;
      if (ore < ORE_VALIDI) {
        console.log(`Dati pubblicati ${ore.toFixed(1)} ore fa: non serve riscaricarli.`);
        await recuperaDalSito(sito);
        return;
      }
    } catch (e) {
      console.log(`Dati pubblicati non disponibili (${e.message}): li scarico da Overpass.`);
    }
  }
  try {
    salva(await daOverpass());
  } catch (e) {
    console.log(`Overpass non disponibile: ${e.message}`);
    try {
      await recuperaDalSito(sito);
    } catch (e2) {
      console.log(`Nessun dato disponibile: ${e2.message}. L'app userà Overpass direttamente.`);
      process.exitCode = 1;
    }
  }
}

if (require.main === module) main();
else module.exports = { salva, QUERY };
