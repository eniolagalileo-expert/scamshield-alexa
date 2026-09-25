# 🛡️ ScamShield for Alexa+

**"Alexa, I got a text from 'USPS' asking for a $1.99 fee. Is this a scam?"**
**"Alexa, someone's on the phone saying he's from my bank."**
**"Alexa, what scams are going around?"**

ScamShield is a free, private scam checker you can use four ways, all powered by one **self-hosted MCP server** (Streamable HTTP, **MCP spec 2025-11-25**) that answers **in plain language, out loud if you like**:

| | Where | What you can do |
|---|---|---|
| 🌐 **Website** | **https://scamshield-alexa.onrender.com** | Paste a message → verdict, reasons, what the real company says, what to do, where to report, a warning to send your family. **Check a screenshot or QR code** (read on your device, never uploaded; QR links are checked without opening them). "Someone is calling me now" helper. **"Already paid or clicked?"** step-by-step recovery. Live scam alerts from the FTC/FBI/SSA. |
| 📱 **Phone app** | Same address → "Add to Home Screen" | Installs as an app; on Android, **share a suspicious text or screenshot straight to ScamShield** from your messages app. |
| 🔊 **Alexa** | "Alexa, open Scam Shield" / "abre escudo antiestafas" | The same checks by voice, in English and Spanish, with a verdict card on Echo Show. |
| 🤖 **AI assistants** | MCP endpoint `https://scamshield-alexa.onrender.com/mcp` | Alexa+, Claude or any MCP client gets 11 read-only tools, plus an **Agent Skill**. A **simulated Alexa+** demo is at [`/demo/`](https://scamshield-alexa.onrender.com/demo/). |

The website is itself an MCP client: every check it does goes through the same MCP tools that assistants use. [Privacy](https://scamshield-alexa.onrender.com/privacy.html) · [Terms](https://scamshield-alexa.onrender.com/terms.html)

Built for the **Build, Ship, Shape: Amazon Developer Hackathon**, Alexa+ track. The Alexa skill is tested end to end in the Alexa simulator ([transcript](docs/alexa-simulator-transcript.md)). Hosted on Render, kept awake by a [GitHub Actions ping](.github/workflows/keepalive.yml) every 10 minutes so Alexa never hits a cold start.

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
| `scam_recovery` | **"I already paid / clicked / shared something."** Ordered recovery steps for what actually happened (gift card, wire, payment app, card, crypto, shared code, password, remote access, personal details, clicked a link only), most urgent first; asks what happened if it isn't clear. English and Spanish | No |
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
- *"I think I got scammed"* → *"I paid with a gift card"*: the first steps out loud, the full plan in the Alexa phone app (*"creo que me estafaron"* in Spanish). The handler is live; the updated interaction model goes out with the next skill update, since the model can't change while the skill is in certification.

Built for how people actually talk to Alexa:
- **Links read aloud work.** *"usps dot com dash track dash redelivery dot top slash pkg"* is rebuilt into `usps.com-track-redelivery.top/pkg` and caught as a disguised link (Spanish too: *"punto com guion … barra"*).
- **A voice made for warnings.** SSML stresses *"This looks like a scam"* and *"Hang up now"*, pauses between sentences, and slows down slightly when warning, which helps older listeners.
- **No dead air.** When ScamShield checks the impersonated company's official website, Alexa first says *"One moment…"* through the [Progressive Response API](https://developer.amazon.com/en-US/docs/alexa/custom-skills/send-the-user-a-progressive-response.html), so the listener isn't left in silence.
- **A card on Echo Show.** Devices with a screen get an [APL](https://developer.amazon.com/en-US/docs/alexa/alexa-presentation-language/understand-apl.html) card: **SCAM** / **BE CAREFUL** / **LOOKS OK** in big letters, the evidence quoted from the message, and one thing to remember. Practice-quiz messages are shown on screen so you can read along.
- **En español.** An `es-US` model ([`es-US.json`](skill-package/interactionModels/custom/es-US.json)): *"Alexa, abre escudo antiestafas"*, then *"es esto una estafa…"* or *"alguien me está llamando del banco"*. Message checks, the phone-call interview, reporting and the family warning are fully in Spanish (the briefing and quiz are English-only for now, and it says so).

**Remembers across sessions, only with permission** (built and tested; switched on after the current certification, see below). Judges of this track asked for skills that *"keep context across sessions"*, and so do the people ScamShield serves:
- *"Warn my daughter Maria"* → *"Want me to remember Maria as the person to warn next time?"* Next time, *"warn my family"* just works.
- *"My bank is Chase"* → when someone calls claiming to be your bank, the verdict ends with *"Call Chase yourself, using the number on the back of your card."*
- After *"I think I got scammed"*: *"Want me to check in about this next time?"* Next launch: *"Welcome back. Last time, we talked about this: paid with a gift card. Did you reach the company that issued the gift card?"* "No" repeats the first step, "yes" closes the case.
- *"Forget me"* deletes everything. Nothing is saved without a yes (or an explicit "my bank is…"), entries expire after 90 days, and the store is keyed by a salted hash of Alexa's user ID, so it never holds Amazon's identifier ([`lib/memory.js`](lib/memory.js), Upstash Redis over REST, no extra dependency). If the store is slow or down, the skill answers normally, as if it remembers nothing. It is off unless `ALEXA_MEMORY=on`: the skill was submitted for certification as storing nothing, so it goes live together with its updated privacy policy and interaction model.

It has been run end to end in the **Alexa developer console simulator** against the live Render deployment: see the [transcript and screenshot](docs/alexa-simulator-transcript.md).

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

## MCP spec: ready for 2026-07-28
ScamShield speaks MCP **2025-11-25**, the newest version the official TypeScript SDK (1.30.1) supports. The [2026-07-28 revision](https://modelcontextprotocol.io/specification/2026-07-28/changelog) makes MCP stateless and deprecates sampling. We're already most of the way there:
- **Stateless by default.** Every request gets a fresh server and a plain JSON response; no tool depends on a session.
- **State travels as tool arguments.** Multi-step flows pass their state back explicitly: `check_phone_call` takes the `answers` so far, `scam_recovery` takes the `situations`. That is the 2026-07-28 model ("explicit handles passed as ordinary tool arguments").
- **Deterministic `tools/list`**, which the new revision recommends for client caching.
- **Sampling is the one thing to migrate.** Sessions exist only so `check_message` can ask the client's model for a second opinion. The new spec deprecates sampling in favor of calling a model provider directly. Our plan: keep rules-first answers (explainable, instant, free), and move the second opinion to a direct, optional model call, while every tool already returns `red_flags` with evidence so the assistant's own model can take that second look itself.

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
lib/alexa.js           Alexa custom-skill conversation handler (English + Spanish, SSML, progressive responses)
lib/alexa-apl.js       Visual verdict card for Echo Show (APL)
lib/alexa-verify.js    Alexa request signature verification
lib/memory.js          Opt-in memory across Alexa sessions (hashed keys, 90-day expiry, "forget me")
lib/recovery.js        scam_recovery: ordered steps after someone already paid, clicked or shared
skill-package/         Alexa interaction models (en-US, es-US)
lib/clues.js           Link/phone analysis, clue extraction
lib/tavily.js          Tavily search + multi-page extract
lib/official.js        Picks the official page and the sentence that answers the question
lib/report.js          Reporting channels by country
lib/guide.js           Read-aloud scam guide (MCP resource)
public/                Website (MCP client): checker, call helper, alerts, privacy, terms, PWA
public/demo/           Simulated Alexa+ web app (voice in/out, browser MCP client)
skills/scam-check/     Agent Skill
docs/                  Real MCP client transcripts
eval/                  Labeled message sets + results
test/                  node:test suites (official MCP client end-to-end)
```

## Safety and privacy
ScamShield never opens, fetches or clicks suspicious links; it analyzes them as text. It stores nothing about the person unless they opt in to the Alexa memory described above (off until the skill's next certified version), never logs message text, and only sends company names or short queries to web search. Full details: [PRIVACY.md](PRIVACY.md). ScamShield gives guidance, not legal or financial advice.

## License
MIT
