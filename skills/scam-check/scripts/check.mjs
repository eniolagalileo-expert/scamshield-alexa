#!/usr/bin/env node
// Checks a message with the ScamShield MCP server and prints the spoken answer and red flags.
// Usage: node check.mjs "message text" [country]
// Needs Node 18+. Server URL: SCAMSHIELD_URL (default http://localhost:3000/mcp).

const url = process.env.SCAMSHIELD_URL || "http://localhost:3000/mcp";
const [message, country] = process.argv.slice(2);
if (!message) {
  console.error('Usage: node check.mjs "message text" [country]');
  process.exit(1);
}

let id = 1;
let version = "2025-11-25";
async function rpc(method, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": version },
    body: JSON.stringify(params === undefined ? { jsonrpc: "2.0", method } : { jsonrpc: "2.0", id: id++, method, params }),
  });
  if (res.status === 202) return null;
  const body = await res.json();
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

try {
  const init = await rpc("initialize", { protocolVersion: version, capabilities: {}, clientInfo: { name: "scam-check-skill", version: "1.0" } });
  version = init.protocolVersion;
  await rpc("notifications/initialized");
  const result = await rpc("tools/call", { name: "check_message", arguments: { message, ...(country ? { country } : {}) } });
  const d = result.structuredContent;
  console.log(result.content[0].text);
  console.log(`\nVerdict: ${d.verdict} (${d.confidence}%)`);
  for (const f of d.red_flags) console.log(`- ${f.flag}: ${f.evidence}`);
} catch (err) {
  console.error(`Could not reach ScamShield at ${url}: ${err.message}`);
  process.exit(1);
}
