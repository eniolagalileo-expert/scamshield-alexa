// Visual card for Alexa devices with a screen (Echo Show, Fire TV): the verdict in big letters,
// the evidence as bullets, and the one thing to remember. Sent only when the device supports APL.

export const COLORS = { scam: "#B3261E", suspicious: "#9A5B00", likely_safe: "#1E6B34", info: "#1F3A5F" };

const DOCUMENT = {
  type: "APL",
  version: "2024.3",
  theme: "dark",
  mainTemplate: {
    parameters: ["card"],
    items: [{
      type: "Frame",
      width: "100vw",
      height: "100vh",
      backgroundColor: "${card.color}",
      item: {
        type: "Container",
        width: "100%",
        height: "100%",
        justifyContent: "center",
        paddingLeft: "6vw",
        paddingRight: "6vw",
        items: [
          { type: "Text", text: "${card.title}", color: "#FFFFFF", fontWeight: "800", fontSize: "${viewport.width < 600 ? '34dp' : '64dp'}", maxLines: 1 },
          { type: "Text", text: "${card.subtitle}", color: "#FFFFFF", fontSize: "${viewport.width < 600 ? '18dp' : '30dp'}", paddingTop: "8dp", maxLines: 7 },
          {
            type: "Container",
            when: "${card.items.length > 0}", // an empty list would otherwise render one blank bullet
            data: "${card.items}",
            paddingTop: "12dp",
            items: [{ type: "Text", text: "• ${data}", color: "#FFFFFF", fontSize: "${viewport.width < 600 ? '16dp' : '26dp'}", paddingTop: "8dp", maxLines: 2 }],
          },
          { type: "Text", text: "${card.footer}", color: "#FFFFFF", opacity: 0.85, fontSize: "${viewport.width < 600 ? '15dp' : '24dp'}", paddingTop: "20dp", fontWeight: "600", maxLines: 2 },
        ],
      },
    }],
  },
};

const clean = (s, max) => String(s || "").replace(/\s+/g, " ").trim().slice(0, max);

export function supportsAPL(body) {
  return Boolean(body?.context?.System?.device?.supportedInterfaces?.["Alexa.Presentation.APL"]);
}

export function renderCard({ kind = "info", title, subtitle = "", items = [], footer = "" }) {
  return {
    type: "Alexa.Presentation.APL.RenderDocument",
    token: "scamshield-card",
    document: DOCUMENT,
    datasources: {
      card: {
        color: COLORS[kind] || COLORS.info,
        title: clean(title, 40),
        subtitle: clean(subtitle, 400),
        items: items.slice(0, 3).map((i) => clean(i, 110)),
        footer: clean(footer, 120),
      },
    },
  };
}
