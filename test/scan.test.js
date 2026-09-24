import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyzeUrl, extractClues } from "../lib/clues.js";
import { scanMessage } from "../lib/scan.js";

const load = (name) => JSON.parse(readFileSync(new URL(`../eval/${name}.json`, import.meta.url)));
const accuracy = (set) => set.filter((d) => (scanMessage(d.text).verdict !== "likely_safe") === (d.label === "scam")).length / set.length;

test("development sets stay at 100% (guards against regressions)", () => {
  for (const set of ["dev-a", "dev-b", "dev-c"]) assert.equal(accuracy(load(set)), 1, set);
});

test("held-out test v2 stays at or above its recorded 86%", () => {
  assert.ok(accuracy(load("test-v2")) >= 0.86);
});

test("finds bare domains and disguised addresses", () => {
  assert.deepEqual(extractClues("update at netflix-accounts-hold.com now").urls, ["netflix-accounts-hold.com"]);
  assert.deepEqual(extractClues("email me at bob@example.com").urls, []);
  assert.equal(analyzeUrl("http://appleid.apple.com.secure-verify.info/restore").risk, "high");
  assert.equal(analyzeUrl("https://hmrc-refund-gov.uk.claims-portal.xyz").risk, "high");
  for (const ok of ["https://www.amazon.co.uk/orders", "https://tools.usps.com/go/x", "https://myaccount.google.com/notifications"]) {
    assert.equal(analyzeUrl(ok).risk, "low", ok);
  }
});

test("speech is short and leads with the verdict", () => {
  const r = scanMessage("Grandma it's me, don't tell mom. I need $3,000 for bail right now, send gift cards.");
  assert.match(r.speech, /^This looks like a scam\./);
  assert.ok(r.speech.split(/[.!?]/).filter(Boolean).length <= 4);
});

test("answers in the message's language", () => {
  const es = scanMessage("Correos: Su paquete está retenido por falta de pago de 1,79 EUR en tasas de aduana. Pague en las próximas 24 horas o será devuelto: https://correos-envios-pago.top/es");
  assert.equal(es.language, "es");
  assert.match(es.speech, /^Esto parece una estafa\. Pide una pequeña tarifa/);
  assert.match(es.speech, /No responda, no pague/);
  const hi = scanMessage("प्रिय ग्राहक, आपका SBI खाता आज बंद कर दिया जाएगा। अपना KYC तुरंत अपडेट करें: http://sbi-kyc-update.online/in और OTP साझा करें।");
  assert.equal(hi.language, "hi");
  assert.match(hi.speech, /^यह एक धोखाधड़ी लगती है।/);
  const en = scanMessage("Your Uber code is 4821. Never share this code with anyone.");
  assert.equal(en.language, "en");
});

test("links read aloud are recognized and checked", async () => {
  const { normalizeSpokenLinks } = await import("../lib/clues.js");
  assert.equal(normalizeSpokenLinks("pay at usps dot com dash track dash redelivery dot top slash pkg today"), "pay at usps.com-track-redelivery.top/pkg today");
  assert.equal(normalizeSpokenLinks("go to h t t p s colon slash slash paypa1 dash secure dot com slash login"), "go to https://paypa1-secure.com/login");
  assert.equal(normalizeSpokenLinks("I will dot the i and we can talk later"), "I will dot the i and we can talk later");
  const r = scanMessage("USPS your package is on hold pay the one ninety nine fee within 24 hours at usps dot com dash track dash redelivery dot top slash pkg");
  assert.equal(r.verdict, "scam");
  assert.ok(r.red_flags.some((f) => f.flag === "Fake or disguised link"));
});
