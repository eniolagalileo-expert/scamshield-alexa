// Minimal MCP client for the browser (Streamable HTTP, JSON responses).
// Performs the initialize handshake once, then calls tools with the negotiated protocol version.

export class McpClient {
  constructor(url, { onCall } = {}) {
    this.url = url;
    this.onCall = onCall || (() => {});
    this.nextId = 1;
    this.ready = null;
    this.protocolVersion = "2025-11-25";
  }

  async post(message) {
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": this.protocolVersion,
      },
      body: JSON.stringify(message),
    });
    if (res.status === 202) return null; // notification accepted
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) throw new Error(body?.error?.message || `MCP request failed (${res.status})`);
    if (body.error) throw new Error(body.error.message);
    return body.result;
  }

  async connect() {
    if (!this.ready) {
      this.ready = (async () => {
        const result = await this.post({
          jsonrpc: "2.0", id: this.nextId++, method: "initialize",
          params: { protocolVersion: this.protocolVersion, capabilities: {}, clientInfo: { name: "simulated-alexa-plus", version: "1.0.0" } },
        });
        this.protocolVersion = result.protocolVersion;
        this.serverInfo = result.serverInfo;
        await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
        return result;
      })().catch((err) => { this.ready = null; throw err; });
    }
    return this.ready;
  }

  async callTool(name, args) {
    await this.connect();
    const started = performance.now();
    const call = { name, args, status: "running" };
    this.onCall(call);
    try {
      const result = await this.post({ jsonrpc: "2.0", id: this.nextId++, method: "tools/call", params: { name, arguments: args } });
      Object.assign(call, { status: result.isError ? "error" : "ok", ms: Math.round(performance.now() - started), result });
      this.onCall(call);
      if (result.isError) throw new Error(result.content?.[0]?.text || "Tool error");
      return { speech: result.content?.[0]?.text || "", data: result.structuredContent || {} };
    } catch (err) {
      Object.assign(call, { status: "error", ms: Math.round(performance.now() - started), error: err.message });
      this.onCall(call);
      throw err;
    }
  }
}
