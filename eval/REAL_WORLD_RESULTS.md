# Real-world benchmark (rules layer only)

Source: Mishra & Soni, *SMS Phishing Dataset for Machine Learning and Pattern Recognition*, Mendeley Data 2022, doi:10.17632/f45bkkt8pr.1 (CC BY 4.0). Never used for tuning.

| Label | Messages | Flagged as scam or suspicious |
|---|---|---|
| ham | 4844 | 1.7% |
| smishing | 638 | 70.2% |
| spam | 489 | 17.8% |

By split (rule changes after Sept 27, 2026 were informed only by the tune half; the held-out half is never inspected):

| Split | Smishing caught | Ham false alarms |
|---|---|---|
| tune | 70.3% (204/290) | 1.6% (38/2348) |
| held-out | 70.1% (244/348) | 1.7% (43/2496) |

For smishing, higher is better (scams caught). For ham (genuine), lower is better (false alarms). "spam" is marketing, not necessarily fraud.
