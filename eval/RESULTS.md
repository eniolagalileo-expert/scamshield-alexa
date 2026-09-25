# check_message benchmark (offline, no AI)

| Set | Messages | Accuracy | Scams caught | False alarms |
|---|---|---|---|---|
| Development set A (used for tuning) | 40 | 100% | 100% (26/26) | 0% (0/14) |
| Development set B (used for tuning) | 30 | 100% | 100% (20/20) | 0% (0/10) |
| Development set C (was held-out v1; later used for tuning) | 34 | 100% | 100% (22/22) | 0% (0/12) |
| **Held-out test v2 (written after the rules; see note)** | 37 | 89% | 82% (18/22) | 0% (0/15) |

**Note on test v2:** its first run (the honest held-out result) was **86%, 17/22 scams, 0/15 false alarms**. On Sept 24, 2026 a rule was widened to catch fake-order texts ("if this was not you, call …"), found while recording the demo and added to development set C. It also catches v22, one of the misses published below, so the current score is no longer a clean held-out number. We quote 86% as the held-out result.

## Known misses
- test-v2/v01 missed scam (Payment app upgrade)
- test-v2/v02 missed scam (Marketplace code scam)
- test-v2/v06 missed scam (Wrong-number opener)
- test-v2/v08 missed scam (Bank fraud call transcript)
