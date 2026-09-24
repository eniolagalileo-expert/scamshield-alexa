// Alexa custom-skill handler: the same ScamShield checks, as a real Alexa conversation.
// Multi-turn state (call interview, quiz, pending "report it?") lives in Alexa session attributes.

import { scanMessage } from "./scan.js";
import { checkPhoneCall } from "./call.js";
import { scamBriefing } from "./briefing.js";
import { practiceQuiz } from "./practice.js";
import { composeWarning } from "./family.js";
import { reportLinks } from "./report.js";
import { BRANDS, brandName } from "./clues.js";
import { extractPages, searchEnabled, webSearch } from "./tavily.js";
import { bestSentences, rankPages } from "./official.js";

const WELCOME = "Welcome to Scam Shield. Read me a message you got, starting with: is this a scam. You can also say: someone's on the phone, what scams are going around, or let's practice.";
const HELP = "You can say: is this a scam, then read the message. Or say: someone's on the phone. Or: what scams are going around. Or: let's practice. What would you like?";

const escapeXml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Speech markup: a short pause between sentences, emphasis on the key warning, and a slightly
// slower pace when warning someone, which helps older listeners.
export function toSSML(text) {
  const warning = /^(Hang up now|This looks like a scam|Be careful)/.test(text);
  let body = escapeXml(text.slice(0, 6000))
    .replace(/^(Hang up now\.|This looks like a scam\.)/, '<emphasis level="strong">$1</emphasis>')
    .replace(/^(Be careful\.)/, '<emphasis level="moderate">$1</emphasis>')
    .replace(/([.!?])\s+(?=[A-Z"])/g, '$1 <break time="350ms"/> ')
    .replace(/\b7 7 2 6\b/g, '<say-as interpret-as="digits">7726</say-as>');
  if (warning) body = `<prosody rate="95%">${body}</prosody>`;
  return `<speak>${body}</speak>`;
}

function respond(text, { end = false, reprompt, attributes = {} } = {}) {
  return {
    version: "1.0",
    sessionAttributes: attributes,
    response: {
      outputSpeech: { type: "SSML", ssml: toSSML(text) },
      ...(end ? {} : { reprompt: { outputSpeech: { type: "PlainText", text: reprompt || "What would you like to do?" } } }),
      shouldEndSession: end,
    },
  };
}

const slot = (req, name) => req.request?.intent?.slots?.[name]?.value || "";

// Quick official-source quote for an impersonated brand; skipped if it can't answer in time.
async function officialQuote(brand, budgetMs = 3500) {
  if (!searchEnabled() || !BRANDS[brand]) return "";
  const work = (async () => {
    const found = await webSearch(`${brandName(brand)} scam text email phishing smishing`, { includeDomains: BRANDS[brand] });
    const candidates = rankPages(found.results, BRANDS[brand]).slice(0, 2);
    if (!candidates.length) return "";
    const pages = await extractPages(candidates.map((c) => c.url), `does ${brand} send texts asking for payment or codes`);
    for (const c of candidates) {
      const best = bestSentences(pages.find((p) => p.url === c.url)?.content || c.content || "", 1);
      if (best.length) return `${brandName(brand).replace(/^the /, "The ")}'s official website says: ${best[0]}`;
    }
    return "";
  })().catch(() => "");
  return Promise.race([work, new Promise((r) => setTimeout(() => r(""), budgetMs))]);
}

async function checkMessage(message, attrs) {
  const r = scanMessage(message);
  let speech = r.speech;
  const brand = r.brands_mentioned[0];
  if (brand && r.verdict !== "likely_safe" && r.language === "en") {
    const quote = await officialQuote(brand);
    if (quote) speech += ` ${quote}`;
  }
  if (r.verdict === "likely_safe") return respond(`${speech} Anything else you'd like me to check?`, { reprompt: "Anything else?", attributes: {} });
  return respond(`${speech} Want to know how to report it?`, {
    reprompt: "Would you like to know how to report it?",
    attributes: { offer: "report", lastMessage: message.slice(0, 500) },
  });
}

function nextCallStep(call) {
  const r = checkPhoneCall(call);
  if (r.status === "need_answer") {
    return respond(r.speech, { reprompt: `${r.next_question.question} Say yes or no.`, attributes: { mode: "call", call: { ...call, pendingKey: r.next_question.key } } });
  }
  return respond(`${r.speech} Is there anything else?`, { reprompt: "Anything else?", attributes: {} });
}

function quizNext(attrs) {
  const quiz = attrs.quiz || { seen: [], score: 0, asked: 0 };
  const q = practiceQuiz({ action: "next", seen: quiz.seen });
  return respond(q.speech, {
    reprompt: "Is it a scam, or is it real?",
    attributes: { mode: "quiz", quiz: { ...quiz, id: q.id, seen: [...quiz.seen, q.id].slice(-40) } },
  });
}

function quizAnswer(attrs, guess) {
  const quiz = attrs.quiz;
  const a = practiceQuiz({ action: "answer", id: quiz.id, guess });
  const score = quiz.score + (a.correct ? 1 : 0);
  const asked = quiz.asked + 1;
  return respond(a.speech.replace("Want another one?", `That's ${score} out of ${asked}. Want another one?`), {
    reprompt: "Want another one?",
    attributes: { mode: "quiz", quiz: { ...quiz, id: null, score, asked } },
  });
}

export async function handleAlexa(body) {
  const type = body?.request?.type;
  const attrs = body?.session?.attributes || {};
  if (type === "LaunchRequest") return respond(WELCOME, { reprompt: HELP });
  if (type === "SessionEndedRequest") return { version: "1.0", response: {} };
  if (type !== "IntentRequest") return respond(HELP, { reprompt: HELP });

  const intent = body.request.intent.name;
  switch (intent) {
    case "CheckMessageIntent": {
      const message = slot(body, "message");
      if (!message) return respond("Sure. What does the message say?", { reprompt: "Please read me the message, starting with: it says." });
      return checkMessage(message, attrs);
    }
    case "PhoneCallIntent": {
      const caller = slot(body, "caller");
      return nextCallStep({ caller_claims_to_be: caller, what_they_want: caller, answers: {} });
    }
    case "BriefingIntent": {
      const r = await Promise.race([scamBriefing({ country: "US" }), new Promise((res) => setTimeout(() => res(null), 6000))]);
      return respond(r ? r.speech : "I couldn't reach the latest warnings right now. Remember: never pay with gift cards or share codes. Want me to check a message?", { reprompt: "Want me to check a message?" });
    }
    case "PracticeIntent":
      return quizNext(attrs);
    case "ScamAnswerIntent":
    case "RealAnswerIntent":
      if (attrs.mode === "quiz" && attrs.quiz?.id) return quizAnswer(attrs, intent === "ScamAnswerIntent" ? "scam" : "real");
      return respond("Let's start a practice round first. Say: let's practice.", { reprompt: HELP });
    case "ReportIntent": {
      const links = reportLinks("US");
      return respond(`You can report it to ${links[0].say}, or ${links[1].say}. Is there anything else?`, { reprompt: "Anything else?" });
    }
    case "WarnFamilyIntent": {
      const w = composeWarning({ recipient: slot(body, "relative"), about: attrs.lastMessage || "" });
      return respond(`${w.speech.replace(/ Should I send it\?$/, "")} You can send that to them by text. Anything else?`, { reprompt: "Anything else?" });
    }
    case "AMAZON.YesIntent":
      if (attrs.mode === "call" && attrs.call?.pendingKey) {
        const { pendingKey, ...call } = attrs.call;
        return nextCallStep({ ...call, answers: { ...call.answers, [pendingKey]: true } });
      }
      if (attrs.mode === "quiz" && !attrs.quiz?.id) return quizNext(attrs);
      if (attrs.offer === "report") {
        const links = reportLinks("US");
        return respond(`You can report it to ${links[0].say}, or ${links[1].say}. Would you like me to write a warning you can send to family?`, {
          reprompt: "Should I write a warning for your family?", attributes: { offer: "warn", lastMessage: attrs.lastMessage },
        });
      }
      if (attrs.offer === "warn") {
        const w = composeWarning({ about: attrs.lastMessage || "" });
        return respond(`Here it is: ${w.message} You can send that by text. Anything else?`, { reprompt: "Anything else?" });
      }
      return respond("Okay. Read me the message, starting with: is this a scam.", { reprompt: HELP });
    case "AMAZON.NoIntent":
      if (attrs.mode === "call" && attrs.call?.pendingKey) {
        const { pendingKey, ...call } = attrs.call;
        return nextCallStep({ ...call, answers: { ...call.answers, [pendingKey]: false } });
      }
      return respond("Okay. Stay safe!", { end: true });
    case "AMAZON.HelpIntent":
      return respond(HELP, { reprompt: HELP });
    case "AMAZON.StopIntent":
    case "AMAZON.CancelIntent":
      return respond("Goodbye, and stay safe.", { end: true });
    case "AMAZON.FallbackIntent":
    default:
      return respond(`Sorry, I didn't catch that. ${HELP}`, { reprompt: HELP });
  }
}
