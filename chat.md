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

## 2026-10-20 — real maps (builder agent)
- **Asked:** Tim: "the map of the US in TTR looks nothing like the US. Fix this and any other similar problems accross the games". Manager added: redraw the card Cavalry icon as horse and rider and Artillery as a cannon on wheels; make coasts read clearly.
- **Built:** `tools/buildgeo.mjs` draws the board from Natural Earth coastlines (Miller projection, Europe gently enlarged, big lakes cut out), countries assigned to the 42 territories with cut lines like the classic board; invisible sea tap areas per territory; grey non-game land; new card icons.
- **Verified:** 30 tests (new map tests failed on the old map, pass on the new); tap-area sampling at 393px: smallest 330 px² (Irkutsk) vs 291 before (Iceland), Iceland 291 -> 813; one read-only reviewer named the world and found nothing major; screenshots `scratchpad/design/risk-maps/before|after`.

## 2026-10-20 — one auto-fit zoom (builder agent)
- **Asked:** Tim: "some games have maps and whatnot you can zoom in and out of often. Make it so that there is only an auto zoom that automatically fits the whole board in sight and then you can zoom if you want with easily reseting back to auto mode."
- **Built:** viewBox zoom in mapview.js (auto fit, pinch, wheel, + / -, clamped pan, fit glide); + / - / fit buttons on phone and laptop; old 2.1x toggle removed; turned-phone board box fits the screen.
- **Verified:** `tools/zoomcheck.mjs` (WebKit, 3 sizes, 57 checks): 28 failed on the old code, all pass now; `npm test` 29 pass + 1 skip; screenshots `scratchpad/design/risk-zoom/before|after`.
- **Open:** real iPhone pinch, Safari trackpad pinch.

## 2026-10-20 — sounds, celebrations and effects (builder agent)
- **Asked:** Tim: "add opptional sounds you can add to the games that reflect what's happening in the game accurately as well as win celebrations, and other fun annimations to go along with everything. Just make sure everything is customizable in the settings so the user can play as preffered."
- **Built:** shared `js/fx.js` (1.0.3, unchanged copy) + `js/fxrisk.js` (table diff -> sounds/effects, see progress.md map); Settings > Sound & effects; error sound on illegal taps; flag stamp + colour flood on conquest; continent sparkle; win/lose celebration.
- **Verified:** `npm test` 34 pass + 1 skip (new `tests/fx.test.js` failed first, mutation-checked); phone-view WebKit 393 px + 1440 px of settings, mid-game roll, win (confetti), no console errors, no overflow; Chrome timing: blitz click handler +18 ms, worst frame gap no worse than before.
- **Open:** sound on a real iPhone.
