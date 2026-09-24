// Where to report scams, by country. Shown under "What to do".

const REPORT_LINKS = {
  US: [
    { name: "FTC: ReportFraud.ftc.gov", url: "https://reportfraud.ftc.gov/", say: "the FTC at reportfraud.ftc.gov" },
    { name: "Forward scam texts to 7726 (SPAM)", url: "https://consumer.ftc.gov/articles/how-recognize-and-report-spam-text-messages", say: "forward the text to 7 7 2 6" },
    { name: "FBI Internet Crime Complaint Center", url: "https://www.ic3.gov/", say: "the FBI's Internet Crime Complaint Center" },
  ],
  GB: [
    { name: "Action Fraud", url: "https://www.actionfraud.police.uk/", say: "Action Fraud" },
    { name: "Forward scam texts to 7726", url: "https://www.ncsc.gov.uk/collection/phishing-scams/report-scam-text-message", say: "forward the text to 7 7 2 6" },
    { name: "Report phishing emails to the NCSC", url: "https://www.ncsc.gov.uk/collection/phishing-scams/report-scam-email", say: "the National Cyber Security Centre" },
  ],
  IN: [
    { name: "National Cyber Crime Reporting Portal (or call 1930)", url: "https://cybercrime.gov.in/", say: "the cyber crime helpline, 1 9 3 0" },
    { name: "Sanchar Saathi: report fraud calls/SMS (Chakshu)", url: "https://sancharsaathi.gov.in/", say: "Sanchar Saathi" },
  ],
  CA: [{ name: "Canadian Anti-Fraud Centre", url: "https://antifraudcentre-centreantifraude.ca/", say: "the Canadian Anti-Fraud Centre" }],
  AU: [{ name: "Scamwatch", url: "https://www.scamwatch.gov.au/", say: "Scamwatch" }],
};

const FALLBACK = [{ name: "Report to your local police and your bank if you shared any details", url: "" }];

export function reportLinks(country) {
  return REPORT_LINKS[String(country || "").toUpperCase()] || FALLBACK;
}

export const SUPPORTED_COUNTRIES = Object.keys(REPORT_LINKS);
