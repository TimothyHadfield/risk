# Risk — chat log

## 2026-10-19 — first build (builder agent, phase 2 brief)
- **Asked:** Tim: "add risk, clue, battleship, connect four, stratego, clue, checkers, pandemic, splendor, king of tokyo, 7 wonders, and evolution to the list of games." Manager brief: exact classic Risk with all variants, own SVG map, exact odds layer, measured computers, online/computer seats, rules-check and ideas docs.
- **Built:** map data + generated SVG map, dice Markov-chain odds, pure rules engine, three computer levels with a measured strength table, Play/Odds/Study/Settings tabs, online rooms via the shared `_online` module.
- **Verified:** 28 node tests (mutation-checked: card table, occupy minimum, tie rule x2, income floor, secrecy, out-of-turn); full games played by taps in headless WebKit at iPhone size and laptop width; two headless iPhones playing online against the real Firebase project with a mid-game reload.
- **Open:** see progress.md NOT verified.

## 2026-10-20 — design pass (builder agent)
- **Asked:** Tim: "once you're finished with all the games, review them again for design improvements especially visually."
- **Built:** phone map legibility + tap areas, laptop board fills height, settings switch/toggle fixes, drawn dice picker, log fade, turn chip tint (see progress.md "Design pass").
- **Verified:** 28 tests pass; before/after phone-view screenshots of 10 states at 393px and 1440px, plus 1280x720 and phone zoom; no console errors, no horizontal overflow.
