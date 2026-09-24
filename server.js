// ScamShield for Alexa+: MCP server over Streamable HTTP (spec 2025-11-25) plus the demo web app.
//   POST /mcp      MCP endpoint (stateless; each request gets a fresh server)
//   GET  /health   status
//   GET  /         "Simulated Alexa+" voice web app that uses the MCP server

import express from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./lib/mcp.js";
import { searchEnabled } from "./lib/tavily.js";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const allowedHosts = process.env.ALLOWED_HOSTS?.split(",").map((h) => h.trim()).filter(Boolean);

const app = createMcpExpressApp({ host: HOST, ...(allowedHosts ? { allowedHosts } : {}) });

// Simple per-IP rate limit so a public server can't burn through the Tavily quota.
const hits = new Map();
function rateLimit(req, res, next) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress).split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (recent.length > 60) return res.status(429).json({ jsonrpc: "2.0", error: { code: -32000, message: "Too many requests" }, id: null });
  next();
}

app.post("/mcp", rateLimit, async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request failed:", err);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
  }
});

// Stateless server: no standalone SSE stream or session to delete.
const notAllowed = (req, res) => res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
app.get("/mcp", notAllowed);
app.delete("/mcp", notAllowed);

app.get("/health", (req, res) => res.json({ ok: true, web_checks: searchEnabled(), mcp: "/mcp", protocol: "2025-11-25" }));
app.use(express.static(new URL("./public", import.meta.url).pathname));

app.listen(PORT, HOST, () => {
  console.log(`ScamShield MCP server: http://localhost:${PORT}/mcp`);
  console.log(`Simulated Alexa+ app:  http://localhost:${PORT}/`);
  if (!searchEnabled()) console.log("⚠️  TAVILY_API_KEY not set: web checks (official sources, scam reports) are off.");
});
