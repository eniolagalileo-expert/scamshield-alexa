# Friction log

Honest notes from building ScamShield with the MCP TypeScript SDK (1.30.1) and the hackathon materials. Entries marked [ADD] are for you to fill in from your own experience.

## 1. Structured output validation error doesn't say which field is wrong
- **What I did:** Returned `structuredContent` from a tool that declared an `outputSchema` with a subset of the fields.
- **What happened:** The client call failed with `MCP error -32602: Structured content does not match the tool's output schema: data must NOT have additional properties` (repeated 4×), with no property names.
- **Impact:** Had to diff the returned object against the schema by hand to find the 4 extra fields.
- **Suggestion:** Include the offending property paths in the error, or document that `outputSchema` objects are strict (`additionalProperties: false`) by default.

## 2. Stateless Streamable HTTP needs manual GET/DELETE handling
- **What I did:** Ran the server in stateless mode (`sessionIdGenerator: undefined`), one server per request.
- **What happened:** GET and DELETE on the endpoint need explicit `405` responses that you have to write yourself; this only comes from reading the examples.
- **Suggestion:** A one-line helper (or an option on `createMcpExpressApp`) for a stateless endpoint.

## 3. DNS-rebinding protection trade-off when deploying
- **What happened:** `createMcpExpressApp({ host: "0.0.0.0" })`, which you need on most hosts, turns off automatic DNS-rebinding protection unless you also pass `allowedHosts`. That's documented in a code comment, but easy to miss when deploying.
- **Suggestion:** Log a warning at startup when binding to 0.0.0.0 without `allowedHosts`.

## 4. Alexa+ track had no starter sample
- **What happened:** The Fire TV, Bee and Ring tracks list starter repositories on the resources page; the Alexa+ track links only to the MCP spec and Agent Skills docs.
- **Suggestion:** A minimal Alexa+-flavored MCP server sample (with voice-friendly response conventions) would make it much faster to start, e.g. guidance on how long spoken tool results should be.

## 5. Tavily: long queries with `include_domains` return off-topic official pages
- **What I did:** Searched official domains with the full user question, e.g. `usps scam fraud phishing warning does usps send texts or emails asking for payment, codes or personal details` with `include_domains: ["usps.com"]`.
- **What happened:** Results were a PDF postal bulletin and stamp announcements. A short query (`USPS scam text email phishing smishing`) returned the right smishing pages.
- **Workaround:** Short keyword queries for search; pass the full question only as the Extract `query` for chunk reranking. Read the top 3 pages in one Extract call and use the first with a clear answer.
- **Suggestion:** A note in the docs that `include_domains` searches work best with short, keyword-style queries.

## 6. Extracted page text needs cleanup before it can be spoken
- **What happened:** Extract output contained list markers ("n", "•"), navigation text ("Skip to Keyboard shortcuts"), run-together sentences ("Do not click.Do not open"), and abbreviations like "U.S." that broke sentence splitting.
- **Workaround:** A small cleanup + sentence scorer (`lib/official.js`) with unit tests built from real responses.
- **Suggestion:** An option to strip navigation/boilerplate, or sentence-level chunks, would help voice use cases.

## 7. Sampling doesn't work with a stateless, JSON-response server, and that isn't obvious
- **What I wanted:** during `check_message`, ask the client's model for a second opinion (MCP sampling, `server.createMessage`).
- **What happened:** our server was stateless with `enableJsonResponse: true`. A server-to-client request mid-call needs an SSE stream, and the client's reply arrives as a *new* POST, which a stateless server (a fresh instance per request) can't match to the pending request.
- **Workaround:** run both modes on one endpoint. If the `initialize` request declares the `sampling` capability, create a session transport (SSE); otherwise keep the stateless JSON path. See `server.js`.
- **Suggestion:** a note in the SDK docs next to `enableJsonResponse`/stateless mode that server-initiated requests (sampling, elicitation) require sessions and SSE.

## 8. [ADD] Anything you hit while deploying, recording, or testing with real clients
