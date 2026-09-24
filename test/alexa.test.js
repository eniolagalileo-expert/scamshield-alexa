import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { handleAlexa } from "../lib/alexa.js";
import { isValidCertUrl } from "../lib/alexa-verify.js";

const intent = (name, slots = {}, attributes = {}) => ({
  version: "1.0",
  session: { attributes },
  request: { type: "IntentRequest", timestamp: new Date().toISOString(), intent: { name, slots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, { name: k, value: v }])) } },
});
// The visible words of an SSML response (tags removed, entities decoded).
const speech = (r) => r.response.outputSpeech.ssml.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s{2,}/g, " ").trim();

test("launch greets and keeps the session open", async () => {
  const r = await handleAlexa({ version: "1.0", request: { type: "LaunchRequest" } });
  assert.match(speech(r), /^Welcome to Scam Shield/);
  assert.equal(r.response.shouldEndSession, false);
});

test("check a message, then 'yes' gives report channels, then 'yes' writes a family warning", async () => {
  const r1 = await handleAlexa(intent("CheckMessageIntent", { message: "USPS your package is on hold pay the 1.99 redelivery fee within 24 hours at usps.com-track-redelivery.top" }));
  assert.match(speech(r1), /^This looks like a scam\./);
  assert.match(speech(r1), /Want to know how to report it\?$/);
  const r2 = await handleAlexa(intent("AMAZON.YesIntent", {}, r1.sessionAttributes));
  assert.match(speech(r2), /report it to the FTC/);
  const r3 = await handleAlexa(intent("AMAZON.YesIntent", {}, r2.sessionAttributes));
  assert.match(speech(r3), /fake delivery text/);
});

test("phone call interview over several turns", async () => {
  const r1 = await handleAlexa(intent("PhoneCallIntent", { caller: "he's from my bank" }));
  assert.match(speech(r1), /code/);
  const r2 = await handleAlexa(intent("AMAZON.YesIntent", {}, r1.sessionAttributes));
  assert.match(speech(r2), /^Hang up now/);
});

test("practice quiz: question, answer, score", async () => {
  const q = await handleAlexa(intent("PracticeIntent"));
  assert.match(speech(q), /Is it a scam, or is it real\?$/);
  const a = await handleAlexa(intent("ScamAnswerIntent", {}, q.sessionAttributes));
  assert.match(speech(a), /That's [01] out of 1\. Want another one\?$/);
});

test("stop ends the session", async () => {
  const r = await handleAlexa(intent("AMAZON.StopIntent"));
  assert.equal(r.response.shouldEndSession, true);
});

test("only Amazon's S3 echo.api certificate URLs are accepted", () => {
  assert.equal(isValidCertUrl("https://s3.amazonaws.com/echo.api/echo-api-cert.pem"), true);
  assert.equal(isValidCertUrl("https://s3.amazonaws.com:443/echo.api/echo-api-cert.pem"), true);
  assert.equal(isValidCertUrl("https://s3.amazonaws.com/echo.api/../evil/cert.pem"), false);
  assert.equal(isValidCertUrl("http://s3.amazonaws.com/echo.api/cert.pem"), false);
  assert.equal(isValidCertUrl("https://evil.com/echo.api/cert.pem"), false);
  assert.equal(isValidCertUrl("https://s3.amazonaws.com:563/echo.api/cert.pem"), false);
});

test("the endpoint rejects unsigned requests", async () => {
  const PORT = 4881;
  const proc = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", TAVILY_API_KEY: "" }, stdio: "pipe" });
  try {
    await new Promise((resolve, reject) => {
      proc.stdout.on("data", (d) => String(d).includes("MCP server") && resolve());
      proc.on("exit", (code) => reject(new Error(`server exited ${code}`)));
    });
    const res = await fetch(`http://127.0.0.1:${PORT}/alexa`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(intent("AMAZON.HelpIntent")) });
    assert.equal(res.status, 400);
  } finally {
    proc.kill();
  }
});

test("caller phrases are cleaned before being spoken back", async () => {
  const { cleanClaim } = await import("../lib/call.js");
  assert.equal(cleanClaim("he's from my bank"), "my bank");
  assert.equal(cleanClaim("saying they are with the IRS"), "the IRS");
  assert.equal(cleanClaim("she is calling from Microsoft"), "Microsoft");
  assert.equal(cleanClaim("my bank"), "my bank");
  const r1 = await handleAlexa(intent("PhoneCallIntent", { caller: "he's from my bank" }));
  const r2 = await handleAlexa(intent("AMAZON.YesIntent", {}, r1.sessionAttributes));
  assert.match(speech(r2), /call your bank back/);
});

test("responses use SSML with emphasis, pauses and escaping", async () => {
  const { toSSML } = await import("../lib/alexa.js");
  const ssml = toSSML("Hang up now. This is almost certainly a scam. Forward it to 7 7 2 6. A & B <c>");
  assert.match(ssml, /^<speak><prosody rate="95%"><emphasis level="strong">Hang up now\.<\/emphasis>/);
  assert.match(ssml, /<break time="350ms"\/>/);
  assert.match(ssml, /<say-as interpret-as="digits">7726<\/say-as>/);
  assert.match(ssml, /A &amp; B &lt;c&gt;/);
  assert.doesNotMatch(toSSML("Welcome to Scam Shield."), /prosody/);
});

const withDevice = (req, { apl = false, locale } = {}) => ({
  ...req,
  request: { ...req.request, requestId: "req-1", ...(locale ? { locale } : {}) },
  context: { System: { apiEndpoint: "https://api.amazonalexa.com", apiAccessToken: "test-token", device: { supportedInterfaces: apl ? { "Alexa.Presentation.APL": { runtime: { maxVersion: "2024.3" } } } : {} } } },
});

test("screen devices get a verdict card; voice-only devices don't", async () => {
  const msg = { message: "USPS your package is on hold pay the 1.99 redelivery fee within 24 hours at usps.com-track-redelivery.top" };
  const show = await handleAlexa(withDevice(intent("CheckMessageIntent", msg), { apl: true }));
  const [d] = show.response.directives;
  assert.equal(d.type, "Alexa.Presentation.APL.RenderDocument");
  assert.equal(d.datasources.card.title, "SCAM");
  assert.match(d.datasources.card.items[0], /usps\.com-track-redelivery\.top/);
  const echo = await handleAlexa(withDevice(intent("CheckMessageIntent", msg)));
  assert.equal(echo.response.directives, undefined);
  assert.equal(echo.card, undefined);
});

test("Spanish locale: the whole conversation is in Spanish", async () => {
  const es = (r) => withDevice(r, { locale: "es-US" });
  const launch = await handleAlexa(es({ version: "1.0", request: { type: "LaunchRequest" } }));
  assert.match(speech(launch), /Escudo Antiestafas/);
  const r1 = await handleAlexa(es(intent("CheckMessageIntent", { message: "USPS su paquete está retenido pague la tarifa en usps punto com guion entrega punto top barra pkg hoy" })));
  assert.match(speech(r1), /^Esto parece una estafa\./);
  assert.match(r1.response.outputSpeech.ssml, /<emphasis level="strong">Esto parece una estafa\.<\/emphasis>/);
  const r2 = await handleAlexa(es(intent("AMAZON.YesIntent", {}, r1.sessionAttributes)));
  assert.match(speech(r2), /reportfraud\.ftc\.gov/);
  const c1 = await handleAlexa(es(intent("PhoneCallIntent", { caller: "dice que es de mi banco" })));
  assert.match(speech(c1), /código/);
  const c2 = await handleAlexa(es(intent("AMAZON.YesIntent", {}, c1.sessionAttributes)));
  assert.match(speech(c2), /^Cuelgue ahora\./);
});

test("slow web checks send a 'one moment' progressive response first", async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => { calls.push({ url: String(url), opts }); return new Response("{}"); };
  const hadKey = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "test";
  try {
    await handleAlexa(withDevice(intent("CheckMessageIntent", { message: "USPS: your package is on hold. Pay the $1.99 redelivery fee within 24 hours at usps.com-track-redelivery.top" })));
    const pr = calls.find((c) => c.url === "https://api.amazonalexa.com/v1/directives");
    assert.ok(pr, "progressive response sent");
    assert.equal(JSON.parse(pr.opts.body).directive.type, "VoicePlayer.Speak");
    assert.equal(pr.opts.headers.Authorization, "Bearer test-token");
  } finally {
    globalThis.fetch = realFetch;
    if (hadKey === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = hadKey;
  }
});

test("progressive responses only go to Amazon's API", async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); return new Response("{}"); };
  try {
    const req = withDevice(intent("BriefingIntent"));
    req.context.System.apiEndpoint = "https://evil.example.com";
    await handleAlexa(req);
    assert.ok(!calls.some((u) => u.includes("evil.example.com")));
  } finally {
    globalThis.fetch = realFetch;
  }
});
