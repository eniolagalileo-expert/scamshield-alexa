// Real-world benchmark for the rules layer (check_message without an assistant).
// Downloads the CC BY 4.0 "SMS Phishing Dataset for Machine Learning and Pattern Recognition"
// (Mishra & Soni, Mendeley Data 2022, doi:10.17632/f45bkkt8pr.1) into eval/.cache/ and scores every message.
// These messages were never used to design or tune the rules.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
import { scanMessage } from "../lib/scan.js";

const ZIP_URL = "https://data.mendeley.com/public-files/datasets/f45bkkt8pr/files/edb361de-918d-469f-9106-e84823830665/file_downloaded";
const cacheDir = new URL("../eval/.cache/", import.meta.url);
const csvPath = new URL("Dataset_5971.csv", cacheDir);

// Minimal ZIP reader: finds the CSV entry via the central directory and inflates it.
function unzipFirstCsv(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (name.endsWith(".csv")) {
      const lNameLen = buf.readUInt16LE(localOffset + 26), lExtraLen = buf.readUInt16LE(localOffset + 28);
      const data = buf.subarray(localOffset + 30 + lNameLen + lExtraLen, localOffset + 30 + lNameLen + lExtraLen + compSize);
      return method === 8 ? inflateRawSync(data) : data;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("No CSV found in the dataset archive.");
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

if (!existsSync(csvPath)) {
  console.error("Downloading the CC BY 4.0 SMS phishing dataset (245 KB)…");
  const res = await fetch(ZIP_URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  await mkdir(cacheDir, { recursive: true });
  await writeFile(csvPath, unzipFirstCsv(Buffer.from(await res.arrayBuffer())));
}

const [header, ...rows] = parseCsv(await readFile(csvPath, "latin1"));
const L = header.indexOf("LABEL"), T = header.indexOf("TEXT");

// Honest split (Sept 27, 2026): rule changes may only be informed by the "tune" half. The "held-out" half,
// which always includes the 60-message sample used for the assistant/sampling evaluations, is never inspected.
const sample = new Set(JSON.parse(await readFile(new URL("../eval/real-world-sample.json", import.meta.url), "utf8")).map((m) => m.text.trim()));
export const half = (text) => (sample.has(text.trim()) || createHash("sha256").update(text).digest()[0] % 2 === 1 ? "held-out" : "tune");

const stats = {}, bySplit = { tune: {}, "held-out": {} };
const tuneMisses = [], tuneFalseAlarms = [];
for (const r of rows) {
  if (!r[T]) continue;
  const label = r[L].toLowerCase();
  const v = scanMessage(r[T]).verdict;
  for (const bucket of [stats, bySplit[half(r[T])]]) {
    const s = (bucket[label] ??= { n: 0, flagged: 0 });
    s.n++;
    if (v !== "likely_safe") s.flagged++;
  }
  if (half(r[T]) === "tune" && label === "smishing" && v === "likely_safe") tuneMisses.push(r[T]);
  if (half(r[T]) === "tune" && label === "ham" && v !== "likely_safe") tuneFalseAlarms.push(r[T]);
}
if (process.argv.includes("--tune-report")) {
  // Only the tune half is ever printed, so rule changes can't be fitted to the held-out half.
  await writeFile(new URL("../eval/.cache/tune-misses.json", import.meta.url), JSON.stringify({ misses: tuneMisses, falseAlarms: tuneFalseAlarms }, null, 1));
}

const pct = (s) => `${((100 * s.flagged) / s.n).toFixed(1)}%`;
const md = [
  "# Real-world benchmark (rules layer only)",
  "",
  "Source: Mishra & Soni, *SMS Phishing Dataset for Machine Learning and Pattern Recognition*, Mendeley Data 2022, doi:10.17632/f45bkkt8pr.1 (CC BY 4.0). Never used for tuning.",
  "",
  "| Label | Messages | Flagged as scam or suspicious |",
  "|---|---|---|",
  ...Object.entries(stats).map(([k, s]) => `| ${k} | ${s.n} | ${pct(s)} |`),
  "",
  "By split (rule changes after Sept 27, 2026 were informed only by the tune half; the held-out half is never inspected):",
  "",
  "| Split | Smishing caught | Ham false alarms |",
  "|---|---|---|",
  ...Object.entries(bySplit).map(([k, b]) => `| ${k} | ${pct(b.smishing)} (${b.smishing.flagged}/${b.smishing.n}) | ${pct(b.ham)} (${b.ham.flagged}/${b.ham.n}) |`),
  "",
  "For smishing, higher is better (scams caught). For ham (genuine), lower is better (false alarms). \"spam\" is marketing, not necessarily fraud.",
].join("\n");
await writeFile(new URL("../eval/REAL_WORLD_RESULTS.md", import.meta.url), `${md}\n`);
console.log(md);
