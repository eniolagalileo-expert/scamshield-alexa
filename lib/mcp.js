// The ScamShield MCP server: tools, a guided prompt, and a reference resource.
// Every tool answers with a short `speech` line first (for voice assistants like Alexa+),
// followed by the full details as JSON.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BRANDS, analyzePhone, analyzeUrl, brandName } from "./clues.js";
import { SUPPORTED_COUNTRIES, reportLinks } from "./report.js";
import { extractPages, searchEnabled, webSearch } from "./tavily.js";
import { scanMessage } from "./scan.js";
import { TOP_SCAMS_GUIDE } from "./guide.js";
import { QUESTIONS, checkPhoneCall } from "./call.js";
import { scamBriefing } from "./briefing.js";
import { composeWarning } from "./family.js";
import { bestSentences, cleanText, rankPages } from "./official.js";

const INSTRUCTIONS = `ScamShield helps people decide whether a message, call, link or phone number is a scam.
Recommended flow when someone asks "is this a scam?":
1. Call check_message with the exact text they received (ask them to read it out if needed).
2. If the message claims to be from a known company, call verify_with_official_source to learn how that company really contacts people.
3. Optionally call search_scam_reports for a phone number, website or unusual phrase.
4. Answer with the verdict in one or two short sentences, then the single most important action. Speak calmly and plainly; many users are older adults.
5. If it looks like a scam, offer how_to_report_scam.
If someone is ON A PHONE CALL right now, use check_phone_call instead: ask the question it returns, pass the answer back, and repeat until it gives a verdict (usually 1-3 questions).
If they ask what scams are going around, use scam_briefing. After a scam verdict, offer warn_family so they can warn a relative.
Never tell the user to click a link or call a number from the suspicious message.`;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WEB = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

function reply(speech, details) {
  return {
    content: [
      { type: "text", text: speech },
      { type: "text", text: JSON.stringify(details, null, 2) },
    ],
    structuredContent: { speech, ...details },
  };
}

const RISK_WORDS = { high: "This looks dangerous.", medium: "Be careful with this one.", low: "Nothing looks wrong with it on its own." };

export function createServer() {
  const server = new McpServer(
    { name: "scamshield", title: "ScamShield", version: "1.0.0" },
    { instructions: INSTRUCTIONS }
  );

  server.registerTool("check_message", {
    title: "Check a message for scam signs",
    description: "Analyze a text, email, DM or call transcript for scam tactics: disguised links, suspicious numbers, pressure, threats, untraceable payment requests, requests for codes, and more. Returns a verdict, a short spoken answer, the red flags with evidence, and next steps. Works offline and instantly.",
    inputSchema: {
      message: z.string().min(1).max(4000).describe("The exact message text the person received"),
      country: z.string().length(2).optional().describe("ISO country code of the person, e.g. US, GB, IN, for local reporting links"),
    },
    outputSchema: {
      speech: z.string(),
      verdict: z.enum(["scam", "suspicious", "likely_safe"]),
      confidence: z.number(),
      language: z.string().describe("Language of the message and of the spoken answer: en, es, hi or id"),
      red_flags: z.array(z.object({ flag: z.string(), evidence: z.string(), why: z.string().optional() })),
      what_to_do: z.array(z.string()),
      brands_mentioned: z.array(z.string()),
      links: z.array(z.object({ url: z.string(), host: z.string().optional(), domain: z.string().optional(), risk: z.string(), flags: z.array(z.string()) })),
      phones: z.array(z.object({ number: z.string(), country: z.string(), risk: z.string(), flags: z.array(z.string()) })),
      report: z.array(z.object({ name: z.string(), url: z.string(), say: z.string().optional() })),
    },
    annotations: READ_ONLY,
  }, async ({ message, country }) => {
    const r = scanMessage(message, { country });
    return reply(r.speech, {
      verdict: r.verdict, confidence: r.confidence, language: r.language, red_flags: r.red_flags, what_to_do: r.what_to_do,
      brands_mentioned: r.brands_mentioned, links: r.links, phones: r.phones, report: r.report,
    });
  });

  server.registerTool("check_link", {
    title: "Check a link without opening it",
    description: "Inspect a web address for look-alike company names (paypa1, arnazon), disguised addresses, raw IPs, link shorteners and risky endings. The link is never opened.",
    inputSchema: { url: z.string().min(3).max(500).describe("The link or web address") },
    annotations: READ_ONLY,
  }, async ({ url }) => {
    const r = analyzeUrl(url);
    return reply(`${RISK_WORDS[r.risk]} ${r.flags[r.flags.length - 1]}.`, r);
  });

  server.registerTool("check_phone_number", {
    title: "Check a phone number",
    description: "Check a phone number's country, premium-rate status, and whether it matches the company it claims to be from.",
    inputSchema: {
      number: z.string().min(3).max(40).describe("The phone number"),
      claimed_sender: z.string().max(40).optional().describe("Who the caller or texter claims to be, e.g. USPS or Chase"),
    },
    annotations: READ_ONLY,
  }, async ({ number, claimed_sender }) => {
    const brand = String(claimed_sender || "").toLowerCase().replace(/[^a-z]/g, "");
    const r = analyzePhone(number, brand ? [brand] : []);
    return reply(`${RISK_WORDS[r.risk]} It's a ${r.country} number. ${r.flags[0]}.`, r);
  });

  server.registerTool("verify_with_official_source", {
    title: "Check what the real company says",
    description: "Read the company's OFFICIAL website to learn how it really contacts customers, e.g. whether USPS ever texts about fees. Only official domains are searched.",
    inputSchema: {
      company: z.enum(Object.keys(BRANDS)).describe("The company the message claims to be from"),
      question: z.string().min(3).max(200).describe("What to check, e.g. 'does USPS text about redelivery fees'"),
    },
    annotations: WEB,
  }, async ({ company, question }) => {
    if (!searchEnabled()) return reply("Web checks are turned off on this server.", { error: "TAVILY_API_KEY not set" });
    const domains = BRANDS[company];
    const name = brandName(company);
    // Short, focused queries find the right pages; the full question is only used to pick passages.
    let candidates = [];
    for (const q of [`${name} scam text email phishing smishing`, `${name} fraud security report suspicious`]) {
      const found = await webSearch(q, { includeDomains: domains });
      candidates = rankPages(found.results, domains).slice(0, 3);
      if (candidates.length) break;
    }
    if (!candidates.length) return reply(`I couldn't find an official ${name} page about scams.`, { company, results: [] });
    // Read the top pages in one call and use the first one that states a clear answer.
    const pages = await extractPages(candidates.map((c) => c.url), question);
    let page = candidates[0];
    let best = [];
    let text = page.content || "";
    for (const c of candidates) {
      const read = pages.find((p) => p.url === c.url);
      const sentences = bestSentences(read?.content || c.content || "");
      if (sentences.length) { page = c; best = sentences; text = read?.content || c.content; break; }
    }
    // Two sentences if they're short enough to listen to comfortably, otherwise just the best one.
    const spoken = best.join(" ").length <= 240 ? best.join(" ") : best[0];
    const speech = best.length
      ? `${name.replace(/^the /, "The ")}'s official website says: ${spoken}`
      : `I found ${name}'s official page about scams. It's on your screen.`;
    return reply(speech, { company, official_url: page.url, title: page.title, key_points: best, excerpt: cleanText(text).slice(0, 700) });
  });

  server.registerTool("search_scam_reports", {
    title: "Search the web for scam reports",
    description: "Search the web for reports about a phone number, website, company name or unusual phrase.",
    inputSchema: { query: z.string().min(3).max(200).describe("e.g. '833-555-0199 scam' or 'usps-parcel-update.cyou'") },
    annotations: WEB,
  }, async ({ query }) => {
    if (!searchEnabled()) return reply("Web checks are turned off on this server.", { error: "TAVILY_API_KEY not set" });
    const r = await webSearch(query);
    const speech = r.answer
      ? `Here's what I found online: ${r.answer.split(/(?<=[.!?])\s/).slice(0, 2).join(" ")}`
      : r.results.length ? `I found ${r.results.length} results, including "${r.results[0].title}".` : "I didn't find any reports about that.";
    return reply(speech, { query, answer: r.answer, results: r.results });
  });

  server.registerTool("how_to_report_scam", {
    title: "How to report a scam",
    description: `Official places to report a scam in the person's country. Countries with specific links: ${SUPPORTED_COUNTRIES.join(", ")}.`,
    inputSchema: { country: z.string().length(2).describe("ISO country code, e.g. US") },
    annotations: READ_ONLY,
  }, async ({ country }) => {
    const links = reportLinks(country);
    const speech = links[0].url
      ? `You can report it to ${links[0].say}${links[1] ? `, or ${links[1].say}` : ""}. The links are on your screen.`
      : `${links[0].name}.`;
    return reply(speech, { country: country.toUpperCase(), links });
  });

  server.registerTool("check_phone_call", {
    title: "Check a phone call in progress",
    description: "For when someone is on a suspicious call right now. Stateless guided interview: pass what you know; the tool returns either next_question (ask it, then call again with the answer added to `answers`) or a verdict. Usually 1-3 questions. Decisive signs (asking for a code, gift cards, remote access, moving money) end it immediately.",
    inputSchema: {
      caller_claims_to_be: z.string().max(60).optional().describe("Who the caller says they are, e.g. 'my bank', 'the IRS', 'Microsoft'"),
      what_they_want: z.string().max(400).optional().describe("What the caller is asking for, in the person's words"),
      caller_number: z.string().max(40).optional().describe("The number shown on caller ID, if known"),
      answers: z.object(Object.fromEntries(QUESTIONS.map((q) => [q.key, z.boolean().optional().describe(q.ask)]))).optional()
        .describe("Yes/no answers collected so far, keyed by next_question.key"),
    },
    annotations: READ_ONLY,
  }, async (args) => {
    const r = checkPhoneCall(args);
    return reply(r.speech, r);
  });

  server.registerTool("scam_briefing", {
    title: "What scams are going around",
    description: "Recent scam warnings from official consumer-protection sources only (FTC, USPIS, FBI IC3, Action Fraud, Scamwatch...), phrased for a short spoken briefing.",
    inputSchema: {
      country: z.string().length(2).optional().describe("ISO country code, e.g. US, GB, IN, CA, AU"),
      topic: z.string().max(60).optional().describe("Optional focus, e.g. 'text messages', 'phone calls', 'jobs'"),
    },
    annotations: WEB,
  }, async ({ country, topic }) => {
    if (!searchEnabled()) return reply("Web checks are turned off on this server.", { error: "TAVILY_API_KEY not set" });
    const r = await scamBriefing({ country, topic });
    return reply(r.speech, { items: r.items });
  });

  server.registerTool("warn_family", {
    title: "Warn a family member",
    description: "Compose a short, calm warning about a scam that the person can send to a relative or friend. Does not send anything itself; the assistant confirms and sends through its own messaging.",
    inputSchema: {
      recipient: z.string().max(40).optional().describe("Who to warn, e.g. 'Mom' or 'Sarah'"),
      about: z.string().max(400).optional().describe("The scam message or a short description of it"),
      scam_type: z.string().max(80).optional().describe("Optional short description, e.g. 'a fake delivery text asking for a small fee'"),
      sender_name: z.string().max(40).optional().describe("Name to sign the message with"),
    },
    annotations: READ_ONLY,
  }, async (args) => {
    const r = composeWarning(args);
    return reply(r.speech, r);
  });

  server.registerPrompt("is_this_a_scam", {
    title: "Is this a scam?",
    description: "Guided scam check for a message someone received.",
    argsSchema: { message: z.string().describe("The message they received") },
  }, ({ message }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Someone received this message and wants to know if it's a scam:\n"""\n${message}\n"""\nUse the ScamShield tools: check_message first, then verify_with_official_source if it claims to be a known company. Answer in two short spoken sentences plus the single most important action. Never suggest clicking its link or calling its number.`,
      },
    }],
  }));

  server.registerResource("top-scams", "scamshield://guides/top-scams", {
    title: "Common scams and how to spot them",
    description: "Plain-language guide to the most common scam types, suitable for reading aloud.",
    mimeType: "text/markdown",
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: TOP_SCAMS_GUIDE }] }));

  return server;
}
