// Spoken answers in the message's language. Spanish is complete; Hindi and Indonesian give the
// verdict and the key action (the red-flag details stay available in English in the structured data).

const HINTS = {
  es: /\b(su|tu|usted|paquete|cuenta|pague|pagar|haga|clic|envío|entrega|enlace|verifique|datos|hoy|horas|premio|felicidades|ganado|banco|será|está|para)\b/gi,
  id: /\b(anda|paket|segera|klik|hadiah|selamat|biaya|rekening|transfer|melalui|berikut|dapat|untuk|dari|hari ini|tertahan)\b/gi,
};

export function detectLanguage(text) {
  const t = String(text || "");
  if ((t.match(/[ऀ-ॿ]/g) || []).length >= 5) return "hi";
  const counts = Object.fromEntries(Object.entries(HINTS).map(([lang, re]) => [lang, (t.match(re) || []).length]));
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return n >= 3 ? best : "en";
}

const ES_REASONS = {
  fake_link: "el enlace se hace pasar por una empresa real pero lleva a otro sitio web",
  odd_link: "el enlace parece extraño",
  bad_phone: "el número de teléfono no coincide con quien dice ser",
  odd_phone: "el número de teléfono es inusual",
  payment_untraceable: "pide tarjetas de regalo, criptomonedas o una transferencia, una señal clásica de estafa",
  fee: "pide una pequeña tarifa para liberar un paquete, un premio o un préstamo",
  p2p_payment: "pide dinero por una aplicación de pagos instantáneos, que es difícil de recuperar",
  credentials: "pide un código, una contraseña o datos de su cuenta",
  urgency: "le presiona para actuar rápido",
  threat: "le amenaza con arresto, multas o el cierre de su cuenta",
  too_good: "promete dinero o premios demasiado buenos para ser verdad",
  secrecy: "le pide que lo mantenga en secreto",
  new_number: "alguien que dice ser familiar con un número nuevo le pide ayuda",
  off_platform: "le lleva a una aplicación de chat privada",
  overpayment: "dice que le envió dinero de más y quiere que devuelva la diferencia",
  remote_access: "dice que su computadora está infectada y le pide que llame",
  romance_money: "usa una historia emocional o romántica para pedir dinero",
  job_equipment: "el trabajo le pide comprar equipo o depositar un cheque",
  unauthorized_charge_call: "menciona un cargo grande y le da un número para llamar",
  emergency_money: "usa una emergencia para que envíe dinero con prisa",
  safe_account: "le pide mover su dinero a una supuesta cuenta segura",
  robocall: "usa un guion de llamada automática sobre garantías o avisos finales",
  fake_renewal: "dice que le cobraron una renovación y le pide llamar para cancelar",
};

const TEXT = {
  es: {
    opening: { scam: "Esto parece una estafa.", suspicious: "Tenga cuidado. Este mensaje tiene señales de alerta.", likely_safe: "No veo señales de estafa." },
    action: {
      scam_link: "No haga clic en el enlace, no devuelva la llamada y no pague ni comparta nada.",
      scam: "No responda, no pague y no comparta códigos ni datos.",
      suspicious: "No use el enlace ni el número del mensaje. Comuníquese directamente con la empresa por su aplicación o sitio web oficial.",
      likely_safe: "Aun así, nunca comparta contraseñas ni códigos de un solo uso.",
    },
  },
  hi: {
    opening: { scam: "यह एक धोखाधड़ी लगती है।", suspicious: "सावधान रहें। इस संदेश में चेतावनी के संकेत हैं।", likely_safe: "मुझे धोखाधड़ी के संकेत नहीं दिखते।" },
    action: {
      scam_link: "लिंक पर क्लिक न करें, वापस कॉल न करें, और कोई भुगतान या जानकारी साझा न करें।",
      scam: "जवाब न दें, भुगतान न करें, और कोई कोड या जानकारी साझा न करें।",
      suspicious: "संदेश के लिंक या नंबर का उपयोग न करें। कंपनी से उसकी आधिकारिक ऐप या वेबसाइट के ज़रिए सीधे संपर्क करें।",
      likely_safe: "फिर भी, कभी भी पासवर्ड या ओटीपी साझा न करें।",
    },
  },
  id: {
    opening: { scam: "Ini sepertinya penipuan.", suspicious: "Hati-hati. Pesan ini punya tanda bahaya.", likely_safe: "Saya tidak melihat tanda penipuan." },
    action: {
      scam_link: "Jangan klik tautannya, jangan menelepon balik, dan jangan membayar atau membagikan apa pun.",
      scam: "Jangan membalas, jangan membayar, dan jangan membagikan kode atau data apa pun.",
      suspicious: "Jangan gunakan tautan atau nomor di pesan itu. Hubungi perusahaan langsung lewat aplikasi atau situs resminya.",
      likely_safe: "Tetap saja, jangan pernah membagikan kata sandi atau kode OTP.",
    },
  },
};

function joinEs(parts) {
  if (parts.length <= 1) return parts[0] || "";
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

// Returns localized speech, or null for English (the caller keeps its English speech).
export function localizedSpeech(lang, { verdict, reasonIds, hasHardFlag }) {
  const t = TEXT[lang];
  if (!t) return null;
  const action = verdict === "scam" ? (hasHardFlag ? t.action.scam_link : t.action.scam) : t.action[verdict];
  if (lang === "es") {
    const reasons = reasonIds.map((id) => ES_REASONS[id]).filter(Boolean).slice(0, 2);
    const because = reasons.length ? ` ${joinEs(reasons).replace(/^./, (c) => c.toUpperCase())}.` : "";
    return `${t.opening[verdict]}${because} ${action}`;
  }
  return `${t.opening[verdict]} ${action}`;
}
