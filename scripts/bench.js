// Offline benchmark for check_message (no API keys needed).
//   dev-a, dev-b: sets used while designing the signals (scores are optimistic)
//   dev-c:        the first held-out set; its misses were later used for tuning
//   test-v2:      written after all tuning; the honest number
import { readFile, writeFile } from "node:fs/promises";
import { scanMessage } from "../lib/scan.js";

const SETS = [
  ["dev-a", "Development set A (used for tuning)"],
  ["dev-b", "Development set B (used for tuning)"],
  ["dev-c", "Development set C (was held-out v1; later used for tuning)"],
  ["test-v2", "**Held-out test v2 (written after the rules; see note)**"],
];

const rows = [];
const misses = [];
for (const [file, label] of SETS) {
  const data = JSON.parse(await readFile(new URL(`../eval/${file}.json`, import.meta.url)));
  let tp = 0, fn = 0, fp = 0, tn = 0;
  for (const d of data) {
    const flagged = scanMessage(d.text).verdict !== "likely_safe";
    if (d.label === "scam") flagged ? tp++ : (fn++, misses.push(`${file}/${d.id} missed scam (${d.type})`));
    else flagged ? (fp++, misses.push(`${file}/${d.id} false alarm (${d.type})`)) : tn++;
  }
  const pct = (n, d) => `${((n / d) * 100).toFixed(0)}%`;
  rows.push(`| ${label} | ${data.length} | ${pct(tp + tn, data.length)} | ${pct(tp, tp + fn)} (${tp}/${tp + fn}) | ${pct(fp, fp + tn)} (${fp}/${fp + tn}) |`);
}

const md = [
  "# check_message benchmark (offline, no AI)",
  "",
  "| Set | Messages | Accuracy | Scams caught | False alarms |",
  "|---|---|---|---|---|",
  ...rows,
  "",
  "**Note on test v2:** its first run (the honest held-out result) was **86%, 17/22 scams, 0/15 false alarms**. " +
    "On Sept 24, 2026 a rule was widened to catch fake-order texts (\"if this was not you, call …\"), found while recording the demo " +
    "and added to development set C. It also catches v22, one of the misses published below, so the current score is no longer a " +
    "clean held-out number. We quote 86% as the held-out result.",
  "",
  "## Known misses",
  ...(misses.length ? misses.map((m) => `- ${m}`) : ["- none"]),
].join("\n");
await writeFile(new URL("../eval/RESULTS.md", import.meta.url), `${md}\n`);
console.log(md);
