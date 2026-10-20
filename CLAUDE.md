# Risk

Play classic Risk (2-6 seats: you, computers Easy/Medium/Hard, pass-the-phone people, or online friends) with exact battle odds, a real-table odds calculator and study views. Static site, $0.

- Live: https://timothyhadfield.github.io/risk/ · repo TimothyHadfield/risk
- Read `progress.md` first (state, traps, decisions, NOT verified).
- Code: `js/map.js` board data · `js/geo.js` generated map shapes (`node tools/buildgeo.js`) · `js/odds.js` dice Markov chain · `js/engine.js` pure rules `apply(state, action)` · `js/ai.js` computers · `js/adapter.js` + `js/net.js` online (shared `js/online.js`, copied unchanged from `../_online/`) · `js/app.js` UI.
- Test: `node --test "tests/*.test.*"` (28 tests, ~1 min). Strength table: `node tools/measure.js 400` rewrites `js/strength.js`.
- Phone check: serve the folder on a free port, then `node ~/.claude/tools/phone-view.mjs http://127.0.0.1:<port>/ --out shot.png` (and `--desktop`).
- Bump `?v=` in index.html (and net.js's import) when shipping changed JS/CSS.
