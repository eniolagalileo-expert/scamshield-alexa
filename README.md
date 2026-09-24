# 🛡️ ScamShield for Alexa+

**"Alexa, I got a text from 'USPS' asking for a $1.99 fee. Is this a scam?"**
**"Alexa, someone's on the phone saying he's from my bank."**
**"Alexa, what scams are going around?"**

ScamShield is a **self-hosted MCP server** (Streamable HTTP, **MCP spec 2025-11-25**) that gives Alexa+, or any MCP-capable assistant, the tools to check suspicious messages, links and phone numbers, and to answer **out loud, in plain language**. It comes with an **Agent Skill** and a **simulated Alexa+ web app** that demos the full voice experience.

Built for the **Build, Ship, Shape: Amazon Developer Hackathon**, Alexa+ track.

## Why voice?
Scams hit the people least likely to open a laptop and research a link: older adults, busy parents, non-native speakers. Asking the assistant already in the kitchen is the most natural way to get a second opinion before you tap, pay or call back.

## MCP tools

| Tool | What it does | Needs web? |
|---|---|---|
| `check_message` | Full scam analysis of a text, email, DM or call transcript: disguised links, number mismatch, pressure, threats, gift-card/crypto/wire requests, code requests, secrecy, "family on a new number", overpayment, fake tech support, safe-account and renewal scams… Multilingual keywords (EN/ES/HI/ID). | No, instant |
| `check_link` | Look-alike domains (`paypa1`, `arnazon`, `rnicrosoft`), disguised addresses (`apple.com.secure-verify.info`), raw IPs, shorteners, risky TLDs. **Never opens the link.** | No |
| `check_phone_number` | Country, premium-rate, and brand/country mismatch ("USPS" texting from a Nigerian number) | No |
| `verify_with_official_source` | Reads the impersonated company's **official website only** (Tavily Search restricted to official domains + Extract) to learn how it really contacts customers | Yes (Tavily) |
| `search_scam_reports` | Web search for reports about a number, site or phrase | Yes (Tavily) |
| `how_to_report_scam` | Official reporting channels by country (US, UK, IN, CA, AU) | No |
| `check_phone_call` | **For a call in progress.** A stateless guided interview: returns the next yes/no question (the most relevant one first, e.g. codes for "my bank", remote access for "Microsoft") or a verdict. Knows who never cold-calls (Microsoft, Apple, the IRS by phone…). Usually 1–3 questions. | No |
| `scam_briefing` | "What scams are going around?" Recent warnings from **official consumer-protection sites only** (FTC, USPIS, FBI IC3, FCC, Action Fraud, Scamwatch…), cleaned up for a spoken briefing | Yes (Tavily news) |
| `warn_family` | Composes a short, calm warning to send to a relative. It sends nothing itself; the assistant confirms and sends | No |
| `practice_quiz` | "Let's practice spotting scams." Reads a message aloud, takes the guess ("scam" / "real"), explains the giveaways, keeps it short for voice | No |

Examples of live `verify_with_official_source` answers:
- USPS: *"These phishing emails and smishing texts appear to be from the US Postal Service, but they are not, and individuals should not interact with them."*
- PayPal: *"PayPal will never ask for sensitive information in an email."*
- Amazon: *"Amazon never asks for your password or for sensitive personal information over the phone or on any external website."*

**Second opinion via MCP sampling.** If the connected assistant supports [sampling](https://modelcontextprotocol.io/specification/2025-11-25/client/sampling), `check_message` asks the assistant's *own* model to double-check anything the rules didn't call a scam, with the rules' evidence attached. No API key is needed, since the client runs the model, and the second opinion can only **raise** caution, never lower it. Clients that declare `sampling` get a session (SSE) automatically; everyone else keeps the fast stateless JSON path.

`check_message` also **answers in the message's language**: full Spanish, plus Hindi and Indonesian (verdict and key action).

Every tool returns **a short spoken sentence first** (`content[0]`), then structured details (`structuredContent`, with an `outputSchema` for `check_message`). All tools carry `readOnlyHint` annotations.

Also provided:
- **Prompt** `is_this_a_scam`: a guided workflow for assistants.
- **Resource** `scamshield://guides/top-scams`: a read-aloud guide to common scams.
- **Server instructions**: tell the assistant the recommended flow and safety rules (never suggest clicking the link).

## A real Alexa skill, too
Besides the MCP server for Alexa+, ScamShield ships a classic **Alexa custom skill** endpoint (`POST /alexa`) with the interaction model in [`skill-package/`](skill-package/interactionModels/custom/en-US.json). Say *"Alexa, open Scam Shield"*, then:
- *"Is this a scam? It says: your package is on hold…"*, then *"yes"* for how to report it, then *"yes"* for a warning to send your family
- *"Someone's on the phone saying he's from my bank"*, then answer yes/no until Alexa says *"Hang up now"*
- *"What scams are going around?"* or *"Let's practice"*, then *"scam"* / *"real"*

Every request is **verified as coming from Amazon**: the certificate URL and chain (issued for `echo-api.amazon.com`, chained to a trusted root), the RSA-SHA256 body signature, and a 150-second timestamp window. Set `ALEXA_SKILL_ID` to also pin the skill ID.

## Works with real AI assistants
[`docs/real-client-transcripts.md`](docs/real-client-transcripts.md) has unedited runs with **Claude Code as the MCP client**. Given only the user's words, the assistant chained `check_message` → `verify_with_official_source` → `check_link` for a USPS text, and used `check_phone_call` for a live "bank fraud department" call, answering: *"Hang up now. This is a scam. A real bank will never ask you to read out a code."*

## Agent Skill
[`skills/scam-check/`](skills/scam-check/SKILL.md) follows the [Agent Skills specification](https://agentskills.io/specification): `SKILL.md` with the workflow, answer shape and safety rules, a [reference guide](skills/scam-check/references/top-scams.md), and [`scripts/check.mjs`](skills/scam-check/scripts/check.mjs), which calls the MCP server from any agent that can run Node.

## Simulated Alexa+ experience
Open `http://localhost:3000/`: an Echo-style assistant in the browser.
1. Tap the mic and say *"Alexa, is this a scam? I got a text saying…"* (or paste the message).
2. The page acts as the Alexa+ client: it runs the MCP handshake, calls `check_message`, then `verify_with_official_source` when a known brand is impersonated.
3. It **speaks the answer** (in Spanish for Spanish messages), shows the red flags, and offers *"How do I report it?"* and *"Warn my mom"*.
4. Say *"Someone's on the phone saying he's from my bank"* for the call interview (answer yes/no by voice), or *"What scams are going around?"* for a briefing.
5. An **MCP activity** panel shows every live `tools/call`, with arguments and timing.

## Accuracy (honest numbers)
We measured three configurations on the **same** held-out messages, including **real SMS from a published research dataset**¹ ([full results](eval/SYSTEM_RESULTS.md)):

| Set | Rules only | Rules + second opinion (MCP sampling) | Full assistant (Claude + tools) |
|---|---|---|---|
| Held-out test v2 (37 msgs) | 86% · 17/22 scams · 0/15 false alarms | **97% · 22/22 · 1/15** | 95% · 22/22 · 2/15 |
| **Real-world SMS sample (60 msgs)** | 62% · **7/30** scams · 0/30 | 92% · **29/30** · 4/30 | 93% · **29/30** · 3/30 |

The rules alone are precise but miss scams they weren't written for (on all 5,971 real messages: 27% of smishing caught, 1.7% false alarms). With the assistant's own model taking a second look, nearly every scam is caught. That's why ScamShield is designed as a **toolbox for an AI assistant**, not a standalone classifier.

We keep ourselves honest: once we learn from a test set's mistakes it becomes a development set (`dev-a/b/c`, now 100%), and new held-out sets are written or sourced separately. Reproduce with `npm run bench`, `npm run bench:real`, `npm run eval:agent -- <set>` and `node scripts/eval-sampling.mjs <set>`.

¹ Mishra & Soni, *SMS Phishing Dataset for Machine Learning and Pattern Recognition*, Mendeley Data 2022, doi:10.17632/f45bkkt8pr.1, CC BY 4.0 ([source notes](eval/REAL_WORLD_SOURCE.md)).

The detection engine is also published as a standalone open-source library: **[scam-signals](https://github.com/eniolagalileo-expert/scam-signals)**.

## Run it

Requirements: Node.js 22.9+ (for `--env-file-if-exists`; `npm start` works on 20+).

```bash
npm install
cp .env.example .env     # optional: add TAVILY_API_KEY for the web tools
npm run dev              # MCP: http://localhost:3000/mcp · demo: http://localhost:3000/
npm test                 # protocol tests with the official MCP client + analyzer tests
npm run bench            # accuracy benchmark
```

### Connect an MCP client
- **MCP Inspector:** `npx @modelcontextprotocol/inspector`, then choose Streamable HTTP with `http://localhost:3000/mcp`.
- **Claude Code:** `claude mcp add --transport http scamshield http://localhost:3000/mcp`
- **Any client** that supports Streamable HTTP: point it at `/mcp`. The server is stateless and returns JSON responses.

| Variable | Default | |
|---|---|---|
| `PORT` | `3000` | |
| `HOST` | `0.0.0.0` | Use `127.0.0.1` for local-only (enables DNS-rebinding protection) |
| `ALLOWED_HOSTS` | none | Comma-separated host allow-list when deployed |
| `RATE_LIMIT_PER_MIN` | `60` | Requests per minute per IP |
| `ALEXA_SKILL_ID` | none | Only accept Alexa requests for this skill ID |
| `ALEXA_VERIFY` | `true` | Set `false` only for local testing without Amazon signatures |
| `TAVILY_API_KEY` | none | Enables `verify_with_official_source`, `search_scam_reports` and `scam_briefing` |

### Deploy (Render, free)
Push to GitHub → Render **New → Blueprint** (uses `render.yaml`) → set `TAVILY_API_KEY`.

## Project structure
```
server.js              Express + Streamable HTTP transport (stateless), static demo app
lib/mcp.js             MCP server: tools, prompt, resource, instructions
lib/scan.js            check_message analysis + spoken answer
lib/i18n.js            Language detection + Spanish/Hindi/Indonesian answers
lib/call.js            check_phone_call guided interview
lib/briefing.js        scam_briefing from official consumer alerts
lib/family.js          warn_family message
lib/practice.js        practice_quiz
lib/second-opinion.js  MCP sampling second opinion
lib/alexa.js           Alexa custom-skill conversation handler
lib/alexa-verify.js    Alexa request signature verification
skill-package/         Alexa interaction model
lib/clues.js           Link/phone analysis, clue extraction
lib/tavily.js          Tavily search + multi-page extract
lib/official.js        Picks the official page and the sentence that answers the question
lib/report.js          Reporting channels by country
lib/guide.js           Read-aloud scam guide (MCP resource)
public/                Simulated Alexa+ web app (voice in/out, browser MCP client)
skills/scam-check/     Agent Skill
docs/                  Real MCP client transcripts
eval/                  Labeled message sets + results
test/                  node:test suites (official MCP client end-to-end)
```

## Safety
ScamShield never opens, fetches or clicks suspicious links; it analyzes them as text. It never asks for or stores personal data. The web tools only read official company sites and search results. ScamShield gives guidance, not legal or financial advice.

## License
MIT
