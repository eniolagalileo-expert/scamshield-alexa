// Picks the most useful official page and the sentences that actually answer
// "how does this company really contact customers?" from its text.

const PAGE_WORDS = /scam|fraud|phish|smish|spoof|security|protect|suspicious|report|impersonat/i;
// Pages about scams themselves beat general "security" or "report" pages.
const SCAM_WORDS = /scam|fraud|phish|smish|spoof|impersonat/i;
// Product pages, forums and seller/community posts are not authoritative answers for consumers.
const OFF_TOPIC = /\b(cd|savings|mortgage|loan rates?|credit cards? offers?|careers?|jobs|investor|press release)\b|forums?|discussions?|community|sellercentral|seller-forums/i;

// Official pages ranked best-first: pages about scams/fraud up, product pages, forums and PDFs down.
export function rankPages(results, domains) {
  const official = results.filter((r) => {
    try { const h = new URL(r.url).hostname; return domains.some((d) => h === d || h.endsWith(`.${d}`)); } catch (_) { return false; }
  });
  const score = (r) => {
    const text = `${r.title} ${r.url}`;
    return (PAGE_WORDS.test(text) ? 3 : 0) + (SCAM_WORDS.test(text) ? 2 : 0) + (PAGE_WORDS.test(r.content || "") ? 1 : 0)
      - (OFF_TOPIC.test(text) ? 4 : 0) - (/\[PDF\]|\.pdf\b|bulletin/i.test(text) ? 1 : 0);
  };
  // The page itself must be about scams or security (title or address), not just mention fraud somewhere.
  return official.map((r, i) => ({ r, s: score(r), i }))
    .filter((x) => x.s >= 3 && !/\/(dp|gp\/product)\//i.test(x.r.url))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.r);
}

export function pickPage(results, domains) {
  return rankPages(results, domains)[0] || null;
}

// Strip page chrome and list artifacts so the text can be read aloud.
export function cleanText(text) {
  return String(text || "")
    .replace(/\[\.\.\.\]/g, " ")
    .replace(/(^|\s)[n•·▪–-]\s(?=\S)/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[®™]/g, "")
    .replace(/([a-z])\.([A-Z])/g, "$1. $2")
    .replace(/\s+/g, " ")
    .trim();
}

const NEGATION = /\b(never|does not|do not|doesn'?t|don'?t|will not|won'?t|should not|shouldn'?t|not send|no longer|is not|are not)\b/i;
const CONTACT = /\b(texts?|text messages?|sms|emails?|calls?|phone|ask|request|payment|pay|fees?|codes?|passwords?|pins?|personal information|account (details|information)|unsolicited|links?|gift cards?)\b/i;
const CHROME = /skip to|keyboard shortcut|sign in|log in|cookie|menu|let's get started|open (a|an) |reply stop|opt.?out|unsubscribe|msg (&|and) data rates/i;

// The best one or two sentences, e.g. "USPS does not send unsolicited text messages."
export function bestSentences(text, max = 2) {
  const sentences = cleanText(text)
    // Keep abbreviations from ending sentences: "U.S. Postal" → "US Postal", "Mr. Smith" → "Mr Smith".
    .replace(/\b((?:[A-Z]\.){2,})/g, (m) => m.replace(/\./g, ""))
    .replace(/\b(Mr|Mrs|Ms|Dr|St|No|Inc|Ltd|Co|e\.g|i\.e|etc|vs)\./g, "$1")
    .split(/(?<=[.!?]"?)\s+(?=["A-Z])/)
    .map((s) => s.replace(/^"|"$/g, "").trim());
  const scored = sentences
    .map((s, i) => ({ s, i, score: (NEGATION.test(s) ? 3 : 0) + (CONTACT.test(s) ? 2 : 0) - (CHROME.test(s) ? 5 : 0) - (s.length > 260 ? 2 : 0) }))
    .filter((x) => x.score >= 4 && x.s.length >= 25 && x.s.length <= 320);
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).slice(0, max).sort((a, b) => a.i - b.i).map((x) => x.s);
}

// Finds the company's official page about scams and the sentences that answer the question.
// Search results for any one fixed wording drift over time, so the scam's own topic ("redelivery fee")
// is searched alongside a general scam query, with a broader fallback if both come back empty.
// Known official scam-advice pages, checked first because search results for any wording drift over time.
// Each one is on the company's own domain; search fills in for everyone else.
export const OFFICIAL_SCAM_PAGES = {
  usps: ["https://faq.usps.com/articles/Knowledge/Scams-Scheme-Alerts"],
  paypal: ["https://www.paypal.com/us/brc/article/what-is-phishing-or-spoofing"],
  irs: ["https://www.irs.gov/newsroom/irs-reminder-tax-scams-continue-year-round"],
  amazon: ["https://www.amazon.com/gp/help/customer/display.html?nodeId=TapjnwRvIRtlgyLPSl"],
};

export async function officialAnswer({ company, question, topic = "" }, { webSearch, extractPages, brands, name }) {
  const domains = brands[company];
  // A known page with a clear statement answers without any search at all.
  const seeds = (OFFICIAL_SCAM_PAGES[company] || []).map((url) => ({ url, title: "", content: "" }));
  if (seeds.length) {
    const pages = await extractPages(seeds.map((p) => p.url), question);
    for (const seed of seeds) {
      const text = pages.find((p) => p.url === seed.url)?.content || "";
      const clear = clearStatement(bestSentences(text, 12), name);
      if (clear) return { page: { ...seed, title: `${name} official scam advice` }, best: bestSentences(text), clear, text };
    }
  }
  const queries = [
    ...(topic ? [`${name} scam alert ${topic}`] : []),
    `${name} scam text email phishing smishing`,
  ];
  const found = await Promise.all(queries.map((q) => webSearch(q, { includeDomains: domains })));
  // Rank the pages from both searches together, so the best scam page wins wherever it came from.
  const all = [];
  for (const f of found) for (const r of f.results || []) if (!all.some((c) => c.url === r.url)) all.push(r);
  let candidates = rankPages(all, domains);
  if (!candidates.length) candidates = rankPages((await webSearch(`${name} fraud security report suspicious`, { includeDomains: domains })).results || [], domains);
  candidates = candidates.slice(0, 3);
  if (!candidates.length) return null;

  // Read the top pages in one call. Prefer a page with a clear statement from the company itself
  // ("PayPal will never ask…"); otherwise use the first page with a useful answer.
  const pages = await extractPages(candidates.map((c) => c.url), question);
  const read = candidates.map((c) => ({ c, text: pages.find((p) => p.url === c.url)?.content || c.content || "" }));
  for (const { c, text } of read) {
    const clear = clearStatement(bestSentences(text, 12), name);
    if (clear) return { page: c, best: bestSentences(text), clear, text };
  }
  for (const { c, text } of read) {
    const best = bestSentences(text);
    if (best.length) return { page: c, best, clear: "", text };
  }
  return { page: candidates[0], best: [], clear: "", text: candidates[0].content || "" };
}

// A statement worth quoting as "the company's official website says": the company (or "we") saying
// what it never does. Generic tips ("Most companies will not…") and page fragments don't qualify.
const NEVER_DOES = /\b(never|will not|won'?t|does not|doesn'?t|do not|don'?t)\b[^.]{0,80}\b(ask|request|send|call|text|e-?mail|charge|contact|require|initiate)/i;
export function clearStatement(sentences, name) {
  const plain = String(name || "").replace(/^the /i, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const own = new RegExp(`\\b(the )?${plain}\\b`, "i");
  return (sentences || [])
    // Start at the company's name, dropping a page heading glued to the front ("Email phishing scams The IRS does not…").
    .map((s) => { const at = s.search(own); return at > 0 && !/[.:;]\s*$/.test(s.slice(0, at)) ? s.slice(at) : s; })
    .map((s) => s.replace(/^the /, "The "))
    .find((s) => NEVER_DOES.test(s) && (own.test(s) || /\b(we|our)\b/i.test(s))
      && !/footnote|you might be thinking|same page link|job/i.test(s) && s.length <= 220) || "";
}
