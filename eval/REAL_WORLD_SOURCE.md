# Real-world messages: source and license

`real-world-sample.json` is a fixed random sample (seed 7: 30 smishing, 30 legitimate) from:

> Sandhya Mishra and Devpriya Soni, "SMS Phishing Dataset for Machine Learning and Pattern Recognition", Mendeley Data, V1, 2022. DOI: 10.17632/f45bkkt8pr.1. https://data.mendeley.com/datasets/f45bkkt8pr/1

Licensed under **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/). Messages are reproduced unchanged except that the labels were mapped to `scam` (Smishing) and `legit` (ham). The full dataset (5,971 messages) is downloaded by `npm run bench:real` and is not stored in this repo.

These messages were never used to design or tune ScamShield's rules.

`calibration-tune.json` (added Sept 29, 2026) holds 70 messages from the same dataset, drawn only from the *tune* half of the hashed split in `scripts/bench-real.js`: 40 ham and 30 smishing messages the rules miss. It was used to calibrate the second-opinion prompt. Same license and attribution.
