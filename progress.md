# Risk — progress

## START HERE
Read this, then `CLAUDE.md`, then `docs/rules-check.md`. Last updated: 2026-10-20 (edge pass).

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
| Sounds, celebrations, effects (shared `js/fx.js` 1.0.3 + `js/fxrisk.js`), Settings > Sound & effects | done 2026-10-20 |
| Real-table look (shared `css/table.css` + `js/table.js` kit, copies of `../_table/`) | done 2026-10-20 |

## Standing instructions (Tim's words)
- "add risk, clue, battleship, connect four, stratego, clue, checkers, pandemic, splendor, king of tokyo, 7 wonders, and evolution to the list of games."
- "the map of the US in TTR looks nothing like the US. Fix this and any other similar problems accross the games" (2026-10-20): maps must read as the real place (real coastlines, lakes, islands).
- "some games have maps and whatnot you can zoom in and out of often. Make it so that there is only an auto zoom that automatically fits the whole board in sight and then you can zoom if you want with easily reseting back to auto mode." (2026-10-20; same behaviour in TTR, Risk, Pandemic, Carcassonne)
- "add opptional sounds you can add to the games that reflect what's happening in the game accurately as well as win celebrations, and other fun annimations to go along with everything. Just make sure everything is customizable in the settings so the user can play as preffered." (2026-10-20)
- "Could you focus on making each game perfect especially in scenarios that the game doesn't expect or are a little weird." (2026-10-20)
- "could you also make sure that each of the games also have a look to them so that the game (either board or card layout) looks almost identical to how the board or card layout looks like in real life, so it's easy to understand if you've already played it before, and also so it feels more like you're actually playing in real life rather than you're playing it online. Even things like how youre cards or other things are laid out infront of you, make it look like they are actual cards laid out similar to how it looks like in real life. Make the decks look like actual decks. Make the board have the same design as it does in real life with the same layouts. It should look kind of like you're looking through a camera that is connected to a user's glasses that is playing in real life (not actually, but the layout and style of everything should be similar)." (2026-10-20)
- From the briefs: exact classic board, 44-card deck, starting armies by player count, escalating and fixed card values, capital and secret-mission variants, own SVG map; exact battle odds, chain odds, expected losses, continent value; computers at measured strength; seats can be you, computer or online in any mix. $0, no copyrighted art or rulebook text.

## Measured computer strength (tools/measure.js, 400 games each, 2026-10-19)
3 players Hard/Medium/Easy: 63% / 37% / 1%. Hard vs two Medium: Hard 42% (fair share 33%). 2p Hard vs Medium 57-43, Hard vs Easy 99-1, Medium vs Easy 98-2.

## Traps
- Ports 8731 etc. are used by other game agents; this project was served on 18947 (`scratchpad/serve.js`).
- `node --test tests/` fails on Windows (treats the folder as a file): use `node --test "tests/*.test.*"`.
- `js/online.js` must stay a byte-for-byte copy of `../_online/online.js`. Risk is gameId `risk`.
- Online writes: one state per move, and setup is one army per move, so a full online game is several thousand writes of the shared 20,000/day free quota (it stops, never bills).
- WebKit offset bug: animating `transform` on an SVG `<g>` badge moved it; the pop now animates the circle's `r`.
- The map box is overflow-hidden and its scroll is always reset (taps near the edge used to shift it). Zoom changes the SVG viewBox only (mapview.js `initZoom`); `#map` has `touch-action: none`, so pinch/drag never reach the page.
- Zoom check: serve the folder, then `node tools/zoomcheck.mjs http://127.0.0.1:<port>/` (WebKit at 393x659, 659x393, 1280x800; 19 checks each; uses Playwright from `~/.claude/tools`). Not part of `npm test`.
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

## Zoom (2026-10-20)
- One zoom only: auto mode fits the whole board (page load, tab change, new game, joining a room, phone rotation). Pinch, wheel / trackpad pinch, or + / - zoom in (max 6x); drag pans only when zoomed, clamped to the board; zooming out stops at the fit = auto again. Fit button (corner brackets) glides back; lit amber when zoomed, dimmed in auto.
- Controls bottom-left of the map, now on laptop too: + above -, fit beside +, placed in empty Pacific so they cover no territory or bonus badge at 393px.
- Removed the old 2.1x zoom toggle (phone only). Turned phone: the board box shrinks (`max-height`) so the whole board stays on screen (it ran 24px off-screen before).

## Sound & effects (2026-10-20)
- `js/fx.js` is a byte-for-byte copy of `../_fx/fx.js` (never edit it; re-copy when the library changes). `js/fxrisk.js`: `events(prev, next, me)` diffs two tables (so your moves, computers' and online players' all sound the same; online = your seat, local = every person, computers-only = none) and `run()` plays them. Hooked in `render()` (`fxStep`); `fxReset()` on new game / reload / joining or leaving a room so nothing replays.
- Event -> sound (+ effect): claim / setup army = `place` (quieter); reinforce = `place` + "+n" float on the badge; card trade = `cardSlide` + `cardFlip` + "+armies" float; one roll = one `dieRoll` per die thrown (attack + defence, 45 ms apart), `diceLand` at 330 ms as the drawn dice settle, then one `thud` per army lost (max 3) + "−n" floats on both badges, dice row shakes when only the attacker lost; blitz = `diceShake` + quick burst of up to 6 `dieRoll`, `diceLand`, up to 5 thuds; move in / end-of-turn move = `slide` + "+n"; territory taken = `stamp` + a flag stamped on the badge, old colour holds then the new colour floods in; continent taken = celebrate 'big' (ding + stars) at its bonus badge + "+bonus"; player wiped out = `explosion` (neutral: `whoosh`) + chip shakes + "Out"; card drawn = `cardDeal` + "+1 card"; cards taken from a wiped-out player = `cardSlide`; your turn starts (reinforce, or your HQ pick) = `turn` + your chip flashes; illegal tap (the existing red toasts) = `error`; Start = `shuffle`; game over = celebrate 'win' (confetti in winner colours) or 'lose' for you; computers-only game shows the win. Others' moves play at 0.75 volume. `dieRoll` and `thud` are Risk's own `FX.define` sounds.
- Animations off (Settings) also stops the old CSS dice tumble / badge pop / target pulse / marching arrow (`.fx-still` on `<html>`); Fast halves them (`.fx-fast`).
- Tests: `tests/fx.test.js` (real fx.js + fake AudioContext + fake elements): scripted game sounds, one sound per die, chime only on your turn, win / lose / computers-only, Sound off = 0 plays, Animations off = 0 animations, no sounds on reload / new game. Failed before `fxrisk.js` existed; mutation-checked (no thuds, always-win, one sound per roll, chime every move, no reload guard all fail it).
- Screenshots: scratchpad `design/risk-fx/` (settings, midgame, win at 393 px and laptop; states from `gen.js` there).

## Real-table look (2026-10-20)
- Play tab = a dark wood table (`main.tbl-surface.tbl-wood-dark`): opponents across the far edge (`#seats .opp`: name plate, face-down card backs + count, armies/lands), the framed printed board in the middle, your place at the near edge (`#mine`: your plate + tray of army pieces to place, your fanned hand of Risk cards, the deck as a stack, traded cards in a messy discard pile). Laptop: board centred at its real shape (container query), helpers in a 380px side panel; phone: helpers in the panel between board and hand (scrolls inside itself); turned phone: two columns.
- Board printed in continent colours (`MapView.BOARD/EDGE`); owners shown only by their army pieces (glossy tokens with the count). Study's owner lens still paints owner colours.
- Cards: paper face with name, the territory's own shape (from the map path) and the troop symbol; wild = three symbols. Red diamond backs.
- Dice: shared `.tbl-die`, red attack, ivory defence, tumble via `TABLE.roll` (fxrisk `env.roll`). Card motion via `env.cards`: a drawn card flies off the deck and flips into your hand (or onto the opponent's backs); traded cards fly onto the discard pile.
- "Done attacking" moved up into the Attack head row (it was below the fold on phone). Hand stays visible all game; tapping it outside your trade phase shows "Trade cards at the start of your turn".
- Zoom knobs are 34px walnut/brass. Short phones (≤600px tall, e.g. 320x568) get a tighter table so Roll/Blitz stay on screen.
- Real-game notes: scratchpad `table/risk/real.md`; before/after shots: scratchpad `table/risk/before|after` (`gen.js` states, `shoot.mjs` = 4 sizes + overflow/scroll/error check). Two reviewer rounds done.
- Kept on purpose after review: numbered army tokens (real figures unreadable at phone size), dark helper panel, app tabs; not built: printed bonus legend / card-trade track on the board, opponents' army piles.

## Edge pass (2026-10-20)
48 odd scenarios tested (scratchpad `edge/risk/`: `scenarios.md`, `edge-engine.js` rules checks, `edge-ui.mjs` WebKit checks at 320x568 / 393x659 / 659x393 / 640x400 / 1280x800 / 1920x1080, `gen-states.js` saved games). 13 failed, all fixed:
- Rule: after a wipe-out you trade only down to 4 cards; a 4-card hand with a set could trade again (engine + AI + no Trade button). Dice must be 1-3 whole numbers.
- End screen says how: "Conquered the world." / "Mission: <winner's mission>." / "Took the headquarters." / "Turn limit: most land." (engine `st.how`; old saves show nothing). Turn-limit log no longer says "You holds".
- Study Threat lens crashed during claiming (AI.threat on unclaimed land). Odds tab: tapping unclaimed land set defender 0 (now 1). Hint while a trade is due says "Trade a card set first". HQ pick on someone else's land says "Pick one of your own".
- Two people on one phone: no "Pass the phone" cover between setup armies unless missions are dealt (nothing secret then).
- Same game in two tabs: the other tab follows each move (`storage` event; new games get `gid`).
- Crowded seats (5 opponents, many cards or big army totals): rows ran into each other; `fitSeats()` now shows one card back + count, then smaller print.
Held up: all-computer table, reload in every phase, storage blocked, damaged saves, Back with sheets, 9-card hand, empty deck, long/emoji/blank/duplicate names, double taps (no double moves).

## NOT verified
- Edge pass: online leave / AFK / host hand-over only through the shared module's tests; two-tab sync while both tabs run computer turns (reasoned: equal versions are ignored).
- The table look on a real iPhone; real card size feel (reasoned); the card flip on a real device.
- Sounds by ear on a real iPhone (headless WebKit on Windows has no Web Audio; sound tested with a fake AudioContext only). Confetti in headless WebKit runs at a low frame rate, so screenshots show it early.
- `tools/zoomcheck.mjs` after this change: its clicks time out on this busy laptop for both the old and new build (4-5 of 57 checks each run); zoom code was not touched.
- Zoom on a real iPhone (pinch tested with synthetic touch pointers in WebKit) and Safari's laptop trackpad pinch (gesture events); no double-tap reset (it would clash with tapping territories).
- Per-territory card symbols against a physical deck; fixed-value symbol pairing.
- On a real iPhone (only WebKit at iPhone size, headless).
- Online with three or more real people, and host hand-over after the host vanishes (module's own tests cover it).
- Free-quota use of a long online game (estimated, not measured).
- Live online run 2026-10-20 (49 moves, two headless phones): once a move took over 10 s to show on both phones, then play carried on in sync. Cause not found (network delay or a tap ignored while the previous move was still sending; the app unblocks after 8 s).
