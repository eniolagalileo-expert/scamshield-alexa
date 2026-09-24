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
    "check_link", "check_message", "check_phone_call", "check_phone_number", "how_to_report_scam", "practice_quiz",
    "scam_briefing", "search_scam_reports", "verify_with_official_source", "warn_family",
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

test("check_phone_call asks the next question, then decides", async () => {
  const first = await client.callTool({ name: "check_phone_call", arguments: { caller_claims_to_be: "my bank" } });
  assert.equal(first.structuredContent.status, "need_answer");
  const key = first.structuredContent.next_question.key;
  assert.equal(key, "asked_for_code");
  const second = await client.callTool({ name: "check_phone_call", arguments: { caller_claims_to_be: "my bank", answers: { [key]: true } } });
  assert.equal(second.structuredContent.verdict, "scam");
  assert.match(second.content[0].text, /^Hang up now/);
  assert.match(second.content[0].text, /your bank back/);
});

test("check_phone_call decides immediately from a clear description", async () => {
  const r = await client.callTool({ name: "check_phone_call", arguments: { caller_claims_to_be: "the IRS", what_they_want: "says I owe taxes and must pay with gift cards or police will arrest me" } });
  assert.equal(r.structuredContent.verdict, "scam");
});

test("warn_family composes a message but sends nothing", async () => {
  const r = await client.callTool({ name: "warn_family", arguments: { recipient: "mom", about: "USPS package fee text" } });
  assert.match(r.structuredContent.message, /^Hi Mom, heads up: I just got a fake delivery text/);
  assert.match(r.content[0].text, /Should I send it\?$/);
});

test("check_phone_call knows Microsoft never cold-calls, and asks relevant questions first", async () => {
  const ms = await client.callTool({ name: "check_phone_call", arguments: { caller_claims_to_be: "Microsoft", what_they_want: "says my computer has a virus" } });
  assert.equal(ms.structuredContent.verdict, "scam");
  assert.match(ms.content[0].text, /never call you out of the blue/);
  const irs = await client.callTool({ name: "check_phone_call", arguments: { caller_claims_to_be: "the IRS" } });
  assert.equal(irs.structuredContent.next_question.key, "asked_for_unusual_payment");
});

test("practice_quiz asks, then explains the answer", async () => {
  const q = await client.callTool({ name: "practice_quiz", arguments: { action: "next" } });
  assert.match(q.content[0].text, /Is it a scam, or is it real\?$/);
  const { id } = q.structuredContent;
  const a = await client.callTool({ name: "practice_quiz", arguments: { action: "answer", id, guess: "scam" } });
  assert.match(a.content[0].text, /^(Right!|Not quite\.)/);
  assert.ok(["scam", "real"].includes(a.structuredContent.answer));
  const bad = await client.callTool({ name: "practice_quiz", arguments: { action: "answer", id: "nope", guess: "scam" } });
  assert.equal(bad.isError, true);
});
