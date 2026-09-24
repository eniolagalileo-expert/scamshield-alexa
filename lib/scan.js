// check_message: a fast, explainable scam analysis that needs no AI model.
// Each signal is a known scam tactic; the answer is phrased to be spoken aloud by a voice assistant.

import { analyzePhone, analyzeUrl, brandName, extractClues } from "./clues.js";
import { reportLinks } from "./report.js";
import { detectLanguage, localizedSpeech } from "./i18n.js";

// weight: how strongly the tactic indicates a scam. `say` is the spoken reason.
const SIGNALS = [
  {
    id: "payment_untraceable", weight: 4,
    re: /\b(gift ?cards?|itunes card|google play card|steam card|bitcoin|crypto(currency)?|usdt|wire (it|the money|transfer)|western union|moneygram)\b/gi,
    flag: "Asks for untraceable payment", say: "it asks for gift cards, crypto or a wire transfer, a classic sign of a scam",
  },
  {
    id: "fee", weight: 2,
    re: /\b(processing|delivery|redelivery|shipping|release|customs|admin(istration)?|small|one[- ]time|activation|late) (fee|charge|duty)\b|\bbiaya administrasi\b|\btasas de aduana\b|\bunpaid (toll|fee|balance)\b/gi,
    flag: "Asks for a small fee to release something", say: "it asks for a small fee to release a package, prize or loan",
  },
  {
    // Only counts when they want you to send money, not when someone mentions paying you.
    id: "p2p_payment", weight: 2,
    re: /\b(send|pay|transfer|deposit)\b(?! you\b)[^.!?]{0,40}\b(zelle|cash ?app|venmo|paypal me)\b|\b(via|by|through|with) (zelle|cash ?app|venmo)\b|\b(zelle|cash ?app|venmo) to \$/gi,
    flag: "Asks for payment by instant transfer app", say: "it wants money through an instant payment app, which is hard to get back",
  },
  {
    // Only when they ask you to hand something over, not when a message merely mentions a password reset.
    id: "credentials", weight: 4,
    re: /\b(send|reply( with)?|enter|confirm|provide|share|give|forward|tell|read|type|update|verify)\b[^.!?\n]{0,40}\b(one[- ]time (code|password)|otp|(verification|security|6-digit) code|code (we|you) (just )?(sent|received)|password|pin|ssn|social security( number)?|card (number|details)|cvv|bank (login|details)|account (details|number)|billing (details|information)|identity|kyc)\b|\bhave your [^.!?]{0,30}\b(ssn|social security number|card|bank|account number|pin|password)\b[^.!?]{0,15}\bready\b|\blog ?in to (verify|confirm)|\bverify your (identity|account)\b|\bupdate your (billing|payment|card|kyc)\b|\bKYC\b|साझा करें|contraseña/gi,
    flag: "Asks for codes, passwords or account details", say: "it asks for a code, password or account details",
  },
  {
    id: "urgency", weight: 1, max: 2,
    re: /\b(urgent(ly)?|immediately|right away|asap|within \d+ (hours?|days?)|today|final notice|last chance|act (now|fast)|expires?|suspend(ed|ion)?|locked|temporarily (locked|suspended)|permanently deleted|será devuelto|en las próximas \d+ horas|urgente|segera|तुरंत|आज)\b/gi,
    flag: "Pressure to act fast", say: "it pressures you to act fast",
  },
  {
    id: "threat", weight: 3,
    re: /\b(arrest (you|your)|(will|may|could) (be|get) (arrested|sued|prosecuted|jailed|deported)|police (will|are going to) (come|visit|arrest)|warrant (for|against) your|arrest warrant|legal action|lawsuit (filed )?against|(late )?penalty|suspension of your licen[cs]e|court (summons|date)|बंद कर दिया जाएगा)\b/gi,
    flag: "Threatens you", say: "it threatens you with arrest, penalties or account closure",
  },
  {
    id: "too_good", weight: 3,
    re: /\b(you('ve| have)? won|winner|congratulations|claim your prize|free (iphone|gift|money)|guaranteed (income|returns?|profit)|double your|earn \$?\d[\d,]* (a|per) (day|week|hour)|\$\d+ ?(a|per) day|no experience needed|pre-?approved|no credit check|selamat|memenangkan hadiah|has ganado|premio)\b/gi,
    flag: "Too good to be true", say: "it promises money or prizes that are too good to be true",
  },
  {
    id: "secrecy", weight: 4,
    re: /\b(keep (this|it) (between us|secret|confidential)|don'?t tell (anyone|your|mom|dad)|do not (tell|discuss this with)|can'?t talk|i'?m in a (meeting|board meeting))\b/gi,
    flag: "Asks for secrecy", say: "it asks you to keep it secret or says the person can't talk",
  },
  {
    id: "new_number", weight: 3,
    re: /\b(this is my new number|new number|dropped my phone|lost my phone|broke my phone|hi (mum|mom|dad))\b/gi,
    flag: "Claims to be family on a new number", say: "someone claiming to be family on a new number is asking for help",
  },
  {
    id: "off_platform", weight: 2,
    re: /\b(telegram|whats ?app|signal app|message me on|contact (our|the) hr|dm me|text me at)\b/gi,
    flag: "Moves the conversation to a private chat app", say: "it moves you to a private chat app, away from official channels",
  },
  {
    id: "overpayment", weight: 4,
    re: /\b(sent (you )?(a check|\$[\d,]+).{0,40}(over|extra|more than)|wire back|send back the difference|refund the (difference|extra)|over the asking|(accidentally|mistakenly) sent you|sent (it )?to you by mistake|send it back)\b/gi,
    flag: "Overpayment or 'sent by mistake' trick", say: "it claims to have sent you extra money and wants it sent back, a classic trick",
  },
  {
    id: "remote_access", weight: 4,
    re: /\b(your (computer|pc|device) (has been|is) (infected|hacked|compromised)|do not (restart|shut down)|call (microsoft|apple|windows) (support|certified)|remote access|anydesk|teamviewer)\b/gi,
    flag: "Fake tech support", say: "it claims your computer is infected and tells you to call for help",
  },
  {
    id: "romance_money", weight: 3,
    re: /\b(my love|my dear|sweetheart|darling|stuck at the airport|customs is holding|gold bars|inheritance)\b/gi,
    flag: "Romance or inheritance story", say: "it uses an emotional or romance story to ask for money",
  },
  {
    id: "job_equipment", weight: 3,
    re: /\b(buy (your )?(home office )?equipment|approved vendor|we'?ll send you a check|pay for (training|equipment)|task(s)? (pays?|earn)|liking (youtube )?videos)\b/gi,
    flag: "Job that asks you to pay or deposit a check", say: "the job asks you to buy equipment or deposit a check, which real employers never do",
  },
  {
    // "Didn't place this order? Call this number" - the refund/remote-access scam opener.
    id: "unauthorized_charge_call", weight: 4,
    re: /\b(if|in case) (you )?(did ?n[o']t|didn'?t|have not|haven'?t) (place|make|authori[sz]e|request|recogni[sz]e)[^.!?]{0,60}\b(call|contact|dial)\b[^.!?]{0,60}(\+?\d[\d\s().-]{7,}\d)/gi,
    flag: "Scary charge with a number to call", say: "it claims a big charge and gives you a number to call, which is how refund scammers reach you",
  },
  {
    id: "emergency_money", weight: 3,
    re: /\b(car accident|in (the )?hospital|at the police station|in jail|bail|stranded|stuck (at|in|abroad)|lost my (wallet|passport))\b[^]{0,160}\b(send|need|wire|transfer|pay)\b[^.!?]{0,40}(\$|£|€|₹|money|cash|gift ?cards?)|\b(send|need|wire|transfer)\b[^.!?]{0,30}(\$|£|€)[\d,]+[^]{0,120}\b(accident|hospital|bail|jail|stranded)\b/gi,
    flag: "Emergency story asking for money", say: "it uses an emergency story to rush you into sending money",
  },
  {
    id: "safe_account", weight: 4,
    re: /\b(move|transfer) (your|the) (money|savings|funds) to (a|another|the) (safe|secure|protected|holding)|(safe|secure) (holding )?account\b/gi,
    flag: "Asks you to move money to a 'safe account'", say: "it asks you to move your money to a so-called safe account, which banks never do",
  },
  {
    id: "robocall", weight: 3,
    re: /\b(extended warranty|final (courtesy )?notice|press 1|courtesy call|your (coverage|policy|service) (is|will be) (cancell?ed|terminated))\b/gi,
    flag: "Robocall-style pressure", say: "it uses a robocall script about warranties or final notices",
  },
  {
    id: "fake_renewal", weight: 3,
    re: /\b(auto-?renew(ed|al)?|has been renewed|will be (charged|debited))\b[^]{0,160}\b(call|contact)\b[^]{0,60}\b(cancel|refund|helpline|billing)|\bto (cancel|get a refund)[^.]{0,40}\bcall\b/gi,
    flag: "Fake renewal or invoice", say: "it claims you were charged for a renewal and tells you to call to cancel, a common refund scam",
  },
];

// Phrases genuine companies use to protect customers; they lower the score.
const REASSURANCE = [
  { re: /\b(don'?t|do not|never) share (this|the) code|will never ask (you )?for (it|your)/i, weight: -4 },
  { re: /\b(open|use) (the|your) [\w ]{0,20}app\b|call the number on the back of your card|number on your (monthly )?bill/i, weight: -3 },
  { re: /\bno action is needed|you don'?t need to do anything\b/i, weight: -3 },
  { re: /\b(you can )?safely ignore (this|it)\b|\bif you (made|requested) this\b/i, weight: -3 },
];

const MAX_EVIDENCE = 2;

function titleCase(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function joinReasons(reasons) {
  if (reasons.length <= 1) return reasons[0] || "";
  return `${reasons.slice(0, -1).join(", ")}, and ${reasons[reasons.length - 1]}`;
}

export function scanMessage(text, { country } = {}) {
  const message = String(text || "").slice(0, 4000);
  const clues = extractClues(message);
  const flags = [];
  let score = 0;

  // Links and phone numbers (offline analysis, nothing is opened or dialed).
  const links = clues.urls.map((u) => analyzeUrl(u));
  const phones = clues.phones.map((p) => analyzePhone(p, clues.brands_mentioned));
  for (const l of links) {
    if (l.risk === "high") {
      score += 5;
      flags.push({ id: "fake_link", weight: 5, flag: "Fake or disguised link", evidence: l.url, why: l.flags[l.flags.length - 1], say: `the link ${l.flags.some((f) => /look-alike|Mentions/.test(f)) ? "pretends to be a real company but goes to a different website" : "is disguised"}` });
    } else if (l.risk === "medium") {
      score += 1;
      flags.push({ id: "odd_link", weight: 1, flag: "Unusual link", evidence: l.url, why: l.flags[0], say: "the link looks unusual" });
    }
  }
  for (const p of phones) {
    if (p.risk === "high") {
      score += 3;
      flags.push({ id: "bad_phone", weight: 3, flag: "Suspicious phone number", evidence: p.number, why: p.flags[0], say: "the phone number doesn't match who they claim to be" });
    } else if (p.risk === "medium") {
      score += 1;
      flags.push({ id: "odd_phone", weight: 1, flag: "Unusual phone number", evidence: p.number, why: p.flags[0], say: "the phone number is unusual" });
    }
  }

  for (const s of SIGNALS) {
    const hits = [...new Set((message.match(s.re) || []).map((m) => m.trim()))];
    if (!hits.length) continue;
    score += s.weight * Math.min(hits.length, s.max || 1);
    flags.push({ weight: s.weight, flag: s.flag, evidence: hits.slice(0, MAX_EVIDENCE).join(" · "), say: s.say, id: s.id });
  }

  // A 2FA code message that says "don't share this code" is protective, not a request.
  let reassurance = 0;
  for (const r of REASSURANCE) if (r.re.test(message)) reassurance += r.weight;
  const hasHardFlag = links.some((l) => l.risk === "high") || phones.some((p) => p.risk === "high");
  if (!hasHardFlag) score += reassurance;
  if (reassurance < 0 && !hasHardFlag) {
    const i = flags.findIndex((f) => f.id === "credentials");
    if (i !== -1) flags.splice(i, 1);
  }

  score = Math.max(0, score);
  const verdict = score >= 5 ? "scam" : score >= 2 ? "suspicious" : "likely_safe";
  // Map the score onto a rough confidence for display; this is a heuristic, not a probability.
  const confidence = verdict === "likely_safe" ? Math.max(55, 90 - score * 15) : Math.min(97, 50 + score * 6);

  // Speak the strongest signals first; ties keep their original order.
  const ranked = [...flags].sort((a, b) => b.weight - a.weight);
  const reasons = ranked.slice(0, 2).map((f) => f.say);
  const opening = {
    scam: "This looks like a scam.",
    suspicious: "Be careful. This message has warning signs.",
    likely_safe: "I don't see signs of a scam.",
  }[verdict];
  const action = {
    scam: hasHardFlag ? "Don't click the link, don't call back, and don't pay or share anything." : "Don't reply, don't pay, and don't share any codes or details.",
    suspicious: clues.brands_mentioned.length
      ? `Don't use the link or number in the message. Contact ${brandName(clues.brands_mentioned[0])} directly through its official app or website.`
      : "Check with the person or company directly, using contact details you already trust.",
    likely_safe: "Still, never share passwords or one-time codes with anyone.",
  }[verdict];
  const englishSpeech = [opening, reasons.length ? `${titleCase(joinReasons(reasons))}.` : "", action].filter(Boolean).join(" ");
  // Answer in the language the message was written in, when we support it.
  const language = detectLanguage(message);
  const speech = localizedSpeech(language, { verdict, reasonIds: ranked.slice(0, 2).map((f) => f.id), hasHardFlag }) || englishSpeech;

  const whatToDo = verdict === "likely_safe"
    ? ["If you're unsure, contact the sender using details you already have, not ones in the message.", "Never share passwords or one-time codes."]
    : [
      hasHardFlag ? "Don't click the link or call the number in the message." : "Don't reply to the message.",
      "Don't send money, gift cards or crypto, and don't share codes or passwords.",
      clues.brands_mentioned.length ? `If you're worried, contact ${brandName(clues.brands_mentioned[0])} through its official app or website.` : "If it claims to be someone you know, call them on a number you already have.",
      "Report it, then delete it.",
    ];

  return {
    verdict,
    confidence,
    score,
    speech,
    language,
    red_flags: flags.map(({ flag, evidence, why }) => ({ flag, evidence, ...(why ? { why } : {}) })),
    links,
    phones,
    brands_mentioned: clues.brands_mentioned,
    what_to_do: whatToDo,
    report: verdict === "likely_safe" ? [] : reportLinks(country),
  };
}
