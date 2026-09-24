// check_phone_call: a guided, stateless interview for "someone is on the phone right now".
// The assistant passes what it knows so far; the tool returns either the next question to ask
// or a verdict. Designed to be fast: at most a few yes/no questions, the most decisive first.

import { analyzePhone, brandName } from "./clues.js";

// Each question: what it tests, how to ask it out loud, and how much a "yes" means.
export const QUESTIONS = [
  { key: "asked_for_code", ask: "Are they asking you to read out or share a code that was just texted or emailed to you?", yes: 10, flag: "Asked for a one-time code", why: "No real company or agency ever asks you to read them a code. That code is the key to your account." },
  { key: "asked_for_unusual_payment", ask: "Are they asking you to pay with gift cards, crypto, a wire transfer, a payment app, or cash?", yes: 10, flag: "Asked for gift cards, crypto, wire or app payment", why: "Real banks, agencies and companies never take payment this way." },
  { key: "asked_for_remote_access", ask: "Are they asking you to install an app or let them control your computer or phone?", yes: 9, flag: "Asked for remote access", why: "Giving remote access lets them empty accounts and steal data." },
  { key: "asked_to_move_money", ask: "Are they telling you to move your money to a new or 'safe' account?", yes: 10, flag: "Told to move money to a 'safe account'", why: "Banks never ask you to move money to protect it." },
  { key: "threatened_or_rushed", ask: "Are they threatening you, like arrest, fines or cutting off service, or rushing you to act right now?", yes: 5, flag: "Threats or pressure", why: "Pressure is used to stop you from thinking or checking." },
  { key: "told_to_keep_secret", ask: "Did they tell you not to hang up, or not to tell anyone, including family or your bank?", yes: 6, flag: "Told to keep it secret or stay on the line", why: "Scammers isolate you so no one can warn you." },
  { key: "they_called_you", ask: "Did they call you, rather than you calling a number you already trust?", yes: 2, flag: "Unexpected incoming call", why: "Caller ID can be faked; an unexpected call proves nothing about who they are." },
];

// Organizations that never make unsolicited calls like this: saying so is decisive and teaches the user.
const NEVER_CALL = [
  { re: /microsoft|windows|apple|icloud|geek squad|tech support|soporte t[eé]cnico|norton|mcafee/i, flag: "Unsolicited tech-support call", why: "Microsoft, Apple and antivirus companies never call you out of the blue about viruses or problems with your computer.", score: 9 },
  { re: /\birs\b|tax|impuestos/i, flag: "Unexpected call from the IRS", why: "The IRS contacts you by mail first, and never demands immediate payment or threatens arrest by phone.", score: 5 },
  { re: /social security|seguro social|\bssa\b/i, flag: "Unexpected Social Security call", why: "Social Security won't threaten you, suspend your number, or demand payment by phone.", score: 5 },
];

// Ask the most relevant question first, based on who is calling and what they said.
const CONTEXT_ORDER = [
  { re: /microsoft|windows|apple|computer|computadora|virus|hack|tech|t[eé]cnico|laptop|internet/i, first: ["asked_for_remote_access", "asked_for_unusual_payment"] },
  { re: /bank|banco|card|tarjeta|account|cuenta|fraud|paypal|venmo|zelle|chase|wells/i, first: ["asked_for_code", "asked_to_move_money"] },
  { re: /irs|tax|impuestos|police|polic[ií]a|sheriff|court|corte|jury|warrant|social security|seguro social|government|gobierno|immigration|inmigraci[oó]n/i, first: ["asked_for_unusual_payment", "threatened_or_rushed"] },
  { re: /grand|son|daughter|nephew|niece|family|accident|jail|hospital|niet[oa]|hij[oa]|sobrin[oa]|familia|accidente|c[aá]rcel/i, first: ["asked_for_unusual_payment", "told_to_keep_secret"] },
];

const DECIDE_AT = 9;      // a single strong signal is enough to say "hang up"
const MAX_QUESTIONS = 4;  // keep the interview short for voice

// "he's from my bank" / "saying they are with the IRS" -> "my bank" / "the IRS"
export function cleanClaim(raw) {
  return String(raw || "")
    .trim()
    .replace(/^(saying|says|claiming|claims)\s+/i, "")
    .replace(/^(dice|dicen|dijo) que (es|son|era|eran)\s+/i, "")
    .replace(/^(es|son)\s+(de|del)\s+/i, "$2 ")
    .replace(/^de(l)?\s+/i, (m, l) => (l ? "el " : ""))
    .replace(/^(he|she|they|it|someone|a man|a woman|a guy)(\s*'s|\s*'re|\s+is|\s+are|\s+was|\s+were|\s+says|\s+said)?\s+/i, "")
    .replace(/^(calling|call(ed)?|ringing)\s+/i, "")
    .replace(/^(from|with|at|for)\s+/i, "")
    .trim();
}

export function checkPhoneCall({ caller_claims_to_be: rawClaim = "", what_they_want: want = "", caller_number: number = "", answers = {} } = {}) {
  const claim = cleanClaim(rawClaim);
  const brand = String(claim).toLowerCase().replace(/[^a-z]/g, "");
  const flags = [];
  let score = 0;

  // Free-text description can already answer some questions.
  const text = `${want}`.toLowerCase();
  const inferred = {
    asked_for_code: /\b(code|otp|pin|verification|password|6 digits?|c[oó]digo|contrase[nñ]a)\b/.test(text) || undefined,
    asked_for_unusual_payment: /\b(gift ?cards?|tarjetas? de regalo|bitcoin|crypto|cripto\w*|wire|transferencia|western union|zelle|cash ?app|venmo|prepaid)\b/.test(text) || undefined,
    asked_for_remote_access: /\b(anydesk|teamviewer|remote|install|download|control (my|your) (computer|phone|screen))\b/.test(text) || undefined,
    asked_to_move_money: /\b(move|transfer)\b.*\b(safe|secure|new|holding) account\b/.test(text) || undefined,
    threatened_or_rushed: /\b(arrest|warrant|police|fine|lawsuit|deport|shut ?off|disconnect|suspend|immediately|right now|arresto|multa|deportar|ahora mismo|inmediatamente)\b/.test(text) || undefined,
  };
  const known = { ...inferred, ...Object.fromEntries(Object.entries(answers).filter(([, v]) => typeof v === "boolean")) };

  for (const q of QUESTIONS) {
    if (known[q.key] === true) {
      score += q.yes;
      flags.push({ flag: q.flag, why: q.why });
    }
  }

  const context = `${claim} ${want}`;
  const known_org = NEVER_CALL.find((n) => n.re.test(context));
  if (known_org) {
    score += known_org.score;
    flags.unshift({ flag: known_org.flag, why: known_org.why });
  }

  let phone = null;
  if (number) {
    phone = analyzePhone(number, brand ? [brand] : []);
    if (phone.risk === "high") {
      score += 4;
      flags.push({ flag: "Suspicious caller number", why: phone.flags[0] });
    }
  }

  const asked = Object.keys(answers).length;
  const priority = (CONTEXT_ORDER.find((c) => c.re.test(context)) || { first: [] }).first;
  const unanswered = QUESTIONS
    .filter((q) => known[q.key] === undefined)
    .sort((a, b) => (priority.includes(b.key) ? 1 : 0) - (priority.includes(a.key) ? 1 : 0) || priority.indexOf(a.key) - priority.indexOf(b.key));
  const who = claim ? (brandName(brand) !== brand ? brandName(brand) : String(claim).replace(/\bmy\b/gi, "your")) : "the caller";

  if (score < DECIDE_AT && unanswered.length && asked < MAX_QUESTIONS) {
    const next = unanswered[0];
    return {
      status: "need_answer",
      next_question: { key: next.key, question: next.ask },
      speech: `${asked === 0 ? "Let's check quickly. " : ""}${next.ask}`,
      flags,
    };
  }

  const verdict = score >= DECIDE_AT ? "scam" : score >= 4 ? "suspicious" : "likely_safe";
  const speech = {
    scam: `Hang up now. This is almost certainly a scam: ${flags[0].why} If you're worried, call ${who === "the caller" ? "the company" : who} back using a number you already trust, ${/bank|card|credit|chase|wells|paypal/i.test(context) ? "like the one on the back of your card" : "from their official website or a bill"}.`,
    suspicious: `Be careful. ${flags.map((f) => f.flag.toLowerCase()).join(", and ")}. It's safest to hang up and call ${who === "the caller" ? "them" : who} back on a number you already trust.`,
    likely_safe: `Nothing they've asked for is a classic scam sign. Still, never share codes or passwords, and if anything feels off, hang up and call back on a number you trust.`,
  }[verdict];

  return {
    status: "done",
    verdict,
    speech,
    flags,
    ...(phone ? { phone } : {}),
    what_to_do: verdict === "likely_safe"
      ? ["Never share codes or passwords.", "If unsure, hang up and call back on a number you already trust."]
      : ["Hang up. It's not rude.", "Don't share codes, passwords or card details, and don't pay anything.", "Call the real organization using a number from your card, bill or its official website.", "If you already shared details or paid, call your bank right away."],
  };
}
