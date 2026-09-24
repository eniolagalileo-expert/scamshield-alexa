// Simulated Alexa+: voice in → ScamShield MCP tools → voice out.

import { McpClient } from "./mcp-client.js";

const $ = (s) => document.querySelector(s);

const EXAMPLES = {
  usps: "USPS: Your package is on hold due to an unpaid $1.99 redelivery fee. Pay within 24 hours or it will be returned to sender: https://usps.com-track-redelivery.top/pkg",
  grandkid: "Grandma it's me, please don't tell mom and dad. I was in a car accident and I'm at the police station. I need $3,000 for bail right now. Please hurry, you can pay with gift cards.",
  bank: "Chase Alert: Unusual activity detected on your account. Your account has been temporarily locked. Verify your identity now to avoid suspension: http://chase-secure-verify.online/login. Reply with the one-time code we sent you.",
  real: "Your Google verification code is 482913. Don't share this code with anyone. Google will never ask you for it.",
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

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => /Samantha|Google US English|Aria|Jenny/i.test(v.name)) || voices.find((v) => v.lang?.startsWith("en")) || null;
}

function speak(text) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
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

// ---------- The "Alexa+" turn ----------
async function handleUtterance(utterance) {
  const text = utterance.trim();
  if (!text) return;
  say("user", text);
  setState("thinking", "Checking with ScamShield…");

  try {
    let reply;
    if (wantsReport(text) && text.length < 80) {
      const r = await mcp.callTool("how_to_report_scam", { country });
      renderReport(r.data.links);
      reply = r.speech;
    } else {
      const message = extractMessage(text) || text;
      const r = await mcp.callTool("check_message", { message, country });
      lastResult = r.data;
      renderDetails(r.data);
      reply = r.speech;

      // Like an agent would: confirm with the real company's own website when one is impersonated.
      const brand = r.data.brands_mentioned?.[0];
      if (brand && r.data.verdict !== "likely_safe") {
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
      if (r.data.verdict !== "likely_safe") reply += " Want to know how to report it?";
    }
    say("bot", reply);
    await speak(reply);
  } catch (err) {
    const msg = `Sorry, I couldn't reach ScamShield. ${err.message}`;
    say("bot", msg);
    await speak(msg);
  }
  setState("idle", "Tap the mic and ask");
  if (lastResult && lastResult.verdict !== "likely_safe") showFollowUp();
}

function showFollowUp() {
  $("#hint").innerHTML = `Say <em>"How do I report it?"</em>, or <button type="button" class="link" id="report-btn">tap here</button>.`;
  $("#report-btn").onclick = () => handleUtterance("How do I report it?");
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
  handleUtterance(t.toLowerCase().startsWith("alexa") ? t : `Alexa, is this a scam? ${t}`);
});

document.querySelectorAll("[data-ex]").forEach((b) =>
  b.addEventListener("click", () => handleUtterance(`Alexa, is this a scam? I got a text saying: ${EXAMPLES[b.dataset.ex]}`))
);

// Load voices early (Chrome populates them asynchronously).
if ("speechSynthesis" in window) speechSynthesis.getVoices();
