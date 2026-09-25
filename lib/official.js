// Picks the most useful official page and the sentences that actually answer
// "how does this company really contact customers?" from its text.

const PAGE_WORDS = /scam|fraud|phish|smish|spoof|security|protect|suspicious|report|impersonat/i;
// Product pages, forums and seller/community posts are not authoritative answers for consumers.
const OFF_TOPIC = /\b(cd|savings|mortgage|loan rates?|credit cards? offers?|careers?|jobs|investor|press release)\b|forums?|discussions?|community|sellercentral|seller-forums/i;

// Official pages ranked best-first: pages about scams/fraud up, product pages, forums and PDFs down.
export function rankPages(results, domains) {
  const official = results.filter((r) => {
    try { const h = new URL(r.url).hostname; return domains.some((d) => h === d || h.endsWith(`.${d}`)); } catch (_) { return false; }
  });
  const score = (r) => {
    const text = `${r.title} ${r.url}`;
    return (PAGE_WORDS.test(text) ? 3 : 0) + (PAGE_WORDS.test(r.content || "") ? 1 : 0)
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
export async function officialAnswer({ company, question, topic = "" }, { webSearch, extractPages, brands, name }) {
  const domains = brands[company];
  const queries = [
    ...(topic ? [`${name} scam alert ${topic}`] : []),
    `${name} scam text email phishing smishing`,
  ];
  const found = await Promise.all(queries.map((q) => webSearch(q, { includeDomains: domains })));
  let candidates = [];
  for (const f of found) {
    for (const r of rankPages(f.results || [], domains)) if (!candidates.some((c) => c.url === r.url)) candidates.push(r);
  }
  if (!candidates.length) candidates = rankPages((await webSearch(`${name} fraud security report suspicious`, { includeDomains: domains })).results || [], domains);
  candidates = candidates.slice(0, 3);
  if (!candidates.length) return null;

  // Read the top pages in one call and use the first one that states a clear answer.
  const pages = await extractPages(candidates.map((c) => c.url), question);
  for (const c of candidates) {
    const text = pages.find((p) => p.url === c.url)?.content || c.content || "";
    const best = bestSentences(text);
    if (best.length) return { page: c, best, text };
  }
  return { page: candidates[0], best: [], text: candidates[0].content || "" };
}
