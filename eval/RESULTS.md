# check_message benchmark (offline, no AI)

| Set | Messages | Accuracy | Scams caught | False alarms |
|---|---|---|---|---|
| Development set A (used for tuning) | 40 | 100% | 100% (26/26) | 0% (0/14) |
| Development set B (used for tuning) | 30 | 100% | 100% (20/20) | 0% (0/10) |
| **Held-out test set (never tuned on)** | 30 | 90% | 95% (19/20) | 20% (2/10) |

## Known misses
- test/t13 missed scam (Amazon refund call)
- test/tl03 false alarm (Password reset (requested))
- test/tl06 false alarm (Parent text)
