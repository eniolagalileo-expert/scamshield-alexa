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

test("briefing headlines are cleaned for speech and junk pages are skipped", async () => {
  const { cleanHeadline, isUsefulAlert } = await import("../lib/briefing.js");
  assert.equal(cleanHeadline("Consumer Alert: FCC Warns Consumers of 'Grandparent Scam' Robocalls | Federal Communications Commission"), "FCC Warns Consumers of 'Grandparent Scam' Robocalls");
  assert.equal(cleanHeadline("The latest scam alerts from Which? - Which? - Which.co.uk"), "The latest scam alerts from Which?");
  assert.equal(cleanHeadline("Scammers are spoofing car dealership websites: What you need to ..."), "Scammers are spoofing car dealership websites");
  assert.equal(cleanHeadline("Pay-by-phone - watch out"), "Pay-by-phone - watch out");
  assert.equal(cleanHeadline("Helping small businesses - National Cyber Security Centre"), "Helping small businesses");
  assert.equal(isUsefulAlert("https://consumer.ftc.gov/consumer-alerts/archive/202609", "Consumer Alerts Archive"), false);
  assert.equal(isUsefulAlert("http://www.irs.gov/zh-hant/newsroom/x", "IRS warning"), false);
  assert.equal(isUsefulAlert("https://consumer.ftc.gov/consumer-alerts/2026/09/x", "Scammers are spoofing car dealership websites"), true);
  // Hub and menu pages are not warnings.
  assert.equal(isUsefulAlert("https://consumer.ftc.gov/consumer-alerts", "Consumer Alerts | Consumer Advice"), false);
  assert.equal(isUsefulAlert("https://www.ftc.gov/news-events/stay-connected", "Stay Connected | Federal Trade Commission"), false);
  assert.equal(isUsefulAlert("https://consumer.ftc.gov/business-impersonators?page=2", "Business Impersonators - FTC Consumer Advice"), false);
  assert.equal(isUsefulAlert("https://consumer.ftc.gov/search-terms/military", "military | Consumer Advice"), false);
  // A leading site name is skipped.
  assert.equal(cleanHeadline("Internet Crime Complaint Center (IC3) | Scammers Impersonating Law Enforcement"), "Scammers Impersonating Law Enforcement");
});

test("archive pages in other languages are skipped", async () => {
  const { isUsefulAlert } = await import("../lib/briefing.js");
  assert.equal(isUsefulAlert("https://consumer.ftc.gov/alertas-consumidores/archivo", "Archivo de las alertas para consumidores"), false);
});

test("the briefing is cached, so a voice assistant gets it instantly the second time", async () => {
  const realFetch = globalThis.fetch;
  const hadKey = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "test";
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ results: [
      { url: "https://consumer.ftc.gov/consumer-alerts/2026/09/scammers-are-impersonating-farm-equipment-businesses", title: "Scammers are impersonating farm equipment businesses", content: "scam" },
      { url: "https://www.ic3.gov/PSA/2026/PSA260917", title: "Internet Crime Complaint Center (IC3) | Scammers Impersonating Law Enforcement", content: "fraud" },
    ] }), { headers: { "Content-Type": "application/json" } });
  };
  try {
    const { scamBriefing } = await import("../lib/briefing.js");
    const first = await scamBriefing({ country: "US", topic: "cache-test" });
    const made = calls;
    const second = await scamBriefing({ country: "US", topic: "cache-test" });
    assert.equal(calls, made, "no new searches for a cached briefing");
    assert.deepEqual(second, first);
    assert.deepEqual(first.items.map((i) => i.source).sort(), ["the FBI", "the FTC"]);
  } finally {
    globalThis.fetch = realFetch;
    if (hadKey === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = hadKey;
  }
});

test("briefing keeps only official, real alerts even if the search returns other sites", async () => {
  const realFetch = globalThis.fetch;
  const hadKey = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "test";
  globalThis.fetch = async () => new Response(JSON.stringify({ results: [
    { url: "https://consumer.ftc.gov/credit-loans-debt", title: "Credit, Loans, and Debt | Consumer Advice", content: "avoid scams and fraud" },
    { url: "https://ago.vermont.gov/scam-prevention", title: "Scam Prevention Through Awareness and Education", content: "scam" },
    { url: "https://www.fincen.gov/news/fincen-identifies-fraud", title: "FinCEN Identifies Nearly $13 Billion Linked to Suspected Fraud", content: "fraud" },
    { url: "https://consumer.ftc.gov/consumer-alerts/2026/09/see-qr-code-parked-somewhere-dont-scan-ityet", title: "See a QR code parked somewhere? Don't scan it…yet!", content: "scammers put fake QR codes on parking meters" },
    { url: "https://www.ic3.gov/PSA/2026/PSA260917", title: "Internet Crime Complaint Center (IC3) | Scammers Impersonating Law Enforcement", content: "fraud" },
  ] }), { headers: { "Content-Type": "application/json" } });
  try {
    const { scamBriefing } = await import("../lib/briefing.js");
    const r = await scamBriefing({ country: "US", topic: "official-only-test" });
    const urls = r.items.map((i) => i.url);
    assert.ok(urls.every((u) => /consumer\.ftc\.gov\/consumer-alerts|ic3\.gov\/PSA/.test(u)), urls.join(", "));
    assert.equal(r.items.length, 2);
  } finally {
    globalThis.fetch = realFetch;
    if (hadKey === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = hadKey;
  }
});

test("only a clear statement from the company itself is quoted", async () => {
  const { clearStatement } = await import("../lib/official.js");
  assert.equal(clearStatement(["Most companies will not reach out via text message.", "PayPal will never ask you for your password in an email."], "PayPal"), "PayPal will never ask you for your password in an email.");
  assert.equal(clearStatement(["More information: Email phishing scams The IRS does not initiate contact with taxpayers by email to request personal or financial information."], "the IRS"), "The IRS does not initiate contact with taxpayers by email to request personal or financial information.");
  assert.equal(clearStatement(["Most companies will not reach out via text message."], "USPS"), "");
  assert.equal(clearStatement(["They usually request that you provide payments to apply for jobs that don't exist. Amazon will never ask for that job fee."], "Amazon"), "");
});
