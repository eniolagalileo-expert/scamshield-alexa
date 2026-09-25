// scam_recovery: "I think I got scammed. What do I do now?" Plain, ordered steps for what actually
// happened, most urgent first. Based on widely published consumer-protection guidance (FTC, banks);
// it names the kind of organization to call, not phone numbers, which change and can be spoofed.

export const SITUATIONS = {
  gift_card: {
    match: /gift ?cards?|itunes|google play card|steam card|tarjetas? de regalo/i,
    en: {
      label: "Paid with a gift card",
      steps: [
        "Contact the company that issued the gift card right away, using the number on the back of the card or its official website. Tell them the card was used in a scam and ask if they can freeze the money and refund you.",
        "Keep the gift card and the receipt. You'll need the card numbers.",
        "Report it to the FTC at ReportFraud.ftc.gov.",
        "Stop all contact with the scammer. If they call back asking for more cards, hang up.",
      ],
    },
    es: {
      label: "Pagué con una tarjeta de regalo",
      steps: [
        "Llame de inmediato a la empresa que emitió la tarjeta de regalo, usando el número de la parte de atrás o su sitio web oficial. Dígales que la tarjeta se usó en una estafa y pregunte si pueden congelar el dinero y devolvérselo.",
        "Guarde la tarjeta y el recibo. Necesitará los números de la tarjeta.",
        "Repórtelo a la FTC en ReportFraud.ftc.gov.",
        "Corte todo contacto con el estafador. Si vuelve a llamar pidiendo más tarjetas, cuelgue.",
      ],
    },
  },
  bank_transfer: {
    match: /wire|bank transfer|transferencia|western union|moneygram|\bmoney\b|dinero/i,
    en: {
      label: "Sent money by wire or bank transfer",
      steps: [
        "Call your bank or the wire company's fraud line right now, using the number on your card, statement or official website. Ask them to reverse or recall the transfer. The faster you call, the better the chance.",
        "Ask your bank to watch your account and to change your account number if the scammer has it.",
        "Report it to the FTC at ReportFraud.ftc.gov, and to the FBI at ic3.gov.",
      ],
    },
    es: {
      label: "Envié dinero por giro o transferencia bancaria",
      steps: [
        "Llame ahora mismo a su banco o a la línea de fraude de la empresa de envíos, usando el número de su tarjeta, su estado de cuenta o su sitio web oficial. Pida que reviertan o recuperen la transferencia. Cuanto antes llame, mejor.",
        "Pida a su banco que vigile su cuenta y que cambie el número de cuenta si el estafador lo tiene.",
        "Repórtelo a la FTC en ReportFraud.ftc.gov y al FBI en ic3.gov.",
      ],
    },
  },
  payment_app: {
    match: /zelle|venmo|cash ?app|payment app|aplicaci[oó]n de pagos|(sent|paid|pagu[eé]|envi[eé]).{0,25}paypal|paypal.{0,15}(payment|pago)/i,
    en: {
      label: "Sent money with a payment app (Zelle, Venmo, Cash App, PayPal)",
      steps: [
        "Report the payment as fraud inside the app, and call your bank if the app is linked to your bank account. Ask them to reverse it.",
        "Don't send more money to \"fix\" it or to get a refund. That's a second scam.",
        "Report it to the FTC at ReportFraud.ftc.gov.",
      ],
    },
    es: {
      label: "Envié dinero por una aplicación de pagos (Zelle, Venmo, Cash App, PayPal)",
      steps: [
        "Reporte el pago como fraude dentro de la aplicación y llame a su banco si la aplicación está conectada a su cuenta. Pida que lo reviertan.",
        "No envíe más dinero para \"arreglarlo\" o para recibir un reembolso. Esa es una segunda estafa.",
        "Repórtelo a la FTC en ReportFraud.ftc.gov.",
      ],
    },
  },
  card: {
    match: /credit card|debit card|(?<!gift )card number|bank card|tarjeta de (cr[eé]dito|d[eé]bito)|n[uú]mero de (mi )?tarjeta/i,
    en: {
      label: "Paid with or gave out a credit or debit card",
      steps: [
        "Call the number on the back of your card now. Tell them it was fraud, ask them to block the card, dispute the charge, and send you a new card.",
        "Check your statement for other charges you don't recognize.",
        "Report it to the FTC at ReportFraud.ftc.gov.",
      ],
    },
    es: {
      label: "Pagué con tarjeta o di el número de mi tarjeta",
      steps: [
        "Llame ahora al número de la parte de atrás de su tarjeta. Diga que fue un fraude, pida que bloqueen la tarjeta, disputen el cargo y le envíen una nueva.",
        "Revise su estado de cuenta por otros cargos que no reconozca.",
        "Repórtelo a la FTC en ReportFraud.ftc.gov.",
      ],
    },
  },
  crypto: {
    match: /crypto|bitcoin|ethereum|usdt|bitcoin atm|cripto/i,
    en: {
      label: "Paid with cryptocurrency",
      steps: [
        "Contact the exchange or crypto ATM company you used, through its official website or app, and report the transaction as fraud.",
        "Keep every detail: the wallet address, amount, date and any messages.",
        "Report it to the FBI at ic3.gov and to the FTC at ReportFraud.ftc.gov.",
        "Beware of anyone who promises to \"recover\" your crypto for a fee. That's a common second scam.",
      ],
    },
    es: {
      label: "Pagué con criptomonedas",
      steps: [
        "Comuníquese con la plataforma o el cajero de criptomonedas que usó, por su sitio web o aplicación oficial, y reporte la transacción como fraude.",
        "Guarde todos los detalles: la dirección de la billetera, el monto, la fecha y los mensajes.",
        "Repórtelo al FBI en ic3.gov y a la FTC en ReportFraud.ftc.gov.",
        "Cuidado con quien prometa \"recuperar\" sus criptomonedas a cambio de un pago. Es una segunda estafa común.",
      ],
    },
  },
  shared_code: {
    match: /\bcode\b|one[- ]time|verification|otp|2fa|c[oó]digo/i,
    en: {
      label: "Shared a code that was texted or emailed to me",
      steps: [
        "Change the password of the account that code was for right away, and sign out of all other devices if the account allows it.",
        "If it was your bank or email, call your bank using the number on your card, or check your email's security settings for devices you don't recognize.",
        "Turn on two-step verification, and never read a code to anyone again, even if they say they're from the company.",
      ],
    },
    es: {
      label: "Compartí un código que me llegó por mensaje o correo",
      steps: [
        "Cambie de inmediato la contraseña de la cuenta de ese código y cierre la sesión en los demás dispositivos si la cuenta lo permite.",
        "Si era su banco o su correo, llame a su banco al número de su tarjeta, o revise la seguridad de su correo por dispositivos que no reconozca.",
        "Active la verificación en dos pasos, y nunca le lea un código a nadie, aunque diga ser de la empresa.",
      ],
    },
  },
  password: {
    match: /password|logged in|signed in|log ?in|contrase[nñ]a|inici[eé] sesi[oó]n/i,
    en: {
      label: "Entered my password on a fake website",
      steps: [
        "Change that password now, from the real app or by typing the real website address yourself. Change it anywhere else you used the same password.",
        "Turn on two-step verification for that account.",
        "If it was a bank, call the number on your card and ask them to watch for fraud.",
      ],
    },
    es: {
      label: "Puse mi contraseña en un sitio falso",
      steps: [
        "Cambie esa contraseña ahora, desde la aplicación real o escribiendo usted mismo la dirección del sitio real. Cámbiela en cualquier otro lugar donde use la misma.",
        "Active la verificación en dos pasos en esa cuenta.",
        "Si era un banco, llame al número de su tarjeta y pida que vigilen su cuenta.",
      ],
    },
  },
  remote_access: {
    match: /remote|anydesk|teamviewer|\b(computer|laptop|screen)\b|installed|acceso remoto|computadora|pantalla/i,
    en: {
      label: "Let someone into my computer or phone",
      steps: [
        "Disconnect the device from the internet (turn off Wi-Fi) and don't let them back in.",
        "Uninstall any app they asked you to install, like AnyDesk or TeamViewer, and run a security scan, or have a trusted person or store check the device.",
        "From a different, safe device, change the passwords for your email and bank, and call your bank using the number on your card.",
      ],
    },
    es: {
      label: "Dejé que alguien entrara a mi computadora o teléfono",
      steps: [
        "Desconecte el dispositivo de internet (apague el Wi-Fi) y no deje que vuelvan a entrar.",
        "Desinstale cualquier aplicación que le pidieron instalar, como AnyDesk o TeamViewer, y haga un análisis de seguridad, o pida a alguien de confianza o a una tienda que revise el equipo.",
        "Desde otro dispositivo seguro, cambie las contraseñas de su correo y su banco, y llame a su banco al número de su tarjeta.",
      ],
    },
  },
  personal_info: {
    match: /social security|\bsocial\b|ssn|identity|personal (information|details)|date of birth|seguro social|datos personales|identidad/i,
    en: {
      label: "Gave out my Social Security number or personal details",
      steps: [
        "Go to IdentityTheft.gov (from the FTC) for a personal recovery plan.",
        "Consider a free credit freeze with all three credit bureaus: Equifax, Experian and TransUnion.",
        "Watch your bank statements and credit reports for anything you don't recognize.",
      ],
    },
    es: {
      label: "Di mi número de Seguro Social o mis datos personales",
      steps: [
        "Visite IdentityTheft.gov (de la FTC) para obtener un plan de recuperación personal.",
        "Considere congelar su crédito gratis en las tres agencias: Equifax, Experian y TransUnion.",
        "Vigile sus estados de cuenta y reportes de crédito por cualquier cosa que no reconozca.",
      ],
    },
  },
  clicked_link: {
    match: /click|tapped|\blink\b|clic|enlace/i,
    en: {
      label: "Only clicked the link",
      steps: [
        "If you didn't type anything or download anything, you're most likely fine. Close the page.",
        "If you entered a password or card number on that page, follow the steps for that too.",
        "If something downloaded, don't open it. Delete it and run a security scan.",
      ],
    },
    es: {
      label: "Solo hice clic en el enlace",
      steps: [
        "Si no escribió ni descargó nada, lo más probable es que esté bien. Cierre la página.",
        "Si puso una contraseña o un número de tarjeta en esa página, siga también esos pasos.",
        "Si se descargó algo, no lo abra. Bórrelo y haga un análisis de seguridad.",
      ],
    },
  },
};

// Asked the next time the person opens the skill, if they chose to be checked on.
export const FOLLOW_UP = {
  gift_card: { en: "Did you reach the company that issued the gift card?", es: "¿Pudo comunicarse con la empresa que emitió la tarjeta de regalo?" },
  bank_transfer: { en: "Did you reach your bank about the transfer?", es: "¿Pudo hablar con su banco sobre la transferencia?" },
  payment_app: { en: "Did you report the payment in the app and call your bank?", es: "¿Reportó el pago en la aplicación y llamó a su banco?" },
  card: { en: "Did you call the number on the back of your card?", es: "¿Llamó al número de la parte de atrás de su tarjeta?" },
  crypto: { en: "Did you report it to the exchange and at ic3.gov?", es: "¿Lo reportó a la plataforma y en ic3.gov?" },
  shared_code: { en: "Did you change that account's password?", es: "¿Cambió la contraseña de esa cuenta?" },
  password: { en: "Did you change that password?", es: "¿Cambió esa contraseña?" },
  remote_access: { en: "Did you remove the app they installed, and change your passwords from another device?", es: "¿Quitó la aplicación que instalaron y cambió sus contraseñas desde otro dispositivo?" },
  personal_info: { en: "Did you get your recovery plan at IdentityTheft.gov?", es: "¿Obtuvo su plan de recuperación en IdentityTheft.gov?" },
  clicked_link: { en: "Did you check that nothing was downloaded?", es: "¿Revisó que no se descargara nada?" },
};

const ORDER = ["remote_access", "gift_card", "crypto", "payment_app", "bank_transfer", "card", "shared_code", "password", "personal_info", "clicked_link"];

export const CALM = {
  en: "You're not alone, and acting quickly helps.",
  es: "No está solo, y actuar rápido ayuda.",
};
const ASK = {
  en: "What happened? For example: I paid with a gift card, I sent money, I shared a code, I entered my password, I let them into my computer, or I only clicked the link.",
  es: "¿Qué pasó? Por ejemplo: pagué con una tarjeta de regalo, envié dinero, compartí un código, puse mi contraseña, dejé que entraran a mi computadora, o solo hice clic en el enlace.",
};

// Which situations a free-text description matches, most urgent first.
export function classify(text) {
  const t = String(text || "");
  const keys = ORDER.filter((k) => SITUATIONS[k].match.test(t));
  // "I sent money on Zelle" is about the app, not a bank wire.
  const specific = keys.some((k) => ["gift_card", "crypto", "payment_app"].includes(k));
  if (specific && !/wire|transfer|western union|moneygram/i.test(t)) return keys.filter((k) => k !== "bank_transfer");
  return keys;
}

export function scamRecovery({ what_happened = "", situations, language = "en" } = {}) {
  const lang = language === "es" ? "es" : "en";
  const keys = (situations?.length ? situations.filter((k) => SITUATIONS[k]) : classify(what_happened)).slice(0, 3);
  if (!keys.length) {
    return { status: "need_details", speech: `${CALM[lang]} ${ASK[lang]}`, situations: [], options: ORDER.map((k) => ({ key: k, label: SITUATIONS[k][lang].label })) };
  }
  const plans = keys.map((k) => ({ key: k, label: SITUATIONS[k][lang].label, steps: SITUATIONS[k][lang].steps }));
  // Out loud: the first two steps of the most urgent situation; the full plan is in the details.
  const first = plans[0];
  const speech = `${CALM[lang]} ${first.steps[0]} ${first.steps[1] || ""}`.trim();
  return { status: "done", speech, situations: plans, report: "https://reportfraud.ftc.gov/" };
}
