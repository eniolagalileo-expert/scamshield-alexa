// scam_briefing: "Alexa, what scams are going around?" Recent warnings from official consumer-protection sites only.

import { webSearch } from "./tavily.js";

const OFFICIAL_SOURCES = {
  US: ["consumer.ftc.gov", "uspis.gov", "ic3.gov", "fcc.gov", "ssa.gov", "irs.gov"], // not ftc.gov: its news is enforcement press releases
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
const SITE_NAME = /^(internet crime complaint center|federal (trade|communications) commission|consumer advice|u\.?s\.? postal inspection service)\b/i;
// Hub and menu pages ("Scams", "Consumer Alerts", "Stay Connected") are not warnings.
const GENERIC = /^(scams?|consumer alerts?|scam alerts?|stay connected|get ftc scam alerts|scam glossary|news( and events)?|press releases|alerts|warnings|resources|business impersonators|medicare impersonators|gift card scams)$/i;
// A briefing item must actually be about scams or fraud.
const ON_TOPIC = /\b(scam\w*|fraud\w*|phish\w*|smish\w*|spoof\w*|impersonat\w*|con artists?|fake|beware|swindl\w*|money mules?|romance|imposter|identity theft)\b/i;

// Turn "Consumer Alert: X | Federal Communications Commission" or "X - Which? - Which.co.uk" into "X".
export function cleanHeadline(title) {
  const parts = String(title || "").split(/\s+\|\s+/);
  let t = parts.length > 1 && SITE_NAME.test(parts[0]) ? parts[1] : parts[0];
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
  if (/^(consumer alerts archive|feature pages|home|news)$/i.test(cleanHeadline(title)) || GENERIC.test(cleanHeadline(title))) return false;
  if (/[?]|\/(search-terms|node|comment)\//i.test(url)) return false;
  return true;
}

// Some official pages are warning-list entries named after a firm; say what they are.
function describe(url, headline) {
  if (/fca\.org\.uk\/news\/warnings\//i.test(url)) return `a warning about an unauthorised firm called ${headline}`;
  return headline;
}

function isOfficial(url, domains) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return domains.some((d) => host === d || host.endsWith(`.${d}`));
  } catch (_) { return false; }
}

// Alert articles carry their date in the address (consumer.ftc.gov/consumer-alerts/2026/09/..., ic3.gov/PSA/2026/PSA260917).
function dateFromUrl(url) {
  const m = url.match(/\/(20\d\d)\/(0[1-9]|1[0-2])\//) || url.match(/\/PSA(\d\d)(\d\d)\d\d\b/i);
  if (!m) return null;
  const year = m[1].length === 2 ? `20${m[1]}` : m[1];
  return `${year}-${m[2]}`;
}

// Official alerts change a few times a week, and a live search takes several seconds, longer than a voice
// assistant can wait. So answers are cached for an hour, and a stale answer is served instantly while a
// fresh one is fetched in the background.
const CACHE_MS = 60 * 60 * 1000;
const cache = new Map(); // "US|topic" -> { at, value, refreshing }

export async function scamBriefing({ country = "US", topic = "" } = {}) {
  const key = `${String(country || "US").toUpperCase()}|${String(topic || "").toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  if (hit) {
    if (!hit.refreshing) {
      hit.refreshing = true;
      fetchBriefing({ country, topic }).then((value) => value.items.length && cache.set(key, { at: Date.now(), value }))
        .catch(() => {}).finally(() => { hit.refreshing = false; });
    }
    return hit.value;
  }
  const value = await fetchBriefing({ country, topic });
  if (value.items.length) cache.set(key, { at: Date.now(), value });
  return value;
}

// Fill the cache ahead of the first request (called at server start when web checks are on).
export function warmBriefing(country = "US") {
  return scamBriefing({ country }).catch(() => {});
}

async function fetchBriefing({ country = "US", topic = "" } = {}) {
  const code = String(country || "US").toUpperCase();
  const domains = OFFICIAL_SOURCES[code] || OFFICIAL_SOURCES.US;
  const about = topic ? `${topic} ` : "";
  // Two targeted searches at once (voice assistants can't wait long), then a broad one only if needed.
  const first = [
    webSearch(`${about}new scam warning`, { includeDomains: domains, maxResults: 8, topic: "news", timeRange: "month" }),
    webSearch(`${about}scammers consumer alert`, { includeDomains: domains, maxResults: 8, timeRange: "month" }),
    // The country's main consumer-alert site on its own returns the most reliably dated alert articles.
    webSearch(`${about}consumer alert scam`, { includeDomains: domains.slice(0, 1), maxResults: 8, timeRange: "month" }),
  ];
  const broad = () => webSearch(`${about}scam alert warning consumers`, { includeDomains: domains, maxResults: 8 });

  const pick = (results) => {
    const seen = new Set();
    return results
      // The search's domain filter isn't always honored, so only official sources are kept here too.
      .filter((r) => isOfficial(r.url, domains) && isUsefulAlert(r.url, r.title) && ON_TOPIC.test(`${r.title} ${r.content}`))
      // Hub pages ("Credit, Loans, and Debt") mention scams in their text; real alerts are dated or say so in the headline.
      .filter((r) => dateFromUrl(r.url) || ON_TOPIC.test(r.title))
      .map((r) => ({
        headline: describe(r.url, cleanHeadline(r.title)),
        url: r.url,
        source: sourceName(r.url),
        published: r.published ? new Date(r.published).toISOString().slice(0, 10) : dateFromUrl(r.url),
        dated_article: Boolean(dateFromUrl(r.url)),
      }))
      .filter((r) => r.headline.length > 12 && !seen.has(r.headline.toLowerCase()) && seen.add(r.headline.toLowerCase()))
      // Real alert articles first, newest first.
      .sort((a, b) => Number(b.dated_article) - Number(a.dated_article) || String(b.published || "").localeCompare(String(a.published || "")))
      .slice(0, 3)
      .map(({ dated_article, ...item }) => item);
  };

  const found = (await Promise.all(first)).flatMap((f) => f.results || []);
  let items = pick(found);
  if (items.length < 2) items = pick([...found, ...((await broad()).results || [])]);
  // "Going around now" means recent: if any alert is from the last 90 days, show only those.
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 7);
  const recent = items.filter((i) => i.published && i.published.slice(0, 7) >= cutoff);
  if (recent.length) items = recent;

  if (!items.length) {
    return { speech: "I couldn't find recent official scam warnings right now. The golden rule still applies: never pay with gift cards or share codes.", items: [] };
  }
  const spoken = items.map((it, i) => `${["First", "Next", "And"][i]}, from ${it.source}: ${it.headline.replace(/[.?!…]*$/, "")}.`).join(" ");
  return {
    speech: `${recent.length ? "Here are recent scam warnings." : "Here are official scam warnings to know about."} ${spoken} Want me to check a message you received?`,
    items,
    recent: recent.length > 0,
  };
}
