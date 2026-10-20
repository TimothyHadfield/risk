# Risk — progress

## START HERE
Read this, then `CLAUDE.md`, then `docs/rules-check.md`. Last updated: 2026-10-20 (real-coastline map + card icons).

## Goal right now
A finished Risk site: full play with every variant, exact odds, measured computers, online seats. Next work only on Tim's request.

## Status
| Part | State |
|---|---|
| Board: 42 territories, 6 continents + bonuses, 83 borders, 44 cards | done, tested |
| World map from real coastlines (Natural Earth, public domain) | done 2026-10-20; `npm install` then `node tools/buildgeo.mjs` rebuilds `js/geo.js` (143 KB) and checks drawn borders against the official list |
| Rules: deal/claim setup, 2-player neutral, escalating/fixed/+1 cards, +2 card land, forced trade, elimination cards, connected/adjacent move | done, tested |
| Goals: world, secret missions (14 or 12), capitals (+ short game) | done, tested |
| Odds: per-roll tables, full battle, chain of territories, stack needed, curve, card ladder, continent value | done, tested |
| Computers Easy/Medium/Hard, measured (`js/strength.js`) | done |
| Online rooms (shared `_online` module, project th-board-games) | done; two-browser run on the real project |
| Study: lenses, luck, timeline, forecast | done |

## Standing instructions (Tim's words)
- "add risk, clue, battleship, connect four, stratego, clue, checkers, pandemic, splendor, king of tokyo, 7 wonders, and evolution to the list of games."
- "the map of the US in TTR looks nothing like the US. Fix this and any other similar problems accross the games" (2026-10-20): maps must read as the real place (real coastlines, lakes, islands).
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
- Map build: dev dependencies only (`node_modules` is gitignored, site loads nothing from them). topojson-simplify weights are square DEGREES, not steradians. Cut lines must get T-junction vertices before the Europe warp, or borders open tiny gaps. The map test skips the rebuild check when `node_modules` is missing.
- The Russia sliver touching North Korea is given to Mongolia (else China would touch Kamchatka); Kazakhstan's far east tip is Ural and Mongolia's far west tip is Siberia so Ural-China and Siberia-China touch, as on the board; Egypt includes eastern Libya.

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

## Design pass (2026-10-20)
- Phone: map badges, +bonus boxes and odds tags drawn 1.36x (`.sc` groups in mapview.js, set by a 899px media query); invisible tap circle per badge (r = min(24, half the distance to the nearest badge)).
- Laptop: board box fills the column height; the SVG sea runs past the viewBox (`#map { overflow: visible }` on desktop only, so phone zoom scroll is unaffected). Panel 400px, cards 68x92.
- Fixed: Settings switches were stretched full width (label.switch had flex:1); toggles no longer wrap; Safari grey select boxes replaced; "?" dots have a 40px tap ring; .btn.sm/stepper/zoom 40px; log fades at the top; dice picker uses the drawn die; computer turn shows from → to; current player chip tinted; continent outlines dimmed once a game is on.
- Before/after screenshots: scratchpad `design/risk/before|after` (states built by `gen.js`, shot by `shoot.sh`).

## Real maps (2026-10-20)
- Board redrawn from Natural Earth (Miller projection, centre 11E so Alaska/Kamchatka sit on the edges, Europe enlarged by one smooth warp). Big lakes from `tools/data/lakes.json`. Grey = land not in the game (New Zealand, Philippines, Pacific islands). Coasts = each territory stroked in its continent colour; dark inner borders on top.
- Every territory has an invisible sea tap area (circle, never past halfway to another badge, under the land). Phone tap sampling: smallest 330 px² (Irkutsk), before 291 (Iceland).
- Card icons redrawn: Cavalry = horse and rider, Artillery = cannon on a wheel.

## NOT verified
- Per-territory card symbols against a physical deck; fixed-value symbol pairing.
- On a real iPhone (only WebKit at iPhone size, headless).
- Online with three or more real people, and host hand-over after the host vanishes (module's own tests cover it).
- Free-quota use of a long online game (estimated, not measured).
- Live online run 2026-10-20 (49 moves, two headless phones): once a move took over 10 s to show on both phones, then play carried on in sync. Cause not found (network delay or a tap ignored while the previous move was still sending; the app unblocks after 8 s).
