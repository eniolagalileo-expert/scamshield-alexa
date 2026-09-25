// ScamShield website: a real MCP client. Every check goes through the same MCP tools that Alexa+,
// the Alexa skill and AI assistants use.
import { McpClient } from "/mcp-client.js";

const mcp = new McpClient("/mcp", { name: "scamshield-web" });
const $ = (id) => document.getElementById(id);

const EXAMPLES = {
  usps: "USPS: Your package is on hold due to an unpaid $1.99 redelivery fee. Pay within 24 hours or it will be returned to sender: https://usps.com-track-redelivery.top/pkg",
  grandkid: "Grandma it's me, please don't tell mom and dad. I was in a car accident and I'm at the police station. I need $3,000 for bail right now. Please hurry, you can pay with gift cards.",
  bank: "Chase Alert: Unusual activity detected on your account. Your account has been temporarily locked. Verify your identity now to avoid suspension: http://chase-secure-verify.online/login. Reply with the one-time code we sent you.",
  real: "Your Google verification code is 482913. Don't share this code with anyone. Google will never ask you for it.",
  spanish: "Su cuenta del banco fue bloqueada. Envíe el código que le mandamos por mensaje para verificar su identidad hoy mismo.",
};

const VERDICTS = {
  scam: { title: "This looks like a scam", cls: "scam" },
  suspicious: { title: "Be careful", cls: "suspicious" },
  likely_safe: { title: "No signs of a scam", cls: "safe" },
};
// Headings for answers given in Spanish (the spoken answer already follows the message's language).
const TITLES_ES = { scam: "Esto parece una estafa", suspicious: "Tenga cuidado", likely_safe: "No veo señales de estafa" };
// The heading already states the verdict, so the same opening sentence isn't repeated under it.
const OPENINGS = /^(This looks like a scam|Be careful|I don't see signs of a scam|Hang up now|Esto parece una estafa|Tenga cuidado|No veo señales de estafa|Cuelgue ahora)\.\s*/i;

// The reporting links a person needs depend on where they live; guess from the browser, default to the US.
const SUPPORTED = ["US", "GB", "IN", "CA", "AU"];
const region = (navigator.languages || [navigator.language || "en-US"]).map((l) => l.split("-")[1]?.toUpperCase()).find((r) => SUPPORTED.includes(r));
const COUNTRY = region || "US";

let lastMessage = "";
let lastLang = "en";

function el(tag, text, attrs = {}) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  if (label) button.textContent = busy ? label : button.dataset.label;
}

async function checkMessage(message) {
  lastMessage = message;
  const btn = $("check-btn");
  btn.dataset.label ||= btn.textContent;
  setBusy(btn, true, "Checking…");
  $("call").hidden = true;
  try {
    const { speech, data } = await mcp.callTool("check_message", { message, country: COUNTRY });
    renderResult(speech, data);
    if (data.brands_mentioned?.[0] && data.verdict !== "likely_safe") officialCheck(data.brands_mentioned[0], data);
  } catch (err) {
    showError(err);
  } finally {
    setBusy(btn, false, true);
  }
}

function renderResult(speech, data) {
  const v = VERDICTS[data.verdict] || VERDICTS.suspicious;
  lastLang = data.language || "en";
  $("verdict").className = `verdict ${v.cls}`;
  $("verdict-title").textContent = (lastLang === "es" && TITLES_ES[data.verdict]) || v.title;
  $("verdict-title").lang = lastLang === "es" ? "es" : "en";
  $("verdict-speech").textContent = speech;
  $("verdict-speech").lang = lastLang;
  $("verdict-speech").dataset.speak = speech;
  $("verdict-speech").textContent = speech.replace(OPENINGS, "");

  const flags = $("flags");
  flags.replaceChildren();
  for (const f of data.red_flags || []) {
    const li = el("li");
    li.append(el("strong", f.flag));
    if (f.evidence) li.append(el("span", ` "${f.evidence}"`, { class: "evidence" }));
    if (f.why) li.append(el("div", f.why, { class: "why" }));
    flags.append(li);
  }
  if (!flags.children.length) flags.append(el("li", "Nothing that asks you to pay, click a link, or share a code."));

  const todo = $("todo");
  todo.replaceChildren(...(data.what_to_do || []).map((t) => el("li", t)));

  const report = $("report");
  report.replaceChildren();
  for (const r of data.report || []) {
    const li = el("li");
    if (r.url) li.append(el("a", r.name, { href: r.url, target: "_blank", rel: "noopener" }));
    else li.textContent = r.name;
    report.append(li);
  }
  report.previousElementSibling.hidden = !report.children.length;
  $("warn-btn").hidden = data.verdict === "likely_safe";
  $("warn").hidden = true;
  $("official").hidden = true;

  $("result").hidden = false;
  $("result").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function officialCheck(company, data) {
  const topic = (data.red_flags || []).find((f) => f.evidence && !/[./]/.test(f.evidence))?.evidence || "scam text message";
  const official = $("official");
  official.textContent = "Checking what the company's official website says…";
  official.hidden = false;
  try {
    const name = company.length <= 4 ? company.toUpperCase() : company.charAt(0).toUpperCase() + company.slice(1);
    const { speech, data: d } = await mcp.callTool("verify_with_official_source", {
      company, topic, question: `Does ${name} send texts or emails asking for payment, codes or personal details?`,
    });
    if (d.clear_statement && d.official_url) {
      official.replaceChildren(el("span", speech + " "), el("a", "Source", { href: d.official_url, target: "_blank", rel: "noopener" }));
    } else official.hidden = true;
  } catch (_) {
    official.hidden = true;
  }
}

function speak(text, lang) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = { es: "es-US", hi: "hi-IN", id: "id-ID" }[lang] || "en-US";
  u.rate = 0.95;
  speechSynthesis.speak(u);
}

async function warnFamily() {
  const btn = $("warn-btn");
  btn.disabled = true;
  try {
    const { data } = await mcp.callTool("warn_family", { about: lastMessage.slice(0, 400) });
    $("warn-text").textContent = data.message;
    $("warn").hidden = false;
  } catch (err) {
    showError(err);
  } finally {
    btn.disabled = false;
  }
}

// "Someone is calling me now": a short yes/no interview, one question at a time.
let call = null;
async function callStep() {
  const { speech, data } = await mcp.callTool("check_phone_call", call);
  if (data.status === "need_answer") {
    call.pendingKey = data.next_question.key;
    $("call-question").textContent = data.next_question.question;
    $("call-q").hidden = false;
    $("call-verdict").hidden = true;
    return;
  }
  const v = VERDICTS[data.verdict] || VERDICTS.suspicious;
  $("call-q").hidden = true;
  $("call-verdict").className = `verdict ${v.cls}`;
  $("call-verdict-title").textContent = data.verdict === "scam" ? "Hang up now" : v.title;
  $("call-verdict-speech").textContent = speech.replace(OPENINGS, "");
  $("call-verdict").hidden = false;
}

function showError(err) {
  $("verdict").className = "verdict suspicious";
  $("verdict-title").textContent = "Something went wrong";
  $("verdict-speech").textContent = /Too many/i.test(err.message)
    ? "Too many checks in a short time. Please wait a minute and try again."
    : "We couldn't check that right now. Please try again in a moment. If you're worried, don't click anything and contact the company directly.";
  for (const id of ["flags", "todo", "report"]) $(id).replaceChildren();
  $("result").hidden = false;
}

async function loadAlerts() {
  const list = $("alerts-list");
  try {
    const { data } = await mcp.callTool("scam_briefing", { country: COUNTRY });
    if (!data.items?.length) throw new Error("none");
    list.replaceChildren(...data.items.map((it) => {
      const li = el("li");
      li.append(el("a", it.headline, { href: it.url, target: "_blank", rel: "noopener" }));
      li.append(el("span", ` ${it.source}${it.published ? ` · ${it.published}` : ""}`, { class: "muted" }));
      return li;
    }));
  } catch (_) {
    list.replaceChildren(el("li", "Couldn't load the latest warnings right now. The golden rule still applies: never pay with gift cards, and never share a code someone texted you."));
  }
}

$("check-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const message = $("message").value.trim();
  if (message) checkMessage(message);
});
document.querySelectorAll("[data-ex]").forEach((b) => b.addEventListener("click", () => {
  $("message").value = EXAMPLES[b.dataset.ex];
  checkMessage(EXAMPLES[b.dataset.ex]);
}));
$("speak-btn").addEventListener("click", () => speak($("verdict-speech").dataset.speak || $("verdict-speech").textContent, lastLang));
$("warn-btn").addEventListener("click", warnFamily);
$("copy-btn").addEventListener("click", async () => {
  await navigator.clipboard?.writeText($("warn-text").textContent);
  $("copy-btn").textContent = "Copied";
});
$("share-btn").addEventListener("click", async () => {
  const text = $("warn-text").textContent;
  if (navigator.share) await navigator.share({ text }).catch(() => {});
  else location.href = `sms:?&body=${encodeURIComponent(text)}`;
});
$("call-btn").addEventListener("click", () => {
  $("result").hidden = true;
  $("call").hidden = false;
  $("call-q").hidden = true;
  $("call-verdict").hidden = true;
  $("call").scrollIntoView({ behavior: "smooth", block: "start" });
  $("caller").focus();
});
$("call-start").addEventListener("submit", async (e) => {
  e.preventDefault();
  const who = $("caller").value.trim();
  call = { caller_claims_to_be: who, what_they_want: who, answers: {} };
  await callStep().catch(showError);
});
document.querySelectorAll("[data-answer]").forEach((b) => b.addEventListener("click", async () => {
  if (!call?.pendingKey) return;
  call.answers[call.pendingKey] = b.dataset.answer === "yes";
  delete call.pendingKey;
  await callStep().catch(showError);
}));

// Shared from the phone's share menu (installed app), or a link like /?text=...
const params = new URLSearchParams(location.search);
const shared = [params.get("text"), params.get("title"), params.get("url")].filter(Boolean).join(" ").trim();
if (shared) {
  $("message").value = shared.slice(0, 4000);
  history.replaceState(null, "", "/");
  checkMessage($("message").value);
}

loadAlerts();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
