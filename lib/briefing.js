// scam_briefing: "Alexa, what scams are going around?" Recent warnings from official consumer-protection sites only.

import { webSearch } from "./tavily.js";

const OFFICIAL_SOURCES = {
  US: ["consumer.ftc.gov", "ftc.gov", "uspis.gov", "ic3.gov", "fcc.gov", "ssa.gov", "irs.gov"],
  GB: ["actionfraud.police.uk", "ncsc.gov.uk", "which.co.uk", "fca.org.uk"],
  IN: ["cybercrime.gov.in", "pib.gov.in", "rbi.org.in"],
  CA: ["antifraudcentre-centreantifraude.ca", "canada.ca"],
  AU: ["scamwatch.gov.au", "accc.gov.au", "moneysmart.gov.au"],
};

const SOURCE_NAMES = {
  "consumer.ftc.gov": "the FTC", "ftc.gov": "the FTC", "uspis.gov": "the Postal Inspection Service", "ic3.gov": "the FBI",
  "fcc.gov": "the FCC", "ssa.gov": "Social Security", "irs.gov": "the IRS", "actionfraud.police.uk": "Action Fraud",
  "ncsc.gov.uk": "the NCSC", "which.co.uk": "Which?", "fca.org.uk": "the FCA", "cybercrime.gov.in": "the cyber crime portal",
  "scamwatch.gov.au": "Scamwatch", "accc.gov.au": "the ACCC", "moneysmart.gov.au": "Moneysmart",
};

function sourceName(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const key = Object.keys(SOURCE_NAMES).find((d) => host === d || host.endsWith(`.${d}`));
    return key ? SOURCE_NAMES[key] : host;
  } catch (_) { return "an official source"; }
}

const SITE_WORDS = /\b(which\?|ftc|consumer advice|gov(\.uk)?|commission|service|fca|action fraud|scamwatch|centre|center|authority|bureau|department|\.co\.uk|\.gov)\b|which\?/i;
// A briefing item must actually be about scams or fraud.
const ON_TOPIC = /\b(scam\w*|fraud\w*|phish\w*|smish\w*|spoof\w*|impersonat\w*|con artists?|fake|beware|swindl\w*|money mules?|romance|imposter|identity theft)\b/i;

// Turn "Consumer Alert: X | Federal Communications Commission" or "X - Which? - Which.co.uk" into "X".
export function cleanHeadline(title) {
  let t = String(title || "").split(/\s+\|\s+/)[0];
  for (let i = 0; i < 3; i++) {
    const m = t.match(/^(.*\S)\s+[-–—]\s+([^-–—]{1,40})$/);
    if (!m || !SITE_WORDS.test(m[2])) break;
    t = m[1];
  }
  t = t.replace(/^consumer alert:\s*/i, "");
  // Search engines cut long titles with "..."; keep the complete part (before a colon) rather than a dangling fragment.
  if (/(\.\.\.|…)\s*$/.test(t)) t = t.includes(":") ? t.slice(0, t.indexOf(":")) : t.replace(/\s+\S*(\.\.\.|…)\s*$/, "");
  return t.replace(/\s+/g, " ").trim();
}

// Index/archive pages and non-English copies aren't useful in a spoken briefing.
export function isUsefulAlert(url, title) {
  if (/\/(archive|archivo|features|search|tag|category)(\/|$)|latest-scam-alerts|alertas/i.test(url)) return false;
  if (/\barchiv/i.test(title)) return false;
  if (/\/(zh-hans|zh-hant|ko|es|ru|vi|ht|fr|de|pt|ar|pl|tl)\//i.test(url)) return false;
  if (/^(consumer alerts archive|feature pages|home|news)$/i.test(cleanHeadline(title))) return false;
  return true;
}

// Some official pages are warning-list entries named after a firm; say what they are.
function describe(url, headline) {
  if (/fca\.org\.uk\/news\/warnings\//i.test(url)) return `a warning about an unauthorised firm called ${headline}`;
  return headline;
}

export async function scamBriefing({ country = "US", topic = "" } = {}) {
  const code = String(country || "US").toUpperCase();
  const domains = OFFICIAL_SOURCES[code] || OFFICIAL_SOURCES.US;
  const query = `${topic ? `${topic} ` : ""}scam alert warning consumers`;
  // Recent, dated alerts first; fall back to broader searches if nothing recent comes back.
  const attempts = [
    { topic: "news", timeRange: "month" },
    { topic: "news" },
    {},
  ];
  let items = [];
  for (const opts of attempts) {
    const found = await webSearch(query, { includeDomains: domains, maxResults: 8, ...opts });
    const seen = new Set();
    items = found.results
      .filter((r) => isUsefulAlert(r.url, r.title) && ON_TOPIC.test(`${r.title} ${r.content}`))
      .map((r) => ({ headline: describe(r.url, cleanHeadline(r.title)), url: r.url, source: sourceName(r.url), published: r.published ? new Date(r.published).toISOString().slice(0, 10) : null }))
      .filter((r) => r.headline.length > 12 && !seen.has(r.headline.toLowerCase()) && seen.add(r.headline.toLowerCase()))
      .sort((a, b) => String(b.published || "").localeCompare(String(a.published || "")))
      .slice(0, 3);
    if (items.length >= 2) break;
  }

  if (!items.length) {
    return { speech: "I couldn't find recent official scam warnings right now. The golden rule still applies: never pay with gift cards or share codes.", items: [] };
  }
  const spoken = items.map((it, i) => `${["First", "Next", "And"][i]}, from ${it.source}: ${it.headline.replace(/[.?!]*$/, "")}.`).join(" ");
  return {
    speech: `Here are recent scam warnings. ${spoken} Want me to check a message you received?`,
    items,
  };
}
