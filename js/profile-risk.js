// Risk's part of the player profile (shared kit: js/profile.js, never edit that one here).
// The computer levels' ratings, the achievement list, today's Daily game and turning a finished game into a result.
(function (root) {
  'use strict';
  // Elo of each level, from the measured one-on-one games (js/strength.js, tools/measure.js, 400 games each).
  // Hard beats Medium about 72%: +160. Medium beats Easy about 98%, which is beyond what Elo can say, so
  // that step is capped at +400. Easy anchored at 1000.
  const LEVELS = [
    { id: 'easy', name: 'Easy', rating: 1000 },
    { id: 'medium', name: 'Medium', rating: 1400 },
    { id: 'hard', name: 'Hard', rating: 1560 },
  ];
  const RANK = { easy: 0, medium: 1, hard: 2 };
  const won = c => !!(c.last && c.last.won);
  const ex = c => (c.last && c.last.extra) || {};
  const achievements = () => [
    { id: 'first', title: 'First win', desc: 'Win a game', test: c => c.stats.wins >= 1 },
    { id: 'medium', title: 'General', desc: 'Beat Medium', test: c => won(c) && RANK[c.last.level] >= 1 },
    { id: 'hard', title: 'Field marshal', desc: 'Beat Hard', test: c => won(c) && c.last.level === 'hard' },
    { id: 'crowd', title: 'Last one standing', desc: 'Win against 5 computers', test: c => won(c) && ex(c).players >= 6 },
    { id: 'aus', title: 'Down under', desc: 'Hold Australia', test: c => (ex(c).conts || []).includes('au') },
    { id: 'asia', title: 'Empire', desc: 'Hold all of Asia', test: c => (ex(c).conts || []).includes('as') },
    { id: 'half', title: 'Half the world', desc: 'Hold 21 territories at once', test: c => ex(c).land >= 21 },
    { id: 'cards', title: 'Cash in', desc: 'Trade one card set for 15 or more armies', test: c => ex(c).trade >= 15 },
    { id: 'quick', title: 'Blitzkrieg', desc: 'Conquer the world in 12 rounds or fewer', test: c => won(c) && ex(c).how === 'world' && ex(c).rounds <= 12 },
    { id: 'streak', title: 'Hat trick', desc: 'Win 3 in a row', test: c => c.stats.bestStreak >= 3 },
    { id: 'daily', title: 'Daily player', desc: '3-day Daily streak', test: c => c.daily.streak >= 3 },
  ];

  // Today's Daily game: the same deal and dice for everyone that day (the engine's seed),
  // classic rules, you against two Hard computers.
  function dailyGame(seed) {
    return { seed: (seed >>> 0) || 1, seats: [{ name: 'You', kind: 'human', level: 'medium' }, { kind: 'cpu', level: 'hard' }, { kind: 'cpu', level: 'hard' }], rules: { mode: 'classic' } };
  }

  // what happened to `me` during a game, kept while it is played (the end state may have lost it all)
  function track(acc, st, me, CONTINENTS, E) {
    acc = acc || { conts: [], land: 0, trade: 0 };
    if (me < 0 || !st.players[me]) return acc;
    let land = 0; for (let t = 0; t < st.owner.length; t++) if (st.owner[t] === me) land++;
    acc.land = Math.max(acc.land, land);
    CONTINENTS.forEach(c => { if (!acc.conts.includes(c.id) && c.terrs.every(t => st.owner[t] === me)) acc.conts.push(c.id); });
    return acc;
  }

  // A finished local game -> Profile.recordResult input. helped: Hint or Undo was used -> "with help", not rated.
  // Only a game with exactly one person against computers counts against a level; more people = pass-and-play.
  function result(st, me, opts) {
    opts = opts || {};
    const humans = st.players.filter(p => p.kind === 'human').length;
    const levels = st.players.filter((p, i) => i !== me && p.kind === 'cpu').map(p => p.level).filter(l => RANK[l] != null);
    const level = levels.length ? levels.reduce((a, b) => (RANK[b] > RANK[a] ? b : a)) : null; // the strongest computer at the table
    const extra = Object.assign({ players: st.players.filter(p => p.kind !== 'neutral').length, rounds: st.round, how: st.how || '' }, opts.acc || {});
    if (humans > 1) return { mode: 'friends', won: null, daily: false, extra };
    const mode = opts.helped ? 'help' : 'computer';
    // teams house rule: the partner of the winner wins too
    const P = st.players, won = st.winner === me || (st.winner >= 0 && !!P[me] && P[me].team != null && P[me].team === P[st.winner].team);
    return { mode, level: mode === 'computer' ? level : null, won, daily: !!opts.daily, extra };
  }

  const api = { LEVELS, achievements, dailyGame, result, track };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RiskProfile = api;
})(typeof window !== 'undefined' ? window : globalThis);
