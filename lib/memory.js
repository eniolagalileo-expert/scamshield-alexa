// Opt-in memory across Alexa sessions: who to warn, which bank the person uses, and an open
// "I got scammed" case to follow up on. Nothing is saved unless the person says yes (or asks,
// as in "my bank is Chase"), "forget me" deletes it all, and entries expire after 90 days.
//
// Keys are a salted SHA-256 of Alexa's userId, so the store never holds Amazon's identifier.
// Backed by Upstash Redis (REST, no dependency) when UPSTASH_REDIS_REST_URL/TOKEN are set,
// otherwise by an in-process map (for tests and local runs; lost on restart).
// The whole feature is off unless ALEXA_MEMORY=on.

import { createHash } from "node:crypto";

const TTL_SECONDS = 90 * 24 * 3600;
const BUDGET_MS = 800; // Alexa must answer quickly; a slow store just means "no memory" this turn

export const memoryEnabled = () => process.env.ALEXA_MEMORY === "on";

const keyFor = (userId) =>
  "ss:u:" + createHash("sha256").update(`${process.env.MEMORY_SALT || "scamshield"}:${userId}`).digest("hex");

const local = new Map();
const localStore = {
  async get(k) {
    const e = local.get(k);
    if (!e || e.exp < Date.now()) return null;
    return e.value;
  },
  async set(k, value) { local.set(k, { value, exp: Date.now() + TTL_SECONDS * 1000 }); },
  async del(k) { local.delete(k); },
};

function upstash(url, token) {
  const call = async (command) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(BUDGET_MS),
    });
    if (!res.ok) throw new Error(`memory store ${res.status}`);
    return (await res.json()).result;
  };
  return {
    async get(k) { const v = await call(["GET", k]); return v ? JSON.parse(v) : null; },
    async set(k, value) { await call(["SET", k, JSON.stringify(value), "EX", String(TTL_SECONDS)]); },
    async del(k) { await call(["DEL", k]); },
  };
}

const store = () => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? upstash(url.replace(/\/$/, ""), token) : localStore;
};

// All three never throw: if the store is down, the skill simply behaves as if it remembers nothing.
export async function recall(userId) {
  if (!memoryEnabled() || !userId) return {};
  try { return (await store().get(keyFor(userId))) || {}; } catch { return {}; }
}

export async function remember(userId, patch) {
  if (!memoryEnabled() || !userId) return false;
  try {
    const k = keyFor(userId);
    const s = store();
    const now = { ...((await s.get(k)) || {}), ...patch, updated: new Date().toISOString().slice(0, 10) };
    for (const [field, v] of Object.entries(now)) if (v == null) delete now[field];
    await s.set(k, now);
    return true;
  } catch { return false; }
}

export async function forget(userId) {
  if (!userId) return false;
  try { await store().del(keyFor(userId)); return true; } catch { return false; }
}
