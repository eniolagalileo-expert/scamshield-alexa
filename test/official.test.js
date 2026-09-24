import { test } from "node:test";
import assert from "node:assert/strict";
import { bestSentences, cleanText, pickPage } from "../lib/official.js";

test("picks the key sentence out of messy page text", () => {
  const text = 'Scammers send texts with phrases like: n "Your account has been suspended." n "There is a package waiting for you." USPS® does not send unsolicited text messages. Keep your information secure: Do not click.Do not open any link or attachment from a sender you cannot verify.';
  const best = bestSentences(text);
  assert.equal(best[0], "USPS does not send unsolicited text messages.");
  assert.ok(best.every((s) => !/^n /.test(s)));
});

test("returns nothing rather than reading page chrome aloud", () => {
  assert.deepEqual(bestSentences("Skip to Keyboard shortcuts Find more solutions. Let's get started. Existing customers can open a CD online."), []);
});

test("prefers official scam pages over product pages and forums", () => {
  const domains = ["amazon.com"];
  const results = [
    { title: "Phishing season | Seller Forums", url: "https://sellercentral.amazon.com/seller-forums/discussions/t/1", content: "scam" },
    { title: "Open a CD", url: "https://www.amazon.com/cd", content: "" },
    { title: "Identifying a scam - Amazon Customer Service", url: "https://www.amazon.com/gp/help/customer/display.html?nodeId=1", content: "report scams" },
    { title: "Unofficial scam blog", url: "https://amazon-scams.example.com/", content: "scam" },
  ];
  assert.equal(pickPage(results, domains).title, "Identifying a scam - Amazon Customer Service");
  assert.equal(pickPage([results[1]], domains), null);
});

test("cleanText removes list artifacts and trademark symbols", () => {
  assert.equal(cleanText('a n "b." • c USPS®'), 'a "b." c USPS');
});

test("abbreviations like U.S. don't split a sentence", () => {
  const best = bestSentences("These phishing emails and smishing texts appear to be from the U.S. Postal Service, but they are not, and individuals should not interact with them.");
  assert.equal(best.length, 1);
  assert.match(best[0], /^These phishing emails .* US Postal Service, but they are not/);
});
