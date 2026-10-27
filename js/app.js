// Risk app: tabs, the play flow, the odds calculator, study views, settings.
(function () {
  'use strict';
  const M = window.RiskMap, E = window.RiskEngine, O = window.RiskOdds, AI = window.RiskAI;
  const { T, ADJ, CONTINENTS, CARDS } = M;
  const VERSION = 'v1.0';
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = p => (p >= 0.995 && p < 1 ? '>99' : p > 0 && p < 0.005 ? '<1' : Math.round(p * 100)) + '%';
  // red -> green for a chance
  function scale(p) { const h = Math.max(0, Math.min(1, (p - 0.2) / 0.65)) * 125; return `hsl(${h},70%,58%)`; }

  // ------------------------------------------------------------ storage
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const DEF_SETTINGS = { speed: 'normal', names: false, mapOdds: true, rules: {}, seats: null, nPlayers: 3 };
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const savedS = store.get('risk.settings', {});
  const S = Object.assign({}, DEF_SETTINGS, isObj(savedS) ? savedS : {});
  S.rules = Object.assign({}, E.DEFAULT_RULES, isObj(S.rules) ? S.rules : {});
  // a damaged save must never stop the page from opening
  if (![2, 3, 4, 5, 6].includes(S.nPlayers)) S.nPlayers = 3;
  if (!['slow', 'normal', 'fast'].includes(S.speed)) S.speed = 'normal';
  if (!Array.isArray(S.seats) || S.seats.length !== 6 || !S.seats.every(s => isObj(s) && ['human', 'online', 'cpu'].includes(s.kind) && ['easy', 'medium', 'hard'].includes(s.level))) S.seats = null;
  if (typeof S.netName !== 'string') S.netName = '';
  const saveSettings = () => store.set('risk.settings', S);

  // ------------------------------------------------------------ app state
  const app = {
    tab: 'play', game: store.get('risk.game', null), sel: -1, to: -1, amount: 1, dice: 3, cards: [], hint: null,
    moveN: 0, busy: false, lastHuman: -1, covered: false, lens: 'owner',
    calc: store.get('risk.calc', { A: 10, D: [5] }),
    history: [],
    net: null, // online room snapshot while in a room
    gm: store.get('risk.gm', null), // this local game's record: { id, helped, acc, recorded, daily, tutorial }
    rec: store.get('risk.rec', null), // replay frames, one per turn: { id, f: [{ o, a, t, r }] }
    undo: [], // the table before each of your recent moves (Undo against the computer)
    rp: null, // replay: frame shown, or null
  };
  const okGame = g => isObj(g) && g.v === 1 && Array.isArray(g.players) && g.players.length >= 2 && g.players.every(isObj) &&
    Array.isArray(g.owner) && g.owner.length === 42 && Array.isArray(g.armies) && g.armies.length === 42 && typeof g.phase === 'string' &&
    Array.isArray(g.log) && Array.isArray(g.deck) && isObj(g.rules) && Number.isInteger(g.turn) && !!g.players[g.turn];
  if (!okGame(app.game)) app.game = null;
  if (!isObj(app.calc) || !Number.isFinite(app.calc.A) || !Array.isArray(app.calc.D) || !app.calc.D.length || !app.calc.D.every(Number.isFinite)) app.calc = { A: 10, D: [5] };

  // ------------------------------------------------------------ tabs
  const TABS = [
    { id: 'play', name: 'Play', icon: '<path d="M4 18 9 6l4 8 3-5 4 9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' },
    { id: 'odds', name: 'Odds', icon: '<rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8.5" cy="8.5" r="1.6" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>' },
    { id: 'study', name: 'Study', icon: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
    { id: 'settings', name: 'Settings', icon: '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
  ];
  function renderTabs() {
    $('#tabsTop').innerHTML = TABS.map(t => `<button data-tab="${t.id}" ${app.tab === t.id ? 'aria-current="page"' : ''}>${t.name}</button>`).join('');
    $('#tabsBottom').innerHTML = TABS.map(t => `<button data-tab="${t.id}" ${app.tab === t.id ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24">${t.icon}</svg>${t.name}</button>`).join('');
  }
  function goTab(id, push) {
    if (app.tab === id) return;
    if (push !== false) history.pushState({ tab: id }, '', '#' + id);
    if (window.COACH && id !== 'play') COACH.closeOffer();
    app.tab = id; app.sel = -1; app.to = -1; view.resetZoom(); render();
    $('#panel').scrollTop = 0;
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) goTab(b.dataset.tab); });
  window.addEventListener('popstate', e => {
    if (!$('#sheet').hidden) { closeSheet(true); return; }
    if (window.COACH && COACH.rulesOpen()) { COACH.closeRules(); history.pushState({ tab: app.tab }, '', '#' + app.tab); return; }
    const id = (e.state && e.state.tab) || (location.hash.slice(1) || 'play');
    goTab(TABS.some(t => t.id === id) ? id : 'play', false);
  });

  // ------------------------------------------------------------ sheet / toast
  function openSheet(html, onMount) {
    $('#sheet').innerHTML = html + '<div style="margin-top:14px"><button class="btn block" data-close>Close</button></div>';
    $('#sheet').hidden = false; $('#sheetBack').hidden = false;
    history.pushState({ tab: app.tab, sheet: 1 }, '', location.hash || '#' + app.tab);
    if (onMount) onMount($('#sheet'));
  }
  function closeSheet(fromPop) { $('#sheet').hidden = true; $('#sheetBack').hidden = true; if (!fromPop && history.state && history.state.sheet) history.back(); }
  $('#sheetBack').addEventListener('click', () => closeSheet());
  $('#sheet').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
  let toastT = 0;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200); }
  const bad = msg => { toast(msg); FX.play('error'); }; // an illegal tap: same message, plus a soft error sound

  const WHY = {
    win: 'Exact chance from the dice math (not a simulation): you keep rolling the most dice you can until you take it or are down to one army.',
    loss: 'Average armies you lose in this fight, win or lose. The defender always rolls two dice when it can.',
    place: 'You get your territories divided by 3 (at least 3), plus every continent you hold whole, plus any card set you trade.',
    cards: 'Sets: three of a kind, one of each, or a wild plus any two. Value goes up for everyone each time anyone trades. With 5 or more cards you must trade.',
    chain: 'Attack the first territory, move everything but one army in, then attack the next from there. Shows the chance to get at least that far.',
    contval: 'Bonus per border is the bonus divided by the territories you must guard. Fewer borders means cheaper to hold.',
    luck: 'Enemy armies your dice killed minus what the dice should kill on average for the same rolls. Positive means lucky dice.',
    strong: 'Measured by computer-vs-computer games (see below). Hard reads exact odds, values continents and cards, guards its borders, and before placing its armies plays each choice a few turns ahead. Medium attacks only with 70%+ odds. Easy attacks on a whim and never moves armies at the end of a turn.',
    mission: 'Win by finishing this secret task before anyone else. If your target colour is you, or someone else wipes them out, it becomes: hold 24 territories.',
    capital: 'Hold your own headquarters and take every enemy headquarters. Short game: 4 players need 2 enemy HQs, 5 players need 3.',
    threat: 'Red = enemy armies next door outnumber yours there. Green = safe.',
    online: 'Play with friends on their own phones. Set a seat to "Online friend" above and tap Make room, then send them the code. Or type a friend\'s code here and tap Join. The host\'s phone runs the computers; if the host leaves, another player takes over.',
    forecast: 'Plays the rest of this game out 40 times from right now with the Hard computer in every seat (new dice each time) and counts who wins. A rough guide to who is ahead, not a promise.',
  };
  document.addEventListener('click', e => {
    const q = e.target.closest('[data-why]'); if (!q) return;
    e.stopPropagation();
    openSheet(`<div class="h" style="margin-bottom:8px">Why</div><div>${esc(WHY[q.dataset.why] || '')}</div>${q.dataset.why === 'strong' ? strengthTable() : ''}`);
  });
  const why = k => `<button class="q" data-why="${k}" aria-label="Why">?</button>`;

  // ------------------------------------------------------------ map
  const view = new window.MapView($('#map'), t => onTerritory(t));
  // the map box never scrolls (taps near the edge must not shift it); zoom works on the drawing itself
  $('#mapWrap').addEventListener('scroll', e => { e.target.scrollTop = 0; e.target.scrollLeft = 0; });
  // one zoom: auto fits the whole board; pinch / wheel / + / - zoom in; the fit button glides back (lit when zoomed)
  view.onZoom = auto => { const f = $('#fitBtn'); f.classList.toggle('lit', !auto); f.setAttribute('aria-pressed', String(!auto)); };
  // with a territory picked, + zooms in on it (the action); otherwise on the middle of the board
  $('#zoomIn').addEventListener('click', () => { if (app.tab === 'play' && app.sel >= 0) view.zoomOn(app.sel, 1.6); else view.zoomBy(1.6); });
  $('#zoomOut').addEventListener('click', () => view.zoomBy(1 / 1.6));
  $('#fitBtn').addEventListener('click', () => view.fit());

  // ------------------------------------------------------------ sounds & effects (js/fx.js + js/fxrisk.js)
  const FX = window.FX, RFX = window.RiskFX;
  FX.init({ game: 'risk', accent: '#6ea8fe' });
  const fxCss = () => { const s = FX.settings, r = document.documentElement.classList; r.toggle('fx-still', !s.animations); r.toggle('fx-fast', s.animSpeed === 'fast'); };
  FX.onChange(fxCss); fxCss();
  let fxPrev = null; const fxTimers = new Set();
  const onMap = el => { // a badge zoomed off the board gets no floating number
    if (!el) return null;
    const r = el.getBoundingClientRect(), m = $('#map').getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    return x >= m.left && x <= m.right && y >= m.top && y <= m.bottom ? el : null;
  };
  const fxEnv = {
    FX,
    at(ms, f) { const id = setTimeout(() => { fxTimers.delete(id); try { f(); } catch (e) { /* an effect never breaks the game */ } }, ms); fxTimers.add(id); },
    badge: t => onMap(view.badges[t] && view.badges[t].c),
    chip: p => seatEl(p),
    cont: ci => onMap(view.contBadges[ci]),
    panel: () => (app.tab === 'play' ? document.querySelector('#panel .phase .h') : null),
    dice: () => (app.tab === 'play' ? document.querySelector('#panel .dice') : null),
    flood: (t, hex, ms) => RFX.flood(view, t, hex, ms, FX),
    stamp: (t, hex) => RFX.stamp(view, t, hex, FX),
    slide: (from, to, hex, ms, lunge) => RFX.slide(view, from, to, hex, ms, lunge, FX),
    // the drawn dice tumble on the table and land on their numbers
    roll: ms => { if (app.tab === 'play') document.querySelectorAll('#panel .dice .tbl-die').forEach((d, i) => TABLE.roll(d, +d.dataset.v, { duration: ms, seed: Date.now() + i * 97 })); },
    cards: (kind, p, n) => cardMotion(kind, p, n),
  };
  // a player's place at the table: their seat across the board, or your own place at the bottom
  function seatEl(p) {
    if (app.tab !== 'play') return null;
    return document.querySelector(`#seats .opp[data-p="${p}"]`) || (p === mineFor ? document.querySelector('#mine .me') : null);
  }
  // an invisible card-sized spot (fixed) at the centre of an element, so a flying card starts / lands card-sized
  function spotAt(el, w) {
    if (!el) return null;
    const r = el.getBoundingClientRect(), h = w * 88 / 63, s = document.createElement('div');
    s.style.cssText = `position:fixed;left:${r.left + r.width / 2 - w / 2}px;top:${r.top + r.height / 2 - h / 2}px;width:${w}px;height:${h}px;visibility:hidden;pointer-events:none`;
    document.body.appendChild(s); setTimeout(() => s.remove(), 1500);
    return s;
  }
  const cardW = () => (matchMedia('(min-width: 900px)').matches ? 76 : 46);
  // physical card motion: drawn from the deck (yours turns face up in your hand), traded sets go onto the discard pile
  function cardMotion(kind, p, n) {
    if (app.tab !== 'play' || !TABLE.animOn()) return;
    const deck = $('#deck'), pile = $('#discard'), hand = $('#hand'), mine = p === mineFor && hand;
    const seat = mine ? hand : document.querySelector(`#seats .opp[data-p="${p}"] .backs`);
    if (kind === 'draw' && deck && seat) {
      const cards = mine ? hand.querySelectorAll('.rk-card') : [], last = cards[cards.length - 1];
      if (last) last.style.visibility = 'hidden';
      TABLE.deal(deck, mine ? (last || spotAt(hand, cardW())) : seat, { duration: 420 }).then(() => {
        if (!last) return; last.style.visibility = ''; last.classList.remove('rk-turn'); void last.offsetWidth; last.classList.add('rk-turn');
      });
    } else if (kind === 'trade' && pile && seat) {
      const ids = (app.game.discard || []).slice(-n);
      ids.forEach((cid, i) => setTimeout(() => {
        const from = spotAt(seat, mine ? cardW() : cardW() * 0.6);
        TABLE.deal(from, pile, { face: riskCard(cid, { cls: 'ghost' }), duration: 380 });
      }, i * 90));
    }
  }
  // the seats played on this screen: online your own seat; here every person (computers-only game: none)
  const fxMe = g => (app.net ? [app.net.mySeat] : g.players.map((p, i) => (p.kind === 'human' ? i : -1)).filter(i => i >= 0));
  function fxStep() { // called on every draw: play whatever changed on the table since the last one
    const g = app.game;
    if (g === fxPrev) return;
    if (fxPrev && g) { try { RFX.run(RFX.events(fxPrev, g, fxMe(g)), fxEnv); } catch (e) { /* never break a move */ } }
    fxPrev = g;
  }
  function fxReset() { fxTimers.forEach(clearTimeout); fxTimers.clear(); fxPrev = app.game; } // a new or reloaded table: no sounds for it

  function mapUI() {
    const g = app.game, ui = { names: S.names };
    if (app.tab === 'odds' || !g) { if (!g) ui.names = true; return ui; }
    const me = g.turn, human = isHumanTurn();
    if (app.tab === 'study') { ui.heat = lensColors(); return ui; }
    if (!human) { if (g.lastRoll) ui.arrow = [g.lastRoll.from, g.lastRoll.to]; return ui; }
    ui.sel = app.sel;
    if (g.phase === 'attack' && app.sel >= 0) {
      ui.targets = new Set(ADJ[app.sel].filter(t => g.owner[t] !== me));
      if (S.mapOdds && g.armies[app.sel] >= 2) {
        ui.tags = new Map();
        ui.targets.forEach(t => { const p = O.battle(g.armies[app.sel], g.armies[t]).win; ui.tags.set(t, { text: pct(p), bg: scale(p) }); });
      }
      if (app.to >= 0) ui.arrow = [app.sel, app.to];
    } else if (g.phase === 'fortify' && app.sel >= 0) {
      ui.targets = new Set(owned(me).filter(t => E.canFortify(g, app.sel, t)));
      if (app.to >= 0) ui.arrow = [app.sel, app.to];
    } else if (g.phase === 'occupy') {
      ui.sel = g.occupy.from; ui.arrow = [g.occupy.from, g.occupy.to];
    } else if (g.phase === 'reinforce' && app.hint != null) {
      ui.targets = new Set([app.hint]);
    }
    return ui;
  }
  const owned = p => E.owned(app.game, p);

  function lensColors() {
    const g = app.game, out = [];
    const me = viewer();
    for (let t = 0; t < 42; t++) {
      // the board is printed in continent colours; the Owner lens paints each territory in its owner's colour
      if (app.lens === 'owner') out.push(g.owner[t] >= 0 ? g.players[g.owner[t]].hex : '#cfc6b0');
      else if (app.lens === 'cont') out.push(CONTINENTS[T[t].ci].color);
      else if (app.lens === 'threat') {
        if (g.owner[t] !== me) { out.push('#2a3042'); continue; }
        const th = AI.threat(g, t), mine = g.armies[t];
        out.push(scale(th === 0 ? 1 : Math.max(0, Math.min(1, (mine - th + 6) / 12))));
      }
    }
    return out;
  }

  // ------------------------------------------------------------ game flow
  function isHumanTurn() {
    const g = app.game; if (!g || g.phase === 'over') return false;
    if (app.net) return !!app.net.myTurn && g.turn === app.net.mySeat;
    return g.players[g.turn].kind === 'human' && !autoNow(g);
  }
  const SETUP = ['claim', 'place', 'capital'];
  // a person who tapped "Finish setup for me": the computer plays their setup turns
  const autoNow = g => SETUP.includes(g.phase) && (g.players[g.turn].kind === 'cpu' || (g.autoSetup || []).includes(g.turn));
  const hardFor = (g, p) => g.players[p].kind === 'cpu' ? g : Object.assign({}, g, { players: g.players.map((q, i) => (i === p ? Object.assign({}, q, { level: 'hard' }) : q)) });
  function viewer() { // whose secrets the screen may show
    const g = app.game; if (!g) return -1;
    if (app.net) return app.net.mySeat;
    if (isHumanTurn()) return g.turn;
    if (app.lastHuman >= 0) return app.lastHuman;
    if (humans() > 1) return -1; // after a reload: show nobody's secrets until someone takes the phone
    return g.players.findIndex(p => p.kind === 'human');
  }
  const humans = () => app.game.players.filter(p => p.kind === 'human').length;

  function act(action) {
    if (app.net) { // online: the host's browser applies it; the new table arrives in onNet()
      if (app.net.sending) return false;
      app.net.sending = true;
      // stay "sending" until the new table arrives (onNet), so a quick second tap can't land on the old one
      const unstick = () => { if (app.net) app.net.sending = false; };
      window.RiskNet.act(action).then(r => { if (!r.ok) { unstick(); toast(r.message); } else setTimeout(unstick, 8000); });
      return false;
    }
    const prev = app.game, mine = isHumanTurn();
    try {
      app.history.push(app.game);
      if (app.history.length > 1) app.history.shift();
      app.game = E.apply(app.game, action);
    } catch (e) { bad(e.message); return false; }
    // Undo against the computer: the table before each of your moves (never in the Daily game)
    if (mine && !(app.gm && app.gm.daily)) { app.undo.push({ g: prev, nf: app.rec ? app.rec.f.length : 0 }); if (app.undo.length > 12) app.undo.shift(); }
    recFrame(app.game, prev);
    gameStats(app.game);
    store.set('risk.game', app.game);
    return true;
  }
  // ------------------------------------------------------------ the game's record: stats, Daily, replay, undo
  const saveGm = rec => { store.set('risk.gm', app.gm); if (rec !== false) store.set('risk.rec', app.rec); };
  const soloSeat = g => { const h = g.players.map((p, i) => (p.kind === 'human' ? i : -1)).filter(i => i >= 0); return h.length === 1 ? h[0] : -1; };
  function gameStats(g) {
    if (app.net || !g || !window.RiskProfile) return;
    if (!app.gm || app.gm.id !== g.gid) app.gm = { id: g.gid, helped: false, acc: null, recorded: false, daily: null, tutorial: false };
    const me = soloSeat(g);
    app.gm.acc = RiskProfile.track(app.gm.acc, g, me, CONTINENTS, E);
    if (g.phase === 'over') app.undo = [];
    if (g.phase === 'over' && !app.gm.recorded && !app.gm.tutorial && window.Profile && me >= 0) {
      app.gm.recorded = true;
      const r = RiskProfile.result(g, me, { helped: app.gm.helped, daily: !!app.gm.daily, acc: app.gm.acc });
      try { Profile.recordResult(app.gm.daily ? Object.assign(r, { date: app.gm.daily }) : r); } catch (e) { /* stats never break the game */ }
    }
    saveGm(false);
  }
  // one replay frame per turn once setup is over (who holds what, how many armies)
  function recFrame(g, prev) {
    if (app.net || !g || SETUP.includes(g.phase)) return;
    if (!app.rec || app.rec.id !== g.gid) app.rec = { id: g.gid, f: [] };
    const f = app.rec.f;
    if (f.length && prev && prev.turn === g.turn && g.phase !== 'over') return;
    f.push({ o: g.owner.map(o => o + 1).join(''), a: g.armies.join(','), t: g.turn, r: g.round });
    store.set('risk.rec', app.rec);
  }
  const frameState = i => {
    const fr = app.rec.f[i], g = app.game;
    return Object.assign({}, g, { owner: fr.o.split('').map(c => +c - 1), armies: fr.a.split(',').map(Number), turn: fr.t, round: fr.r, phase: 'replay', lastRoll: null });
  };
  // leaving an unfinished Daily game (new game, another Daily) counts it as lost, so it can't be retried
  function abandonDaily() {
    const m = app.gm, g = app.game;
    if (!window.Profile || !m || !m.daily || m.recorded || !g || g.phase === 'over' || m.id !== g.gid) return;
    m.recorded = true; saveGm();
    try { Profile.recordResult({ mode: m.helped ? 'help' : 'computer', level: m.helped ? null : 'hard', won: false, daily: true, date: m.daily }); } catch (e) { /* ignore */ }
    toast('Daily game left: counted as a loss');
  }
  // starting the Daily or the guided game over an unfinished game: the first tap only warns
  let leaveAsk = 0;
  function leaveOk() {
    if (!app.game || app.game.phase === 'over' || Date.now() - leaveAsk < 4000) { leaveAsk = 0; return true; }
    leaveAsk = Date.now();
    toast('Tap again to leave your game in progress');
    return false;
  }
  function endGame() { abandonDaily(); clearTimeout(tickT); stopReplay(); app.game = null; app.undo = []; store.del('risk.game'); render(); offerTutorial(); }
  function undo() {
    const g = app.game;
    if (app.net || !g || g.phase === 'over' || !app.undo.length || (app.gm && app.gm.daily)) return;
    const x = app.undo.pop();
    clearTimeout(tickT);
    if (app.gm) app.gm.helped = true;
    if (app.rec && app.rec.id === x.g.gid) app.rec.f.length = Math.min(app.rec.f.length, x.nf);
    app.game = x.g; app.sel = -1; app.to = -1; app.cards = []; app.hint = null;
    if (g.turn !== x.g.turn) app.lastHuman = x.g.turn;
    store.set('risk.game', app.game); saveGm();
    fxReset(); render(); tick();
    toast('Took back your last move');
    if (window.COACH) COACH.emit('undo');
  }
  function startDaily() {
    if (!window.Profile || !window.RiskProfile) return;
    const day = Profile.daily.date(), g = app.game;
    if (app.gm && app.gm.daily === day && g && g.gid === app.gm.id && g.phase !== 'over') { Profile.closePanel(); if (app.tab !== 'play') goTab('play'); return toast('Your Daily game is on the table'); }
    if (Profile.daily.played(day)) return Profile.openPanel({ tab: 'daily' });
    if (app.net) { Profile.closePanel(); return toast('Leave the online room first'); }
    if (!leaveOk()) return;
    Profile.closePanel();
    const d = RiskProfile.dailyGame(Profile.daily.seed(day));
    startLocal(d.seats, d.rules, { seed: d.seed, daily: day });
    toast('Daily game: you against two Hard computers');
  }
  // Basic Training (js/tutorial.js + shared js/coach.js): a fixed deal, you against two Easy computers
  let tour = null;
  function startTutorial() {
    if (!window.COACH || !tour || !window.RiskTutorial) return;
    if (app.net) return toast('Leave the online room first');
    if (!leaveOk()) return;
    const t = RiskTutorial.setup();
    tour.reset();
    startLocal(t.seats, t.rules, { seed: t.seed, tutorial: true });
    tour.start();
  }
  function offerTutorial() {
    if (!window.COACH || !tour || app.tab !== 'play' || app.game || app.net || !$('#sheet').hidden) return;
    if (tour.seen() || COACH.offered('risk-first')) return;
    COACH.offer({ id: 'risk-first', title: 'New to Risk?', text: 'Basic Training: a guided first game against two easy computers.', yes: 'Teach me', no: 'No thanks', onYes: () => startTutorial() });
  }
  function openRules() { if (window.COACH && window.RiskTutorial) { closeSheet(); COACH.rules(RiskTutorial.rules()); } }
  // replay of a finished game, turn by turn
  let rpT = 0;
  function stopReplay() { clearInterval(rpT); rpT = 0; app.rp = null; }
  function replayPanel() {
    const n = app.rec.f.length, i = app.rp, fr = app.rec.f[i], g = app.game, P = g.players[fr.t];
    const land = g.players.map((p, k) => ({ p, n: fr.o.split('').filter(c => +c - 1 === k).length })).filter(x => x.n > 0);
    return `<div class="phase"><div class="head"><span class="h">Replay</span><span class="small muted num">Round ${fr.r} · turn ${i + 1} of ${n}</span></div>
      <div class="small" style="margin-bottom:6px"><b style="color:${P.hex}">${esc(P.name)}</b> to play</div>
      <input type="range" class="rp-range" id="rpRange" min="0" max="${n - 1}" value="${i}" aria-label="Turn">
      <div class="row" style="margin-top:8px"><button class="btn sm" id="rpPrev" aria-label="Back">‹</button><button class="btn sm primary grow" id="rpPlay">${rpT ? 'Pause' : 'Play'}</button><button class="btn sm" id="rpNext" aria-label="Forward">›</button><button class="btn sm" id="rpClose">Done</button></div>
      <div class="row wrap small" style="margin-top:8px">${land.map(x => `<span class="pill" style="background:${x.p.hex}">${esc(x.p.name)} ${x.n}</span>`).join('')}</div></div>`;
  }
  function bindReplay() {
    const n = app.rec.f.length, go = i => { app.rp = Math.max(0, Math.min(n - 1, i)); render(); };
    const on = (id, f) => { const b = document.getElementById(id); if (b) b.addEventListener('click', f); };
    on('rpPrev', () => { clearInterval(rpT); rpT = 0; go(app.rp - 1); });
    on('rpNext', () => { clearInterval(rpT); rpT = 0; go(app.rp + 1); });
    on('rpClose', () => { stopReplay(); render(); });
    on('rpPlay', () => {
      if (rpT) { clearInterval(rpT); rpT = 0; render(); return; }
      if (app.rp >= n - 1) app.rp = 0;
      rpT = setInterval(() => { if (app.rp == null || app.rp >= n - 1) { clearInterval(rpT); rpT = 0; render(); return; } go(app.rp + 1); }, DELAY[S.speed] + 220);
      render();
    });
    const r = $('#rpRange'); if (r) r.addEventListener('input', () => { clearInterval(rpT); rpT = 0; go(+r.value); });
  }
  function afterAct() {
    const g = app.game;
    if (g.phase !== 'attack' && g.phase !== 'fortify') { app.to = -1; }
    if (g.phase === 'reinforce' || g.phase === 'over') { app.sel = -1; }
    app.hint = null;
    render();
    tick();
  }

  const DELAY = { slow: 750, normal: 380, fast: 90 };
  let tickT = 0;
  function tick() {
    clearTimeout(tickT);
    const g = app.game; if (!g || g.phase === 'over' || app.net) return; // online: the host runs the computers
    const P = g.players[g.turn];
    if (P.kind === 'cpu' || autoNow(g)) {
      const d = ['claim', 'place'].includes(g.phase) ? Math.min(60, DELAY[S.speed]) : DELAY[S.speed];
      tickT = setTimeout(() => {
        if (!app.game || app.game !== g) return;
        const a = AI.choose(hardFor(g, g.turn), g.turn);
        if (!a || !act(a)) return;
        render(); tick();
      }, d);
    } else if (P.kind === 'human') {
      // claiming and placing show nothing secret unless missions are dealt: no cover between every single army
      const secret = !['claim', 'place'].includes(g.phase) || g.players.some(p => p.mission);
      if (humans() > 1 && app.lastHuman !== g.turn && app.lastHuman !== -1 && secret) showCover(g.turn);
      app.lastHuman = g.turn;
    }
  }
  function showCover(p) {
    const P = app.game.players[p];
    const c = document.createElement('div'); c.className = 'cover';
    c.innerHTML = `<div class="cap">Pass the phone</div><div class="big" style="color:${P.hex}">${esc(P.name)}</div><div class="muted">Your cards${P.mission ? ' and mission' : ''} are on the next screen.</div><button class="btn primary">I'm ${esc(P.name)}</button>`;
    c.querySelector('button').addEventListener('click', () => c.remove());
    document.body.appendChild(c);
  }

  function onTerritory(t) {
    const g = app.game;
    if (app.tab === 'odds') { // tap a territory to load its armies as the defender
      if (!g) return;
      app.calc.D[app.calc.D.length - 1] = Math.max(1, g.armies[t]); // unclaimed land has 0: the calculator starts at 1
      store.set('risk.calc', app.calc); render(); return;
    }
    if (!g || !isHumanTurn()) { toast(T[t].name); return; }
    if (app.tab !== 'play') goTab('play');
    const me = g.turn;
    switch (g.phase) {
      case 'claim': if (g.owner[t] < 0) { act({ type: 'claim', t }); afterAct(); } else bad(T[t].name + ' is taken'); return;
      case 'place': {
        if (g.owner[t] === me || (g.quota && g.owner[t] === g.neutral)) { act({ type: 'place', t }); afterAct(); }
        else bad(g.quota ? 'Yours or a neutral one' : 'Place on your own land');
        return;
      }
      case 'capital': if (g.owner[t] === me) { act({ type: 'capital', t }); afterAct(); } else bad('Pick one of your own'); return;
      case 'reinforce': {
        if (g.mustTrade) { bad('Trade a card set first'); return; }
        if (g.owner[t] !== me) { bad('Place on your own land'); return; }
        const n = app.amount === 0 ? g.reserve : Math.min(app.amount, g.reserve);
        act({ type: 'place', t, n }); afterAct(); return;
      }
      case 'attack': {
        if (g.owner[t] === me) { app.sel = g.armies[t] >= 2 ? t : -1; app.to = -1; if (g.armies[t] < 2) bad('Needs 2+ armies to attack'); render(); return; }
        if (app.sel >= 0 && ADJ[app.sel].includes(t)) { app.to = t; render(); return; }
        // tap an enemy first: pick your strongest neighbour
        const from = ADJ[t].filter(u => g.owner[u] === me && g.armies[u] >= 2).sort((a, b) => g.armies[b] - g.armies[a])[0];
        if (from !== undefined) { app.sel = from; app.to = t; render(); } else bad('No army next to ' + T[t].name);
        return;
      }
      case 'fortify': {
        if (g.owner[t] !== me) return;
        if (app.sel >= 0 && app.sel !== t && E.canFortify(g, app.sel, t)) { app.to = t; app.moveN = g.armies[app.sel] - 1; render(); return; }
        app.sel = g.armies[t] >= 2 ? t : -1; app.to = -1; render(); return;
      }
    }
  }

  // ------------------------------------------------------------ art
  const SYM_SVG = {
    I: '<circle cx="17" cy="7" r="4.2" fill="currentColor"/><path d="M10 28V18c0-4 3-6 7-6s7 2 7 6v10h-4v-8h-1v8h-4v-8h-1v8z" fill="currentColor"/><path d="M26 4v18" stroke="currentColor" stroke-width="1.8"/>',
    C: '<path d="M7 15C9 13.2 17 13 20.5 13.5L24.5 7.5 25.5 5.4 26.8 7C28.5 8 30.5 9.5 31.8 11L31 12.8C29.5 12.8 28 12.5 27 12C26 13.5 25.2 15.5 25 17C24.8 19 24.3 20.3 23.5 21L24.5 28H22.5L21.5 22.5 20.5 22.5 20 28H18L18.5 21.8H12L11 28H9L9.5 21.5 8.6 21 7 28H5L6.4 19C5.6 18 6 16 7 15Z" fill="currentColor"/><path d="M7.5 15.5C4.5 16 3 19 2.5 24H4.2C4.7 20.5 5.8 18.5 8 17.3Z" fill="currentColor"/><circle cx="15.4" cy="3.4" r="2.4" fill="currentColor"/><path d="M12.9 6.5h4.8l.8 7.2-5.8.2z" fill="currentColor"/><path d="M17 8.2l5.6 2.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>', // horse and rider
    A: '<path d="M4.5 19.5 28.6 8.6l1.9 4.1L7.3 25.2z" fill="currentColor"/><rect x="28" y="7.2" width="3" height="6.6" rx="1" transform="rotate(-24 29.5 10.5)" fill="currentColor"/><path d="M13 23 3 28.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="15" cy="22.5" r="6" fill="#f3efe4" stroke="currentColor" stroke-width="2.2"/><path d="M15 16.5v12M9 22.5h12M10.8 18.3l8.4 8.4M19.2 18.3l-8.4 8.4" stroke="currentColor" stroke-width="1.2"/><circle cx="15" cy="22.5" r="1.8" fill="currentColor"/>', // cannon on a wheel
    W: '<path d="M17 3l4 9 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z" fill="currentColor"/>',
  };
  const SYM_NAME = { I: 'Infantry', C: 'Cavalry', A: 'Artillery', W: 'Wild' };
  // a territory card laid out like the real ones: name at the top, the territory's shape, the troop symbol below
  const shapeBox = []; // territory -> viewBox around its outline (measured once from the drawn map)
  function shapeVB(t) {
    if (!shapeBox[t]) {
      let b = null; try { b = view.paths[t].getBBox(); } catch (e) { /* not drawn yet */ }
      if (!b || !b.width) return '0 0 10 10';
      const pad = Math.max(b.width, b.height) * 0.06;
      shapeBox[t] = [b.x - pad, b.y - pad, b.width + 2 * pad, b.height + 2 * pad].map(v => +v.toFixed(1)).join(' ');
    }
    return shapeBox[t];
  }
  function riskCard(cid, o) {
    o = o || {};
    const c = CARDS[cid], cls = `tbl-card tbl-poker rk-card${o.on ? ' is-up' : ''}${o.own ? ' own' : ''}${o.cls ? ' ' + o.cls : ''}`;
    if (c.terr < 0) {
      return `<div class="${cls} wild" data-card="${cid}" role="button" aria-pressed="${!!o.on}" aria-label="Wild card"><span class="rk-nm">Wild</span><span class="rk-syms">${['I', 'C', 'A'].map(s => `<svg viewBox="0 0 34 30">${SYM_SVG[s]}</svg>`).join('')}</span><span class="rk-lab">Wild</span></div>`;
    }
    const ci = T[c.terr].ci, id = CONTINENTS[ci].id;
    const nm = T[c.terr].name, long = nm.length > 9 || nm.split(' ').some(w => w.length > 7);
    return `<div class="${cls}" data-card="${cid}" role="button" aria-pressed="${!!o.on}" aria-label="${esc(nm)}, ${SYM_NAME[c.sym]}"><span class="rk-nm${long ? ' long' : ''}">${esc(nm)}</span>` +
      `<svg class="rk-shape" viewBox="${shapeVB(c.terr)}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path d="${window.RiskGeo.terr[c.terr].d}" fill="${window.MapView.BOARD[id]}" stroke="${window.MapView.EDGE[id]}" vector-effect="non-scaling-stroke"/></svg>` +
      `<svg class="rk-sym" viewBox="0 0 34 30" aria-hidden="true">${SYM_SVG[c.sym]}</svg></div>`;
  }
  const BACK = 'diamonds'; // the printed back of every Risk card
  // a plastic army piece (infantry 1, cavalry 5, artillery 10) in a player's colour
  const piece = (sym, hex) => `<svg class="rk-piece" viewBox="0 0 34 30" style="color:${hex}" aria-hidden="true">${SYM_SVG[sym]}</svg>`;
  function trayHTML(n, hex) { // unplaced armies laid in front of you, broken into real pieces
    const bits = []; let a = n;
    [[10, 'A'], [5, 'C'], [1, 'I']].forEach(([v, s]) => { let k = Math.floor(a / v); a -= k * v; while (k-- > 0 && bits.length < 6) bits.push(piece(s, hex)); });
    return `<div class="tray" aria-label="${n} armies to place">${bits.join('')}<b class="num">${n}</b></div>`;
  }
  const pipHTML = v => TABLE.PIPS[v].map(c => `<i style="grid-area:${Math.ceil(c / 3)}/${(c - 1) % 3 + 1}"></i>`).join('');
  function dieFace(k) { // small drawn die showing k pips
    const P = { 1: [[9, 9]], 2: [[5, 5], [13, 13]], 3: [[4.5, 4.5], [9, 9], [13.5, 13.5]] }[k];
    return `<svg viewBox="0 0 18 18" width="20" height="20" aria-hidden="true"><rect x="1" y="1" width="16" height="16" rx="4" fill="#e5534b"/>${P.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.7" fill="#fff"/>`).join('')}</svg>`;
  }
  function diceHTML(r) {
    if (!r) return '';
    const n = Math.min(r.att.length, r.def.length);
    // red attack dice against ivory defence dice, as on the real table
    const a = r.att.map((v, i) => `<span class="tbl-die red${i < n && v <= r.def[i] ? ' lost' : ''}" data-v="${v}" aria-label="Attack ${v}">${pipHTML(v)}</span>`).join('');
    const d = r.def.map((v, i) => `<span class="tbl-die${i < n && r.att[i] > v ? ' lost' : ''}" data-v="${v}" aria-label="Defence ${v}">${pipHTML(v)}</span>`).join('');
    return `<div class="dice">${a}<span class="vs">vs</span>${d}<span class="small muted" style="margin-left:6px">−${r.al} / −${r.dl}</span></div>`;
  }

  // ------------------------------------------------------------ PLAY panel
  // ------------------------------------------------------------ the table round the board
  // Other players sit across the board (name plate, the backs of their cards, their land and armies);
  // you sit at the bottom edge (your hand fanned, your unplaced armies, the deck and the discard pile).
  let mineFor = -1, seatsKey = '', mineKey = '', fanApi = null;
  const nCards = p => (Array.isArray(p.cards) ? p.cards.length : (p.cards | 0));
  const armiesOf = (g, i) => g.armies.reduce((a, n, t) => a + (g.owner[t] === i ? n : 0), 0);
  function renderTable() {
    const rp = app.rp != null && app.rec && app.rec.f[app.rp]; // replay: the seats show that turn's land and armies
    const g = rp ? frameState(app.rp) : app.game, show = app.tab === 'play' && !!g;
    $('#seats').hidden = !show; $('#mine').hidden = !show;
    document.body.classList.toggle('at-table', show);
    if (!show) { seatsKey = mineKey = ''; mineFor = -1; return; }
    const v = viewer(); mineFor = v;
    // seats across the table
    const others = g.players.map((p, i) => i).filter(i => i !== v);
    const sk = JSON.stringify([v, g.turn, g.phase === 'over', others.map(i => { const p = g.players[i]; return [p.name, p.out, nCards(p), E.countOwned(g, i), armiesOf(g, i)]; })]);
    if (sk !== seatsKey) {
      seatsKey = sk;
      $('#seats').innerHTML = others.map(i => {
        const p = g.players[i], turn = g.turn === i && g.phase !== 'over';
        if (p.kind === 'neutral') return `<div class="opp neutral" data-p="${i}" style="--pc:${p.hex}"><div class="tbl-plate"><i></i>Neutral</div><div class="seat-row"><span class="st num">${E.countOwned(g, i)}▲ ${armiesOf(g, i)}⚑</span></div></div>`;
        const k = nCards(p), backs = Array.from({ length: Math.min(k, 5) }, () => TABLE.back({ pattern: BACK })).join('');
        return `<div class="opp${turn ? ' turn' : ''}${p.out ? ' out' : ''}" data-p="${i}" style="--pc:${p.hex}"><div class="tbl-plate"><i></i><span class="nm">${esc(p.name)}</span></div>` +
          `<div class="seat-row"><span class="backs" aria-label="${k} cards">${backs}${k ? `<b class="num">${k}</b>` : ''}</span><span class="st num">${E.countOwned(g, i)}▲ ${armiesOf(g, i)}⚑</span></div></div>`;
      }).join('');
      fitSeats();
    }
    // your place: plate, unplaced armies, hand, deck, discard pile
    const P = v >= 0 ? g.players[v] : null, hand = P && Array.isArray(P.cards) ? P.cards : [];
    const myTurn = v >= 0 && isHumanTurn() && g.turn === v;
    const pick = myTurn && g.phase === 'reinforce';
    const toPlace = !P || !myTurn ? 0 : g.phase === 'reinforce' ? g.reserve : SETUP.includes(g.phase) ? (P.pool | 0) : 0;
    const deckN = Array.isArray(g.deck) ? g.deck.length : (g.deck | 0), disc = (g.discard || []).slice(-5);
    const sel = app.cards.filter(c => hand.includes(c));
    const mk = JSON.stringify([v, hand, sel, pick, toPlace, deckN, disc, g.discard ? g.discard.length : 0, P && [P.name, P.hex, E.countOwned(g, v), armiesOf(g, v)], myTurn, g.phase === 'over']);
    if (mk === mineKey) return;
    mineKey = mk;
    const me = P ? `<div class="me${myTurn && g.phase !== 'over' ? ' turn' : ''}" style="--pc:${P.hex}"><div class="tbl-plate"><i></i><span class="nm">${esc(P.name)}</span></div>${toPlace ? trayHTML(toPlace, P.hex) : `<span class="st num">${E.countOwned(g, v)}▲ ${armiesOf(g, v)}⚑</span>`}</div>` : '<div class="me"></div>';
    $('#mine').innerHTML = `${me}<div class="hand${pick ? ' pick' : ''}" id="hand"></div><div class="decks"><div id="deck" aria-label="Deck, ${deckN} cards"></div><div id="discard" aria-label="Traded cards"></div></div>`;
    TABLE.deck($('#deck'), deckN, { pattern: BACK, perCard: 0.3, max: 10 });
    // every card keeps its own small tilt by its place in the whole pile, so the pile never reshuffles on screen
    const all = g.discard || [];
    TABLE.pile($('#discard'), all.map((c, i) => (i >= all.length - 5 ? riskCard(c) : '')), { seed: 'risk-discard', max: 5, rot: 10, off: 3 });
    // the hand last, once the deck and pile have their size, so the fan gets its real width
    if (fanApi && fanApi.disconnect) fanApi.disconnect();
    fanApi = TABLE.fan($('#hand'), hand.map(c => riskCard(c, { on: sel.includes(c), own: CARDS[c].terr >= 0 && g.owner[CARDS[c].terr] === v })), { pick: false, spread: 0.66, lift: 12, maxRot: 10, arc: 0.8 });
  }
  // many players on a narrow screen: show one card back (the count stays), then smaller print, until every seat fits
  function fitSeats() {
    const box = $('#seats'), over = () => [...box.querySelectorAll('.opp')].some(o => { const r = o.querySelector('.seat-row'); return r && r.getBoundingClientRect().width > o.getBoundingClientRect().width + 0.5; });
    box.classList.remove('tight', 'tighter');
    if (!box.clientWidth || !over()) return;
    box.classList.add('tight'); if (over()) box.classList.add('tighter');
  }
  window.addEventListener('resize', () => { if (!$('#seats').hidden) fitSeats(); });
  // tap a card in your hand to pick it for a set (only while you are placing armies)
  $('#mine').addEventListener('click', e => {
    const c = e.target.closest('#hand [data-card]'); if (!c) return;
    const g = app.game;
    if (!g || g.phase !== 'reinforce' || !isHumanTurn() || g.turn !== mineFor) { bad('Trade cards at the start of your turn'); return; }
    const id = +c.dataset.card, i = app.cards.indexOf(id);
    if (i >= 0) app.cards.splice(i, 1); else { app.cards.push(id); if (app.cards.length > 3) app.cards.shift(); }
    render();
  });

  function newGamePanel() {
    const n = S.nPlayers;
    if (!S.seats || S.seats.length !== 6) S.seats = [{ kind: 'human', level: 'medium' }].concat(Array.from({ length: 5 }, () => ({ kind: 'cpu', level: 'medium' })));
    const mode = S.rules.mode;
    const rows = Array.from({ length: n }, (_, i) => {
      const s = S.seats[i], c = E.COLORS[i];
      const v = s.kind === 'human' || s.kind === 'online' ? s.kind : s.level;
      return `<div class="seat"><i style="background:${c.hex}"></i><span>${c.name}</span><select data-seat="${i}" aria-label="${c.name} seat">
        <option value="human" ${v === 'human' ? 'selected' : ''}>Person</option>
        <option value="online" ${v === 'online' ? 'selected' : ''}>Online friend</option>
        <option value="easy" ${v === 'easy' ? 'selected' : ''}>Computer · Easy</option>
        <option value="medium" ${v === 'medium' ? 'selected' : ''}>Computer · Medium</option>
        <option value="hard" ${v === 'hard' ? 'selected' : ''}>Computer · Hard</option></select></div>`;
    }).join('');
    const net = S.seats.slice(0, n).some(s => s.kind === 'online');
    return `<div class="phase">
      <div class="head"><span class="h">New game</span>${why('strong')}<button class="btn primary sm" id="startBtn" style="min-width:96px">${net ? 'Make room' : 'Start'}</button></div>
      <div class="seg" id="nPl" aria-label="Players">${[2, 3, 4, 5, 6].map(k => `<button aria-pressed="${k === n}" data-n="${k}">${k}${k === 2 ? ' players' : ''}</button>`).join('')}</div>
      <div style="margin-top:6px">${rows}</div>
      ${n === 2 ? '<div class="small muted" style="margin-top:6px">Two players: a neutral army holds 14 territories.</div>' : ''}
      <div class="seg" id="modeSeg" style="margin-top:8px" aria-label="Goal">${[['classic', 'World'], ['mission', 'Missions'], ['capital', 'Capitals']].map(([k, l]) => `<button aria-pressed="${mode === k}" data-mode="${k}" ${n === 2 && k !== 'classic' ? 'disabled' : ''}>${l}</button>`).join('')}</div>
      <div class="small muted" style="margin-top:8px">More rule choices in Settings.</div>
    </div>
    <div class="phase" style="margin-top:10px">
      <div class="head"><span class="h">Online</span>${why('online')}</div>
      <div class="row"><input class="inp grow" id="netName" maxlength="20" placeholder="Your name" autocomplete="nickname" value="${esc(S.netName || '')}"></div>
      <div class="row" style="margin-top:8px"><input class="inp grow" id="netCode" maxlength="8" placeholder="Room code" autocapitalize="characters" autocomplete="off"><button class="btn sm" id="joinBtn">Join</button></div>
    </div>`;
  }
  function bindNewGame() {
    document.querySelectorAll('#nPl [data-n]').forEach(b => b.addEventListener('click', () => { S.nPlayers = +b.dataset.n; if (S.nPlayers === 2) S.rules.mode = 'classic'; saveSettings(); render(); }));
    document.querySelectorAll('#modeSeg [data-mode]').forEach(b => b.addEventListener('click', () => { S.rules.mode = b.dataset.mode; saveSettings(); render(); }));
    document.querySelectorAll('[data-seat]').forEach(sel => sel.addEventListener('change', () => {
      const i = +sel.dataset.seat; S.seats[i] = ['human', 'online'].includes(sel.value) ? { kind: sel.value, level: 'medium' } : { kind: 'cpu', level: sel.value }; saveSettings(); render();
    }));
    const sb = $('#startBtn'); if (sb) sb.addEventListener('click', startGame);
    const nm = $('#netName'); if (nm) nm.addEventListener('change', () => { S.netName = nm.value.trim().slice(0, 20); saveSettings(); });
    const jb = $('#joinBtn'); if (jb) jb.addEventListener('click', joinRoom);
  }

  // ------------------------------------------------------------ online rooms
  const netName = () => { const nm = $('#netName'); if (nm) { S.netName = nm.value.trim().slice(0, 20); saveSettings(); } return S.netName || 'Player'; };
  function netReady() { if (window.RiskNet) return true; toast('Online is still loading'); return false; }
  async function makeRoom() {
    if (!netReady() || app.netBusy) return;
    const n = S.nPlayers, seats = S.seats.slice(0, n);
    let host = seats.findIndex(s => s.kind === 'human'); if (host < 0) host = 0;
    const kinds = seats.map((s, i) => (i === host ? 'human' : s.kind === 'cpu' ? 'computer' : 'empty'));
    const rules = Object.assign({}, S.rules); if (n === 2) rules.mode = 'classic';
    app.netBusy = true; render();
    const r = await window.RiskNet.createRoom({ name: netName(), seats: kinds, options: { rules, levels: seats.map(s => s.level) } });
    app.netBusy = false;
    if (!r.ok) { toast(r.message); render(); }
  }
  async function joinRoom() {
    if (!netReady() || app.netBusy) return;
    const code = ($('#netCode').value || '').trim().toUpperCase();
    if (code.length < 4) { toast('Type the room code'); return; }
    if (!/^[A-Z0-9]+$/.test(code)) { toast('No room with that code.'); return; } // codes are letters and digits only
    app.netBusy = true; render();
    const r = await window.RiskNet.joinRoom(code, netName());
    app.netBusy = false;
    if (!r.ok) { toast(r.message); app.net = null; render(); }
  }
  async function leaveRoom() {
    const R = window.RiskNet; app.net = null;
    app.game = store.get('risk.game', null); app.sel = -1; app.to = -1; app.cards = [];
    fxReset(); render(); tick();
    if (R) await R.leave();
  }
  function onNet(s) {
    if (!s || ['none', 'closed', 'left'].includes(s.status)) {
      if (app.net && s && s.status !== 'none') toast(s.status === 'closed' ? 'The room was closed' : 'You left the room');
      if (app.net) { app.net = null; app.game = store.get('risk.game', null); fxReset(); render(); tick(); }
      return;
    }
    // presence ticks arrive often; redraw only when something on screen changes (a redraw under a finger eats the tap)
    const key = JSON.stringify([s.status, s.code, s.v, s.mySeat, s.myTurn, s.isHost, s.hostAway, s.seats, s.mine, s.options]);
    if (app.net && app.net.key === key) return;
    const prev = app.game, wasNet = !!app.net;
    app.net = Object.assign({}, s, { key, sending: app.net ? app.net.sending : false });
    if (s.pub && (s.status === 'playing' || s.status === 'finished')) {
      const g = window.RiskGame.merge(s.pub, s.mine, s.mySeat);
      app.game = g; if (!prev) view.resetZoom();
      if (!wasNet || !prev) fxReset(); // joining or coming back into a room: nothing to replay
      if (!wasNet || !prev || prev.ver !== g.ver) settleSelection(prev, g);
      if (app.net.sending && (!prev || prev.ver !== g.ver)) app.net.sending = false;
    } else app.game = null;
    render();
  }
  // keep taps sensible after the table changes (what afterAct/afterBattle do in a local game)
  function settleSelection(prev, g) {
    const me = app.net.mySeat;
    if (g.phase === 'occupy') { app.moveN = g.occupy.max; return; }
    if (prev && prev.phase === 'occupy' && g.phase === 'attack') { const to = prev.occupy.to; app.sel = g.owner[to] === me && g.armies[to] >= 2 ? to : -1; app.to = -1; }
    if (app.to >= 0 && g.owner[app.to] === me && g.phase === 'attack') { app.sel = app.to; app.to = -1; }
    if (app.sel >= 0 && (g.owner[app.sel] !== me || g.armies[app.sel] < 2)) { app.sel = -1; app.to = -1; }
    if (g.phase !== 'attack' && g.phase !== 'fortify') app.to = -1;
    if (g.phase === 'reinforce' || g.phase === 'over' || g.turn !== me) { app.sel = -1; app.to = -1; }
    if (prev && prev.turn !== g.turn) app.cards = [];
    app.hint = null;
  }
  function lobbyPanel() {
    const s = app.net;
    if (s.status === 'joining') return `<div class="phase"><div class="h">Joining ${esc(s.code || '')}…</div><div class="small muted" style="margin-top:6px">Waiting for the host to seat you.</div><div class="row" style="margin-top:10px"><button class="btn block" id="leaveBtn">Cancel</button></div></div>`;
    const rows = s.seats.map((q, i) => {
      const c = E.COLORS[i];
      const who = q.kind === 'computer' ? 'Computer · ' + ((s.options.levels || [])[i] || 'medium').replace(/^./, x => x.toUpperCase()) : q.kind === 'empty' ? '<span class="muted">Open seat</span>' : esc(q.name) + (i === s.mySeat ? ' <span class="muted">(you)</span>' : '');
      const dot = q.kind === 'human' ? `<span class="dot${q.online ? ' on' : ''}" title="${q.online ? 'Online' : 'Away'}"></span>` : '';
      return `<div class="seat"><i style="background:${c.hex}"></i><span>${c.name}</span><span class="grow" style="text-align:right">${who} ${dot}</span></div>`;
    }).join('');
    const goal = { classic: 'World', mission: 'Missions', capital: 'Capitals' }[(s.options.rules || {}).mode] || 'World';
    return `<div class="phase"><div class="cap">Room code</div><div class="code">${esc(s.code)}</div>
      <div class="small muted">Friends open this page, type the code and tap Join. Goal: ${goal}.</div>
      <div style="margin-top:8px">${rows}</div>
      <div class="row" style="margin-top:10px">${s.isHost ? '<button class="btn primary grow" id="netStart">Start</button>' : '<span class="small muted grow">Waiting for the host to start.</span>'}<button class="btn" id="leaveBtn">Leave</button></div>
      ${s.isHost ? '<div class="small muted" style="margin-top:6px">Open seats become computers when you start.</div>' : ''}</div>`;
  }
  function bindLobby() {
    const b = $('#netStart'); if (b) b.addEventListener('click', async () => { b.disabled = true; const r = await window.RiskNet.start(); if (!r.ok) { toast(r.message); b.disabled = false; } });
    const l = $('#leaveBtn'); if (l) l.addEventListener('click', leaveRoom);
  }

  function startGame() {
    if (S.seats.slice(0, S.nPlayers).some(s => s.kind === 'online')) { makeRoom(); return; }
    const n = S.nPlayers;
    const seats = S.seats.slice(0, n).map((s, i) => ({ name: s.kind === 'human' ? (S.seats.slice(0, n).filter(x => x.kind === 'human').length > 1 ? E.COLORS[i].name : 'You') : E.COLORS[i].name + ' ' + s.level[0].toUpperCase(), kind: s.kind, level: s.level }));
    startLocal(seats, S.rules, {});
  }
  // a new local game; opts: { seed, tutorial, daily: 'YYYY-MM-DD' } (Daily and Basic Training use the standard rules)
  function startLocal(seats, rules, opts) {
    abandonDaily(); stopReplay();
    closeSheet(); if (window.COACH) COACH.closeOffer();
    const R = opts.seed ? Object.assign({}, E.DEFAULT_RULES, rules) : rules;
    seats = seats.map((s, i) => Object.assign({}, s, { name: s.name || E.COLORS[i].name + ' ' + s.level[0].toUpperCase() }));
    app.game = E.newGame(seats, R, opts.seed); app.game.gid = Date.now(); view.resetZoom();
    app.sel = -1; app.to = -1; app.cards = []; app.lastHuman = -1; app.hint = null; app.undo = [];
    app.gm = { id: app.game.gid, helped: !!opts.tutorial, acc: null, recorded: false, daily: opts.daily || null, tutorial: !!opts.tutorial };
    app.rec = { id: app.game.gid, f: [] };
    store.set('risk.game', app.game); saveGm();
    if (app.tab !== 'play') { app.tab = 'play'; history.pushState({ tab: 'play' }, '', '#play'); }
    fxReset(); FX.play('shuffle'); render(); tick();
  }

  function phaseBox(g) {
    const me = g.turn, P = g.players[me];
    const human = isHumanTurn();
    if (g.phase === 'over') {
      const W = g.players[g.winner];
      return `<div class="phase"><div class="cap">Game over</div><div class="big" style="color:${W.hex};margin:4px 0 6px">${W.name === 'You' ? 'You win' : esc(W.name) + ' wins'}</div>
        <div class="small muted">${winHow(g)}${g.round} rounds.</div>${luckTable(g)}${timeline(g)}
        <div class="row" style="margin-top:10px">${!app.net && app.rec && app.rec.id === g.gid && app.rec.f.length > 1 ? '<button class="btn" id="replayBtn">Replay</button>' : ''}<button class="btn primary grow" id="againBtn">New game</button></div></div>`;
    }
    if (!human) {
      return `<div class="phase"><div class="head"><span class="h" style="color:${P.hex}">${esc(P.name)}</span><span class="small muted">${phaseName(g)}</span></div>
        ${g.lastRoll ? `<div class="row small" style="margin-bottom:6px"><b>${esc(T[g.lastRoll.from].name)}</b><span class="muted">→</span><b>${esc(T[g.lastRoll.to].name)}</b></div>${diceHTML(g.lastRoll)}` : '<div class="small muted">Thinking…</div>'}</div>`;
    }
    const head = (title, extra) => `<div class="head"><span class="h">${title}</span>${extra || ''}</div>`;
    switch (g.phase) {
      case 'claim': {
        const free = g.owner.filter(o => o < 0).length;
        return `<div class="phase">${head('Claim a territory', `<span class="small muted">${free} left</span>`)}<div class="small muted">Tap any empty one on the map.</div>
          <div class="row" style="margin-top:10px"><button class="btn sm" data-auto="one">Pick for me</button>${app.net ? '' : '<button class="btn sm" data-auto="setup">Finish setup for me</button>'}</div></div>`;
      }
      case 'place': {
        const q = g.quota;
        const sub = q ? `Place ${q.own} of yours${q.neutral ? ' and 1 neutral to block' : ''}.` : 'Place one army on your land.';
        return `<div class="phase">${head('Place armies', `<span class="small muted num">${P.pool} left</span>`)}<div class="small muted">${sub}</div>
          <div class="row" style="margin-top:10px"><button class="btn sm" data-auto="one">Pick for me</button>${app.net ? '' : '<button class="btn sm" data-auto="setup">Finish setup for me</button>'}</div></div>`;
      }
      case 'capital':
        return `<div class="phase">${head('Pick your headquarters', why('capital'))}<div class="small muted">Tap one of your territories. Others see it once all have chosen.</div>
          <div class="row" style="margin-top:10px"><button class="btn sm" data-auto="one">Pick for me</button></div></div>`;
      case 'reinforce': {
        const hand = Array.isArray(P.cards) ? P.cards : [];
        // after wiping someone out, sets can be traded only until you hold 4 or fewer cards
        const sets = g.after && hand.length <= 4 ? [] : E.findSets(hand);
        const sel = app.cards.filter(c => hand.includes(c));
        const okSet = sel.length === 3 && E.isSet(sel);
        const val = okSet ? E.tradeValue(g, sel) : (sets.length ? E.tradeValue(g, sets[0]) : E.setValue(g, ['I', 'I', 'I']));
        const inc = g.income || E.income(g, me);
        return `<div class="phase">${head(g.mustTrade ? 'Trade cards first' : `Place <span class="num">${g.reserve}</span>`, why('place'))}
          ${g.after ? '<div class="small muted">Extra armies from the cards you took. Then keep attacking.</div>' : `<div class="small muted">${inc.terr} for land${inc.conts.length ? ' + ' + inc.conts.map(c => CONTINENTS.find(x => x.id === c).name + ' ' + CONTINENTS.find(x => x.id === c).bonus).join(' + ') : ''}. Tap your land.</div>`}
          <div class="row" style="margin-top:8px"><div class="seg grow" id="amtSeg">${[[1, '1'], [3, '3'], [0, 'All']].map(([k, l]) => `<button aria-pressed="${app.amount === k}" data-amt="${k}">${l}</button>`).join('')}</div><button class="btn sm" id="hintBtn">Hint</button></div>
          ${hand.length ? `<div class="row" style="margin-top:10px"><span class="cap grow">Cards · next set ${E.setValue(g, okSet ? sel.map(c => CARDS[c].sym) : ['I', 'C', 'A'])}${why('cards')}</span>${sets.length ? `<button class="btn sm ${okSet ? 'warm' : ''}" id="tradeBtn">${okSet ? 'Trade +' + val : 'Pick a set'}</button>` : ''}</div>` : ''}
        </div>`;
      }
      case 'attack': {
        let body = '<div class="small muted">Tap your territory, then a neighbour to attack. Odds show on the map.</div>';
        if (app.sel >= 0 && app.to >= 0 && g.owner[app.to] !== me && g.owner[app.sel] === me && g.armies[app.sel] >= 2) {
          const A = g.armies[app.sel], D = g.armies[app.to], b = O.battle(A, D);
          const maxD = Math.min(3, A - 1); if (app.dice > maxD) app.dice = maxD;
          body = `<div class="row small" style="margin-bottom:6px"><b>${esc(T[app.sel].name)}</b><span class="muted">${A} →</span><b>${esc(T[app.to].name)}</b><span class="muted">${D}</span></div>
            <div class="odds"><span class="small muted">Win${why('win')}</span><div class="row"><div class="meter grow"><i style="width:${b.win * 100}%;background:${scale(b.win)}"></i></div><b class="num" style="color:${scale(b.win)}">${pct(b.win)}</b></div>
            <span class="small muted">You lose${why('loss')}</span><span class="small num">~${b.expAttLoss.toFixed(1)} armies, they lose ~${b.expDefLoss.toFixed(1)}</span></div>
            <div class="row" style="margin-top:10px"><div class="seg" id="diceSeg" style="flex:0 0 120px">${[1, 2, 3].map(k => `<button aria-pressed="${app.dice === k}" data-dice="${k}" aria-label="${k} ${k === 1 ? 'die' : 'dice'}" ${k > maxD ? 'disabled' : ''}>${dieFace(k)}</button>`).join('')}</div>
            <button class="btn primary grow" id="rollBtn">Roll</button><button class="btn warm" id="blitzBtn">Blitz</button></div>`;
        }
        // "Done attacking" sits up by the title so it stays in sight above your hand on a phone
        return `<div class="phase">${head('Attack', '<button class="btn sm" id="hintBtn">Hint</button><button class="btn sm" id="endAtk">Done attacking</button>')}${body}
          ${g.lastRoll ? `<div style="margin-top:8px">${diceHTML(g.lastRoll)}</div>` : ''}</div>`;
      }
      case 'occupy': {
        const o = g.occupy; if (app.moveN < o.min || app.moveN > o.max) app.moveN = o.max;
        return `<div class="phase">${head('Move in', `<span class="small muted">${esc(T[o.to].name)}</span>`)}
          ${diceHTML(g.lastRoll)}
          <div class="row" style="margin-top:10px"><button class="btn sm" data-mv="min">${o.min}</button>
          <div class="stepper"><button data-step="-1">−</button><output class="num">${app.moveN}</output><button data-step="1">+</button></div>
          <button class="btn sm" data-mv="max">${o.max}</button><button class="btn primary grow" id="occBtn">Move</button></div></div>`;
      }
      case 'fortify': {
        let body = `<div class="small muted">${g.rules.fortify === 'adjacent' ? 'One move to a neighbour.' : 'One move along your own land.'} Tap from, then to.</div>`;
        if (app.sel >= 0 && app.to >= 0) {
          const max = g.armies[app.sel] - 1; if (app.moveN < 1 || app.moveN > max) app.moveN = max;
          body = `<div class="row small" style="margin-bottom:6px"><b>${esc(T[app.sel].name)}</b><span class="muted">→</span><b>${esc(T[app.to].name)}</b></div>
          <div class="row"><div class="stepper"><button data-step="-1">−</button><output class="num">${app.moveN}</output><button data-step="1">+</button></div><button class="btn primary grow" id="fortBtn">Move &amp; end turn</button></div>`;
        }
        return `<div class="phase">${head('Move armies')}${body}<div class="row" style="margin-top:10px"><button class="btn block" id="endTurn">End turn</button></div></div>`;
      }
    }
    return '';
  }
  // how the game ended (and the winner's mission, now that everyone may see it)
  function winHow(g) {
    const W = g.players[g.winner];
    if (g.how === 'mission' && W.mission && !W.mission.hidden) return `Mission: ${esc(E.missionText(W.mission))}. `;
    return ({ world: 'Conquered the world. ', capital: 'Took the headquarters. ', limit: 'Turn limit: most land. ', mission: 'Secret mission done. ' })[g.how] || '';
  }
  function phaseName(g) { return { claim: 'claiming', place: 'placing', capital: 'choosing HQ', reinforce: 'placing', attack: 'attacking', occupy: 'moving in', fortify: 'moving' }[g.phase] || ''; }

  function secretLine(g) {
    const v = viewer(); if (v < 0) return '';
    const P = g.players[v];
    const bits = [];
    if (P.mission && !P.mission.hidden) bits.push(`<span class="cap">Mission</span> ${esc(E.missionText(P.mission))}${why('mission')}`);
    if (g.rules.mode === 'capital' && g.phase !== 'capital') {
      const held = g.players.filter((q, j) => j !== v && q.capital >= 0 && q.kind !== 'neutral' && g.owner[q.capital] === v).length;
      bits.push(`<span class="cap">HQs</span> ${held} of ${E.capitalNeed(g)} taken${why('capital')}`);
    }
    if (!bits.length) return '';
    return `<div class="small" style="margin-top:8px">${bits.join(' · ')}</div>`;
  }

  function playPanel() {
    const g = app.game;
    if (app.net && !g) return lobbyPanel();
    if (!g) return newGamePanel();
    if (app.rp != null && app.rec && app.rec.f[app.rp]) return replayPanel();
    const logH = g.log.slice(matchMedia('(min-width: 900px)').matches ? -40 : -6).map(l => `<div>${esc(l)}</div>`).join('');
    const netLine = app.net ? `<span class="small muted">Room ${esc(app.net.code)}${app.net.hostAway ? ' · host away' : ''}</span>` : '';
    return phaseBox(g) + secretLine(g) +
      `<div class="log" id="log">${logH}</div>` +
      (g.phase !== 'over' ? `<div class="row" style="margin-top:8px"><button class="btn sm ghost" id="quitBtn">${app.net ? 'Leave' : 'New game'}</button>${app.net || (app.gm && app.gm.daily) ? '' : `<button class="btn sm ghost" id="undoBtn" ${app.undo.length ? '' : 'disabled'}>Undo</button>`}<span class="grow"></span>${app.gm && app.gm.daily && app.gm.id === g.gid ? '<span class="small muted">Daily game</span>' : ''}${netLine}<span class="small muted">Round ${g.round}</span></div>` : '');
  }

  function bindPlay() {
    const g = app.game;
    if (app.net && !g) { bindLobby(); return; }
    if (!g) { bindNewGame(); return; }
    if (app.rp != null && app.rec && app.rec.f[app.rp]) { bindReplay(); return; }
    const on = (id, f) => { const b = document.getElementById(id); if (b) b.addEventListener('click', f); };
    if (app.net) {
      on('againBtn', leaveRoom);
      on('quitBtn', () => openSheet(`<div class="h">Leave the room?</div><div class="muted" style="margin:6px 0 12px">A computer takes your seat.</div><button class="btn warm block" id="quitYes">Leave</button>`, s => s.querySelector('#quitYes').addEventListener('click', () => { closeSheet(); leaveRoom(); })));
    }
    if (!app.net) on('againBtn', endGame);
    if (!app.net) on('replayBtn', () => { app.rp = 0; render(); });
    if (!app.net) on('undoBtn', undo);
    if (!app.net) on('quitBtn', () => openSheet(`<div class="h">Start over?</div><div class="muted" style="margin:6px 0 12px">${app.gm && app.gm.daily && app.gm.id === g.gid ? 'Leaving the Daily game counts as a loss.' : 'This game ends.'}</div><button class="btn warm block" id="quitYes">End game</button>`, s => s.querySelector('#quitYes').addEventListener('click', () => { closeSheet(); endGame(); })));
    document.querySelectorAll('[data-auto]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.auto === 'one') { act(AI.choose(app.game, app.game.turn)); afterAct(); return; }
      // only this person's setup: the Hard computer picks for them; other people still pick their own
      const me = app.game.turn;
      app.game = Object.assign({}, app.game, { autoSetup: (app.game.autoSetup || []).concat(me) });
      let guard = 0;
      while (autoNow(app.game) && guard++ < 2000) act(AI.choose(hardFor(app.game, app.game.turn), app.game.turn));
      store.set('risk.game', app.game);
      afterAct();
    }));
    document.querySelectorAll('#amtSeg [data-amt]').forEach(b => b.addEventListener('click', () => { app.amount = +b.dataset.amt; render(); }));
    on('tradeBtn', () => {
      const P = g.players[g.turn];
      let sel = app.cards.filter(c => P.cards.includes(c));
      if (!(sel.length === 3 && E.isSet(sel))) { // pick the best set for them
        const sets = E.findSets(P.cards); sel = sets.sort((a, b) => bonusOf(b) - bonusOf(a))[0];
        app.cards = sel.slice(); render(); return;
      }
      const val = E.tradeValue(g, sel);
      if (act({ type: 'trade', cards: sel })) { if (app.gm && app.gm.acc) { app.gm.acc.trade = Math.max(app.gm.acc.trade || 0, val); saveGm(); } app.cards = []; afterAct(); }
    });
    const bonusOf = s => E.tradeValue(g, s) + (s.some(c => CARDS[c].terr >= 0 && g.owner[CARDS[c].terr] === g.turn) ? 2 : 0) - s.filter(c => CARDS[c].sym === 'W').length;
    on('hintBtn', () => {
      const h = AI.hint(g, g.turn);
      if (!app.net && app.gm) { app.gm.helped = true; saveGm(); }
      if (g.phase === 'reinforce' && g.mustTrade) { bad('Trade a card set first'); return; }
      if (g.phase === 'reinforce') { app.hint = h.place; render(); toast('Suggested: ' + T[h.place].name); return; }
      const a = h.attacks[0];
      if (!a || a.score <= 0) { toast('Hint: stop attacking now'); return; }
      app.sel = a.from; app.to = a.to; render(); toast(`Hint: ${T[a.from].name} → ${T[a.to].name}`);
    });
    document.querySelectorAll('#diceSeg [data-dice]').forEach(b => b.addEventListener('click', () => { app.dice = +b.dataset.dice; render(); }));
    on('rollBtn', () => { if (act({ type: 'attack', from: app.sel, to: app.to, dice: app.dice })) afterBattle(); });
    on('blitzBtn', () => { if (act({ type: 'blitz', from: app.sel, to: app.to })) afterBattle(); });
    on('endAtk', () => { app.sel = -1; app.to = -1; act({ type: 'endAttack' }); afterAct(); });
    document.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
      const lo = g.phase === 'occupy' ? g.occupy.min : 1, hi = g.phase === 'occupy' ? g.occupy.max : g.armies[app.sel] - 1;
      app.moveN = Math.max(lo, Math.min(hi, app.moveN + +b.dataset.step)); render();
    }));
    document.querySelectorAll('[data-mv]').forEach(b => b.addEventListener('click', () => { app.moveN = b.dataset.mv === 'min' ? g.occupy.min : g.occupy.max; render(); }));
    on('occBtn', () => { const to = g.occupy.to; if (act({ type: 'occupy', n: app.moveN })) { app.sel = app.game.armies[to] >= 2 ? to : -1; app.to = -1; afterAct(); } });
    on('fortBtn', () => { if (act({ type: 'fortify', from: app.sel, to: app.to, n: app.moveN })) { app.sel = -1; app.to = -1; afterAct(); } });
    on('endTurn', () => { app.sel = -1; app.to = -1; act({ type: 'endTurn' }); afterAct(); });
  }
  function afterBattle() {
    const g = app.game;
    if (g.phase === 'occupy') { app.moveN = g.occupy.max; }
    else if (app.to >= 0 && g.owner[app.to] === g.turn) { app.sel = app.to; app.to = -1; }
    else if (app.sel >= 0 && g.armies[app.sel] < 2) { app.sel = -1; app.to = -1; }
    afterAct();
  }

  function luckTable(g) {
    const rows = g.players.map((p, i) => {
      if (p.kind === 'neutral') return '';
      const s = g.stats[i]; if (!s) return '';
      const L = (s.luck || 0);
      return `<tr><td><span class="pill" style="background:${p.hex}">${esc(p.name)}</span></td><td class="r">${E.countOwned(g, i)}</td><td class="r">${s.taken}</td><td class="r" style="color:${scale(0.5 + L / 20)}">${L >= 0 ? '+' : ''}${L.toFixed(1)}</td></tr>`;
    }).join('');
    return `<table class="t" style="margin-top:8px"><tr><th>Player</th><th class="r">Land</th><th class="r">Taken</th><th class="r">Dice luck${why('luck')}</th></tr>${rows}</table>`;
  }

  // land held per player, round by round
  function timeline(g) {
    const H = g.hist || []; if (H.length < 2) return '';
    const W = 300, Ht = 84, n = H.length;
    const X = i => 6 + i / (n - 1) * (W - 12), Y = v => Ht - 4 - v / 42 * (Ht - 10);
    const lines = g.players.map((p, i) => `<polyline points="${H.map((h, k) => X(k).toFixed(1) + ',' + Y(h.land[i]).toFixed(1)).join(' ')}" fill="none" stroke="${p.hex}" stroke-width="2" stroke-linejoin="round"/>`).join('');
    return `<div class="cap" style="margin-top:10px">Land by round</div><svg class="chart" viewBox="0 0 ${W} ${Ht}" preserveAspectRatio="none"><line x1="6" x2="${W - 6}" y1="${Y(21)}" y2="${Y(21)}" stroke="#2a3042" stroke-dasharray="3 3"/>${lines}</svg>`;
  }

  // who is likely to win from here: play the rest out many times with the computer brains
  const fc = { running: false, wins: null, n: 0, of: 0, key: '' };
  function runForecast() {
    const g0 = app.game; if (!g0 || g0.phase === 'over' || fc.running || app.net) return; // online: the deck order is secret
    const key = g0.ver + ':' + g0.turn; fc.running = true; fc.wins = g0.players.map(() => 0); fc.n = 0; fc.of = 40; fc.key = key;
    // one move at a time in short slices, so taps stay instant even when a 6-player game runs long
    let st = null, k = 0;
    const fresh = () => {
      st = JSON.parse(JSON.stringify(g0)); k = 0;
      st.seed = (Math.random() * 4294967296) >>> 0;
      for (let i = st.deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [st.deck[i], st.deck[j]] = [st.deck[j], st.deck[i]]; }
      st.players.forEach(p => { if (p.kind === 'human' || p.kind === 'online') { p.kind = 'cpu'; p.level = 'hard'; } });
      delete st.autoSetup;
      st.rules.maxTurns = Math.ceil(st.turns / Math.max(1, E.active(st).length)) + 120;
    };
    const stepOne = () => {
      if (!st) fresh();
      st = E.apply(st, AI.choose(st, st.turn, { fast: true })); // the quick Hard brain: 40 games must stay quick
      if (st.phase === 'over' || ++k >= 30000) { if (st.winner >= 0) fc.wins[st.winner]++; fc.n++; st = null; }
    };
    const chunk = () => {
      if (!app.game || (app.game.ver + ':' + app.game.turn) !== key) { fc.running = false; return; }
      const t0 = performance.now(), n0 = fc.n; while (fc.n < fc.of && performance.now() - t0 < 30) stepOne();
      if (app.tab === 'study' && fc.n !== n0) render();
      if (fc.n < fc.of) setTimeout(chunk, 0); else { fc.running = false; if (app.tab === 'study') render(); }
    };
    setTimeout(chunk, 0);
  }
  function forecastBox(g) {
    const fresh = fc.wins && fc.key === g.ver + ':' + g.turn;
    const rows = fresh ? g.players.map((p, i) => p.kind === 'neutral' ? '' : `<div class="row small" style="margin:3px 0"><span style="width:76px" class="grow0">${esc(p.name)}</span><div class="meter grow"><i style="width:${fc.wins[i] / Math.max(1, fc.n) * 100}%;background:${p.hex}"></i></div><b class="num" style="width:40px;text-align:right">${pct(fc.wins[i] / Math.max(1, fc.n))}</b></div>`).join('') : '';
    return `<div class="phase" style="margin-top:10px"><div class="head"><span class="h">Who wins from here?</span>${why('forecast')}<button class="btn sm" id="fcBtn" ${fc.running || g.phase === 'over' ? 'disabled' : ''}>${fc.running ? fc.n + ' / ' + fc.of : 'Forecast'}</button></div>${rows}</div>`;
  }

  // ------------------------------------------------------------ ODDS panel
  function oddsPanel() {
    const c = app.calc;
    const ch = O.chain(c.A, c.D);
    const b0 = O.battle(c.A, c.D[0]);
    const need = [0.5, 0.75, 0.9].map(p => [p, O.needed(c.D[0], p)]);
    // win chance vs attacking stack, for the first defender
    const pts = []; for (let A = 2; A <= 40; A++) pts.push([A, O.winP(A, c.D[0])]);
    const W = 300, H = 80, X = A => 8 + (A - 2) / 38 * (W - 16), Y = p => H - 6 - p * (H - 14);
    const poly = pts.map(([A, p]) => `${X(A).toFixed(1)},${Y(p).toFixed(1)}`).join(' ');
    const g = app.game;
    const fromBoard = g && g.phase === 'attack' && app.sel >= 0 && app.to >= 0;
    return `<div class="phase">
      <div class="head"><span class="h">Battle odds</span>${why('win')}</div>
      <div class="row" style="justify-content:space-between"><span class="cap">Attacking stack</span>${stepper('A', c.A)}</div>
      ${c.D.map((d, i) => `<div class="row" style="justify-content:space-between;margin-top:6px"><span class="cap">${i === 0 ? 'Defender' : 'Then'} ${c.D.length > 1 ? i + 1 : ''}</span><div class="row">${c.D.length > 1 ? `<button class="btn sm ghost" data-rm="${i}" aria-label="Remove">×</button>` : ''}${stepper('D' + i, d)}</div></div>`).join('')}
      <div class="row" style="margin-top:6px"><button class="btn sm" id="addD" ${c.D.length >= 8 ? 'disabled' : ''}>+ Next territory</button>${why('chain')}<span class="grow"></span>${fromBoard ? '<button class="btn sm" id="fromBoard">From map</button>' : ''}</div>
      <div class="sep"></div>
      <div class="row"><div class="grow"><div class="cap">${c.D.length > 1 ? 'Take them all' : 'Win'}</div><div class="big" style="color:${scale(ch.all)}">${pct(ch.all)}</div></div>
        <div class="small muted" style="text-align:right">You lose ~${ch.expLoss.toFixed(1)}<br>${c.D.length > 1 ? `Left at the end ~${ch.endArmies.toFixed(1)}` : `They lose ~${b0.expDefLoss.toFixed(1)}`}</div></div>
      ${c.D.length > 1 ? `<div class="small" style="margin-top:6px">${ch.atLeast.slice(1).map((p, i) => `<span class="pill" style="background:${scale(p)};margin:2px 4px 2px 0">${i + 1}: ${pct(p)}</span>`).join('')}</div>` : ''}
      <div class="sep"></div>
      <div class="cap">Win chance by stack size vs ${c.D[0]}</div>
      <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="8" x2="${W - 8}" y1="${Y(0.5)}" y2="${Y(0.5)}" stroke="#2a3042" stroke-dasharray="3 3"/><polyline points="${poly}" fill="none" stroke="#6ea8fe" stroke-width="2"/><circle cx="${X(Math.min(40, c.A))}" cy="${Y(O.winP(Math.min(40, c.A), c.D[0]))}" r="3.5" fill="#f0b354"/></svg>
      <div class="row small muted" style="justify-content:space-between"><span>2</span><span>stack</span><span>40</span></div>
      <div class="small" style="margin-top:6px">Stack needed: ${need.map(([p, n]) => `<b>${n}</b> for ${p * 100}%`).join(' · ')}</div>
    </div>
    <div class="phase" style="margin-top:10px"><div class="head"><span class="h">Card sets</span>${why('cards')}</div>${cardValueTable()}</div>`;
  }
  function stepper(id, v) { return `<div class="stepper" data-st="${id}"><button data-d="-1" aria-label="Less">−</button><output class="num">${v}</output><button data-d="1" aria-label="More">+</button></div>`; }
  function cardValueTable() {
    const g = app.game, done = g ? g.sets : 0;
    const esc6 = []; const tmp = { rules: { cards: 'escalating' }, sets: 0 };
    for (let k = 0; k < 10; k++) { tmp.sets = k; esc6.push(E.setValue(tmp)); }
    return `<div class="small muted" style="margin-bottom:6px">Escalating values, set by set${g ? ` (this game: ${done} traded, next ${E.setValue(g, ['I', 'C', 'A'])})` : ''}:</div>
      <div class="row wrap">${esc6.map((v, k) => `<span class="pill" style="background:${k === done && g ? '#f0b354' : '#2a3042'};color:${k === done && g ? '#0f1117' : '#e8eaf0'}">${k + 1}: ${v}</span>`).join('')}</div>
      <div class="small muted" style="margin-top:6px">Fixed values: 3 infantry 4 · 3 cavalry 6 · 3 artillery 8 · one of each 10.</div>`;
  }
  function bindOdds() {
    document.querySelectorAll('[data-st]').forEach(st => st.querySelectorAll('[data-d]').forEach(b => {
      let hold = 0, rep = 0;
      const stepOnce = () => {
        const id = st.dataset.st, d = +b.dataset.d;
        if (id === 'A') app.calc.A = Math.max(2, Math.min(200, app.calc.A + d));
        else { const i = +id.slice(1); app.calc.D[i] = Math.max(1, Math.min(200, app.calc.D[i] + d)); }
        store.set('risk.calc', app.calc); render();
      };
      b.addEventListener('click', stepOnce);
      void hold; void rep;
    }));
    document.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { app.calc.D.splice(+b.dataset.rm, 1); store.set('risk.calc', app.calc); render(); }));
    const add = $('#addD'); if (add) add.addEventListener('click', () => { app.calc.D.push(3); store.set('risk.calc', app.calc); render(); });
    const fb = $('#fromBoard'); if (fb) fb.addEventListener('click', () => { const g = app.game; app.calc = { A: g.armies[app.sel], D: [g.armies[app.to]] }; store.set('risk.calc', app.calc); render(); });
  }

  // ------------------------------------------------------------ STUDY panel
  function studyPanel() {
    const g = app.game;
    const rows = CONTINENTS.map(c => {
      const holder = g ? g.players.findIndex((p, i) => E.holdsCont(g, i, c.idx)) : -1;
      return `<tr><td><span style="color:${c.color};font-weight:700">${c.name}</span></td><td class="r">+${c.bonus}</td><td class="r">${c.terrs.length}</td><td class="r">${c.borders.length}</td><td class="r"><b>${(c.bonus / c.borders.length).toFixed(2)}</b></td>${g ? `<td class="r">${holder >= 0 ? `<span class="pill" style="background:${g.players[holder].hex}">${esc(g.players[holder].name.split(' ')[0])}</span>` : '–'}</td>` : ''}</tr>`;
    }).join('');
    const lens = g ? `<div class="row" style="margin-bottom:10px"><span class="cap">Map</span><div class="seg grow" id="lensSeg">${[['owner', 'Owner'], ['cont', 'Continents'], ['threat', 'Threat']].map(([k, l]) => `<button aria-pressed="${app.lens === k}" data-lens="${k}">${l}</button>`).join('')}</div>${app.lens === 'threat' ? why('threat') : ''}</div>` : '';
    let game = '';
    if (g) {
      const inc = g.players.map((p, i) => p.kind === 'neutral' || p.out ? null : { p, i, inc: E.income(g, i).total }).filter(Boolean).sort((a, b) => b.inc - a.inc);
      game = `<div class="phase" style="margin-top:10px"><div class="head"><span class="h">This game</span></div>
        <table class="t"><tr><th>Player</th><th class="r">Next income</th><th class="r">Cards</th></tr>${inc.map(x => `<tr><td><span class="pill" style="background:${x.p.hex}">${esc(x.p.name)}</span></td><td class="r">${x.inc}</td><td class="r">${Array.isArray(x.p.cards) ? x.p.cards.length : x.p.cards}</td></tr>`).join('')}</table>
        ${luckTable(g)}${timeline(g)}</div>` + (app.net ? '' : forecastBox(g));
    }
    return lens + `<div class="phase"><div class="head"><span class="h">Continent value</span>${why('contval')}</div>
      <table class="t"><tr><th>Continent</th><th class="r">Bonus</th><th class="r">Land</th><th class="r">Borders</th><th class="r">Per border</th>${g ? '<th class="r">Held</th>' : ''}</tr>${rows}</table>
      <div class="small muted" style="margin-top:8px">Australia and South America pay the most per border to guard.</div></div>` + game;
  }
  function bindStudy() {
    document.querySelectorAll('#lensSeg [data-lens]').forEach(b => b.addEventListener('click', () => { app.lens = b.dataset.lens; render(); }));
    const f = $('#fcBtn'); if (f) f.addEventListener('click', () => { runForecast(); render(); });
  }

  // ------------------------------------------------------------ SETTINGS panel
  function settingsPanel() {
    const R = S.rules;
    const seg = (key, opts) => `<div class="seg" data-rule="${key}">${opts.map(([v, l]) => `<button aria-pressed="${R[key] === v}" data-v="${v}">${l}</button>`).join('')}</div>`;
    const sw = (key, on, obj) => `<label class="switch"><input type="checkbox" data-sw="${key}" data-obj="${obj}" ${on ? 'checked' : ''}><span></span></label>`;
    return `<div class="phase"><div class="head"><span class="h">Rules</span><span class="small muted">next game</span></div>
      <div class="set-row"><label>Setup</label>${seg('setup', [['deal', 'Deal cards'], ['claim', 'Take turns']])}</div>
      <div class="set-row"><label>Card values</label>${seg('cards', [['escalating', '4,6,8…'], ['fixed', 'Fixed'], ['plusone', '+1']])}</div>
      <div class="set-row"><label>+2 on card land</label>${sw('cardBonus', R.cardBonus, 'rules')}</div>
      <div class="set-row"><label>End-of-turn move</label>${seg('fortify', [['connected', 'Along land'], ['adjacent', 'Next door']])}</div>
      <div class="set-row"><label>Capitals short game ${why('capital')}</label>${sw('capitalShort', R.capitalShort, 'rules')}</div>
      <div class="set-row"><label>12-mission deck</label>${sw('missions12', R.missions12, 'rules')}</div>
    </div>
    <div class="phase" style="margin-top:10px"><div class="head"><span class="h">Display</span></div>
      <div class="set-row"><label>Computer speed</label><div class="seg" id="speedSeg">${[['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']].map(([v, l]) => `<button aria-pressed="${S.speed === v}" data-v="${v}">${l}</button>`).join('')}</div></div>
      <div class="set-row"><label>Odds on the map</label>${sw('mapOdds', S.mapOdds, 'S')}</div>
      <div class="set-row"><label>Territory names</label>${sw('names', S.names, 'S')}</div>
      <div class="set-row"><label>How strong are the computers? ${why('strong')}</label></div>
    </div>
    <div class="phase" style="margin-top:10px"><div class="head"><span class="h">Sound &amp; effects</span></div><div id="fxBox"></div></div>
    ${window.COACH && window.RiskTutorial ? `<div class="phase" style="margin-top:10px"><div class="head"><span class="h">Help</span></div><div class="row"><button class="btn grow" id="rulesBtn">Rules</button><button class="btn grow" id="tutBtn">Basic Training</button></div></div>` : ''}
    <div class="small muted" style="margin-top:10px">Risk ${VERSION}. Our own map drawing; rules from the Parker Brothers and Hasbro rulebooks.</div>`;
  }
  function bindSettings() {
    const fb = $('#fxBox'); if (fb) FX.renderSettings(fb);
    const rb = $('#rulesBtn'); if (rb) rb.addEventListener('click', openRules);
    const tb = $('#tutBtn'); if (tb) tb.addEventListener('click', startTutorial);
    document.querySelectorAll('[data-rule]').forEach(sg => sg.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => { S.rules[sg.dataset.rule] = b.dataset.v; saveSettings(); render(); })));
    document.querySelectorAll('#speedSeg [data-v]').forEach(b => b.addEventListener('click', () => { S.speed = b.dataset.v; saveSettings(); render(); }));
    document.querySelectorAll('[data-sw]').forEach(i => i.addEventListener('change', () => { if (i.dataset.obj === 'rules') S.rules[i.dataset.sw] = i.checked; else S[i.dataset.sw] = i.checked; saveSettings(); render(); }));
  }

  // measured by tools/sim.js — see progress.md
  const STRENGTH = window.RISK_STRENGTH || null;
  function strengthTable() {
    if (!STRENGTH) return '';
    return `<table class="t" style="margin-top:10px"><tr><th>Match</th><th class="r">Games</th><th class="r">Result</th></tr>${STRENGTH.map(r => `<tr><td>${r[0]}</td><td class="r">${r[1]}</td><td class="r">${r[2]}</td></tr>`).join('')}</table>`;
  }

  // ------------------------------------------------------------ render
  function render() {
    renderTabs();
    const panel = $('#panel');
    const keep = panel.scrollTop;
    if (app.tab === 'play') { panel.innerHTML = playPanel(); bindPlay(); }
    else if (app.tab === 'odds') { panel.innerHTML = oddsPanel(); bindOdds(); }
    else if (app.tab === 'study') { panel.innerHTML = studyPanel(); bindStudy(); }
    else { panel.innerHTML = settingsPanel(); bindSettings(); }
    panel.scrollTop = keep;
    const lg = $('#log'); if (lg) lg.scrollTop = lg.scrollHeight;
    renderTable();
    if (app.game && app.rp != null && app.tab === 'play' && app.rec && app.rec.f[app.rp]) view.update(frameState(app.rp), { names: S.names });
    else if (app.game) view.update(drawState(app.game), mapUI());
    else view.update(blankState(), mapUI());
    fxStep();
    if (window.COACH) setTimeout(() => COACH.update(), 0); // the guided game follows the table and steps aside under a sheet
  }
  // while HQs are being picked, the map rings only the viewer's own (others are secret until all have chosen)
  function drawState(g) {
    if (g.phase !== 'capital') return g;
    const v = viewer();
    return Object.assign({}, g, { players: g.players.map((p, i) => (i === v ? p : Object.assign({}, p, { capital: -1 }))) });
  }
  let blank = null;
  function blankState() {
    if (!blank) { blank = { owner: new Array(42).fill(-1), armies: new Array(42).fill(0), players: [] }; }
    return blank;
  }

  // ------------------------------------------------------------ boot
  $('#ver').textContent = VERSION;
  const h = location.hash.slice(1); if (TABS.some(t => t.id === h)) app.tab = h;
  history.replaceState({ tab: app.tab }, '', '#' + app.tab);
  try { render(); } catch (e) { // a saved game this version can't draw: start clean rather than a dead page
    app.game = null; store.del('risk.game'); render(); toast('Saved game could not be opened');
  }
  // several people on one phone: after a reload, cover the screen before the next person's turn
  if (app.game) { app.lastHuman = humans() > 1 ? -2 : isHumanTurn() ? app.game.turn : -1; tick(); }
  // online: hook up once the module has loaded, and go back into a room after a reload
  function hookNet() {
    const R = window.RiskNet; if (!R || hookNet.done) return; hookNet.done = true;
    R.on('change', onNet);
    R.on('error', m => toast(typeof m === 'string' ? m : (m && m.message) || 'Online error'));
    R.resume().then(back => { if (back) toast('Back in your room'); });
  }
  window.addEventListener('risknet', hookNet); hookNet();
  // the same game open in two tabs: a move made in one shows up in the other (no stale table to play on)
  window.addEventListener('storage', e => {
    if (e.key !== 'risk.game' || app.net) return;
    let n = null; try { n = e.newValue ? JSON.parse(e.newValue) : null; } catch (err) { return; }
    const cur = app.game;
    if (n && !okGame(n)) return;
    if (!n) { if (!cur) return; clearTimeout(tickT); app.game = null; }
    else if (cur && n.gid === cur.gid && (n.ver || 0) <= (cur.ver || 0)) return; // same game, nothing newer
    else { app.game = n; if (!cur || n.gid !== cur.gid) view.resetZoom(); }
    app.sel = -1; app.to = -1; app.cards = []; app.hint = null;
    document.querySelectorAll('.cover').forEach(c => c.remove());
    app.lastHuman = app.game && humans() > 1 ? -2 : -1;
    fxReset(); render(); tick();
  });
  // My stats (shared _profile kit, everything stays on this device)
  if (window.Profile && window.RiskProfile && $('#meBtn')) {
    const paintMe = () => { $('#meBtn').innerHTML = Profile.avatarSVG(Profile.avatar, 26) + '<span>My stats</span>'; };
    try {
      Profile.init({
        game: 'risk', levels: RiskProfile.LEVELS, achievements: RiskProfile.achievements(),
        modes: { help: { name: 'Computers, with help' }, friends: { name: 'Pass and play' }, online: { hide: true } },
        daily: { title: 'Daily game', onPlay: () => startDaily() },
        onChange: what => { if (what === 'me' || what === 'import') paintMe(); },
      });
      paintMe(); $('#meBtn').hidden = false;
      $('#meBtn').onclick = () => Profile.openPanel();
    } catch (e) { $('#meBtn').remove(); }
  } else if ($('#meBtn')) $('#meBtn').remove();
  // Basic Training: steps follow the game's own state; it steps aside on other tabs and under sheets
  if (window.COACH && window.RiskTutorial) {
    const tut = () => !!(app.gm && app.gm.tutorial && app.game && app.game.gid === app.gm.id && !app.net);
    tour = COACH.tour({
      id: 'risk-first',
      steps: RiskTutorial.steps({ game: () => (tut() ? app.game : null), app: () => app }),
      pauseIf: () => app.tab !== 'play' || !tut() || app.rp != null || !$('#sheet').hidden || !!document.querySelector('.cover') || (window.Profile && Profile.isOpen()),
    });
    if (tut() && app.game.phase !== 'over') tour.resume(); // carry on after a reload
    offerTutorial();
  }
  // a new version reloads itself only at a quiet moment: not online, no sheet or rules open, not typing, no game mid-play on screen
  if (window.PWA) window.PWA.safeToReload = () => !app.net && $('#sheet').hidden && !(window.COACH && COACH.rulesOpen()) && !document.querySelector('.cover') &&
    !(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) &&
    (!app.game || app.game.phase === 'over' || app.tab === 'odds' || app.tab === 'settings');
  window.__risk = app; // for headless checks
  window.RiskApp = { app, act, afterAct, onTerritory, isHumanTurn, render: () => render(), goTab, undo, startDaily, startTutorial, openRules, get tour() { return tour; } };
})();
