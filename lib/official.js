// Picks the most useful official page and the sentences that actually answer
// "how does this company really contact customers?" from its text.

const PAGE_WORDS = /scam|fraud|phish|smish|spoof|security|protect|suspicious|report|impersonat/i;
// Product pages, forums and seller/community posts are not authoritative answers for consumers.
const OFF_TOPIC = /\b(cd|savings|mortgage|loan rates?|credit cards? offers?|careers?|jobs|investor|press release)\b|forums?|discussions?|community|sellercentral|seller-forums/i;

// Official pages ranked best-first: pages about scams/fraud up, product pages, forums and PDFs down.
export function rankPages(results, domains) {
  const official = results.filter((r) => {
    try { return domains.some((d) => new URL(r.url).hostname.endsWith(d)); } catch (_) { return false; }
  });
  const score = (r) => {
    const text = `${r.title} ${r.url}`;
    return (PAGE_WORDS.test(text) ? 3 : 0) + (PAGE_WORDS.test(r.content || "") ? 1 : 0)
      - (OFF_TOPIC.test(text) ? 4 : 0) - (/\[PDF\]|\.pdf\b|bulletin/i.test(text) ? 1 : 0);
  };
  return official.map((r, i) => ({ r, s: score(r), i }))
    .filter((x) => x.s > 0)
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
const CHROME = /skip to|keyboard shortcut|sign in|log in|cookie|menu|let's get started|open (a|an) /i;

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
