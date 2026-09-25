import { test } from "node:test";
import assert from "node:assert/strict";
import { handleAlexa } from "../lib/alexa.js";
import { recall } from "../lib/memory.js";

const USER = "amzn1.ask.account.TEST-USER";
const req = (request, attributes = {}, locale = "en-US") => ({
  version: "1.0",
  session: { attributes, user: { userId: USER } },
  request: { locale, timestamp: new Date().toISOString(), ...request },
});
const intent = (name, slots = {}, attributes = {}, locale) =>
  req({ type: "IntentRequest", intent: { name, slots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, { name: k, value: v }])) } }, attributes, locale);
const say = (r) => r.response.outputSpeech.ssml.replace(/<[^>]+>/g, "").replace(/\s{2,}/g, " ").trim();

test("memory is off unless ALEXA_MEMORY=on: nothing is offered or saved", async () => {
  delete process.env.ALEXA_MEMORY;
  const r = await handleAlexa(intent("WarnFamilyIntent", { relative: "maria" }));
  assert.doesNotMatch(say(r), /remember/i);
  const b = await handleAlexa(intent("RememberBankIntent", { bank: "chase" }));
  assert.match(say(b), /don't keep any information/);
  assert.deepEqual(await recall(USER), {});
});

test("with consent: remembers who to warn, the bank, and follows up on a recovery case", async () => {
  process.env.ALEXA_MEMORY = "on";
  try {
    // Who to warn: offered, saved only after "yes", then used without naming them.
    const w1 = await handleAlexa(intent("WarnFamilyIntent", { relative: "maria" }));
    assert.match(say(w1), /Want me to remember Maria/);
    const w2 = await handleAlexa(intent("AMAZON.YesIntent", {}, w1.sessionAttributes));
    assert.match(say(w2), /I'll remember Maria/);
    const w3 = await handleAlexa(intent("WarnFamilyIntent"));
    assert.match(say(w3), /Maria/);
    assert.doesNotMatch(say(w3), /Want me to remember/);

    // The bank: asked for explicitly, then used in a phone-call verdict.
    const b = await handleAlexa(intent("RememberBankIntent", { bank: "chase" }));
    assert.match(say(b), /Got it: Chase/);
    const c1 = await handleAlexa(intent("PhoneCallIntent", { caller: "my bank" }));
    const c2 = await handleAlexa(intent("AMAZON.YesIntent", {}, c1.sessionAttributes));
    assert.match(say(c2), /Hang up now.*Call Chase yourself/);

    // Recovery: offered a check-in, and asked about it at the next launch.
    const r1 = await handleAlexa(intent("RecoveryIntent", { what: "a gift card" }));
    assert.match(say(r1), /check in about this next time/);
    const r2 = await handleAlexa(intent("AMAZON.YesIntent", {}, r1.sessionAttributes));
    assert.match(say(r2), /I'll ask how it went/);
    const l1 = await handleAlexa(req({ type: "LaunchRequest" }));
    assert.match(say(l1), /Welcome back.*paid with a gift card.*Did you reach the company that issued the gift card\?/);
    const n = await handleAlexa(intent("AMAZON.NoIntent", {}, l1.sessionAttributes));
    assert.match(say(n), /first step again: Contact the company/);
    assert.equal(n.response.shouldEndSession, false);
    const l2 = await handleAlexa(req({ type: "LaunchRequest" }));
    const y = await handleAlexa(intent("AMAZON.YesIntent", {}, l2.sessionAttributes));
    assert.match(say(y), /won't ask about it again/);
    const l3 = await handleAlexa(req({ type: "LaunchRequest" }));
    assert.match(say(l3), /^Welcome to Scam Shield/);

    // "Forget me" deletes everything.
    const f = await handleAlexa(intent("ForgetMeIntent"));
    assert.match(say(f), /forgotten everything/);
    assert.deepEqual(await recall(USER), {});
  } finally {
    delete process.env.ALEXA_MEMORY;
  }
});

test("declining keeps nothing, and Spanish works too", async () => {
  process.env.ALEXA_MEMORY = "on";
  try {
    const w1 = await handleAlexa(intent("WarnFamilyIntent", { relative: "pedro" }, {}, "es-US"));
    assert.match(say(w1), /recuerde a Pedro/);
    const w2 = await handleAlexa(intent("AMAZON.NoIntent", {}, w1.sessionAttributes, "es-US"));
    assert.match(say(w2), /no lo guardaré/);
    assert.equal(w2.response.shouldEndSession, false);
    assert.deepEqual(await recall(USER), {});
  } finally {
    delete process.env.ALEXA_MEMORY;
  }
});
