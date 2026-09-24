// practice_quiz: "Alexa, let's practice spotting scams." Stateless: `next` returns a message to read out,
// `answer` checks the guess and explains the tells. Uses the hand-written development sets (not the held-out tests).

import { readFileSync } from "node:fs";
import { scanMessage } from "./scan.js";

const SETS = ["dev-a", "dev-b", "dev-c"];
// Short, readable messages only; long ones are hard to follow by ear.
const ITEMS = SETS.flatMap((s) => JSON.parse(readFileSync(new URL(`../eval/${s}.json`, import.meta.url))))
  .filter((d) => d.text.length <= 260 && !/[ऀ-ॿ]/.test(d.text))
  .map((d) => ({ id: d.id, label: d.label, type: d.type, text: d.text.replace(/^From: [^\n]+\n/, "") }));

export const quizSize = () => ITEMS.length;

const article = (word) => (/^[aeiou]/i.test(word) ? "an" : "a");

function pick(seen, prefer) {
  const pool = ITEMS.filter((i) => !seen.includes(i.id) && (!prefer || i.label === prefer));
  const from = pool.length ? pool : ITEMS.filter((i) => !seen.includes(i.id));
  return (from.length ? from : ITEMS)[Math.floor(Math.random() * (from.length || ITEMS.length))];
}

export function practiceQuiz({ action = "next", id, guess, seen = [] } = {}) {
  if (action === "answer") {
    const item = ITEMS.find((i) => i.id === id);
    if (!item) return { error: "Unknown message id. Ask for a new one with action 'next'." };
    const g = String(guess);
    const saidScam = /\b(scam|fake|fraud|suspicious|dangerous|not safe)\b/i.test(g) && !/\bnot (a )?scam\b|\b(real|legit|genuine)\b|\bsafe\b(?<!not safe)/i.test(g);
    const isScam = item.label === "scam";
    const correct = saidScam === isScam;
    const r = scanMessage(item.text);
    const tells = r.red_flags.slice(0, 2).map((f) => f.flag.toLowerCase());
    const explain = isScam
      ? `It was a scam${item.type ? `, ${article(item.type)} ${item.type.toLowerCase().replace(/\s*\(.*\)$/, "")}` : ""}.${tells.length ? ` The giveaways: ${tells.join(", and ")}.` : ""}`
      : `It was a real message. ${r.red_flags.length ? "It had nothing that asks you to pay, click, or share a code." : "There's no pressure, no payment request, and no code request."}`;
    return {
      correct,
      answer: isScam ? "scam" : "real",
      speech: `${correct ? "Right!" : "Not quite."} ${explain} Want another one?`,
      red_flags: r.red_flags,
    };
  }
  // Alternate between scams and real messages so both get practiced.
  const lastWasScam = seen.length ? ITEMS.find((i) => i.id === seen[seen.length - 1])?.label === "scam" : Math.random() < 0.5;
  const item = pick(seen, lastWasScam ? "legit" : "scam");
  return {
    id: item.id,
    message: item.text,
    speech: `Here's a message: "${item.text}" Is it a scam, or is it real?`,
    total_available: ITEMS.length,
  };
}
