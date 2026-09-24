// Alexa custom-skill handler: the same ScamShield checks, as a real Alexa conversation.
// Multi-turn state (call interview, quiz, pending "report it?") lives in Alexa session attributes.
// English (en-*) and Spanish (es-*) locales; devices with a screen also get a visual card.

import { scanMessage } from "./scan.js";
import { checkPhoneCall, QUESTIONS } from "./call.js";
import { scamBriefing } from "./briefing.js";
import { practiceQuiz } from "./practice.js";
import { composeWarning } from "./family.js";
import { reportLinks } from "./report.js";
import { BRANDS, brandName } from "./clues.js";
import { extractPages, searchEnabled, webSearch } from "./tavily.js";
import { bestSentences, rankPages } from "./official.js";
import { renderCard, supportsAPL } from "./alexa-apl.js";

const T = {
  en: {
    welcome: "Welcome to Scam Shield. Read me a message you got, starting with: is this a scam. You can also say: someone's on the phone, what scams are going around, or let's practice.",
    help: "You can say: is this a scam, then read the message. Or say: someone's on the phone. Or: what scams are going around. Or: let's practice. What would you like?",
    askMessage: "Sure. What does the message say?",
    askMessageReprompt: "Please read me the message, starting with: it says.",
    anythingElse: "Anything else you'd like me to check?",
    offerReport: "Want to know how to report it?",
    offerReportReprompt: "Would you like to know how to report it?",
    report: () => { const l = reportLinks("US"); return `You can report it to ${l[0].say}, or ${l[1].say}.`; },
    offerWarn: "Would you like me to write a warning you can send to family?",
    offerWarnReprompt: "Should I write a warning for your family?",
    warning: (relative, about) => composeWarning({ recipient: relative, about }).message,
    warningSpoken: (text) => `Here it is: ${text} You can send that by text.`,
    sayYesNo: "Say yes or no.",
    startQuiz: "Let's start a practice round first. Say: let's practice.",
    okayRead: "Okay. Read me the message, starting with: is this a scam.",
    no: "Okay. Stay safe!",
    bye: "Goodbye, and stay safe.",
    sorry: "Sorry, I didn't catch that.",
    checking: "One moment. I'm checking what the company's official website says.",
    fetchingNews: "One moment. I'm getting the latest scam warnings.",
    briefingFailed: "I couldn't reach the latest warnings right now. Remember: never pay with gift cards or share codes. Want me to check a message?",
    card: {
      titles: { scam: "SCAM", suspicious: "BE CAREFUL", likely_safe: "LOOKS OK" },
      callTitles: { scam: "HANG UP", suspicious: "BE CAREFUL", likely_safe: "PROBABLY OK" },
      footer: { scam: "Don't click. Don't call back. Don't pay or share codes.", suspicious: "Contact the company yourself, using its official app or website.", likely_safe: "Never share passwords or one-time codes." },
      callFooter: "Call back on a number you already trust.",
      welcomeTitle: "Scam Shield",
      welcomeItems: ["\"Is this a scam: ...\" then read the message", "\"Someone's on the phone\"", "\"What scams are going around?\""],
      quizTitle: "Scam or real?",
      quizFooter: "Say: it's a scam, or: it's real.",
    },
  },
  es: {
    welcome: "Le damos la bienvenida a Escudo Antiestafas. Léame un mensaje que recibió, empezando con: es esto una estafa. También puede decir: alguien me está llamando.",
    help: "Puede decir: es esto una estafa, y leer el mensaje. O diga: alguien me está llamando. ¿Qué le gustaría hacer?",
    askMessage: "Claro. ¿Qué dice el mensaje?",
    askMessageReprompt: "Léame el mensaje, empezando con: dice.",
    anythingElse: "¿Quiere que revise algo más?",
    offerReport: "¿Quiere saber cómo reportarlo?",
    offerReportReprompt: "¿Le digo cómo reportarlo?",
    report: () => "Puede reportarlo a la FTC en reportfraud.ftc.gov, o reenviar el mensaje de texto al 7 7 2 6.",
    offerWarn: "¿Quiere que escriba un aviso para enviarle a su familia?",
    offerWarnReprompt: "¿Escribo un aviso para su familia?",
    warning: (relative) => `Hola${relative ? ` ${relative.charAt(0).toUpperCase()}${relative.slice(1)}` : ""}, un aviso: me llegó un mensaje falso que está circulando. Si te llega, no hagas clic en el enlace, no respondas y no pagues ni compartas códigos. Las empresas reales nunca piden tarjetas de regalo ni códigos por mensaje.`,
    warningSpoken: (text) => `Aquí está: ${text} Puede enviarlo por mensaje de texto.`,
    sayYesNo: "Diga sí o no.",
    startQuiz: "Por ahora, la práctica solo está disponible en inglés. ¿Quiere que revise un mensaje?",
    okayRead: "Está bien. Léame el mensaje, empezando con: es esto una estafa.",
    no: "Está bien. ¡Cuídese!",
    bye: "Adiós, y cuídese.",
    sorry: "Perdón, no le entendí.",
    englishOnly: "Por ahora, las alertas de estafas y la práctica solo están disponibles en inglés. ¿Quiere que revise un mensaje?",
    card: {
      titles: { scam: "ESTAFA", suspicious: "CUIDADO", likely_safe: "PARECE SEGURO" },
      callTitles: { scam: "CUELGUE", suspicious: "CUIDADO", likely_safe: "PROBABLEMENTE BIEN" },
      footer: { scam: "No haga clic. No devuelva la llamada. No pague ni comparta códigos.", suspicious: "Comuníquese usted con la empresa por su app o sitio oficial.", likely_safe: "Nunca comparta contraseñas ni códigos." },
      callFooter: "Llame usted a un número de confianza.",
      welcomeTitle: "Escudo Antiestafas",
      welcomeItems: ["\"Es esto una estafa: ...\" y lea el mensaje", "\"Alguien me está llamando\""],
    },
  },
};

// Spanish phone-call interview: the same questions and reasons as lib/call.js, by question key.
const ES_QUESTIONS = {
  asked_for_code: "¿Le están pidiendo que lea o comparta un código que le acaban de enviar por mensaje o correo?",
  asked_for_unusual_payment: "¿Le piden pagar con tarjetas de regalo, criptomonedas, una transferencia, una aplicación de pagos o efectivo?",
  asked_for_remote_access: "¿Le piden instalar una aplicación o dejarles controlar su computadora o teléfono?",
  asked_to_move_money: "¿Le dicen que mueva su dinero a una cuenta nueva o segura?",
  threatened_or_rushed: "¿Le amenazan, por ejemplo con arresto, multas o cortar un servicio, o le apuran para actuar ya?",
  told_to_keep_secret: "¿Le dijeron que no cuelgue, o que no le cuente a nadie, ni a su familia ni a su banco?",
  they_called_you: "¿Ellos le llamaron a usted, en vez de usted llamar a un número de confianza?",
};
const ES_WHY = {
  asked_for_code: "ninguna empresa ni agencia real le pide que le lea un código. Ese código es la llave de su cuenta.",
  asked_for_unusual_payment: "los bancos, agencias y empresas reales nunca cobran con tarjetas de regalo, criptomonedas ni transferencias así.",
  asked_for_remote_access: "dar acceso remoto les permite vaciar sus cuentas y robar sus datos.",
  asked_to_move_money: "los bancos nunca le piden mover su dinero para protegerlo.",
  threatened_or_rushed: "la presión sirve para que no piense ni verifique.",
  told_to_keep_secret: "los estafadores le aíslan para que nadie pueda advertirle.",
  they_called_you: "el identificador de llamadas se puede falsificar.",
  "Unsolicited tech-support call": "Microsoft, Apple y las empresas de antivirus nunca le llaman sin aviso por virus o problemas en su computadora.",
  "Unexpected call from the IRS": "el IRS primero le escribe por correo y nunca exige un pago inmediato ni amenaza con arresto por teléfono.",
  "Unexpected Social Security call": "el Seguro Social no le amenaza ni exige pagos por teléfono.",
  "Suspicious caller number": "el número no coincide con quien dice ser.",
};
const FLAG_KEY = Object.fromEntries(QUESTIONS.map((q) => [q.flag, q.key]));
const esWhy = (flag) => ES_WHY[FLAG_KEY[flag.flag]] || ES_WHY[flag.flag] || "";

const escapeXml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const STRONG = /^(Hang up now\.|This looks like a scam\.|Cuelgue ahora\.|Esto parece una estafa\.)/;
const MODERATE = /^(Be careful\.|Tenga cuidado\.)/;

// Speech markup: a short pause between sentences, emphasis on the key warning, and a slightly
// slower pace when warning someone, which helps older listeners.
export function toSSML(text) {
  const warning = STRONG.test(text) || MODERATE.test(text);
  let body = escapeXml(text.slice(0, 6000))
    .replace(STRONG, '<emphasis level="strong">$1</emphasis>')
    .replace(MODERATE, '<emphasis level="moderate">$1</emphasis>')
    .replace(/([.!?])\s+(?=[A-Z"¿¡ÁÉÍÓÚÑ])/g, '$1 <break time="350ms"/> ')
    .replace(/\b7 7 2 6\b/g, '<say-as interpret-as="digits">7726</say-as>');
  if (warning) body = `<prosody rate="95%">${body}</prosody>`;
  return `<speak>${body}</speak>`;
}

function respond(text, { end = false, reprompt, attributes = {}, card } = {}) {
  return {
    version: "1.0",
    sessionAttributes: attributes,
    response: {
      outputSpeech: { type: "SSML", ssml: toSSML(text) },
      ...(end ? {} : { reprompt: { outputSpeech: { type: "PlainText", text: reprompt || "What would you like to do?" } } }),
      shouldEndSession: end,
    },
    ...(card ? { card } : {}),
  };
}

const slot = (req, name) => req.request?.intent?.slots?.[name]?.value || "";

// "One moment..." spoken right away while a slow web check runs (Alexa's Progressive Response API),
// so a listener never sits in silence. Best effort: any failure is ignored.
const ALEXA_API = /^https:\/\/api(\.(eu|fe))?\.amazonalexa\.com$/;
function progressive(body, speech) {
  const sys = body?.context?.System;
  const requestId = body?.request?.requestId;
  if (!sys?.apiAccessToken || !requestId || !ALEXA_API.test(sys.apiEndpoint || "")) return;
  fetch(`${sys.apiEndpoint}/v1/directives`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sys.apiAccessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ header: { requestId }, directive: { type: "VoicePlayer.Speak", speech } }),
    signal: AbortSignal.timeout(1500),
  }).catch(() => {});
}

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

async function checkMessage(body, ctx, message) {
  const t = T[ctx.lang];
  const r = scanMessage(message, { speak: ctx.lang });
  let speech = r.speech;
  const brand = r.brands_mentioned[0];
  if (ctx.lang === "en" && brand && BRANDS[brand] && searchEnabled() && r.verdict !== "likely_safe" && r.language === "en") {
    progressive(body, t.checking);
    const quote = await officialQuote(brand);
    if (quote) speech += ` ${quote}`;
  }
  const card = {
    kind: r.verdict,
    title: t.card.titles[r.verdict],
    subtitle: r.speech.split(/(?<=\.)\s/)[0],
    items: r.red_flags.map((f) => (!f.evidence ? f.flag : ctx.lang === "en" ? `${f.flag}: "${f.evidence}"` : `"${f.evidence}"`)),
    footer: t.card.footer[r.verdict],
  };
  if (r.verdict === "likely_safe") return respond(`${speech} ${t.anythingElse}`, { reprompt: t.anythingElse, attributes: {}, card });
  return respond(`${speech} ${t.offerReport}`, {
    reprompt: t.offerReportReprompt,
    attributes: { offer: "report", lastMessage: message.slice(0, 500) },
    card,
  });
}

function nextCallStep(ctx, call) {
  const t = T[ctx.lang];
  const r = checkPhoneCall(call);
  if (r.status === "need_answer") {
    const key = r.next_question.key;
    const question = ctx.lang === "es" ? ES_QUESTIONS[key] : r.next_question.question;
    const first = Object.keys(call.answers || {}).length === 0;
    const speech = ctx.lang === "es" ? `${first ? "Revisemos rápido. " : ""}${question}` : r.speech;
    return respond(speech, { reprompt: `${question} ${t.sayYesNo}`, attributes: { mode: "call", call: { ...call, pendingKey: key } } });
  }
  let speech = r.speech;
  if (ctx.lang === "es") {
    const why = r.flags[0] ? esWhy(r.flags[0]) : "";
    speech = {
      scam: `Cuelgue ahora. Esto es casi seguro una estafa: ${why} Si le preocupa, llame usted mismo a un número de confianza, como el que aparece en su tarjeta o en una factura.`,
      suspicious: "Tenga cuidado. Lo más seguro es colgar y llamar usted mismo a un número de confianza.",
      likely_safe: "Nada de lo que le han pedido es una señal clásica de estafa. Aun así, nunca comparta códigos ni contraseñas y, si algo le parece raro, cuelgue y llame a un número de confianza.",
    }[r.verdict];
  }
  const card = {
    kind: r.verdict,
    title: t.card.callTitles[r.verdict],
    items: r.flags.map((f) => (ctx.lang === "es" ? esWhy(f).replace(/^./, (c) => c.toUpperCase()) : f.flag)).filter(Boolean),
    footer: t.card.callFooter,
  };
  return respond(`${speech} ${t.anythingElse}`, { reprompt: t.anythingElse, attributes: {}, card });
}

function quizNext(ctx, attrs) {
  const quiz = attrs.quiz || { seen: [], score: 0, asked: 0 };
  const q = practiceQuiz({ action: "next", seen: quiz.seen });
  return respond(q.speech, {
    reprompt: "Is it a scam, or is it real?",
    attributes: { mode: "quiz", quiz: { ...quiz, id: q.id, seen: [...quiz.seen, q.id].slice(-40) } },
    card: { kind: "info", title: T.en.card.quizTitle, subtitle: q.message, footer: T.en.card.quizFooter },
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
    card: {
      kind: a.answer === "scam" ? "scam" : "likely_safe",
      title: `${a.correct ? "Right!" : "Not quite."} It was ${a.answer === "scam" ? "a scam" : "real"}.`,
      items: a.answer === "scam" ? a.red_flags.map((f) => f.flag) : [],
      footer: `Score: ${score} out of ${asked}`,
    },
  });
}

async function route(body, ctx) {
  const t = T[ctx.lang];
  const type = body?.request?.type;
  const attrs = body?.session?.attributes || {};
  if (type === "LaunchRequest") {
    return respond(t.welcome, { reprompt: t.help, card: { kind: "info", title: t.card.welcomeTitle, items: t.card.welcomeItems } });
  }
  if (type === "SessionEndedRequest") return { version: "1.0", response: {} };
  if (type !== "IntentRequest") return respond(t.help, { reprompt: t.help });

  const intent = body.request.intent.name;
  switch (intent) {
    case "CheckMessageIntent": {
      const message = slot(body, "message");
      if (!message) return respond(t.askMessage, { reprompt: t.askMessageReprompt });
      return checkMessage(body, ctx, message);
    }
    case "PhoneCallIntent": {
      const caller = slot(body, "caller");
      return nextCallStep(ctx, { caller_claims_to_be: caller, what_they_want: caller, answers: {} });
    }
    case "BriefingIntent": {
      if (ctx.lang === "es") return respond(t.englishOnly, { reprompt: t.anythingElse });
      if (searchEnabled()) progressive(body, t.fetchingNews);
      const r = await Promise.race([scamBriefing({ country: "US" }), new Promise((res) => setTimeout(() => res(null), 6000))]);
      return respond(r ? r.speech : t.briefingFailed, { reprompt: "Want me to check a message?" });
    }
    case "PracticeIntent":
      if (ctx.lang === "es") return respond(t.englishOnly, { reprompt: t.anythingElse });
      return quizNext(ctx, attrs);
    case "ScamAnswerIntent":
    case "RealAnswerIntent":
      if (attrs.mode === "quiz" && attrs.quiz?.id) return quizAnswer(attrs, intent === "ScamAnswerIntent" ? "scam" : "real");
      return respond(t.startQuiz, { reprompt: t.help });
    case "ReportIntent":
      return respond(`${t.report()} ${t.anythingElse}`, { reprompt: t.anythingElse });
    case "WarnFamilyIntent": {
      const text = t.warning(slot(body, "relative"), attrs.lastMessage || "");
      return respond(`${t.warningSpoken(text)} ${t.anythingElse}`, { reprompt: t.anythingElse });
    }
    case "AMAZON.YesIntent":
      if (attrs.mode === "call" && attrs.call?.pendingKey) {
        const { pendingKey, ...call } = attrs.call;
        return nextCallStep(ctx, { ...call, answers: { ...call.answers, [pendingKey]: true } });
      }
      if (attrs.mode === "quiz" && !attrs.quiz?.id) return quizNext(ctx, attrs);
      if (attrs.offer === "report") {
        return respond(`${t.report()} ${t.offerWarn}`, { reprompt: t.offerWarnReprompt, attributes: { offer: "warn", lastMessage: attrs.lastMessage } });
      }
      if (attrs.offer === "warn") {
        return respond(`${t.warningSpoken(t.warning("", attrs.lastMessage || ""))} ${t.anythingElse}`, { reprompt: t.anythingElse });
      }
      return respond(t.okayRead, { reprompt: t.help });
    case "AMAZON.NoIntent":
      if (attrs.mode === "call" && attrs.call?.pendingKey) {
        const { pendingKey, ...call } = attrs.call;
        return nextCallStep(ctx, { ...call, answers: { ...call.answers, [pendingKey]: false } });
      }
      return respond(t.no, { end: true });
    case "AMAZON.HelpIntent":
      return respond(t.help, { reprompt: t.help });
    case "AMAZON.StopIntent":
    case "AMAZON.CancelIntent":
      return respond(t.bye, { end: true });
    case "AMAZON.FallbackIntent":
    default:
      return respond(`${t.sorry} ${t.help}`, { reprompt: t.help });
  }
}

export async function handleAlexa(body) {
  const ctx = { lang: /^es/i.test(body?.request?.locale || "") ? "es" : "en" };
  const out = await route(body, ctx);
  const { card, ...reply } = out;
  if (card && reply.response && supportsAPL(body)) reply.response.directives = [renderCard(card)];
  return reply;
}
