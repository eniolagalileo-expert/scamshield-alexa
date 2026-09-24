# check_message benchmark (offline, no AI)

| Set | Messages | Accuracy | Scams caught | False alarms |
|---|---|---|---|---|
| Development set A (used for tuning) | 40 | 100% | 100% (26/26) | 0% (0/14) |
| Development set B (used for tuning) | 30 | 100% | 100% (20/20) | 0% (0/10) |
| Development set C (was held-out v1; later used for tuning) | 30 | 100% | 100% (20/20) | 0% (0/10) |
| **Held-out test v2 (written after all tuning, never tuned on)** | 37 | 86% | 77% (17/22) | 0% (0/15) |

## Known misses
- test-v2/v01 missed scam (Payment app upgrade)
- test-v2/v02 missed scam (Marketplace code scam)
- test-v2/v06 missed scam (Wrong-number opener)
- test-v2/v08 missed scam (Bank fraud call transcript)
- test-v2/v22 missed scam (Coinbase login call)
