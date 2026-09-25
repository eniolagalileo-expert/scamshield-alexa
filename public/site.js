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
    if (data.recent === false) $("h-alerts").textContent = "Official scam warnings";
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

// "I already paid, clicked or shared something": pick what happened, get the steps in order.
const recovery = { picked: [] };
async function loadRecoveryOptions() {
  const { data } = await mcp.callTool("scam_recovery", {});
  $("recover-options").replaceChildren(...data.options.map((o) => {
    const b = el("button", o.label, { type: "button", "aria-pressed": "false", "data-key": o.key });
    b.addEventListener("click", () => toggleRecovery(b));
    return b;
  }));
}
async function toggleRecovery(button) {
  const key = button.dataset.key;
  const on = button.getAttribute("aria-pressed") !== "true";
  button.setAttribute("aria-pressed", String(on));
  recovery.picked = on ? [...recovery.picked, key] : recovery.picked.filter((k) => k !== key);
  const plan = $("recover-plan");
  if (!recovery.picked.length) return plan.replaceChildren();
  try {
    // The server puts the most urgent situation first (e.g. remote access before a payment).
    const order = [...$("recover-options").children].map((b) => b.dataset.key);
    const situations = [...recovery.picked].sort((a, b) => order.indexOf(a) - order.indexOf(b)).slice(0, 3);
    const { data } = await mcp.callTool("scam_recovery", { situations });
    plan.replaceChildren(...data.situations.map((p) => {
      const box = el("div", null, { class: "plan" });
      box.append(el("h3", p.label));
      const ol = el("ol");
      for (const step of p.steps) ol.append(el("li", step));
      box.append(ol);
      return box;
    }));
    const report = el("p");
    report.append("Report it, even if you got your money back: ", el("a", "ReportFraud.ftc.gov", { href: data.report, target: "_blank", rel: "noopener" }), ".");
    plan.append(report);
  } catch (err) {
    plan.replaceChildren(el("p", "We couldn't load the steps right now. Call your bank or card company using the number on the back of your card, and report it at ReportFraud.ftc.gov."));
  }
}
$("recover-link").addEventListener("click", () => $("recover-options").querySelector("button")?.focus({ preventScroll: true }));

// Screenshot or QR code: read on this device (never uploaded), then checked like a pasted message.
// A QR code's link is checked without opening it.
const loadScript = (src) => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) return resolve();
  const s = el("script", null, { src, crossorigin: "anonymous" });
  s.onload = resolve;
  s.onerror = () => reject(new Error(`Couldn't load ${src}`));
  document.head.append(s);
});

async function readQR(bitmap) {
  if ("BarcodeDetector" in window) {
    try {
      const codes = await new BarcodeDetector({ formats: ["qr_code"] }).detect(bitmap);
      if (codes[0]?.rawValue) return codes[0].rawValue;
    } catch (_) { /* fall back to jsQR */ }
  }
  await loadScript("https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js");
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = el("canvas", null, { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return window.jsQR(img.data, img.width, img.height)?.data || "";
}

async function readText(file) {
  await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js");
  const worker = await window.Tesseract.createWorker(["eng", "spa"]);
  try {
    const { data } = await worker.recognize(file);
    // Rejoin links that wrap onto the next line ("usps.com-track-\nredelivery.top").
    return data.text.replace(/[ \t]+/g, " ").replace(/(\S[-/])\n(?=[a-z0-9])/g, "$1").replace(/\n{2,}/g, "\n").trim();
  } finally {
    await worker.terminate();
  }
}

async function checkImage(file) {
  const status = $("image-status");
  const btn = $("image-btn");
  btn.dataset.label ||= btn.textContent;
  setBusy(btn, true, "Reading the picture…");
  status.hidden = false;
  status.textContent = "Looking for a QR code…";
  try {
    const bitmap = await createImageBitmap(file);
    const qr = await readQR(bitmap).catch(() => "");
    if (qr) {
      status.textContent = `This QR code leads to: ${qr.slice(0, 200)}. We haven't opened it. Checking it now…`;
      $("message").value = qr.slice(0, 4000);
      await checkMessage(qr.slice(0, 4000));
      status.textContent = `This QR code leads to: ${qr.slice(0, 200)}. We didn't open it.`;
      return;
    }
    status.textContent = "Reading the text in the picture, on your device. The first time takes a few seconds…";
    const text = await readText(file);
    if (text.length < 8) {
      status.textContent = "We couldn't find any text or QR code in that picture. Try a clearer screenshot, or type the message in.";
      return;
    }
    status.textContent = "Here's the text we read from your screenshot. You can fix any mistakes and check it again.";
    $("message").value = text.slice(0, 4000);
    await checkMessage(text.slice(0, 4000));
  } catch (err) {
    status.textContent = "We couldn't read that picture. Please type or paste the message instead.";
  } finally {
    setBusy(btn, false, true);
    $("image-input").value = "";
  }
}
$("image-btn").addEventListener("click", () => $("image-input").click());
$("image-input").addEventListener("change", () => {
  const file = $("image-input").files?.[0];
  if (file) checkImage(file);
});

// Shared from the phone's share menu (installed app), or a link like /?text=...
const params = new URLSearchParams(location.search);
const shared = [params.get("text"), params.get("title"), params.get("url")].filter(Boolean).join(" ").trim();
if (shared) {
  $("message").value = shared.slice(0, 4000);
  history.replaceState(null, "", "/");
  checkMessage($("message").value);
}

// A screenshot shared from the phone's share menu: the service worker kept it for us.
if (params.get("image") && "caches" in window) {
  history.replaceState(null, "", "/");
  caches.open("scamshield-share").then(async (c) => {
    const r = await c.match("/shared-image");
    await c.delete("/shared-image");
    if (r) checkImage(await r.blob());
  }).catch(() => {});
}

loadAlerts();
loadRecoveryOptions().catch(() => {});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
