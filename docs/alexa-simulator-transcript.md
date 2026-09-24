# ScamShield in the real Alexa simulator

Unedited session in the Amazon Alexa developer console simulator (skill in development stage), with the skill's HTTPS endpoint hosted on Render (`https://scamshield-alexa.onrender.com/alexa`). Every request was signed by Amazon and verified by the server before it answered.

![Alexa simulator](img/alexa-simulator.jpg)

**User:** open scam shield
**Alexa:** Welcome to Scam Shield. Read me a message you got, starting with: is this a scam. You can also say: someone's on the phone, what scams are going around, or let's practice.

**User:** is this a scam USPS your package is on hold pay the one dollar ninety nine redelivery fee within twenty four hours or it will be returned
**Alexa:** Be careful. This message has warning signs. It asks for a small fee to release a package, prize or loan, and it pressures you to act fast. Don't use the link or number in the message. Contact USPS directly through its official app or website. Want to know how to report it?

**User:** yes
**Alexa:** You can report it to the FTC at reportfraud.ftc.gov, or forward the text to 7 7 2 6. Would you like me to write a warning you can send to family?

**User:** someone is on the phone saying he's from my bank
**Alexa:** Let's check quickly. Are they asking you to read out or share a code that was just texted or emailed to you?

**User:** yes
**Alexa:** Hang up now. This is almost certainly a scam: No real company or agency ever asks you to read them a code. That code is the key to your account. If you're worried, call your bank back using a number you already trust, like the one on the back of your card. Is there anything else?

**User:** let's practice
**Alexa:** Here's a message: "SunPass: Our records show your vehicle has an outstanding toll balance of $4.15. Pay by today to avoid a $50 penalty: https://sunpass.com-invoice.top/pay" Is it a scam, or is it real?

**User:** it's a scam
**Alexa:** Right! It was a scam, a toll scam. The giveaways: threatens you, and unusual link. That's 1 out of 1. Want another one?

**Found and fixed during this test:** the first run said "call he's from your bank back", because Alexa captured the whole phrase "he's from my bank" as the caller. `cleanClaim()` in `lib/call.js` now strips those lead-ins (regression test in `test/alexa.test.js`).
