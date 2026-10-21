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

## 2026-10-20 — real-table look (builder agent)
- **Asked:** Tim: make every game look "almost identical to how the board or card layout looks like in real life ... like you're looking through a camera that is connected to a user's glasses" (full words in progress.md). Manager: keep the real world map and auto-fit zoom.
- **Built:** wood table with opponents across, printed continent-coloured framed board, your hand fan / army tray / deck / discard pile at the near edge, paper Risk cards with territory shapes, real red/ivory dice, physical card motion (deal + flip, trade onto pile); shared `_table` kit copied in; fx.js re-copied.
- **Verified:** `node --test "tests/*.test.*"` 34 pass + 1 skip (incl. online); WebKit shots of 5 states at 393x659, 320x568, 659x393, 1280x800: no overflow, no page scroll, no console errors; Roll click shows red + ivory dice with animations, no errors; Effects speed and Computer speed change independently; two reviewer rounds, fixes applied; zoomcheck laptop flake same as before (4-5 click timeouts).
- **Open:** real iPhone look; printed bonus legend / trade track not built.

## 2026-10-20 — edge pass (builder agent)
- **Asked:** Tim: "Could you focus on making each game perfect especially in scenarios that the game doesn't expect or are a little weird."
- **Built:** 13 fixes (see progress.md "Edge pass"): wipe-out trade limit, dice check, end screen says how, Threat lens crash, Odds 0 defender, Hint/HQ messages, no setup covers, two-tab sync, crowded seat rows.
- **Verified:** 48 scenarios; new engine tests failed first then pass; `node --test "tests/*.test.*"` 38 pass + 1 skip; WebKit checks 74 (13 failed on the old build, 0 after) at 6 sizes.

## 2026-10-21 — visibility pass (builder agent)
- **Asked:** Tim: "for a lot of the games the cards or board layout is too small to easily see what's going on ... Consider parts of the board that are dense in what's happening and if the user can reasonably see it." (full words in progress.md)
- **Built:** pieces/numbers sized to the board with crowded spots spread apart, odds tags placed beside pieces and under them, + zooms on the picked territory, bigger laptop board (narrower panel), turned phone tabs in the header, tighter attack box on small phones.
- **Verified:** new `tools/vischeck.mjs` 18 fails on the old build, 0 after (WebKit + Chromium, 5 sizes); `npm test` 38 pass + 1 skip; zoomcheck only the known laptop click-timeout flake (old build too); 35 before/after shots, one reviewer round (study table wrap fixed; hand "collapse" was a mid-animation shot).
- **Open:** hand card names and phone whole-board territory names still small.
