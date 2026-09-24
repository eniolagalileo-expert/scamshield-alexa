import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CreateMessageRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const PORT = 4879;
let proc;
let client;
let transport;
let reply = "VERDICT: scam\nREASON: A stranger's friendly 'wrong number' text is a common opener for investment scams.";
const asked = [];

before(async () => {
  proc = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", TAVILY_API_KEY: "" }, stdio: "pipe" });
  await new Promise((resolve, reject) => {
    proc.stdout.on("data", (d) => String(d).includes("MCP server") && resolve());
    proc.on("exit", (code) => reject(new Error(`server exited ${code}`)));
  });
  // A client that can run a model (MCP sampling). Here the "model" is scripted.
  client = new Client({ name: "sampling-client", version: "1.0.0" }, { capabilities: { sampling: {} } });
  client.setRequestHandler(CreateMessageRequestSchema, async (request) => {
    asked.push(request.params);
    return { role: "assistant", model: "test-model", content: { type: "text", text: reply } };
  });
  transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${PORT}/mcp`));
  await client.connect(transport);
});

after(async () => {
  await client?.close();
  proc?.kill();
});

test("sampling clients get a session", () => {
  assert.ok(transport.sessionId, "expected a session id");
});

test("a second opinion can raise caution on a message the rules missed", async () => {
  const r = await client.callTool({ name: "check_message", arguments: { message: "Hi Jessica, are we still on for golf Tuesday? It's David from the investment club. Sorry if wrong number!" } });
  assert.equal(r.structuredContent.verdict, "scam");
  assert.equal(r.structuredContent.second_opinion.used, true);
  assert.match(r.content[0].text, /^This looks like a scam\. A stranger's friendly 'wrong number' text/);
  assert.match(asked.at(-1).messages[0].content.text, /Detector verdict: likely_safe/);
});

test("a second opinion never lowers the rules' verdict, and clear scams skip it", async () => {
  reply = "VERDICT: likely_safe\nREASON: Looks fine.";
  const before = asked.length;
  const scam = await client.callTool({ name: "check_message", arguments: { message: "USPS: pay the $1.99 fee within 24 hours: https://usps.com-track-redelivery.top/pkg" } });
  assert.equal(scam.structuredContent.verdict, "scam");
  assert.equal(asked.length, before, "clear scams should not trigger sampling");
  const sus = await client.callTool({ name: "check_message", arguments: { message: "Your account needs attention, act now: bit.ly/3xYz" } });
  assert.notEqual(sus.structuredContent.verdict, "likely_safe");
  assert.equal(sus.structuredContent.second_opinion.used, false);
});
