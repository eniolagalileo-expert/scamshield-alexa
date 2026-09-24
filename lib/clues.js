// Deterministic clue extraction and offline link analysis.
// These run before the AI and act as guardrails the model cannot argue away.

export const BRANDS = {
  paypal: ["paypal.com"],
  amazon: ["amazon.com", "amazon.co.uk", "amazon.in", "amazon.de", "amazon.ca", "amazon.com.au"],
  apple: ["apple.com", "icloud.com"],
  usps: ["usps.com"],
  fedex: ["fedex.com"],
  dhl: ["dhl.com"],
  ups: ["ups.com"],
  netflix: ["netflix.com"],
  microsoft: ["microsoft.com", "live.com", "outlook.com", "office.com"],
  google: ["google.com", "gmail.com", "youtube.com"],
  chase: ["chase.com"],
  wellsfargo: ["wellsfargo.com"],
  bankofamerica: ["bankofamerica.com", "bofa.com"],
  irs: ["irs.gov"],
  coinbase: ["coinbase.com"],
  facebook: ["facebook.com", "fb.com", "meta.com"],
  instagram: ["instagram.com"],
  whatsapp: ["whatsapp.com"],
  binance: ["binance.com"],
};

// How to say each brand out loud (upper-case names like "AMAZON" can get spelled out by speech engines).
const BRAND_NAMES = {
  paypal: "PayPal", amazon: "Amazon", apple: "Apple", usps: "USPS", fedex: "FedEx", dhl: "DHL", ups: "UPS",
  netflix: "Netflix", microsoft: "Microsoft", google: "Google", chase: "Chase", wellsfargo: "Wells Fargo",
  bankofamerica: "Bank of America", irs: "the IRS", coinbase: "Coinbase", facebook: "Facebook",
  instagram: "Instagram", whatsapp: "WhatsApp", binance: "Binance",
};
export const brandName = (b) => BRAND_NAMES[b] || b;

const SHORTENERS = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly", "rebrand.ly", "cutt.ly", "shorturl.at", "rb.gy", "t.ly", "s.id"];
const RISKY_TLDS = ["top", "xyz", "click", "live", "shop", "icu", "buzz", "cfd", "sbs", "rest", "cyou", "monster", "quest", "support", "online", "site", "info", "vip", "work", "loan"];
const TWO_PART_SUFFIXES = ["co.uk", "com.au", "co.in", "co.jp", "com.br", "co.nz", "co.za", "com.sg", "com.mx"];

const URGENCY = /\b(urgent|immediately|within 24 hours|within \d+ hours|final notice|last chance|act now|suspended|locked|expires? (today|soon)|verify (now|your account)|unusual activity|legal action|arrest|penalty)\b/gi;
const PAYMENT = /\b(gift ?cards?|itunes card|google play card|bitcoin|crypto(currency)?|usdt|wire transfer|western union|moneygram|zelle|cash ?app|venmo|processing fee|delivery fee|small fee|upfront)\b/gi;
const CREDENTIALS = /\b(password|pin|one[- ]time (code|password)|otp|verification code|ssn|social security|card number|cvv|bank (login|details)|log ?in to (verify|confirm))\b/gi;
const TOO_GOOD = /\b(you('ve| have) won|winner|prize|free (iphone|gift)|guaranteed (income|returns?|profit)|earn \$?\d+[k]? (a|per) (day|week)|work from home|no experience needed|double your)\b/gi;

function uniq(arr) {
  return [...new Set(arr.map((x) => x.trim()).filter(Boolean))];
}

function matches(text, re) {
  return uniq((text.match(re) || []).map((m) => m.toLowerCase())).slice(0, 8);
}

export function extractClues(text) {
  const withScheme = (text.match(/\b((?:https?:\/\/|www\.)[^\s<>"')]+|(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s<>"')]*)/gi) || [])
    .map((u) => u.replace(/[.,;:!?]+$/, ""));
  // Bare domains like "netflix-accounts-hold.com" (no http, no path), skipping ones inside emails or longer links.
  const bare = [...text.matchAll(/(^|[\s(<"'])((?:[a-z0-9-]+\.)+(?:com|net|org|info|co|io|us|uk|top|xyz|click|live|shop|icu|buzz|cfd|sbs|rest|cyou|online|site|support|vip|app|link|me))(?=[\s)>"',.!?:;]|$)/gi)]
    .map((m) => m[2])
    .filter((d) => !withScheme.some((u) => u.includes(d)));
  const urls = uniq([...withScheme, ...bare]).slice(0, 10);
  const emails = uniq(text.match(/\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/g) || []).slice(0, 5);
  const phones = uniq((text.match(/(\+?\d[\d\s().-]{7,}\d)/g) || []).filter((p) => p.replace(/\D/g, "").length >= 8)).slice(0, 5);
  const money = uniq(text.match(/(?:[$€£₹]\s?\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*(?:\.\d{1,2})?\s?(?:usd|dollars|eur|gbp|inr|rupees))/gi) || []).slice(0, 6);
  const lower = text.toLowerCase();
  const brands = Object.keys(BRANDS).filter((b) => lower.replace(/\s+/g, "").includes(b)).slice(0, 5);

  return {
    urls,
    emails,
    phones,
    money,
    brands_mentioned: brands,
    urgency: matches(text, URGENCY),
    payment_requests: matches(text, PAYMENT),
    credential_requests: matches(text, CREDENTIALS),
    too_good_to_be_true: matches(text, TOO_GOOD),
  };
}

function registrableDomain(host) {
  const parts = host.split(".");
  const lastTwo = parts.slice(-2).join(".");
  return TWO_PART_SUFFIXES.includes(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
}

// Undo common character swaps used in lookalike domains (paypa1 → paypal, rn → m).
function deLeet(s) {
  return s.replace(/rn/g, "m").replace(/0/g, "o").replace(/[1!|]/g, "l").replace(/3/g, "e").replace(/5/g, "s").replace(/\$/g, "s").replace(/vv/g, "w");
}

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

export function analyzeUrl(raw) {
  const flags = [];
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`);
  } catch (_) {
    return { url: raw, risk: "medium", flags: ["Could not parse this link"] };
  }
  const host = url.hostname.toLowerCase();
  const domain = registrableDomain(host);
  const label = domain.split(".")[0];
  const tld = host.split(".").pop();
  let score = 0;
  const add = (points, flag) => { score += points; flags.push(flag); };

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) add(3, "Link points to a raw IP address instead of a website name");
  if (host.includes("xn--")) add(3, "Uses special look-alike characters (punycode)");
  if (url.username || raw.includes("@")) add(3, "Contains '@', which can hide the real destination");
  if (SHORTENERS.includes(host)) add(1, "Shortened link hides the real destination");
  if (RISKY_TLDS.includes(tld)) add(1, `Uses the .${tld} ending, which is common in scam sites`);
  if ((host.match(/-/g) || []).length >= 2) add(1, "Many hyphens in the domain, typical of fake sites");
  if (host.split(".").length >= 5) add(1, "Unusually deep subdomains");
  // A real-looking domain placed in front of the actual one, e.g. apple.com.secure-verify.info or gov.uk.claims.xyz
  const inner = host.split(".").slice(0, -2).join(".");
  if (/(^|\.)(com|gov|org|net|co)(\.[a-z]{2})?(\.|$)/.test(inner) || /-(gov|com)(\.|$)/.test(host.split(".").slice(0, -2).join("."))) {
    add(3, `Disguised address: the real website is ${domain}, not the name shown at the start`);
  }
  if (url.protocol === "http:" && /^http:/i.test(raw)) add(1, "Not encrypted (http, not https)");

  const official = Object.values(BRANDS).flat();
  if (!official.includes(domain)) {
    for (const [brand, domains] of Object.entries(BRANDS)) {
      const hostNorm = deLeet(host.replace(/[.-]/g, ""));
      const labelNorm = deLeet(label);
      if (host.includes(brand)) {
        add(3, `Mentions "${brand}" but the real site is ${domain}, not ${domains[0]}`);
        break;
      }
      if (hostNorm.includes(brand) || (brand.length >= 5 && editDistance(labelNorm, brand) <= 1)) {
        add(3, `Looks like "${domains[0]}" but is actually ${domain} (look-alike domain)`);
        break;
      }
    }
  }

  const risk = score >= 3 ? "high" : score >= 1 ? "medium" : "low";
  return { url: raw, host, domain, risk, flags: flags.length ? flags : ["No structural red flags found in the link itself"] };
}

// ---------- Phone numbers ----------

// Where each brand actually operates, to spot e.g. "USPS" texting from a foreign number.
const BRAND_COUNTRY = { usps: "US", irs: "US", chase: "US", wellsfargo: "US", bankofamerica: "US" };

const COUNTRY_CODES = [
  ["1", "US", "United States/Canada"], ["44", "GB", "United Kingdom"], ["91", "IN", "India"],
  ["234", "NG", "Nigeria"], ["63", "PH", "Philippines"], ["62", "ID", "Indonesia"], ["92", "PK", "Pakistan"],
  ["880", "BD", "Bangladesh"], ["86", "CN", "China"], ["7", "RU", "Russia/Kazakhstan"], ["233", "GH", "Ghana"],
  ["254", "KE", "Kenya"], ["27", "ZA", "South Africa"], ["61", "AU", "Australia"], ["49", "DE", "Germany"],
  ["33", "FR", "France"], ["34", "ES", "Spain"], ["55", "BR", "Brazil"], ["52", "MX", "Mexico"],
  ["971", "AE", "United Arab Emirates"], ["65", "SG", "Singapore"], ["60", "MY", "Malaysia"], ["84", "VN", "Vietnam"],
];

const US_TOLL_FREE = ["800", "833", "844", "855", "866", "877", "888"];

export function analyzePhone(raw, brands = []) {
  const digits = String(raw).replace(/\D/g, "");
  const hasPlus = /^\s*\+/.test(raw);
  const flags = [];
  let score = 0;
  let country = null;
  let local = digits;

  if (hasPlus) {
    // Longest matching prefix wins (e.g. 234 before 2x).
    const match = COUNTRY_CODES.filter(([code]) => digits.startsWith(code)).sort((a, b) => b[0].length - a[0].length)[0];
    if (match) { country = { code: match[1], name: match[2] }; local = digits.slice(match[0].length); }
  } else if (digits.length === 10 || (digits.length === 11 && digits.startsWith("1"))) {
    country = { code: "US", name: "United States/Canada (assumed)" };
    local = digits.slice(-10);
  }

  if (digits.length < 8 || digits.length > 15) { score += 1; flags.push("Unusual number length"); }
  if (country?.code === "US") {
    const area = local.slice(0, 3);
    if (area === "900") { score += 2; flags.push("900 number: premium-rate, can charge you per minute"); }
    else if (US_TOLL_FREE.includes(area)) flags.push("Toll-free number: real companies use these, but so do scam call centers");
  }
  for (const b of brands) {
    const home = BRAND_COUNTRY[b];
    if (home && country && country.code !== home) {
      score += 3;
      flags.push(`Claims to be ${b.toUpperCase()} (a ${home} organization) but the number is from ${country.name}`);
    }
  }
  const risk = score >= 3 ? "high" : score >= 1 ? "medium" : "low";
  return { number: raw, country: country?.name || "Unknown", risk, flags: flags.length ? flags : ["Nothing unusual about the number itself. Search it to check reports."] };
}
