// ScamShield for Alexa+: MCP server over Streamable HTTP (spec 2025-11-25) plus the demo web app.
//   POST /mcp      MCP endpoint (stateless by default; sessions for clients that support sampling)
//   GET  /health   status
//   GET  /         "Simulated Alexa+" voice web app that uses the MCP server

import { randomUUID } from "node:crypto";
import express from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./lib/mcp.js";
import { searchEnabled } from "./lib/tavily.js";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN || 60);
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
  if (recent.length > RATE_LIMIT_PER_MIN) return res.status(429).json({ jsonrpc: "2.0", error: { code: -32000, message: "Too many requests" }, id: null });
  next();
}

// Two modes on one endpoint:
// - Stateless (default): each request gets a fresh server and a JSON response. Simple and scalable.
// - Session: clients that declare the `sampling` capability get a session with SSE streams, so the
//   server can ask the client's model for a second opinion in the middle of a tool call.
const sessions = new Map(); // sessionId -> { transport, server, lastSeen }
const SESSION_IDLE_MS = 30 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastSeen > SESSION_IDLE_MS) {
      s.transport.close();
      s.server.close();
      sessions.delete(id);
    }
  }
}, 5 * 60 * 1000).unref();

const rpcError = (res, status, message) => res.status(status).json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null });

app.post("/mcp", rateLimit, async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"];
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) return rpcError(res, 404, "Session not found. Start a new one with initialize.");
      session.lastSeen = Date.now();
      return await session.transport.handleRequest(req, res, req.body);
    }

    if (isInitializeRequest(req.body) && req.body.params?.capabilities?.sampling) {
      const server = createServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => sessions.set(id, { transport, server, lastSeen: Date.now() }),
        onsessionclosed: (id) => sessions.delete(id),
      });
      await server.connect(transport);
      return await transport.handleRequest(req, res, req.body);
    }

    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request failed:", err);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
  }
});

// GET opens the server-to-client stream and DELETE ends a session; both only exist in session mode.
const sessionOnly = async (req, res) => {
  const session = sessions.get(req.headers["mcp-session-id"]);
  if (!session) return res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed without a session." }, id: null });
  session.lastSeen = Date.now();
  await session.transport.handleRequest(req, res);
};
app.get("/mcp", sessionOnly);
app.delete("/mcp", sessionOnly);

app.get("/health", (req, res) => res.json({ ok: true, web_checks: searchEnabled(), mcp: "/mcp", protocol: "2025-11-25" }));
app.use(express.static(new URL("./public", import.meta.url).pathname));

app.listen(PORT, HOST, () => {
  console.log(`ScamShield MCP server: http://localhost:${PORT}/mcp`);
  console.log(`Simulated Alexa+ app:  http://localhost:${PORT}/`);
  if (!searchEnabled()) console.log("⚠️  TAVILY_API_KEY not set: web checks (official sources, scam reports) are off.");
});
