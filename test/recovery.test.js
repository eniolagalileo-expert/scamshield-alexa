import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, scamRecovery, SITUATIONS } from "../lib/recovery.js";

test("classifies what happened, most urgent first", () => {
  assert.deepEqual(classify("they took control of my computer and I paid with gift cards"), ["remote_access", "gift_card"]);
  assert.deepEqual(classify("I sent money on Zelle"), ["payment_app"]);
  assert.deepEqual(classify("I wired $2,000 to a safe account"), ["bank_transfer"]);
  assert.deepEqual(classify("I entered my PayPal password"), ["password"]);
  assert.deepEqual(classify("I only clicked the link"), ["clicked_link"]);
  assert.deepEqual(classify("compartí el código"), ["shared_code"]);
  assert.deepEqual(classify("pagué con tarjetas de regalo"), ["gift_card"]);
});

test("every situation has English and Spanish steps", () => {
  for (const [key, s] of Object.entries(SITUATIONS)) {
    for (const lang of ["en", "es"]) {
      assert.ok(s[lang].label && s[lang].steps.length >= 3, `${key}.${lang}`);
    }
    assert.equal(s.en.steps.length, s.es.steps.length, key);
  }
});

test("unknown situations ask a question and offer the options", () => {
  const r = scamRecovery({ what_happened: "I don't know" });
  assert.equal(r.status, "need_details");
  assert.equal(r.options.length, Object.keys(SITUATIONS).length);
  assert.equal(scamRecovery({ situations: ["crypto"], language: "es" }).situations[0].label, "Pagué con criptomonedas");
});
