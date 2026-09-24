// Evaluates check_message with an MCP sampling second opinion. The MCP client here is the official SDK client;
// its sampling handler asks a real model through the `claude` CLI (no tools), the way an assistant would.
// Needs the ScamShield server running (npm run dev) and the `claude` CLI logged in.
// Usage: node scripts/eval-sampling.mjs <set> [--url http://127.0.0.1:3000/mcp] [--model sonnet] [--concurrency 4]
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CreateMessageRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const args = process.argv.slice(2);
const opt = (name, dflt) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : dflt);
const set = args[0];
const url = opt("url", "http://127.0.0.1:3000/mcp");
const model = opt("model", "sonnet");
const concurrency = Number(opt("concurrency", 4));
if (!set) { console.error("Usage: node scripts/eval-sampling.mjs <set-name>"); process.exit(2); }

let samplingCalls = 0;
function askModel({ systemPrompt, messages }) {
  samplingCalls++;
  const text = messages.map((m) => m.content.text).join("\n\n");
  return new Promise((resolve) => {
    execFile("claude", ["-p", `${systemPrompt}\n\n${text}`, "--model", model, "--output-format", "json", "--tools", ""],
      { timeout: 120_000, maxBuffer: 5 * 1024 * 1024 },
      (err, stdout) => {
        try { resolve(JSON.parse(stdout).result || ""); } catch (_) { resolve(""); }
      });
  });
}

async function connect() {
  const client = new Client({ name: "sampling-eval", version: "1.0.0" }, { capabilities: { sampling: {} } });
  client.setRequestHandler(CreateMessageRequestSchema, async (req) => ({
    role: "assistant", model, content: { type: "text", text: await askModel(req.params) },
  }));
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return client;
}

const data = JSON.parse(await readFile(new URL(`../eval/${set}.json`, import.meta.url)));
const results = [];
let next = 0;
async function worker() {
  const client = await connect();
  while (next < data.length) {
    const item = data[next++];
    const t = Date.now();
    const r = await client.callTool({ name: "check_message", arguments: { message: item.text } }, undefined, { timeout: 180_000 });
    const d = r.structuredContent || {};
    const flagged = d.verdict === "scam" || d.verdict === "suspicious";
    results.push({ id: item.id, label: item.label, verdict: d.verdict, second_opinion: d.second_opinion || null, correct: flagged === (item.label === "scam"), seconds: (Date.now() - t) / 1000 });
    process.stderr.write(`\r${results.length}/${data.length}`);
  }
  await client.close();
}
await Promise.all(Array.from({ length: concurrency }, worker));
process.stderr.write("\n");

const tp = results.filter((r) => r.label === "scam" && r.correct).length, fn = results.filter((r) => r.label === "scam" && !r.correct).length;
const fp = results.filter((r) => r.label === "legit" && !r.correct).length, tn = results.filter((r) => r.label === "legit" && r.correct).length;
const summary = {
  set, model, mode: "rules + MCP sampling second opinion", n: results.length,
  accuracy: +((tp + tn) / results.length).toFixed(3), scams_caught: `${tp}/${tp + fn}`, false_alarms: `${fp}/${fp + tn}`,
  sampling_calls: samplingCalls, raised_by_second_opinion: results.filter((r) => r.second_opinion?.used).length,
};
await writeFile(new URL(`../eval/sampling-${set}.json`, import.meta.url), JSON.stringify({ summary, results: results.sort((a, b) => a.id.localeCompare(b.id)) }, null, 2));
console.log(JSON.stringify(summary, null, 2));
