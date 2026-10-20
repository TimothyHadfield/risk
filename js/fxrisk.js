// Risk sounds and effects. events() compares the table before and after a move and says what
// happened (works the same for your moves, the computers' and online players'); run() plays it:
// sounds through fx.js (each obeys the Sound settings), small effects that never move the layout.
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const M = node ? require('./map.js') : root.RiskMap;
  const SETUP = ['claim', 'place', 'capital'];
  const nCards = p => (Array.isArray(p.cards) ? p.cards.length : (p.cards | 0));
  const holds = (g, p, ci) => M.CONTINENTS[ci].terrs.every(t => g.owner[t] === p);
  const st = (g, p) => (g.stats && g.stats[p]) || { rolls: 0, won: 0, lost: 0 };

  // ---------------------------------------------------------------- what happened
  // me: the seats played on this screen (online: your seat; here: the people; [] = computers only)
  function events(a, b, me) {
    const out = [];
    me = me || [];
    if (!a || !b || a === b || !Array.isArray(a.owner) || !Array.isArray(b.owner) || !Array.isArray(a.players) || !Array.isArray(b.players)) return out;
    if (!((b.ver | 0) > (a.ver | 0)) || a.phase === 'over') return out; // a reload, a new game or an older table: nothing to play
    if (a.players.length !== b.players.length || a.players.some((p, i) => p.color !== b.players[i].color)) return out;
    const p = a.turn, mine = me.includes(p), hex = i => (b.players[i] && b.players[i].hex) || '#e8eaf0';
    const setup = SETUP.includes(a.phase);

    // card trade-in
    if ((b.sets | 0) > (a.sets | 0)) out.push({ type: 'trade', p, mine, n: b.sets - a.sets, armies: a.phase === 'reinforce' && b.phase === 'reinforce' ? b.reserve - a.reserve : 0 });

    // dice: one roll, or a blitz (many rolls in one move)
    const rolls = st(b, p).rolls - st(a, p).rolls;
    if (rolls > 0) {
      const r = b.lastRoll || null;
      out.push({ type: 'battle', p, mine, rolls, from: r ? r.from : -1, to: r ? r.to : -1, att: r ? r.att.length : 3, def: r ? r.def.length : 2,
        al: st(b, p).lost - st(a, p).lost, dl: st(b, p).won - st(a, p).won, attHit: !!r && r.al > 0 && r.dl === 0 });
    }

    // armies set down / moved
    const moved = new Set();
    if (a.phase === 'occupy' && a.occupy && b.owner[a.occupy.to] === p) {
      const n = b.armies[a.occupy.to] - a.armies[a.occupy.to];
      if (n > 0) { out.push({ type: 'move', p, mine, from: a.occupy.from, to: a.occupy.to, n }); moved.add(a.occupy.to).add(a.occupy.from); }
    } else if ((a.phase === 'attack' || a.phase === 'fortify') && rolls === 0) {
      let from = -1, to = -1;
      for (let t = 0; t < a.owner.length; t++) {
        if (a.owner[t] !== p || b.owner[t] !== p) continue;
        if (b.armies[t] < a.armies[t]) from = t; else if (b.armies[t] > a.armies[t]) to = t;
      }
      if (from >= 0 && to >= 0) { out.push({ type: 'move', p, mine, from, to, n: b.armies[to] - a.armies[to] }); moved.add(from).add(to); }
    }
    const placed = [];
    for (let t = 0; t < a.owner.length; t++) {
      if (a.owner[t] < 0 && b.owner[t] >= 0) placed.push({ type: 'claim', p: b.owner[t], mine: me.includes(b.owner[t]), t });
      else if (a.owner[t] === b.owner[t] && b.armies[t] > a.armies[t] && !moved.has(t) && rolls === 0) placed.push({ type: 'place', p: b.owner[t], mine, t, n: b.armies[t] - a.armies[t], setup });
    }
    out.push(...placed);

    // territories taken (flag stamp + the new colour floods in)
    for (let t = 0; t < a.owner.length; t++) {
      if (a.owner[t] >= 0 && b.owner[t] >= 0 && a.owner[t] !== b.owner[t]) out.push({ type: 'conquer', p: b.owner[t], mine: me.includes(b.owner[t]), t, was: hex(a.owner[t]), hex: hex(b.owner[t]) });
    }
    // a whole continent taken (not during setup)
    if (!setup && !SETUP.includes(b.phase)) {
      M.CONTINENTS.forEach((c, ci) => {
        b.players.forEach((q, i) => { if (q.kind !== 'neutral' && holds(b, i, ci) && !holds(a, i, ci)) out.push({ type: 'continent', p: i, mine: me.includes(i), ci, hex: hex(i), bonus: c.bonus }); });
      });
    }
    // players wiped out
    const gone = [];
    b.players.forEach((q, i) => { if (q.out && !a.players[i].out) { gone.push(i); out.push({ type: 'out', p: i, by: q.killedBy, mine: me.includes(i), neutral: q.kind === 'neutral' }); } });
    // cards drawn at the end of a turn, or taken from a wiped-out player
    b.players.forEach((q, i) => {
      const d = nCards(q) - nCards(a.players[i]);
      if (d > 0) out.push({ type: gone.some(v => b.players[v].killedBy === i) ? 'loot' : 'draw', p: i, mine: me.includes(i), n: d });
    });
    // game over
    if (b.phase === 'over') out.push({ type: 'over', winner: b.winner, hex: hex(b.winner), kind: !me.length || me.includes(b.winner) ? 'win' : 'lose' });
    // it just became your turn (start of your real turn, or your headquarters pick) - not every move
    else if (me.includes(b.turn) && (b.phase === 'reinforce' || b.phase === 'capital') && (a.turn !== b.turn || (a.phase !== b.phase && SETUP.includes(a.phase))))
      out.push({ type: 'myTurn', p: b.turn, hex: hex(b.turn) });
    return out;
  }

  // ---------------------------------------------------------------- play it
  // env: { FX, at(ms, fn), badge(t), chip(p), cont(ci), panel(), dice(), flood(t, oldHex, ms), stamp(t, hex) }
  function run(evs, env) {
    if (!evs || !evs.length) return 0;
    const FX = env.FX, s = FX.settings, sp = s.animSpeed === 'fast' ? 0.55 : 1;
    let T = 0;
    const at = (ms, f) => env.at(Math.round(ms * sp), f);
    const snd = (ms, name, e, o) => at(ms, () => FX.play(name, Object.assign({ vol: e && e.mine === false ? 0.75 : 1 }, o || {}))); // others' moves never louder than yours
    const fl = (ms, el, text, color) => at(ms, () => FX.floatText(el(), text, color));
    let places = 0;
    for (const e of evs) {
      switch (e.type) {
        case 'trade':
          snd(T, 'cardSlide', e); snd(T + 160, 'cardFlip', e);
          if (e.armies > 0) fl(T + 200, () => (e.mine ? env.panel() : env.chip(e.p)), '+' + e.armies, 'var(--accent-warm)');
          T += 260; break;
        case 'claim': case 'place':
          if (places < 3) { snd(T + places * 70, 'place', e, { vol: (e.mine ? 1 : 0.75) * (e.setup || e.type === 'claim' ? 0.7 : 1) }); }
          if (e.type === 'place' && !e.setup) fl(T + 40, () => env.badge(e.t), '+' + e.n, 'var(--good)');
          places++; break;
        case 'battle': {
          T += places ? 80 * Math.min(3, places) : 0; places = 0;
          const lost = e.al + e.dl;
          let land;
          if (e.rolls === 1) { // one tumble per die thrown, landing as the drawn dice settle
            for (let i = 0; i < e.att + e.def; i++) snd(T + i * 45, 'dieRoll', e);
            land = T + 330;
          } else { // blitz: a shake, then a quick burst of rolls
            snd(T, 'diceShake', e);
            const n = Math.min(e.rolls, 6);
            for (let i = 0; i < n; i++) snd(T + 120 + i * 85, 'dieRoll', e);
            land = T + 120 + n * 85 + 60;
          }
          snd(land, 'diceLand', e);
          if (e.from >= 0 && e.al) fl(land + 20, () => env.badge(e.from), '−' + e.al, 'var(--bad)');
          if (e.to >= 0 && e.dl) fl(land + 20, () => env.badge(e.to), '−' + e.dl, 'var(--bad)');
          if (e.attHit) at(land + 20, () => FX.shake(env.dice()));
          const k = Math.min(lost, e.rolls === 1 ? 3 : 5);
          for (let i = 0; i < k; i++) snd(land + 90 + i * 85, 'thud', e, { vol: (e.mine ? 1 : 0.75) * (1 - i * 0.12) });
          T = land + 90 + k * 85; break;
        }
        case 'move':
          snd(T, 'slide', e); fl(T + 60, () => env.badge(e.to), '+' + e.n, 'var(--good)'); T += 240; break;
        case 'conquer':
          env.flood(e.t, e.was, Math.round(T * sp)); // old colour holds, then the new one floods in with the stamp
          snd(T, 'stamp', e); at(T, () => env.stamp(e.t, e.hex)); T += 220; break;
        case 'continent':
          at(T, () => FX.celebrate({ kind: 'big', at: env.cont(e.ci), colors: [e.hex, '#ffffff', '#f0b354'] }));
          fl(T + 80, () => env.cont(e.ci), '+' + e.bonus, e.hex); T += 320; break;
        case 'out':
          snd(T, e.neutral ? 'whoosh' : 'explosion', e, { vol: 0.6 });
          at(T, () => FX.shake(env.chip(e.p))); if (!e.neutral) fl(T + 60, () => env.chip(e.p), 'Out', 'var(--bad)');
          T += 450; break;
        case 'draw':
          snd(T, 'cardDeal', e); fl(T, () => env.chip(e.p), '+1 card', 'var(--accent)'); T += 200; break;
        case 'loot':
          snd(T, 'cardSlide', e); fl(T, () => env.chip(e.p), '+' + e.n + ' cards', 'var(--accent)'); T += 260; break;
        case 'over':
          at(T + 250, () => FX.celebrate({ kind: e.kind, colors: [e.hex, '#ffffff', '#f0b354', '#e8eaf0'] })); T += 250; break;
        case 'myTurn':
          T = Math.max(T, 120);
          snd(T, 'turn'); at(T, () => FX.flash(env.chip(e.p), e.hex)); break;
      }
    }
    return T;
  }

  // ---------------------------------------------------------------- map effects (browser only)
  const animOn = FX => !!(FX && FX.settings.animations && root.document);
  const speed = FX => (FX.settings.animSpeed === 'fast' ? 0.55 : 1);
  // the territory keeps its old colour for `ms`, then the conqueror's colour floods in
  function flood(view, t, color, ms, FX) {
    if (!animOn(FX)) return;
    const p = view.paths[t]; if (!p || !p.animate) return;
    const o = p.cloneNode(false);
    o.removeAttribute('data-t'); o.setAttribute('class', 'terr fx-flood'); o.style.fill = color;
    view.land.parentNode.insertBefore(o, view.land.nextSibling); // just above the land, outside its shadow filter (cheaper to draw)
    const fade = 520 * speed(FX), dur = ms + fade;
    let a; try { a = o.animate([{ opacity: 1 }, { opacity: 1, offset: ms / dur }, { opacity: 0 }], { duration: dur, easing: 'ease-in', fill: 'forwards' }); } catch (e) { o.remove(); return; }
    const done = () => o.remove(); a.onfinish = done; a.oncancel = done; setTimeout(done, dur + 200);
  }
  // a little flag in the conqueror's colour stamped onto the territory (an overlay: nothing moves)
  function stamp(view, t, color, FX) {
    if (!animOn(FX)) return;
    const b = view.badges[t]; if (!b || !b.c.getBoundingClientRect) return;
    const r = b.c.getBoundingClientRect(), m = view.svg.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < m.left || x > m.right || y < m.top || y > m.bottom) return; // zoomed away from it
    const d = root.document.createElement('div');
    d.setAttribute('aria-hidden', 'true');
    d.style.cssText = `position:fixed;left:${x - 11}px;top:${y - 30}px;width:22px;height:24px;pointer-events:none;z-index:2147483000;transform-origin:4px 22px`;
    d.innerHTML = `<svg viewBox="0 0 22 24" width="22" height="24"><path d="M4 2v20" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><path d="M5 3h13l-3 4.5 3 4.5H5z" fill="${color}" stroke="#0f1117" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
    root.document.body.appendChild(d);
    const dur = 900 * speed(FX);
    let a; try { a = d.animate([{ transform: 'scale(2.2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: 0.22 }, { transform: 'scale(1)', opacity: 1, offset: 0.75 }, { transform: 'scale(1) translateY(-6px)', opacity: 0 }], { duration: dur, easing: 'ease-out' }); } catch (e) { d.remove(); return; }
    const done = () => d.remove(); a.onfinish = done; a.oncancel = done; setTimeout(done, dur + 200);
  }

  // Risk's own sounds (synthesised like the rest): one die tumbling to a stop, an army lost
  const FXG = root.FX;
  if (FXG && FXG.define) {
    FXG.define('dieRoll', k => { let t = 0, gap = 0.028; for (let i = 0; i < 6; i++) { k.tone({ f: k.rnd(1300, 2100), dur: 0.018, vol: 0.09, type: 'triangle', at: t }); k.noise({ f: k.rnd(2400, 3200), q: 2, dur: 0.022, vol: 0.17, at: t }); t += gap; gap *= 1.3; } }, 'moves');
    FXG.define('thud', k => { k.tone({ f: 105, f2: 52, dur: 0.17, vol: 0.42 }); k.noise({ f: 420, filter: 'lowpass', dur: 0.07, vol: 0.32 }); }, 'moves');
  }

  const api = { events, run, flood, stamp };
  if (node) module.exports = api; else root.RiskFX = api;
})(typeof window !== 'undefined' ? window : globalThis);
