// Computer players. choose(state, seat) returns the next action for that seat.
// Easy: plays loosely and attacks on a whim. Medium: attacks only with good
// odds and builds toward a continent. Hard: values continents, card timing,
// threats on its borders and the exact battle odds before every attack.
// Strength is measured in tools/sim.js (see progress.md).
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const M = node ? require('./map.js') : root.RiskMap;
  const E = node ? require('./engine.js') : root.RiskEngine;
  const O = node ? require('./odds.js') : root.RiskOdds;
  const { T, ADJ, CONTINENTS, N } = M;

  // Hard player's weights (tuned with tools/sim.js; see progress.md)
  const H = { lossW: 0.18, failW: 1.2, lowCut: 0.5, lowPen: 2, stopDiv: 0, cardV: 1.5, keepGoing: 0, split: true, stack: 0.08, atk: 'hard', plc: 'plan', fort: 'hard', def: 0 };

  function rng(st, salt) { // deterministic per state, never touches the game seed
    let x = ((st.ver || 0) * 2654435761 + (salt || 0) * 40503 + st.turns * 97 + st.armies.reduce((a, b, i) => a + b * (i + 1), 0)) >>> 0;
    return () => { x = (x + 0x6D2B79F5) >>> 0; let t = Math.imul(x ^ (x >>> 15), x | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const enemyNbrs = (st, t) => ADJ[t].filter(u => st.owner[u] !== st.owner[t]);
  const isBorder = (st, t) => enemyNbrs(st, t).length > 0;
  function threat(st, t) { // enemy armies that could hit t, minus our armies there
    let e = 0; ADJ[t].forEach(u => { const o = st.owner[u]; if (o >= 0 && o !== st.owner[t] && st.players[o].kind !== 'neutral') e += st.armies[u] - 1; }); // unclaimed land threatens nobody
    return e;
  }

  // ---------------------------------------------------------- continent focus
  function contScores(st, p) {
    const m = st.players[p].mission;
    return CONTINENTS.map((c, ci) => {
      const size = c.terrs.length;
      const own = c.terrs.filter(t => st.owner[t] === p).length;
      let enemy = 0; c.terrs.forEach(t => { if (st.owner[t] !== p) enemy += st.armies[t]; });
      let s = (c.bonus / c.borders.length) * (0.25 + own / size) - enemy / (size * 6) + (own === size ? 2 : 0);
      if (m && !m.hidden && m.kind === 'conts' && m.conts.includes(c.id)) s += 2;
      return s;
    });
  }
  function targetCont(st, p) { const s = contScores(st, p); return s.indexOf(Math.max(...s)); }

  // ---------------------------------------------------------- main
  function choose(st, seat) {
    const P = st.players[seat], lvl = P.level || 'medium';
    const r = rng(st, seat + 1);
    switch (st.phase) {
      case 'claim': return { type: 'claim', t: claimPick(st, seat, lvl, r) };
      case 'place': return setupPlace(st, seat, lvl, r);
      case 'capital': return { type: 'capital', t: capitalPick(st, seat) };
      case 'reinforce': return reinforce(st, seat, lvl, r);
      case 'occupy': return occupy(st, seat, lvl);
      case 'attack': return attack(st, seat, lvl, r);
      case 'fortify': return fortify(st, seat, lvl, r);
    }
    return null;
  }

  function claimPick(st, p, lvl, r) {
    const free = []; for (let t = 0; t < N; t++) if (st.owner[t] < 0) free.push(t);
    if (lvl === 'easy') return pick(r, free);
    let best = free[0], bs = -1e9;
    free.forEach(t => {
      const c = CONTINENTS[T[t].ci];
      const own = c.terrs.filter(u => st.owner[u] === p).length, other = c.terrs.filter(u => st.owner[u] >= 0 && st.owner[u] !== p).length;
      let s = (c.bonus / c.terrs.length) * (1 + own * 1.5) - other * 0.4 + (c.terrs.length <= 4 ? 0.6 : 0);
      s += ADJ[t].filter(u => st.owner[u] === p).length * 0.3 + r() * 0.05;
      if (s > bs) { bs = s; best = t; }
    });
    return best;
  }

  function capitalPick(st, p) {
    const mine = E.owned(st, p);
    let best = mine[0], bs = -1e9;
    mine.forEach(t => { const s = st.armies[t] * 2 - enemyNbrs(st, t).length * 3 - threat(st, t); if (s > bs) { bs = s; best = t; } });
    return best;
  }

  // hard: put the armies where they buy the best attack this turn, unless a
  // held continent's border is in danger
  function planPlace(st, p, reserve) {
    const mine = E.owned(st, p), tc = targetCont(st, p);
    let best = mine[0], bs = -1e9;
    mine.forEach(t => {
      const en = enemyNbrs(st, t); if (!en.length) return;
      const A = st.armies[t] + reserve;
      let s = 0;
      en.forEach(u => { const v = O.winP(A, st.armies[u]) * gain(st, p, u, tc) - O.lossP(A, st.armies[u]) * H.lossW; if (v > s) s = v; });
      CONTINENTS.forEach((c, ci) => { if (E.holdsCont(st, p, ci) && c.borders.includes(t)) s += Math.max(0, threat(st, t) - st.armies[t]) * H.def * c.bonus / 5; });
      if (s > bs) { bs = s; best = t; }
    });
    return best;
  }

  function bestPlace(st, p, lvl, r) {
    if (lvl === 'hard' && H.plc === 'plan' && st.phase === 'reinforce') return planPlace(st, p, st.reserve);
    const mine = E.owned(st, p);
    if (lvl === 'easy') { const b = mine.filter(t => isBorder(st, t)); return pick(r, b.length ? b : mine); }
    const tc = targetCont(st, p);
    let best = mine[0], bs = -1e9;
    mine.forEach(t => {
      const en = enemyNbrs(st, t); if (!en.length) return;
      let s = 0;
      const inT = T[t].ci === tc, nbrT = en.some(u => T[u].ci === tc);
      if (inT) s += 3; if (nbrT) s += 4;
      // weakest enemy neighbour we could take
      const weak = Math.min(...en.map(u => st.armies[u]));
      s += 2 / (1 + weak);
      if (lvl === 'hard' && H.plc === 'hard') {
        // defend a held continent's border under threat
        CONTINENTS.forEach((c, ci) => { if (E.holdsCont(st, p, ci) && c.borders.includes(t)) s += Math.max(0, threat(st, t) - st.armies[t]) * 0.4 + c.bonus * 0.3; });
        s += Math.min(st.armies[t], 12) * H.stack; // build one stack
      }
      s += r() * 0.01;
      if (s > bs) { bs = s; best = t; }
    });
    return best;
  }

  function setupPlace(st, p, lvl, r) {
    if (st.quota && st.quota.own === 0 && st.quota.neutral > 0) {
      // block the opponent with the neutral army
      const opp = st.players.findIndex((q, i) => i !== p && q.kind !== 'neutral');
      const nt = E.owned(st, st.neutral);
      let best = nt[0], bs = -1e9;
      nt.forEach(t => { const s = ADJ[t].filter(u => st.owner[u] === opp).reduce((a, u) => a + st.armies[u], 0) + ADJ[t].filter(u => st.owner[u] === p).length * 0.5 + r() * 0.01; if (s > bs) { bs = s; best = t; } });
      return { type: 'place', t: best };
    }
    return { type: 'place', t: bestPlace(st, p, lvl, r) };
  }

  function reinforce(st, p, lvl, r) {
    const P = st.players[p];
    const sets = st.after === 'attack' && P.cards.length <= 4 ? [] : E.findSets(P.cards); // after a wipe-out: only down to 4 cards
    if (sets.length && (st.mustTrade || lvl !== 'easy')) {
      // prefer the set that earns the +2 territory bonus and keeps wilds
      let best = sets[0], bs = -1e9;
      sets.forEach(s => {
        let v = E.tradeValue(st, s);
        if (s.some(c => M.CARDS[c].terr >= 0 && st.owner[M.CARDS[c].terr] === p)) v += 2;
        v -= s.filter(c => M.CARDS[c].sym === 'W').length * 1.5;
        if (v > bs) { bs = v; best = s; }
      });
      return { type: 'trade', cards: best };
    }
    const t = bestPlace(st, p, lvl, r);
    if (lvl === 'easy') return { type: 'place', t, n: Math.max(1, Math.ceil(st.reserve / 2)) };
    return { type: 'place', t, n: st.reserve };
  }

  // value of taking territory `to` from p's view
  function gain(st, p, to, tc) {
    const c = CONTINENTS[T[to].ci];
    let v = 1;
    const own = c.terrs.filter(u => st.owner[u] === p).length;
    if (own === c.terrs.length - 1) v += c.bonus * 1.6; // completes it
    if (T[to].ci === tc) v += 1.2;
    const d = st.owner[to];
    if (d >= 0 && st.players[d].kind !== 'neutral') {
      if (E.holdsCont(st, d, T[to].ci)) v += c.bonus * 1.2; // breaks theirs
      if (E.countOwned(st, d) === 1) v += 4 + st.players[d].cards.length * 1.5; // knock them out
      const m = st.players[p].mission;
      if (m && m.kind === 'kill' && !m.fallback && st.players[d].color === m.color) v += 2.5;
    }
    if (!st.captured) v += H.cardV; // a card this turn
    return v;
  }

  function attack(st, p, lvl, r) {
    const mine = E.owned(st, p).filter(t => st.armies[t] >= 2);
    const tc = targetCont(st, p);
    let best = null, bs = 0;
    mine.forEach(f => ADJ[f].forEach(t => {
      if (st.owner[t] === p) return;
      const A = st.armies[f], D = st.armies[t];
      if (lvl === 'easy') {
        if (A > D + 1 && r() < 0.6) { const s = A - D + r(); if (s > bs) { bs = s; best = [f, t]; } }
        return;
      }
      const pw = O.winP(A, D);
      if (lvl === 'medium' || H.atk === 'medium' && lvl === 'hard') { if (pw >= 0.7) { const s = pw + (T[t].ci === tc ? 0.3 : 0) + r() * 0.01; if (s > bs) { bs = s; best = [f, t]; } } return; }
      // hard: expected gain minus the armies we expect to lose, and keep borders safe
      const v = gain(st, p, t, tc);
      let s = pw * v - O.lossP(A, D) * H.lossW - (1 - pw) * H.failW;
      if (pw < H.lowCut) s -= H.lowPen;
      if (st.captured) s -= H.keepGoing;
      // do not strip a held continent's border bare
      CONTINENTS.forEach((c, ci) => { if (E.holdsCont(st, p, ci) && c.borders.includes(f) && enemyNbrs(st, f).length > 1) s -= 0.6; });
      if (s > bs) { bs = s; best = [f, t]; }
    }));
    if (lvl === 'easy' && best && r() < 0.15) best = null; // gets bored
    if (best) return { type: 'blitz', from: best[0], to: best[1], stop: lvl === 'hard' && H.stopDiv ? Math.max(1, Math.min(3, Math.floor(st.armies[best[0]] / H.stopDiv))) : 1 };
    return { type: 'endAttack' };
  }

  function occupy(st, p, lvl) {
    const o = st.occupy;
    if (lvl === 'easy') return { type: 'occupy', n: o.min };
    if (lvl === 'medium') return { type: 'occupy', n: o.max };
    if (!H.split) return { type: 'occupy', n: o.max };
    // hard: split by threat between the two territories
    const total = st.armies[o.from]; // armies in `from` before moving
    const fromEnemies = ADJ[o.from].filter(u => st.owner[u] !== p);
    if (!fromEnemies.length) return { type: 'occupy', n: o.max };
    const toThreat = enemyNbrs(st, o.to).length ? threat(st, o.to) + 3 : 0;
    const fromThreat = threat(st, o.from);
    let n = Math.round(total * (toThreat + 1) / (toThreat + fromThreat + 2));
    n = Math.max(o.min, Math.min(o.max, n));
    return { type: 'occupy', n };
  }

  function fortify(st, p, lvl, r) {
    if (st.phase === 'attack') return { type: 'endAttack' };
    if (lvl === 'easy') return { type: 'endTurn' };
    const mine = E.owned(st, p);
    // biggest stack that is not facing anyone
    const inner = mine.filter(t => !isBorder(st, t) && st.armies[t] > 1).sort((a, b) => st.armies[b] - st.armies[a]);
    for (const f of inner) {
      const reach = st.rules.fortify === 'adjacent' ? ADJ[f].filter(u => st.owner[u] === p) : [...E.reachable(st, f)];
      const borders = reach.filter(t => isBorder(st, t));
      if (!borders.length) continue;
      let best = borders[0], bs = -1e9;
      const tc = targetCont(st, p);
      borders.forEach(t => { const s = threat(st, t) - st.armies[t] + (T[t].ci === tc ? 2 : 0); if (s > bs) { bs = s; best = t; } });
      return { type: 'fortify', from: f, to: best, n: st.armies[f] - 1 };
    }
    return { type: 'endTurn' };
  }

  // best attack suggestion for the hint button (hard brain, with reasons)
  function hint(st, p) {
    const tc = targetCont(st, p);
    const out = [];
    E.owned(st, p).filter(t => st.armies[t] >= 2).forEach(f => ADJ[f].forEach(t => {
      if (st.owner[t] === p) return;
      const b = O.battle(st.armies[f], st.armies[t]);
      out.push({ from: f, to: t, win: b.win, loss: b.expAttLoss, value: gain(st, p, t, tc) });
    }));
    out.forEach(o => { o.score = o.win * o.value - o.loss * 0.18 - (1 - o.win) * 1.2; });
    out.sort((a, b) => b.score - a.score);
    return { target: tc, attacks: out, place: bestPlace(st, p, 'hard', () => 0.5) };
  }

  const api = { choose, hint, targetCont, contScores, threat, H };
  if (node) module.exports = api; else root.RiskAI = api;
})(typeof window !== 'undefined' ? window : globalThis);
