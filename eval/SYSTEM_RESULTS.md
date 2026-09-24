# End-to-end results: rules vs. rules + second opinion vs. full assistant

All three configurations were run on the **same** messages. Neither set was used to design or tune anything.

| Set | Rules only (`check_message`, offline) | Rules + second opinion via **MCP sampling** | Full assistant (Claude Code + ScamShield tools) |
|---|---|---|---|
| Held-out test v2: 37 hand-written messages (22 scams, 15 genuine look-alikes) | 86% · 17/22 scams · 0/15 false alarms | **97% · 22/22 scams · 1/15 false alarms** | 95% · 22/22 scams · 2/15 false alarms |
| Real-world sample: 60 real SMS (30 smishing, 30 genuine)¹ | 62% · 7/30 scams · 0/30 false alarms | 92% · 29/30 scams · 4/30 false alarms | 93% · 29/30 scams · 3/30 false alarms |

Rules only, on the **full** real-world dataset (5,971 messages): 27.0% of 638 smishing messages flagged; 1.7% of 4,844 genuine messages flagged (see `REAL_WORLD_RESULTS.md`).

**What this shows:** the rules are precise (almost no false alarms) but miss scams they weren't written for. Letting the assistant's own model take a second look, through MCP sampling (no API key, the client runs the model) or by reasoning over the tools itself, catches nearly all of them, at the cost of a few extra "be careful" answers on genuine messages. For a scam checker that's the right trade: "suspicious" on a real message costs a moment of checking, while a missed scam can cost savings.

**How it was run**
- Model: Claude Sonnet (via the `claude` CLI), temperature default; one run per message.
- Second opinion: `scripts/eval-sampling.mjs`. The official MCP SDK client declares `sampling`; its handler sends the server's sampling request to the model with no tools.
- Full assistant: `scripts/eval-agent.mjs`. Claude Code is the MCP client, with ScamShield's analysis tools allowed; it must end with a one-line verdict.
- Per-message results: `agent-*.json`, `sampling-*.json`. The samples are small (37 and 60), so treat differences of one or two messages as noise.

**Errors worth noting:** both AI configurations missed the same real-world item (an HP/Kodak promotion, arguably marketing rather than a scam). False alarms were "suspicious" (not "scam") calls on short, context-free personal texts ("Wife.") and on genuine Amazon/utility notices.

¹ Mishra & Soni, *SMS Phishing Dataset for Machine Learning and Pattern Recognition*, Mendeley Data 2022, doi:10.17632/f45bkkt8pr.1, CC BY 4.0. See `REAL_WORLD_SOURCE.md`.
