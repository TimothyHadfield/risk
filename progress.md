# Risk — progress

## START HERE
Read this, then `CLAUDE.md`, then `docs/rules-check.md`. Last updated: 2026-10-19 (first build, phase 2 brief).

## Goal right now
A finished Risk site: full play with every variant, exact odds, measured computers, online seats. Next work only on Tim's request.

## Status
| Part | State |
|---|---|
| Board: 42 territories, 6 continents + bonuses, 83 borders, 44 cards | done, tested |
| Own SVG world map (hand-drawn outlines cut into territories) | done; `tools/buildgeo.js` checks drawn borders against the official list |
| Rules: deal/claim setup, 2-player neutral, escalating/fixed/+1 cards, +2 card land, forced trade, elimination cards, connected/adjacent move | done, tested |
| Goals: world, secret missions (14 or 12), capitals (+ short game) | done, tested |
| Odds: per-roll tables, full battle, chain of territories, stack needed, curve, card ladder, continent value | done, tested |
| Computers Easy/Medium/Hard, measured (`js/strength.js`) | done |
| Online rooms (shared `_online` module, project th-board-games) | done; two-browser run on the real project |
| Study: lenses, luck, timeline, forecast | done |

## Standing instructions (Tim's words)
- "add risk, clue, battleship, connect four, stratego, clue, checkers, pandemic, splendor, king of tokyo, 7 wonders, and evolution to the list of games."
- From the briefs: exact classic board, 44-card deck, starting armies by player count, escalating and fixed card values, capital and secret-mission variants, own SVG map; exact battle odds, chain odds, expected losses, continent value; computers at measured strength; seats can be you, computer or online in any mix. $0, no copyrighted art or rulebook text.

## Measured computer strength (tools/measure.js, 400 games each, 2026-10-19)
3 players Hard/Medium/Easy: 63% / 37% / 1%. Hard vs two Medium: Hard 42% (fair share 33%). 2p Hard vs Medium 57-43, Hard vs Easy 99-1, Medium vs Easy 98-2.

## Traps
- Ports 8731 etc. are used by other game agents; this project was served on 18947 (`scratchpad/serve.js`).
- `node --test tests/` fails on Windows (treats the folder as a file): use `node --test "tests/*.test.*"`.
- `js/online.js` must stay a byte-for-byte copy of `../_online/online.js`. Risk is gameId `risk`.
- Online writes: one state per move, and setup is one army per move, so a full online game is several thousand writes of the shared 20,000/day free quota (it stops, never bills).
- WebKit offset bug: animating `transform` on an SVG `<g>` badge moved it; the pop now animates the circle's `r`.
- The map box is overflow-hidden; its scroll is reset unless zoomed (taps near the edge used to shift it).

## Decisions (one line each)
- Defender always rolls the most dice allowed (no prompt each roll).
- Two players: neutral leftovers spread evenly; neutral never attacks.
- Capitals with 6 players need every enemy HQ (the rulebook covers 3-5).
- Card symbol per territory follows the common card listing (counts verified, pairing not).
- Fixed values: 3 infantry 4, 3 cavalry 6, 3 artillery 8, one of each 10 (sources disagree on the pairing).
- Online: host's phone runs computers; forecast and "Finish setup for me" are hidden online (forecast needs the secret deck).
- Seat choice "Online friend" in the New game panel; Start becomes "Make room"; Join by code below it.
- Pass-the-phone cover screen between people sharing one phone.

## QA pass (fresh agent, live site, 2026-10-20) and fixes
- Fixed + rechecked headless: other players' HQ rings showed during HQ picks (now hidden until all chose); "Finish setup for me" also did other people's setup (now only yours); reload removed the pass-the-phone cover (now covers after a reload); Forecast froze the page up to 7.5 s (now one move per 30 ms slice: worst pause 0.73 s, 6 players, ~90 s total); "stack needed" took 11 s at 200 armies (binary search on the cached table, same answers); bad room code like "A/B/" showed a database error; damaged localStorage crashed the page.
- Held up: rapid double/triple taps, taps during computer turns, reload in every phase, Back with sheets, 2p neutral limit, zoom taps, 163-game random-move engine fuzz.
- Still slow (low): the Odds chain with ~200-army stacks takes ~1 s per tap.

## NOT verified
- Per-territory card symbols against a physical deck; fixed-value symbol pairing.
- On a real iPhone (only WebKit at iPhone size, headless).
- Online with three or more real people, and host hand-over after the host vanishes (module's own tests cover it).
- Free-quota use of a long online game (estimated, not measured).
