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

Examples of live `verify_with_official_source` answers:
- USPS: *"These phishing emails and smishing texts appear to be from the US Postal Service, but they are not, and individuals should not interact with them."*
- PayPal: *"PayPal will never ask for sensitive information in an email."*
- Amazon: *"Amazon never asks for your password or for sensitive personal information over the phone or on any external website."*

`check_message` also **answers in the message's language**: full Spanish, plus Hindi and Indonesian (verdict and key action).

Every tool returns **a short spoken sentence first** (`content[0]`), then structured details (`structuredContent`, with an `outputSchema` for `check_message`). All tools carry `readOnlyHint` annotations.

Also provided:
- **Prompt** `is_this_a_scam`: a guided workflow for assistants.
- **Resource** `scamshield://guides/top-scams`: a read-aloud guide to common scams.
- **Server instructions**: tell the assistant the recommended flow and safety rules (never suggest clicking the link).

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
`npm run bench` runs `check_message` offline on labeled sets ([results](eval/RESULTS.md)). We follow a strict rule: once we look at a test set's mistakes to improve the rules, it becomes a development set, and we write a **new** held-out set.

| Set | Accuracy | Scams caught | False alarms |
|---|---|---|---|
| Dev sets A, B, C (100 msgs, used while designing the rules) | 100% | 66/66 | 0/34 |
| **Held-out test v2 (37 msgs, written after all tuning, never tuned on)** | **86%** | **17/22** | **0/15** |

History: the first held-out set scored 90% (19/20 scams, 2/10 false alarms). We fixed the general causes (mentions of a password vs. requests for one, money sent *to* you, stories that mention the police), which removed false alarms, then wrote v2. On v2 the rules miss some new wordings of code-sharing and "business upgrade" scams. That's why ScamShield is a **toolbox for an AI assistant** (official-source checks, web reports, the call interview) rather than a single yes/no classifier.

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
