import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyzeUrl, extractClues } from "../lib/clues.js";
import { scanMessage } from "../lib/scan.js";

const load = (name) => JSON.parse(readFileSync(new URL(`../eval/${name}.json`, import.meta.url)));
const accuracy = (set) => set.filter((d) => (scanMessage(d.text).verdict !== "likely_safe") === (d.label === "scam")).length / set.length;

test("development sets stay at 100% (guards against regressions)", () => {
  assert.equal(accuracy(load("dev-a")), 1);
  assert.equal(accuracy(load("dev-b")), 1);
});

test("held-out test set stays at or above its recorded 90%", () => {
  assert.ok(accuracy(load("test")) >= 0.9);
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
