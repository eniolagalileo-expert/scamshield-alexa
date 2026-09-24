// warn_family: compose a short, calm warning a person can send to a relative (the assistant sends it).

const TYPE_HINTS = [
  [/delivery|package|parcel|usps|fedex|dhl|ups|royal mail/i, "a fake delivery text asking for a small fee"],
  [/bank|account (is )?locked|chase|wells|paypal/i, "a fake bank alert asking you to 'verify' your account"],
  [/grand|mum|mom|dad|new number|family/i, "a message pretending to be family asking for money"],
  [/job|recruit|hiring|interview/i, "a fake job offer"],
  [/prize|won|winner|lottery|sweepstakes/i, "a fake prize that asks for a fee"],
  [/tech|microsoft|virus|computer/i, "a fake tech-support warning"],
  [/irs|tax|social security|warrant|arrest/i, "a fake government threat"],
];

export function composeWarning({ recipient = "", about = "", scam_type = "", sender_name = "" } = {}) {
  const hint = scam_type || (TYPE_HINTS.find(([re]) => re.test(about)) || [])[1] || "a scam message";
  const to = String(recipient).trim();
  const greeting = to ? `Hi ${to.charAt(0).toUpperCase()}${to.slice(1)}, ` : "Hi, ";
  const text = `${greeting}heads up: I just got ${hint.replace(/^a /, "a ")}. It's a scam going around. If you get one, don't click the link, don't reply, and don't pay or share any codes. Real companies never ask for gift cards or codes by text.${sender_name ? ` - ${sender_name}` : ""}`;
  return {
    speech: `Here's a warning you can send${to ? ` to ${to}` : ""}: "${text}" Should I send it?`,
    message: text,
    recipient: to || null,
  };
}
