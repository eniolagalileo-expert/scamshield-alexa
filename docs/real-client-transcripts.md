# ScamShield with a real MCP client

These are unedited runs of **Claude Code (v2.1.281)** used as an MCP client, connected to a local ScamShield server over Streamable HTTP. The assistant chose which tools to call on its own; the only instruction was to use the ScamShield tools and answer like a voice assistant.

Reproduce:

```bash
npm run dev
echo '{"mcpServers":{"scamshield":{"type":"http","url":"http://127.0.0.1:3000/mcp"}}}' > mcp.json
claude -p "<question>" --mcp-config mcp.json --strict-mcp-config --allowedTools "mcp__scamshield__*"
```

## A text message

**User:** My grandma just got this text and wants to know if it's a scam: "USPS: Your package is on hold due to an unpaid $1.99 redelivery fee. Pay within 24 hours or it will be returned to sender: https://usps.com-track-redelivery.top/pkg". Use the ScamShield tools to check it, then answer the way a voice assistant would say it out loud to her, in 2-3 short sentences.

**Tools the assistant called:**

1. `check_message` `{"message": "USPS: Your package is on hold due to an unpaid $1.99 redelivery fee. Pay within 24 hours or it will be returned to sender: https://usps.com-track-redelivery.top/pkg", "country": "US"}`
2. `verify_with_official_source` `{"company": "usps", "question": "does USPS text about redelivery fees or unpaid postage with a payment link"}`
3. `check_link` `{"url": "https://usps.com-track-redelivery.top/pkg"}`

**Assistant's answer:**

> Yes, this is a scam. The link isn't the real Post Office website, and the Postal Service says it doesn't send texts like this asking for fees. Please don't tap the link or pay anything; just delete the text, or forward it to 7726 to report it.
>
> ---
> ScamShield rated it a scam with 97% confidence. It found three warning signs: the link goes to `com-track-redelivery.top` instead of usps.com, it asks for a small "release" fee, and it pressures her with a 24-hour deadline. USPS's own website also calls these texts "smishing" scams. If she's expecting a package, she can check it herself in the official USPS app or at usps.com. If she'd like to warn other family members, I can help with that too.

## A phone call in progress

**User:** I'm on the phone right now with a man who says he's from my bank's fraud department. He says someone is using my card and he needs me to read him the 6-digit code they just texted me so he can block it. What should I do? Use the ScamShield tools. Answer like a voice assistant, short.

**Tools the assistant called:**

1. `check_phone_call` `{"caller_claims_to_be": "my bank's fraud department", "what_they_want": "Says someone is using my card and needs me to read him the 6-digit code they just texted me so he can block it", "answers": {"asked_for_code": true`

**Assistant's answer:**

> **Hang up now. This is a scam.**
>
> A real bank will never ask you to read out a code. That code is the key to your account.
>
> Then call your bank yourself, using the number on the back of your card. If you already gave him the code, tell them that right away.
>
> Want me to show you how to report it, or warn a family member?

