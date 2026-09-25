# Friction log

Honest notes from building ScamShield with the MCP TypeScript SDK (1.30.1), the Alexa Skills Kit, Tavily and the hackathon materials. Each entry has what we tried, what happened, the workaround, a suggestion and a severity (High: blocked or broke a feature; Medium: cost hours or risked a wrong result; Low: minor).

## 1. Structured output validation error doesn't say which field is wrong
- **Severity:** Medium
- **What I did:** Returned `structuredContent` from a tool that declared an `outputSchema` with a subset of the fields.
- **What happened:** The client call failed with `MCP error -32602: Structured content does not match the tool's output schema: data must NOT have additional properties` (repeated 4×), with no property names.
- **Impact:** Had to diff the returned object against the schema by hand to find the 4 extra fields.
- **Suggestion:** Include the offending property paths in the error, or document that `outputSchema` objects are strict (`additionalProperties: false`) by default.

## 2. Stateless Streamable HTTP needs manual GET/DELETE handling
- **Severity:** Low
- **What I did:** Ran the server in stateless mode (`sessionIdGenerator: undefined`), one server per request.
- **What happened:** GET and DELETE on the endpoint need explicit `405` responses that you have to write yourself; this only comes from reading the examples.
- **Suggestion:** A one-line helper (or an option on `createMcpExpressApp`) for a stateless endpoint.

## 3. DNS-rebinding protection trade-off when deploying
- **Severity:** Medium
- **What happened:** `createMcpExpressApp({ host: "0.0.0.0" })`, which you need on most hosts, turns off automatic DNS-rebinding protection unless you also pass `allowedHosts`. That's documented in a code comment, but easy to miss when deploying.
- **Suggestion:** Log a warning at startup when binding to 0.0.0.0 without `allowedHosts`.

## 4. Alexa+ track had no starter sample
- **Severity:** Medium
- **What happened:** The Fire TV, Bee and Ring tracks list starter repositories on the resources page; the Alexa+ track links only to the MCP spec and Agent Skills docs.
- **Suggestion:** A minimal Alexa+-flavored MCP server sample (with voice-friendly response conventions) would make it much faster to start, e.g. guidance on how long spoken tool results should be.

## 5. Tavily: long queries with `include_domains` return off-topic official pages
- **Severity:** Medium
- **What I did:** Searched official domains with the full user question, e.g. `usps scam fraud phishing warning does usps send texts or emails asking for payment, codes or personal details` with `include_domains: ["usps.com"]`.
- **What happened:** Results were a PDF postal bulletin and stamp announcements. A short query (`USPS scam text email phishing smishing`) returned the right smishing pages.
- **Workaround:** Short keyword queries for search; pass the full question only as the Extract `query` for chunk reranking. Read the top 3 pages in one Extract call and use the first with a clear answer.
- **Suggestion:** A note in the docs that `include_domains` searches work best with short, keyword-style queries.

## 6. Extracted page text needs cleanup before it can be spoken
- **Severity:** Low
- **What happened:** Extract output contained list markers ("n", "•"), navigation text ("Skip to Keyboard shortcuts"), run-together sentences ("Do not click.Do not open"), and abbreviations like "U.S." that broke sentence splitting.
- **Workaround:** A small cleanup + sentence scorer (`lib/official.js`) with unit tests built from real responses.
- **Suggestion:** An option to strip navigation/boilerplate, or sentence-level chunks, would help voice use cases.

## 7. Sampling doesn't work with a stateless, JSON-response server, and that isn't obvious
- **Severity:** High
- **What I wanted:** during `check_message`, ask the client's model for a second opinion (MCP sampling, `server.createMessage`).
- **What happened:** our server was stateless with `enableJsonResponse: true`. A server-to-client request mid-call needs an SSE stream, and the client's reply arrives as a *new* POST, which a stateless server (a fresh instance per request) can't match to the pending request.
- **Workaround:** run both modes on one endpoint. If the `initialize` request declares the `sampling` capability, create a session transport (SSE); otherwise keep the stateless JSON path. See `server.js`.
- **Suggestion:** a note in the SDK docs next to `enableJsonResponse`/stateless mode that server-initiated requests (sampling, elicitation) require sessions and SSE.

## 8. Spoken web addresses arrive differently per locale
- **Severity:** High
- **What I wanted:** check links that people read aloud ("usps dot com dash track dot top").
- **What happened:** in `en-US`, an `AMAZON.SearchQuery` slot keeps the words ("dot com dash"), so the skill has to rebuild the address itself. In `es-US`, Alexa's speech recognition had already rewritten "usps punto com guion entrega punto top barra pago" into `usps.comentrega.top/pago`, dropping the dash, so the address the skill sees is not the one in the text.
- **Workaround:** rebuild spoken addresses in both languages (`normalizeSpokenLinks` in `lib/clues.js`), and judge the address the skill receives on its own (look-alike domain, risky ending).
- **Suggestion:** document how each locale formats spoken URLs in `AMAZON.SearchQuery`, or offer a slot option that keeps the raw words.

## 9. Enabling APL is a two-step change
- **Severity:** Low
- **What happened:** before APL was enabled, simulator requests had empty `supportedInterfaces`, so no card could be sent. Turning on the APL interface and saving isn't enough: the console says the model must be rebuilt for it to take effect. After the rebuild, requests included `Alexa.Presentation.APL` and the card rendered.
- **Workaround:** save the interface, then **Build skill**. The code sends the card only when the request says the device supports APL, so voice-only devices never get it.

## 10. Tavily results sometimes ignore `include_domains`, and fixed query wording drifts
- **Severity:** High
- **What happened:** while recording the demo, a search restricted to `usps.com` returned Kaspersky and Palo Alto pages plus USPS PDFs. A briefing restricted to FTC/FBI/SSA domains returned pages from ago.vermont.gov and fincen.gov, and menu pages like "Credit, Loans, and Debt". The same fixed query ("USPS scam text email phishing smishing") that found USPS's scam FAQ earlier in the day stopped finding it.
- **Workaround:** never trust the filter alone. `rankPages` and the briefing re-check every result against the official domains (exact host or subdomain, so `fakeusps.com` is not `usps.com`). Searches now include the scam's own topic from the message ("USPS scam alert redelivery fee"). Spoken quotes must be a clear statement from the company ("Amazon will never request…"), and if there isn't one, the quote is skipped.
- **Also:** a live search plus extraction can take 4 to 8 seconds, longer than a voice assistant can wait. Briefings are cached for an hour (served instantly while refreshing, and warmed at startup) and quotes for a day.
- **Suggestion:** document whether `include_domains` is a hard filter or a ranking hint.

## 11. The Alexa simulator often ignores the first utterance after a page load
- **Severity:** Low
- **What I did:** opened the Test tab and typed an utterance (e.g. "ask scam shield is this a scam …").
- **What happened:** the first input after loading the page often produced no request and no reply; sending the same text again worked. It happened on most page loads during testing and recording.
- **Workaround:** send a throwaway utterance ("open scam shield") first, then the real one.
- **Suggestion:** fix the first-input race, or show an error when an utterance isn't sent.
