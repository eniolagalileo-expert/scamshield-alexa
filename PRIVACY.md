# Privacy

ScamShield is built for people who may be worried, rushed, or older. It is designed to learn as little about them as possible.

**What ScamShield stores:** nothing. There is no database, no accounts, and no message history on the server. Each check is handled in memory and forgotten when the response is sent.

**What it logs:** only operational errors, as an error type and code location. Message text is never written to logs; error messages are dropped on purpose because some (like JSON parse errors) can quote the request body.

**What leaves the server:**
- **Web checks (Tavily):** `verify_with_official_source` reads a known official scam page for the company, or sends a short query built from the *company name and the scam's topic* (e.g. "USPS scam alert redelivery fee"), and only reads that company's official website. `search_scam_reports` sends the query the assistant chooses (e.g. a phone number or domain). The full message is never sent.
- **Second opinion (MCP sampling):** only if the connected assistant supports it, the message and the rules' findings are sent **back to that same assistant's model**, the one the person is already talking to. ScamShield has no model or API key of its own.

**Links are never opened.** Suspicious links are analyzed as text. ScamShield never fetches, clicks, or previews them.

**Alexa:** requests are accepted only when signed by Amazon (certificate chain, signature, and timestamp are verified). The skill uses Alexa session attributes only for the current conversation (the current quiz question, the phone-call answers so far, and the last message checked, so "warn my family" can refer to it); nothing is kept after the session ends. To say "One moment…" during a slow check, it sends only that fixed phrase back to Amazon's own Alexa API (never to any other address), using the short-lived token Amazon includes in the request.

**Website and phone app:** no accounts, cookies or analytics. A pasted or shared message is checked and forgotten. "Read it to me" uses the browser's built-in voice, and "Warn my family" is written on the device for the person to share. **Screenshots and QR codes are read on the device** (Tesseract.js and jsQR, downloaded from jsDelivr on first use); the picture is never uploaded, and only the text read from it, or the QR code's link (not opened), is checked. A screenshot shared from the phone's share menu is held in the app's on-device cache only until the page reads it, then deleted. The offline cache holds only the app's own pages, never messages. The full policy for users is at https://scamshield-alexa.onrender.com/privacy.html.

**Browser demo:** the simulated Alexa+ page (`/demo/`) keeps no history; speech recognition and speech output use the browser's built-in features.

**Hosting:** the public demo runs on Render's free plan. Render may keep standard request logs (such as IP address and time) under its own policies.

ScamShield gives guidance, not legal or financial advice. If you've already paid or shared details, contact your bank right away.
