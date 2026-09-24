// Verifies that a request really comes from Alexa, as required for custom-skill web services:
// https://developer.amazon.com/en-US/docs/alexa/custom-skills/host-a-custom-skill-as-a-web-service.html
// 1. The certificate URL points at Amazon's S3 echo.api path.  2. The certificate chain is valid, current,
// issued for echo-api.amazon.com, and chains to a trusted root.  3. The body's RSA-SHA256 signature matches.
// 4. The request timestamp is within 150 seconds.

import { X509Certificate, verify as verifySignature } from "node:crypto";
import { rootCertificates } from "node:tls";

const certCache = new Map(); // url -> { certs, fetchedAt }
const ROOTS = rootCertificates.map((pem) => {
  try { return new X509Certificate(pem); } catch (_) { return null; }
}).filter(Boolean);

export function isValidCertUrl(raw) {
  let url;
  try { url = new URL(raw); } catch (_) { return false; }
  const path = new URL(url.pathname.replace(/\/+/g, "/"), "https://x").pathname; // normalizes "/echo.api/../"
  return url.protocol === "https:" &&
    url.hostname.toLowerCase() === "s3.amazonaws.com" &&
    (url.port === "" || url.port === "443") &&
    path.startsWith("/echo.api/");
}

function splitPem(pem) {
  return (pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || []).map((c) => new X509Certificate(c));
}

async function getChain(url) {
  const hit = certCache.get(url);
  if (hit && Date.now() - hit.fetchedAt < 60 * 60 * 1000) return hit.certs;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`Could not fetch certificate (${res.status})`);
  const certs = splitPem(await res.text());
  if (!certs.length) throw new Error("No certificate in chain");
  certCache.set(url, { certs, fetchedAt: Date.now() });
  return certs;
}

export function validateChain(certs, now = new Date()) {
  const [leaf] = certs;
  if (now < new Date(leaf.validFrom) || now > new Date(leaf.validTo)) return "certificate expired or not yet valid";
  if (!/DNS:echo-api\.amazon\.com\b/.test(leaf.subjectAltName || "")) return "certificate not issued for echo-api.amazon.com";
  for (let i = 0; i < certs.length - 1; i++) {
    if (!certs[i].checkIssued(certs[i + 1]) || !certs[i].verify(certs[i + 1].publicKey)) return "broken certificate chain";
  }
  const top = certs[certs.length - 1];
  const trusted = ROOTS.some((root) => (root.fingerprint256 === top.fingerprint256) || (top.checkIssued(root) && top.verify(root.publicKey)));
  return trusted ? null : "certificate chain does not lead to a trusted root";
}

export async function verifyAlexaRequest(headers, rawBody, { skillId } = {}) {
  const certUrl = headers["signaturecertchainurl"];
  const signature = headers["signature-256"];
  if (!certUrl || !signature) return "missing signature headers";
  if (!isValidCertUrl(certUrl)) return "invalid certificate URL";

  const certs = await getChain(certUrl);
  const chainError = validateChain(certs);
  if (chainError) return chainError;
  if (!verifySignature("RSA-SHA256", rawBody, certs[0].publicKey, Buffer.from(signature, "base64"))) return "signature mismatch";

  let body;
  try { body = JSON.parse(rawBody.toString("utf8")); } catch (_) { return "invalid JSON"; }
  const ts = Date.parse(body?.request?.timestamp);
  if (!ts || Math.abs(Date.now() - ts) > 150 * 1000) return "request timestamp too old";
  const appId = body?.session?.application?.applicationId || body?.context?.System?.application?.applicationId;
  if (skillId && appId !== skillId) return "wrong skill id";
  return null;
}
