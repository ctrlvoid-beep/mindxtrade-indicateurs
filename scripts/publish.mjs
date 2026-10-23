#!/usr/bin/env node
/*
 * Publie une nouvelle version d'un indicateur.
 *
 *   node scripts/publish.mjs --id indicateur-01 --version 1.1.0 --zip "C:\chemin\archive.zip" --notes "Correctif A|Nouveauté B"
 *
 * Options :
 *   --id        identifiant de l'indicateur (voir data/indicators.json)
 *   --version   numéro de version (ex. 1.11 ou 1.1.0)
 *   --zip       chemin de l'archive à publier
 *   --notes     notes de version, séparées par « | »
 *   --status    stable | beta | soon (défaut : stable)
 *   --date      date de publication AAAA-MM-JJ (défaut : aujourd'hui)
 *   --guide     PDF à exposer en lecture en ligne (défaut : premier PDF trouvé dans le zip)
 *   --force     écrase une version déjà publiée
 *   --push      enchaîne git add / commit / push (Vercel redéploie alors automatiquement)
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data", "indicators.json");

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

function fail(msg) {
  console.error("✖ " + msg);
  process.exit(1);
}

// Extrait le premier PDF d'une archive zip (méthodes « stored » et « deflate »)
function extractFirstPdf(zipBuf) {
  const eocd = zipBuf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;
  const count = zipBuf.readUInt16LE(eocd + 10);
  let p = zipBuf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (zipBuf.readUInt32LE(p) !== 0x02014b50) break;
    const method = zipBuf.readUInt16LE(p + 10);
    const compSize = zipBuf.readUInt32LE(p + 20);
    const nameLen = zipBuf.readUInt16LE(p + 28);
    const extraLen = zipBuf.readUInt16LE(p + 30);
    const commentLen = zipBuf.readUInt16LE(p + 32);
    const localOff = zipBuf.readUInt32LE(p + 42);
    const name = zipBuf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (!/\.pdf$/i.test(name) || name.includes("__MACOSX")) continue;
    const lNameLen = zipBuf.readUInt16LE(localOff + 26);
    const lExtraLen = zipBuf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = zipBuf.subarray(start, start + compSize);
    if (method === 0) return { name, data: raw };
    if (method === 8) return { name, data: zlib.inflateRawSync(raw) };
  }
  return null;
}

const opt = args(process.argv.slice(2));
if (!opt.id || !opt.version || !opt.zip) {
  fail('Usage : node scripts/publish.mjs --id <id> --version <x.y.z> --zip <archive.zip> [--notes "a|b"] [--push]');
}
if (!/^\d+(\.\d+){1,2}$/.test(opt.version)) fail(`Version invalide « ${opt.version} » (format attendu : 1.2 ou 1.2.3)`);

const zipPath = path.resolve(opt.zip);
if (!fs.existsSync(zipPath)) fail(`Archive introuvable : ${zipPath}`);

const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
const ind = data.indicators.find((i) => i.id === opt.id);
if (!ind) fail(`Indicateur « ${opt.id} » inconnu. Disponibles : ${data.indicators.map((i) => i.id).join(", ")}`);

ind.changelog ??= [];
const existing = ind.changelog.findIndex((c) => c.version === opt.version);
if (existing >= 0 && !opt.force) fail(`La v${opt.version} de ${ind.id} est déjà publiée (ajoutez --force pour l'écraser).`);

const date = typeof opt.date === "string" ? opt.date : new Date().toISOString().slice(0, 10);
const relDir = `downloads/${ind.id}`;
const relZip = `${relDir}/${ind.id}-v${opt.version}.zip`;
fs.mkdirSync(path.join(ROOT, relDir), { recursive: true });

const zipBuf = fs.readFileSync(zipPath);
fs.writeFileSync(path.join(ROOT, relZip), zipBuf);
const sha256 = createHash("sha256").update(zipBuf).digest("hex");

// Guide PDF consultable en ligne
let relGuide = null;
const relGuidePath = `${relDir}/${ind.id}-guide-v${opt.version}.pdf`;
if (typeof opt.guide === "string") {
  fs.copyFileSync(path.resolve(opt.guide), path.join(ROOT, relGuidePath));
  relGuide = relGuidePath;
} else {
  try {
    const pdf = extractFirstPdf(zipBuf);
    if (pdf) {
      fs.writeFileSync(path.join(ROOT, relGuidePath), pdf.data);
      relGuide = relGuidePath;
      console.log(`  Guide extrait du zip : ${pdf.name}`);
    }
  } catch (e) {
    console.warn(`  (Guide PDF non extrait : ${e.message})`);
  }
}

const notes = typeof opt.notes === "string" ? opt.notes.split("|").map((s) => s.trim()).filter(Boolean) : [];
const entry = { version: opt.version, date, notes, file: relZip };
if (existing >= 0) ind.changelog.splice(existing, 1);
ind.changelog.unshift(entry);

Object.assign(ind, {
  version: opt.version,
  released: date,
  status: typeof opt.status === "string" ? opt.status : ind.status === "soon" ? "stable" : ind.status,
  file: relZip,
  size: zipBuf.length,
  sha256,
  guide: relGuide ?? ind.guide,
});

fs.writeFileSync(DATA, JSON.stringify(data, null, 2) + "\n", "utf8");

console.log(`✔ ${ind.name} v${opt.version} publié`);
console.log(`  Archive : ${relZip} (${(zipBuf.length / 1024).toFixed(1)} Ko)`);
console.log(`  SHA-256 : ${sha256}`);

if (opt.push) {
  const git = (...a) => execFileSync("git", a, { cwd: ROOT, stdio: "inherit" });
  git("add", "-A");
  git("commit", "-m", `Publie ${ind.name} v${opt.version}`);
  git("push");
  console.log("✔ Poussé sur GitHub — Vercel redéploie le site automatiquement.");
} else {
  console.log("  Prochaine étape : git add -A && git commit && git push (ou relancez avec --push).");
}
