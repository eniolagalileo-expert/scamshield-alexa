// Simulated Alexa+: voice in → ScamShield MCP tools → voice out.

import { McpClient } from "../mcp-client.js";

const $ = (s) => document.querySelector(s);

const EXAMPLES = {
  usps: "USPS: Your package is on hold due to an unpaid $1.99 redelivery fee. Pay within 24 hours or it will be returned to sender: https://usps.com-track-redelivery.top/pkg",
  grandkid: "Grandma it's me, please don't tell mom and dad. I was in a car accident and I'm at the police station. I need $3,000 for bail right now. Please hurry, you can pay with gift cards.",
  bank: "Chase Alert: Unusual activity detected on your account. Your account has been temporarily locked. Verify your identity now to avoid suspension: http://chase-secure-verify.online/login. Reply with the one-time code we sent you.",
  real: "Your Google verification code is 482913. Don't share this code with anyone. Google will never ask you for it.",
  spanish: "Correos: Su paquete está retenido por falta de pago de 1,79 EUR en tasas de aduana. Pague en las próximas 24 horas o será devuelto: https://correos-envios-pago.top/es",
};

const VERDICT_UI = {
  scam: { label: "🚨 Scam", cls: "scam" },
  suspicious: { label: "⚠️ Suspicious", cls: "suspicious" },
  likely_safe: { label: "✅ Likely safe", cls: "safe" },
};

const country = ((navigator.language || "").split("-")[1] || "US").toUpperCase();
let lastResult = null;

// ---------- MCP activity log ----------
const callRows = new Map();
const mcp = new McpClient("/mcp", { onCall: renderCall });

function renderCall(call) {
  const list = $("#calls");
  list.querySelector(".muted")?.remove();
  let row = callRows.get(call);
  if (!row) {
    row = document.createElement("li");
    callRows.set(call, row);
    list.prepend(row);
  }
  const args = JSON.stringify(call.args);
  row.className = `call ${call.status}`;
  row.innerHTML = `
    <div><code class="tool">tools/call → ${escapeHtml(call.name)}</code>
      <span class="status">${call.status === "running" ? "…" : call.status === "ok" ? `✔ ${call.ms} ms` : `✖ ${escapeHtml(call.error || "error")}`}</span></div>
    <code class="args">${escapeHtml(args.length > 140 ? `${args.slice(0, 140)}…"}` : args)}</code>`;
}

// ---------- Device state & chat ----------
function setState(state, label) {
  $("#device").dataset.state = state;
  $("#state-label").textContent = label;
}

function say(role, text) {
  const li = document.createElement("li");
  li.className = role;
  li.textContent = text;
  $("#chat").append(li);
  li.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function pickVoice(lang = "en") {
  const voices = speechSynthesis.getVoices();
  if (lang === "en") return voices.find((v) => /Samantha|Google US English|Aria|Jenny/i.test(v.name)) || voices.find((v) => v.lang?.startsWith("en")) || null;
  return voices.find((v) => v.lang?.toLowerCase().startsWith(lang)) || null;
}

function speak(text, lang = "en") {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = { en: "en-US", es: "es-ES", hi: "hi-IN", id: "id-ID" }[lang] || "en-US";
    const voice = pickVoice(lang);
    if (voice) u.voice = voice;
    u.rate = 1;
    u.onend = u.onerror = resolve;
    setState("speaking", "Speaking…");
    speechSynthesis.speak(u);
  });
}

// ---------- Understanding the request ----------
// Strip the wake word and the lead-in so only the received message is checked.
function extractMessage(utterance) {
  return utterance
    .replace(/^\s*(hey\s+|ok\s+)?alexa[,.]?\s*/i, "")
    .replace(/^(is this (a )?scam|can you check (this|a) (message|text)|check this( message| text)?|scam check)[?:,.]?\s*/i, "")
    .replace(/^(i (got|received) (a |an )?(text|message|email|call|dm)( that says| saying| from [^:]+)?[:,]?\s*)/i, "")
    .trim();
}

const wantsReport = (u) => /\b(report|who do i tell|where do i tell)\b/i.test(u);
const wantsBriefing = (u) => /\b(what|which|any) (new |recent )?scams?\b.*\b(going around|out there|lately|these days|right now|this week)|\bscam (news|alerts?|briefing|update)\b/i.test(u);
const onACall = (u) => /\b(on the (phone|line)|(is |are )?calling me|(someone|somebody|a man|a woman|a guy) (is )?(call(ing|ed)|on the phone)|a (phone )?call from|caller)\b/i.test(u);
const familyTarget = (u) => (u.match(/\b(?:warn|tell|let|message|text)\s+(?:my\s+)?(mom|mum|mother|dad|father|son|daughter|grandson|granddaughter|grandma|grandpa|wife|husband|sister|brother|family|friend)\b/i) || [])[1];
const YES = /^(yes|yeah|yep|yup|uh huh|they are|they did|he is|she is|he did|she did|correct|right|true)\b/i;
const NO = /^(no|nope|nah|not really|they aren'?t|they didn'?t|he isn'?t|she isn'?t|he didn'?t|she didn'?t)\b/i;
const wantsPractice = (u) => /\b(practice|quiz me|let'?s (play|practice)|test me|train me)\b/i.test(u);
const isCommand = (u) => wantsPractice(u) ||  wantsReport(u) || wantsBriefing(u) || onACall(u) || familyTarget(u) || YES.test(u) || NO.test(u);

let quiz = null; // { id, seen, score, asked }
let callSession = null; // { caller_claims_to_be, what_they_want, answers, pendingKey }
let lastMessage = "";

// "The caller says he's from my bank and wants..." → "my bank"
function callerClaim(u) {
  const m = u.match(/\b(?:from|(?:says|saying) (?:he|she|they|it)(?:'s| is| are) (?:from )?|claims? to be (?:from )?|pretending to be (?:from )?)((?:my|the) [\w ]{2,25}?|[A-Z][\w&]+(?: [A-Z][\w&]+)?)(?=[,.]| and| who| asking| saying| wants|$)/);
  return m ? m[1].trim() : "";
}

// ---------- The "Alexa+" turn ----------
async function handleUtterance(utterance) {
  const text = utterance.trim();
  if (!text) return;
  say("user", text);
  setState("thinking", "Checking with ScamShield…");

  try {
    let reply;
    let lang = "en";
    if (quiz?.id && !wantsPractice(text) && /\b(scam|fake|fraud|real|legit|genuine|safe|not a scam)\b/i.test(text)) {
      const r = await mcp.callTool("practice_quiz", { action: "answer", id: quiz.id, guess: text });
      quiz.asked++; if (r.data.correct) quiz.score++;
      quiz.id = null;
      renderQuiz(r.data);
      reply = r.speech.replace("Want another one?", `That's ${quiz.score} out of ${quiz.asked}. Want another one?`);
    } else if (wantsPractice(text) || (quiz && /^(yes|yeah|sure|ok|okay|another|next|go on)\b/i.test(text))) {
      quiz ??= { seen: [], score: 0, asked: 0 };
      const r = await mcp.callTool("practice_quiz", { action: "next", seen: quiz.seen });
      quiz.id = r.data.id; quiz.seen.push(r.data.id);
      renderQuiz(null);
      reply = r.speech;
    } else if (callSession && (YES.test(text) || NO.test(text))) {
      reply = await continueCall(YES.test(text));
    } else if (onACall(text)) {
      callSession = { caller_claims_to_be: callerClaim(text), what_they_want: extractMessage(text), answers: {} };
      reply = await continueCall(null);
    } else if (wantsBriefing(text)) {
      const r = await mcp.callTool("scam_briefing", { country });
      renderBriefing(r.data.items || []);
      reply = r.speech;
    } else if (familyTarget(text)) {
      const r = await mcp.callTool("warn_family", { recipient: familyTarget(text), about: lastMessage || text });
      renderWarning(r.data);
      reply = r.speech;
    } else if (wantsReport(text) && text.length < 80) {
      const r = await mcp.callTool("how_to_report_scam", { country });
      renderReport(r.data.links);
      reply = r.speech;
    } else {
      const message = extractMessage(text) || text;
      lastMessage = message;
      callSession = null;
      quiz = null;
      const r = await mcp.callTool("check_message", { message, country });
      lastResult = r.data;
      renderDetails(r.data);
      reply = r.speech;
      lang = r.data.language || "en";

      // Like an agent would: confirm with the real company's own website when one is impersonated.
      const brand = r.data.brands_mentioned?.[0];
      if (brand && r.data.verdict !== "likely_safe" && lang === "en") {
        try {
          const o = await mcp.callTool("verify_with_official_source", {
            company: brand,
            question: `does ${brand} send texts or emails asking for payment, codes or personal details`,
          });
          if (o.data.official_url) {
            reply += ` ${o.speech}`;
            renderOfficial(o.data);
          }
        } catch (_) { /* web check is optional */ }
      }
      const REPORT_OFFER = { en: "Want to know how to report it?", es: "¿Quiere saber cómo denunciarlo?", hi: "क्या आप जानना चाहते हैं कि इसकी रिपोर्ट कैसे करें?", id: "Mau tahu cara melaporkannya?" };
      if (r.data.verdict !== "likely_safe") reply += ` ${REPORT_OFFER[lang] || REPORT_OFFER.en}`;
    }
    say("bot", reply);
    await speak(reply, lang);
  } catch (err) {
    const msg = `Sorry, I couldn't reach ScamShield. ${err.message}`;
    say("bot", msg);
    await speak(msg);
  }
  setState("idle", callSession ? "Answer yes or no" : quiz?.id ? "Scam or real?" : "Tap the mic and ask");
  if (quiz?.id) showQuizAnswers();
  else if (quiz) showQuizNext();
  else if (callSession) showCallAnswers();
  else if (lastResult && lastResult.verdict !== "likely_safe") showFollowUp();
}

// One step of the guided phone-call interview.
async function continueCall(answer) {
  if (callSession.pendingKey && answer !== null) callSession.answers[callSession.pendingKey] = answer;
  const { pendingKey, ...args } = callSession;
  const r = await mcp.callTool("check_phone_call", args);
  if (r.data.status === "need_answer") {
    callSession.pendingKey = r.data.next_question.key;
  } else {
    renderCallVerdict(r.data);
    lastResult = { verdict: r.data.verdict };
    callSession = null;
  }
  return r.speech;
}

function showQuizAnswers() {
  $("#hint").innerHTML = `Say <em>"scam"</em> or <em>"real"</em>, or tap: <button type="button" class="link" id="q-scam">Scam</button> · <button type="button" class="link" id="q-real">Real</button>`;
  $("#q-scam").onclick = () => handleUtterance("It's a scam");
  $("#q-real").onclick = () => handleUtterance("It's real");
}

function showQuizNext() {
  $("#hint").innerHTML = `Say <em>"another one"</em>, or <button type="button" class="link" id="q-next">tap for the next message</button>.`;
  $("#q-next").onclick = () => handleUtterance("Another one");
}

function renderQuiz(result) {
  $("#details-panel").hidden = false;
  if (!result) {
    $("#details").innerHTML = `<h3>🎓 Practice: scam or real?</h3><p class="muted">Listen to the message and decide.</p><p class="official">Score: ${quiz.score} / ${quiz.asked}</p>`;
    return;
  }
  const flags = (result.red_flags || []).map((f) => `<li><strong>${escapeHtml(f.flag)}</strong><q>${escapeHtml(f.evidence)}</q></li>`).join("");
  $("#details").innerHTML = `<h3>🎓 Practice: ${result.correct ? "✅ Correct" : "❌ Not quite"}</h3>
    <p>It was <strong>${result.answer === "scam" ? "a scam" : "a real message"}</strong>. Score: ${quiz.score} / ${quiz.asked}</p>
    ${flags ? `<ul class="flags">${flags}</ul>` : ""}`;
}

function showCallAnswers() {
  $("#hint").innerHTML = `Say <em>"yes"</em> or <em>"no"</em>, or tap: <button type="button" class="link" id="yes-btn">Yes</button> · <button type="button" class="link" id="no-btn">No</button>`;
  $("#yes-btn").onclick = () => handleUtterance("Yes");
  $("#no-btn").onclick = () => handleUtterance("No");
}

function showFollowUp() {
  $("#hint").innerHTML = `Say <em>"How do I report it?"</em> or <em>"Warn my mom"</em>, or tap: <button type="button" class="link" id="report-btn">Report it</button> · <button type="button" class="link" id="warn-btn">Warn my mom</button>`;
  $("#report-btn").onclick = () => handleUtterance("How do I report it?");
  $("#warn-btn").onclick = () => handleUtterance("Warn my mom about this");
}

// ---------- Details panel ----------
function renderDetails(d) {
  const v = VERDICT_UI[d.verdict];
  $("#details-panel").hidden = false;
  $("#details").innerHTML = `
    <div class="verdict ${v.cls}">${v.label} <small>${d.confidence}% confident</small></div>
    ${d.red_flags.length ? `<ul class="flags">${d.red_flags.map((f) => `<li><strong>${escapeHtml(f.flag)}</strong><q>${escapeHtml(f.evidence)}</q>${f.why ? `<small>${escapeHtml(f.why)}</small>` : ""}</li>`).join("")}</ul>` : ""}
    <h3>What to do</h3>
    <ol class="todo">${d.what_to_do.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ol>
    <div id="official"></div><div id="report"></div>`;
}

function renderOfficial(o) {
  const quote = o.key_points?.length ? o.key_points.join(" ") : o.title;
  $("#official").innerHTML = `<h3>🏛️ From the official website</h3>
    <p class="official"><q>${escapeHtml(quote)}</q> <a href="${escapeHtml(o.official_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(new URL(o.official_url).hostname)} ↗</a></p>`;
}

function renderCallVerdict(d) {
  const v = VERDICT_UI[d.verdict];
  $("#details-panel").hidden = false;
  $("#details").innerHTML = `
    <div class="verdict ${v.cls}">📞 ${v.label}</div>
    ${d.flags.length ? `<ul class="flags">${d.flags.map((f) => `<li><strong>${escapeHtml(f.flag)}</strong><small>${escapeHtml(f.why)}</small></li>`).join("")}</ul>` : ""}
    <h3>What to do</h3>
    <ol class="todo">${d.what_to_do.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ol>
    <div id="report"></div>`;
}

function renderBriefing(items) {
  $("#details-panel").hidden = false;
  $("#details").innerHTML = `<h3>📰 Recent official scam warnings</h3>
    <ul class="report">${items.map((i) => `<li><a href="${escapeHtml(i.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(i.headline)}</a> <small>${escapeHtml(i.source)}${i.published ? ` · ${escapeHtml(i.published)}` : ""}</small></li>`).join("")}</ul>`;
}

function renderWarning(d) {
  $("#details-panel").hidden = false;
  const box = $("#warning") || (() => { $("#details").insertAdjacentHTML("beforeend", '<div id="warning"></div>'); return $("#warning"); })();
  box.innerHTML = `<h3>👨‍👩‍👧 Warning to send${d.recipient ? ` to ${escapeHtml(d.recipient)}` : ""}</h3><p class="official"><q>${escapeHtml(d.message)}</q></p>`;
}

function renderReport(links) {
  if (!$("#report")) {
    $("#details-panel").hidden = false;
    $("#details").insertAdjacentHTML("beforeend", '<div id="report"></div>');
  }
  $("#report").innerHTML = `<h3>📣 Report it</h3><ul class="report">${links.map((l) => l.url
    ? `<li><a href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.name)} ↗</a></li>`
    : `<li>${escapeHtml(l.name)}</li>`).join("")}</ul>`;
}

// ---------- Input: voice, typing, examples ----------
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;

$("#mic").addEventListener("click", () => {
  if (!Recognition) {
    $("#hint").textContent = "Voice input isn't supported in this browser. Type or paste the message below instead.";
    $("#typed").focus();
    return;
  }
  if (recognizer) { recognizer.stop(); return; }
  speechSynthesis.cancel();
  recognizer = new Recognition();
  recognizer.lang = navigator.language || "en-US";
  recognizer.interimResults = true;
  recognizer.continuous = false;
  let finalText = "";
  setState("listening", "Listening…");
  $("#mic").classList.add("on");
  recognizer.onresult = (e) => {
    finalText = [...e.results].map((r) => r[0].transcript).join(" ");
    $("#state-label").textContent = `“${finalText.slice(-60)}”`;
  };
  recognizer.onerror = () => setState("idle", "Didn't catch that. Tap to try again");
  recognizer.onend = () => {
    recognizer = null;
    $("#mic").classList.remove("on");
    if (finalText) handleUtterance(finalText);
    else setState("idle", "Tap the mic and ask");
  };
  recognizer.start();
});

$("#type-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = $("#typed").value;
  $("#typed").value = "";
  handleUtterance(/^\s*alexa\b/i.test(t) || isCommand(t) ? t : `Alexa, is this a scam? ${t}`);
});

document.querySelectorAll("[data-ex]").forEach((b) =>
  b.addEventListener("click", () => handleUtterance(`Alexa, is this a scam? I got a text saying: ${EXAMPLES[b.dataset.ex]}`))
);
document.querySelectorAll("[data-say]").forEach((b) => b.addEventListener("click", () => handleUtterance(b.dataset.say)));

// Load voices early (Chrome populates them asynchronously).
if ("speechSynthesis" in window) speechSynthesis.getVoices();
