// Risk as the shared online module expects it (see ../_online/README.md in the parent folder).
// Seats: 0..n-1 are the players in colour order. The host's browser holds the full state and
// runs the computers; everyone else sees publicView plus their own privateView.
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const E = node ? require('./engine.js') : root.RiskEngine;
  const AI = node ? require('./ai.js') : root.RiskAI;
  const LEVELS = ['easy', 'medium', 'hard'];

  const game = {
    id: 'risk', minSeats: 2, maxSeats: 6,
    // options: { rules: {...}, levels: ['hard', ...] }
    setup(n, options, rng, seats) {
      const o = options || {}, lv = o.levels || [];
      const S = Array.from({ length: n }, (_, i) => {
        const s = (seats && seats[i]) || {};
        const level = LEVELS.includes(lv[i]) ? lv[i] : 'medium';
        if (s.kind === 'computer') return { name: E.COLORS[i].name + ' ' + level[0].toUpperCase(), kind: 'cpu', level };
        return { name: String(s.name || E.COLORS[i].name).slice(0, 20), kind: 'human', level };
      });
      return E.newGame(S, o.rules || {}, Math.floor(rng() * 4294967296) || 1);
    },
    toAct(st) { const a = E.actor(st); return a < 0 ? [] : [a]; },
    apply(st, seat, action) {
      if (E.actor(st) !== seat) throw new Error('Not your turn');
      return E.apply(st, action);
    },
    // everything a player at a real table can see (hands as counts, missions hidden, no deck order or seed)
    publicView(st) { return E.view(st, -1); },
    // only this seat's secrets; sorted so it stays stable between moves
    privateView(st, seat) {
      const P = st.players[seat]; if (!P) return null;
      return { cards: P.cards.slice().sort((a, b) => a - b), mission: P.mission, capital: P.capital };
    },
    bot(ctx, seat) { return AI.choose(ctx.state, seat); },
    isOver(st) { return st.phase === 'over'; },
  };

  // the state a player's screen draws: the public table plus their own hand
  function merge(pub, mine, seat) {
    const g = JSON.parse(JSON.stringify(pub));
    g.players.forEach((p, i) => {
      if (typeof p.cards === 'number') p.cards = new Array(p.cards).fill(-1);
      if (i === seat && mine) { p.cards = mine.cards.slice(); p.mission = mine.mission; p.capital = mine.capital; }
    });
    return g;
  }

  const api = { game, merge };
  if (node) module.exports = api; else root.RiskGame = api;
})(typeof window !== 'undefined' ? window : globalThis);
