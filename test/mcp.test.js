import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const PORT = 4877;
let proc;
let client;
let transport;

before(async () => {
  proc = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", TAVILY_API_KEY: "" }, stdio: "pipe" });
  await new Promise((resolve, reject) => {
    proc.stdout.on("data", (d) => String(d).includes("MCP server") && resolve());
    proc.on("exit", (code) => reject(new Error(`server exited ${code}`)));
  });
  client = new Client({ name: "test-client", version: "1.0.0" });
  transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${PORT}/mcp`));
  await client.connect(transport);
});

after(async () => {
  await client?.close();
  proc?.kill();
});

test("negotiates MCP 2025-11-25 and exposes the tools, prompt and resource", async () => {
  assert.equal(transport.protocolVersion, "2025-11-25");
  assert.equal(client.getServerVersion().name, "scamshield");
  assert.match(client.getInstructions(), /check_message/);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    "check_link", "check_message", "check_phone_number", "how_to_report_scam", "search_scam_reports", "verify_with_official_source",
  ]);
  assert.ok(tools.every((t) => t.annotations?.readOnlyHint === true));
  const { prompts } = await client.listPrompts();
  assert.deepEqual(prompts.map((p) => p.name), ["is_this_a_scam"]);
  const { resources } = await client.listResources();
  assert.equal(resources[0].uri, "scamshield://guides/top-scams");
});

test("check_message returns a spoken answer first, plus structured details", async () => {
  const r = await client.callTool({ name: "check_message", arguments: {
    message: "USPS: Your package is on hold due to an unpaid $1.99 redelivery fee. Pay within 24 hours: https://usps.com-track-redelivery.top/pkg",
    country: "US",
  } });
  assert.match(r.content[0].text, /^This looks like a scam\./);
  assert.equal(r.structuredContent.verdict, "scam");
  assert.ok(r.structuredContent.red_flags.some((f) => f.flag === "Fake or disguised link"));
});

test("genuine 2FA code message is not flagged", async () => {
  const r = await client.callTool({ name: "check_message", arguments: { message: "Your Google verification code is 482913. Don't share this code with anyone." } });
  assert.equal(r.structuredContent.verdict, "likely_safe");
});

test("link, phone and report tools answer in speech", async () => {
  const link = await client.callTool({ name: "check_link", arguments: { url: "http://paypa1-secure.com/login" } });
  assert.match(link.content[0].text, /dangerous/);
  const phone = await client.callTool({ name: "check_phone_number", arguments: { number: "+234 803 555 0199", claimed_sender: "USPS" } });
  assert.match(phone.content[0].text, /Nigeria/);
  const report = await client.callTool({ name: "how_to_report_scam", arguments: { country: "GB" } });
  assert.match(report.content[0].text, /Action Fraud/);
});

test("web tools degrade gracefully without a Tavily key", async () => {
  const r = await client.callTool({ name: "search_scam_reports", arguments: { query: "833-555-0199 scam" } });
  assert.match(r.content[0].text, /turned off/);
});

test("rejects invalid arguments", async () => {
  const r = await client.callTool({ name: "check_link", arguments: { url: "" } });
  assert.equal(r.isError, true);
});
