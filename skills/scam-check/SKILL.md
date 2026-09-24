---
name: scam-check
description: Decide whether a text message, email, DM, phone call or link is a scam, and explain it in plain, spoken-friendly language. Use when someone asks "is this a scam?", pastes or reads out a suspicious message, mentions a strange link, phone number, gift card request, package fee, bank alert, prize, job offer or a family member asking for money.
license: MIT
compatibility: Uses the ScamShield MCP server (Streamable HTTP). Set SCAMSHIELD_URL if it is not at http://localhost:3000/mcp. Web checks need the server to have a Tavily key.
metadata:
  author: scamshield
  version: "1.0"
---

# Scam check

Help the person decide, calmly and quickly, whether what they received is a scam. Many people asking are older adults, so keep answers short and plain.

## Steps

1. **Get the exact message.** If they only describe it, ask them to read it out word for word, including any link or phone number.
2. **Analyze it.** Call the `check_message` tool with the exact text (and their two-letter country code if known).
   Without MCP tools, run: `node scripts/check.mjs "<message>"`
3. **If it claims to be a known company** (bank, delivery service, tax office, Amazon, Apple…), call `verify_with_official_source` to learn how that company really contacts people.
4. **Optionally** call `search_scam_reports` for a phone number or website in the message.
5. **Answer out loud in this shape:**
   - One sentence with the verdict ("This looks like a scam.").
   - One sentence with the one or two strongest reasons.
   - The single most important action ("Don't click the link or pay anything.").
   - If it's a scam, offer to explain how to report it (`how_to_report_scam`).

## If they're on a phone call right now
1. Call `check_phone_call` with who the caller claims to be and what they want.
2. If it returns `next_question`, ask exactly that question out loud, then call it again with the answer added to `answers` (keyed by `next_question.key`).
3. As soon as it returns a verdict, say it. If it says "Hang up now", lead with that.

## Other things people ask
- "What scams are going around?": call `scam_briefing` (pass their country if known) and read the short briefing.
- After a scam verdict, offer to warn a relative: `warn_family` composes the message; read it back and ask before sending.

## Rules

- Never tell them to click a link, call a number, or reply to the suspicious message, not even "to check".
- Never ask for their passwords, codes or card numbers.
- If they already paid or shared details: tell them to call their bank using the number on their card, change passwords, and report it.
- Real companies and government agencies never ask for gift cards, crypto, wire transfers, or codes that were texted to you. Say so when relevant.

## Examples

**Input:** "USPS: Your package is on hold due to an unpaid $1.99 fee. Pay within 24 hours: https://usps.com-track-redelivery.top/pkg"
**Answer:** "This looks like a scam. The link pretends to be USPS but goes to a different website, and it asks for a small fee to release a package. Don't click the link or pay anything. Want to know how to report it?"

**Input:** "Your Google verification code is 482913. Don't share this code with anyone."
**Answer:** "This looks like a normal security code. It's only a problem if you didn't ask for it or someone asks you to read it to them. Never share it."

See [common scam types](references/top-scams.md) for more patterns to explain.
