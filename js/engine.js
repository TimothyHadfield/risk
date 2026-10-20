// The whole game as a pure function: apply(state, action) -> new state.
// view(state, seat) hides what nobody at a real table could see (other hands,
// secret missions, unchosen capitals, the deck order and the dice seed).
// The same engine runs local, computer and online seats.
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const M = node ? require('./map.js') : root.RiskMap;
  const O = node ? require('./odds.js') : root.RiskOdds;
  const { T, ADJ, CONTINENTS, CARDS, N } = M;

  const COLORS = [
    { id: 'red', name: 'Red', hex: '#e5534b' },
    { id: 'blue', name: 'Blue', hex: '#4c8dff' },
    { id: 'yellow', name: 'Yellow', hex: '#e8c547' },
    { id: 'green', name: 'Green', hex: '#3fb27f' },
    { id: 'black', name: 'Black', hex: '#5b6170' },
    { id: 'pink', name: 'Pink', hex: '#e07ad1' },
  ];
  const NEUTRAL_HEX = '#a8a196';

  const DEFAULT_RULES = {
    mode: 'classic',      // 'classic' (take the world) | 'mission' (secret missions) | 'capital'
    setup: 'deal',        // 'deal' (cards dealt, then armies placed in turn) | 'claim' (take turns claiming)
    cards: 'escalating',  // 'escalating' 4,6,8,10,12,15,+5 | 'fixed' by symbol | 'plusone' 4,5,6...
    cardBonus: true,      // +2 armies on a traded card's territory you hold
    fortify: 'connected', // 'connected' (through your own land) | 'adjacent' (1959 free move)
    capitalShort: false,  // capital game: 4p need 2 enemy HQs, 5p need 3
    missions12: false,    // 1990s US deck: drop the two "Europe + ... + a third" missions
    maxTurns: 600,        // safety stop for computer games
  };

  const START = { 2: 40, 3: 35, 4: 30, 5: 25, 6: 20 };

  // ------------------------------------------------------------- random
  function rand(st) { // mulberry32, state kept in st.seed
    let t = (st.seed = (st.seed + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const die = st => 1 + Math.floor(rand(st) * 6);
  function shuffle(st, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand(st) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const clone = o => JSON.parse(JSON.stringify(o));

  // ------------------------------------------------------------- missions
  // kinds: conts [continent ids] (+ extra: one more continent of your choice),
  // count n (with min armies each), kill colour
  function missionList(rules, colorsInPlay) {
    const L = [
      { kind: 'conts', conts: ['na', 'af'] },
      { kind: 'conts', conts: ['na', 'au'] },
      { kind: 'conts', conts: ['as', 'sa'] },
      { kind: 'conts', conts: ['as', 'af'] },
    ];
    if (!rules.missions12) {
      L.push({ kind: 'conts', conts: ['eu', 'sa'], extra: true });
      L.push({ kind: 'conts', conts: ['eu', 'au'], extra: true });
    }
    L.push({ kind: 'count', n: 24, min: 1 });
    L.push({ kind: 'count', n: 18, min: 2 });
    COLORS.forEach(c => { if (colorsInPlay.includes(c.id)) L.push({ kind: 'kill', color: c.id }); });
    return L;
  }
  function missionText(m) {
    if (!m) return '';
    const cn = id => CONTINENTS.find(c => c.id === id).name;
    if (m.kind === 'conts') return 'Take ' + m.conts.map(cn).join(' and ') + (m.extra ? ' and one more continent' : '');
    if (m.kind === 'count') return m.min > 1 ? `Hold ${m.n} territories with 2+ armies each` : `Hold ${m.n} territories`;
    if (m.kind === 'kill') return `Wipe out ${COLORS.find(c => c.id === m.color).name}` + (m.fallback ? ' (now: hold 24 territories)' : '');
    return '';
  }

  // ------------------------------------------------------------- setup
  // seats: [{ name, kind: 'human'|'cpu'|'online', level }]
  function newGame(seats, rules, seed) {
    const R = Object.assign({}, DEFAULT_RULES, rules || {});
    const n = seats.length;
    if (n < 2 || n > 6) throw new Error('2 to 6 players');
    if (n === 2 && R.mode !== 'classic') R.mode = 'classic'; // two-player game is the classic game with a neutral army
    const st = {
      v: 1, rules: R,
      seed: (seed >>> 0) || ((Math.random() * 4294967296) >>> 0),
      players: seats.map((s, i) => ({
        name: s.name || COLORS[i].name, kind: s.kind || 'human', level: s.level || 'medium',
        color: COLORS[i].id, hex: COLORS[i].hex,
        cards: [], out: false, pool: START[n], mission: null, capital: -1, killedBy: -1,
      })),
      owner: new Array(N).fill(-1), armies: new Array(N).fill(0),
      deck: [], discard: [], sets: 0,
      turn: 0, round: 1, turns: 0,
      phase: 'claim', reserve: 0, quota: null,
      captured: false, occupy: null, after: null, mustTrade: false,
      lastRoll: null, lastBattle: null, log: [], winner: -1, neutral: -1,
      stats: seats.map(() => ({ rolls: 0, won: 0, lost: 0, taken: 0, cardsArmies: 0 })),
    };
    if (n === 2) {
      st.players.push({ name: 'Neutral', kind: 'neutral', level: '', color: 'neutral', hex: NEUTRAL_HEX, cards: [], out: false, pool: 40, mission: null, capital: -1, killedBy: -1 });
      st.neutral = 2;
      st.players[0].pool = st.players[1].pool = 40;
    }
    const deckNoWild = shuffle(st, CARDS.filter(c => c.sym !== 'W').map(c => c.id));
    if (n === 2 || R.setup === 'deal') {
      // deal territory cards round the table (2 players: three piles of 14 incl. neutral)
      const k = st.players.length;
      deckNoWild.forEach((cid, i) => { const p = i % k; claimT(st, CARDS[cid].terr, p); });
      st.phase = 'place';
    } else {
      st.phase = 'claim';
    }
    st.deck = shuffle(st, CARDS.map(c => c.id));
    if (R.mode === 'mission') {
      const ms = shuffle(st, missionList(R, st.players.map(p => p.color)));
      st.players.forEach(p => { p.mission = ms.pop(); });
      fixMissions(st);
    }
    st.turn = 0;
    startSetupTurn(st);
    log(st, st.phase === 'claim' ? `First to claim: ${st.players[0].name}.` : `Land dealt. First to place: ${st.players[0].name}.`);
    return st;
  }
  function claimT(st, t, p) { st.owner[t] = p; st.armies[t] = 1; st.players[p].pool--; }
  function fixMissions(st) {
    st.players.forEach((p, i) => {
      const m = p.mission; if (!m || m.kind !== 'kill' || m.fallback) return;
      const ti = st.players.findIndex(q => q.color === m.color);
      if (ti === i || ti < 0) m.fallback = true;
    });
  }
  function startSetupTurn(st) {
    if (st.neutral >= 0 && st.phase === 'place') st.quota = { own: Math.min(2, st.players[st.turn].pool), neutral: Math.min(1, st.players[st.neutral].pool) };
    else st.quota = null;
  }

  function log(st, text) { st.log.push(text); if (st.log.length > 120) st.log.splice(0, st.log.length - 120); }
  const pname = (st, i) => (i < 0 ? 'nobody' : st.players[i].name);
  const active = st => st.players.map((p, i) => i).filter(i => !st.players[i].out && st.players[i].kind !== 'neutral');
  const owned = (st, p) => { const r = []; for (let t = 0; t < N; t++) if (st.owner[t] === p) r.push(t); return r; };
  const countOwned = (st, p) => { let c = 0; for (let t = 0; t < N; t++) if (st.owner[t] === p) c++; return c; };
  const holdsCont = (st, p, ci) => CONTINENTS[ci].terrs.every(t => st.owner[t] === p);

  // ------------------------------------------------------------- reinforcement
  function income(st, p) {
    const n = countOwned(st, p);
    let base = Math.max(3, Math.floor(n / 3));
    const conts = [];
    CONTINENTS.forEach((c, ci) => { if (holdsCont(st, p, ci)) { base += c.bonus; conts.push(c.id); } });
    return { total: base, terr: Math.max(3, Math.floor(n / 3)), conts };
  }

  // ------------------------------------------------------------- cards
  function setValue(st, symsOrNull) {
    const R = st.rules;
    if (R.cards === 'fixed') return fixedValue(symsOrNull);
    if (R.cards === 'plusone') return 4 + st.sets;
    const k = st.sets; // sets already traded in the whole game
    const tbl = [4, 6, 8, 10, 12, 15];
    return k < tbl.length ? tbl[k] : 15 + 5 * (k - 5);
  }
  // fixed: three infantry 4, three cavalry 6, three artillery 8, one of each 10 (wild = best)
  function fixedValue(syms) {
    if (!syms) return 0;
    const val = s => {
      if (s[0] === s[1] && s[1] === s[2]) return { I: 4, C: 6, A: 8 }[s[0]];
      if (new Set(s).size === 3) return 10;
      return 0;
    };
    let best = 0;
    const w = syms.map((s, i) => s === 'W' ? i : -1).filter(i => i >= 0);
    const opts = ['I', 'C', 'A'];
    const rec = (arr, k) => { if (k >= w.length) { best = Math.max(best, val(arr)); return; } opts.forEach(o => { const a = arr.slice(); a[w[k]] = o; rec(a, k + 1); }); };
    rec(syms.slice(), 0);
    return best;
  }
  function isSet(cards) {
    if (cards.length !== 3) return false;
    const s = cards.map(c => CARDS[c].sym);
    const wild = s.filter(x => x === 'W').length;
    if (wild >= 1) return true; // wild + any two
    return (s[0] === s[1] && s[1] === s[2]) || new Set(s).size === 3;
  }
  function findSets(cards) {
    const out = [];
    for (let a = 0; a < cards.length; a++) for (let b = a + 1; b < cards.length; b++) for (let c = b + 1; c < cards.length; c++) {
      const s = [cards[a], cards[b], cards[c]]; if (isSet(s)) out.push(s);
    }
    return out;
  }
  function tradeValue(st, cards) { return setValue(st, cards.map(c => CARDS[c].sym)); }

  // ------------------------------------------------------------- who acts / legal
  function actor(st) {
    if (st.phase === 'over') return -1;
    return st.turn;
  }
  function canPlace(st, p, t) { return st.owner[t] === p; }

  function reachable(st, from) { // territories connected through own land
    const p = st.owner[from]; const seen = new Set([from]); const q = [from];
    while (q.length) { const x = q.pop(); ADJ[x].forEach(y => { if (!seen.has(y) && st.owner[y] === p) { seen.add(y); q.push(y); } }); }
    seen.delete(from); return seen;
  }
  function canFortify(st, from, to) {
    const p = st.turn;
    if (st.owner[from] !== p || st.owner[to] !== p || from === to || st.armies[from] < 2) return false;
    if (st.rules.fortify === 'adjacent') return ADJ[from].includes(to);
    return reachable(st, from).has(to);
  }
  function canAttack(st, from, to) {
    const p = st.turn;
    return st.phase === 'attack' && st.owner[from] === p && st.owner[to] !== p && st.armies[from] >= 2 && ADJ[from].includes(to);
  }

  // ------------------------------------------------------------- apply
  function apply(st0, act) {
    const st = clone(st0);
    const err = applyIn(st, act);
    if (err) throw new Error(err);
    st.ver = (st0.ver || 0) + 1;
    return st;
  }
  function applyIn(st, a) {
    if (st.phase === 'over') return 'game over';
    const p = st.turn, P = st.players[p];
    switch (a.type) {
      case 'claim': {
        if (st.phase !== 'claim') return 'not claiming';
        if (st.owner[a.t] !== -1) return 'taken';
        claimT(st, a.t, p);
        log(st, `${P.name} claimed ${T[a.t].name}.`);
        if (st.owner.every(o => o >= 0)) { st.phase = 'place'; }
        nextSetup(st); return null;
      }
      case 'place': {
        const n = a.n || 1;
        if (st.phase === 'place') {
          // setup: one army per turn (two-player: two own + one neutral per turn)
          if (st.quota) {
            const isNeutral = st.owner[a.t] === st.neutral;
            if (isNeutral) { if (st.quota.neutral < 1) return 'neutral already placed'; st.quota.neutral--; st.players[st.neutral].pool--; st.armies[a.t]++; }
            else { if (st.owner[a.t] !== p) return 'not yours'; if (st.quota.own < 1) return 'no more this turn'; st.quota.own--; P.pool--; st.armies[a.t]++; }
            if (st.quota.own === 0 && st.quota.neutral === 0) nextSetup(st);
            return null;
          }
          if (st.owner[a.t] !== p) return 'not yours';
          if (P.pool < 1) return 'none left';
          P.pool--; st.armies[a.t]++;
          nextSetup(st); return null;
        }
        if (st.phase !== 'reinforce') return 'not placing now';
        if (st.mustTrade) return 'trade cards first';
        if (st.owner[a.t] !== p) return 'not yours';
        if (n < 1 || n > st.reserve || n !== Math.floor(n)) return 'bad count';
        st.armies[a.t] += n; st.reserve -= n;
        if (st.reserve === 0) { st.phase = st.after || 'attack'; st.after = null; log(st, `${P.name} placed armies.`); }
        checkWin(st);
        return null;
      }
      case 'capital': {
        if (st.phase !== 'capital') return 'not choosing capitals';
        if (st.owner[a.t] !== p) return 'not yours';
        P.capital = a.t; log(st, `${P.name} chose a headquarters.`);
        const next = nextIdx(st, p, q => st.players[q].capital < 0);
        if (next < 0) { log(st, 'Headquarters revealed.'); beginGame(st); } else st.turn = next;
        return null;
      }
      case 'trade': {
        if (st.phase !== 'reinforce') return 'cannot trade now';
        const cs = a.cards;
        if (!Array.isArray(cs) || cs.length !== 3 || new Set(cs).size !== 3 || !cs.every(c => P.cards.includes(c))) return 'not your cards';
        if (!isSet(cs)) return 'not a set';
        // after wiping someone out you trade only until you hold 4 or fewer; more sets wait for your next turn
        if (st.after === 'attack' && P.cards.length <= 4) return 'you hold 4 or fewer cards: trade again on your next turn';
        const v = tradeValue(st, cs);
        st.sets++; st.reserve += v; st.stats[p] && (st.stats[p].cardsArmies += v);
        P.cards = P.cards.filter(c => !cs.includes(c));
        st.discard.push(...cs);
        let bonus = '';
        if (st.rules.cardBonus) {
          const t = cs.map(c => CARDS[c].terr).find(t => t >= 0 && st.owner[t] === p);
          if (t !== undefined) { st.armies[t] += 2; bonus = ` +2 on ${T[t].name}`; }
        }
        log(st, `${P.name} traded cards for ${v}${bonus}.`);
        st.mustTrade = mustTradeNow(st);
        return null;
      }
      case 'attack': {
        if (!canAttack(st, a.from, a.to)) return 'cannot attack there';
        if (a.dice != null && !(Number.isInteger(a.dice) && a.dice >= 1)) return 'dice must be 1, 2 or 3';
        const dice = Math.min(a.dice || 3, 3, st.armies[a.from] - 1);
        if (dice < 1) return 'need two armies';
        roll(st, a.from, a.to, dice);
        return null;
      }
      case 'blitz': { // keep rolling with the most dice until won or down to `stop`
        if (!canAttack(st, a.from, a.to)) return 'cannot attack there';
        const stop = Math.max(1, a.stop || 1);
        let guard = 0;
        while (st.phase === 'attack' && st.owner[a.to] !== p && st.armies[a.from] > stop && st.armies[a.from] >= 2 && guard++ < 500) {
          roll(st, a.from, a.to, Math.min(3, st.armies[a.from] - 1));
        }
        return null;
      }
      case 'occupy': {
        if (st.phase !== 'occupy') return 'nothing to occupy';
        const o = st.occupy; const n = a.n;
        if (n < o.min || n > o.max || n !== Math.floor(n)) return 'bad count';
        st.armies[o.from] -= n; st.armies[o.to] += n;
        st.occupy = null;
        st.phase = 'attack';
        afterCapture(st, p, o.victim);
        return null;
      }
      case 'endAttack': {
        if (st.phase !== 'attack') return 'not attacking';
        st.phase = 'fortify';
        return null;
      }
      case 'fortify': {
        if (st.phase !== 'fortify' && st.phase !== 'attack') return 'cannot move now';
        if (!canFortify(st, a.from, a.to)) return 'cannot move there';
        const n = a.n; if (n < 1 || n > st.armies[a.from] - 1 || n !== Math.floor(n)) return 'bad count';
        st.armies[a.from] -= n; st.armies[a.to] += n;
        log(st, `${P.name} moved ${n} from ${T[a.from].name} to ${T[a.to].name}.`);
        endTurn(st); return null;
      }
      case 'endTurn': {
        if (st.phase !== 'fortify' && st.phase !== 'attack') return 'cannot end now';
        endTurn(st); return null;
      }
      case 'resign': {
        // a player leaves: their land becomes neutral-like? keep simple: they stay as a passive player
        P.kind = 'cpu'; P.level = P.level || 'easy'; log(st, `${P.name} handed over to the computer.`);
        return null;
      }
      default: return 'unknown action';
    }
  }

  function roll(st, from, to, dice) {
    const p = st.turn, d = st.owner[to];
    const dd = Math.min(2, st.armies[to]);
    const A = []; for (let i = 0; i < dice; i++) A.push(die(st));
    const D = []; for (let i = 0; i < dd; i++) D.push(die(st));
    A.sort((x, y) => y - x); D.sort((x, y) => y - x);
    let al = 0, dl = 0;
    for (let i = 0; i < Math.min(dice, dd); i++) { if (A[i] > D[i]) dl++; else al++; }
    st.armies[from] -= al; st.armies[to] -= dl;
    st.lastRoll = { from, to, att: A, def: D, al, dl };
    // dice luck: armies your dice killed minus the average for the same dice
    let eDl = 0; O.rollTable(dice, dd).forEach(o => { eDl += o.p * o.dl; });
    const eAl = Math.min(dice, dd) - eDl;
    const s = st.stats[p]; if (s) { s.rolls++; s.won += dl; s.lost += al; s.luck = (s.luck || 0) + dl - eDl; }
    const sd = st.stats[d]; if (sd) { sd.won += al; sd.lost += dl; sd.luck = (sd.luck || 0) + al - eAl; }
    if (st.armies[to] === 0) {
      // captured: must move in at least as many as dice just rolled
      st.owner[to] = p; st.captured = true; if (s) s.taken++;
      const max = st.armies[from] - 1, min = Math.min(dice, max);
      log(st, `${st.players[p].name} took ${T[to].name}.`);
      if (min === max) { st.armies[from] -= max; st.armies[to] = max; afterCapture(st, p, d); }
      else { st.occupy = { from, to, min, max, victim: d }; st.phase = 'occupy'; }
    }
  }

  function afterCapture(st, p, victim) {
    // elimination: take their cards
    if (victim >= 0 && countOwned(st, victim) === 0) {
      const V = st.players[victim];
      V.out = true; V.killedBy = p;
      if (V.kind !== 'neutral') {
        log(st, `${st.players[p].name} wiped out ${V.name}` + (V.cards.length ? ` and took ${V.cards.length} card${V.cards.length > 1 ? 's' : ''}.` : '.'));
        st.players[p].cards.push(...V.cards); V.cards = [];
      } else log(st, `${st.players[p].name} cleared the neutral army.`);
      // kill missions on the eliminated colour held by someone else become 24 territories
      st.players.forEach((q, i) => { const m = q.mission; if (m && m.kind === 'kill' && !m.fallback && m.color === V.color && i !== p) m.fallback = true; });
      if (checkWin(st)) return;
      if (st.players[p].cards.length >= 6) {
        // trade down to 4 or fewer right away, then place, then keep attacking
        st.phase = 'reinforce'; st.after = 'attack'; st.reserve = 0; st.mustTrade = true;
        return;
      }
    }
    checkWin(st);
  }

  function mustTradeNow(st) {
    const P = st.players[st.turn];
    if (st.after === 'attack') return P.cards.length > 4 && findSets(P.cards).length > 0;
    return P.cards.length >= 5 && findSets(P.cards).length > 0;
  }

  function nextIdx(st, from, ok) {
    const n = st.players.length;
    for (let k = 1; k <= n; k++) { const q = (from + k) % n; if (ok(q)) return q; }
    return -1;
  }

  function nextSetup(st) {
    const n = st.players.length;
    const humans = st.players.map((_, i) => i).filter(i => st.players[i].kind !== 'neutral');
    if (st.phase === 'claim') { st.turn = humans[(humans.indexOf(st.turn) + 1) % humans.length]; return; }
    // place phase: next seat with armies left in pool
    const left = humans.filter(i => st.players[i].pool > 0);
    const neutralLeft = st.neutral >= 0 && st.players[st.neutral].pool > 0;
    if (!left.length) {
      if (neutralLeft) { // leftover neutral armies spread evenly
        const nt = owned(st, st.neutral); let k = 0;
        while (st.players[st.neutral].pool > 0 && nt.length) { st.armies[nt[k++ % nt.length]]++; st.players[st.neutral].pool--; }
      }
      st.quota = null;
      if (st.rules.mode === 'capital') { st.phase = 'capital'; st.turn = humans[0]; log(st, 'Choose headquarters in secret.'); return; }
      beginGame(st); return;
    }
    st.turn = nextIdx(st, st.turn, q => st.players[q].kind !== 'neutral' && st.players[q].pool > 0);
    startSetupTurn(st);
    void n;
  }

  // per-round history of land and armies for the timeline chart
  function snapshot(st) {
    if (!st.hist) st.hist = [];
    const land = st.players.map(() => 0), arm = st.players.map(() => 0);
    for (let t = 0; t < N; t++) { const o = st.owner[t]; if (o >= 0) { land[o]++; arm[o] += st.armies[t]; } }
    st.hist.push({ land, arm });
    if (st.hist.length > 400) st.hist.splice(1, 1);
  }

  function beginGame(st) {
    st.turn = active(st)[0];
    st.round = 1;
    st.hist = []; snapshot(st);
    log(st, 'The war begins.');
    startTurn(st);
  }

  function startTurn(st) {
    const p = st.turn;
    st.captured = false; st.occupy = null; st.after = null; st.lastRoll = null;
    const inc = income(st, p);
    st.reserve = inc.total; st.income = inc;
    st.phase = 'reinforce';
    st.mustTrade = mustTradeNow(st);
    log(st, `${st.players[p].name}: +${inc.total} armies` + (inc.conts.length ? ` (incl. ${inc.conts.map(c => CONTINENTS.find(x => x.id === c).name).join(', ')})` : '') + '.');
  }

  function endTurn(st) {
    const p = st.turn, P = st.players[p];
    if (st.captured) {
      if (!st.deck.length) { st.deck = shuffle(st, st.discard); st.discard = []; }
      if (st.deck.length) { P.cards.push(st.deck.pop()); log(st, `${P.name} drew a card.`); }
    }
    if (checkWin(st)) return;
    st.turns++;
    if (st.turns >= st.rules.maxTurns * active(st).length) { // safety stop: most territories wins
      const best = active(st).sort((a, b) => countOwned(st, b) - countOwned(st, a))[0];
      st.winner = best; st.phase = 'over'; st.stop = true; st.how = 'limit'; log(st, `Turn limit reached. Most land: ${pname(st, best)}.`); return;
    }
    const next = nextIdx(st, p, q => !st.players[q].out && st.players[q].kind !== 'neutral');
    if (next <= p) { st.round++; snapshot(st); }
    st.turn = next;
    startTurn(st);
  }

  // ------------------------------------------------------------- winning
  function missionDone(st, i) {
    const m = st.players[i].mission; if (!m) return false;
    const conts = CONTINENTS.map((c, ci) => holdsCont(st, i, ci));
    if (m.kind === 'conts') {
      const need = m.conts.map(id => CONTINENTS.findIndex(c => c.id === id));
      if (!need.every(ci => conts[ci])) return false;
      if (!m.extra) return true;
      return conts.some((h, ci) => h && !need.includes(ci));
    }
    if (m.kind === 'count') {
      let c = 0; for (let t = 0; t < N; t++) if (st.owner[t] === i && st.armies[t] >= m.min) c++;
      return c >= m.n;
    }
    if (m.kind === 'kill') {
      if (m.fallback) return countOwned(st, i) >= 24;
      const v = st.players.find(q => q.color === m.color);
      return v.out && v.killedBy === i;
    }
    return false;
  }
  function capitalNeed(st) {
    const n = active(st).length + st.players.filter(q => q.out && q.kind !== 'neutral').length;
    if (st.rules.capitalShort) { if (n === 4) return 2; if (n === 5) return 3; }
    return n - 1;
  }
  function capitalDone(st, i) {
    const P = st.players[i]; if (P.capital < 0 || st.owner[P.capital] !== i) return false;
    let got = 0;
    st.players.forEach((q, j) => { if (j !== i && q.kind !== 'neutral' && q.capital >= 0 && st.owner[q.capital] === i) got++; });
    return got >= capitalNeed(st);
  }
  function checkWin(st) {
    if (st.phase === 'claim' || st.phase === 'place' || st.phase === 'capital') return false;
    const act = active(st);
    let w = -1, how = '', kind = '';
    if (act.length === 1) { w = act[0]; how = 'conquered the world'; kind = 'world'; }
    if (w < 0 && st.rules.mode === 'mission') {
      // the player whose turn it is checks first, then the rest in order
      const order = [st.turn].concat(act.filter(i => i !== st.turn));
      for (const i of order) if (missionDone(st, i)) { w = i; how = 'completed the secret mission'; kind = 'mission'; break; }
    }
    if (w < 0 && st.rules.mode === 'capital') {
      for (const i of act) if (capitalDone(st, i)) { w = i; how = 'took the headquarters'; kind = 'capital'; break; }
    }
    if (w >= 0) { snapshot(st); st.winner = w; st.how = kind; st.phase = 'over'; st.reserve = 0; st.occupy = null; log(st, `${st.players[w].name} ${how}!`); return true; }
    return false;
  }

  // ------------------------------------------------------------- view
  function view(st, seat) {
    const v = clone(st);
    delete v.seed;
    v.deck = v.deck.length; // count only
    v.players.forEach((p, i) => {
      if (i !== seat && st.phase !== 'over') {
        p.cards = p.cards.length;
        if (p.mission) p.mission = { hidden: true };
        if (st.phase === 'capital' && p.capital >= 0) p.capital = -2; // chosen, not yet revealed
      }
    });
    return v;
  }

  const api = {
    COLORS, DEFAULT_RULES, START, newGame, apply, view, actor, income, setValue, tradeValue, isSet, findSets,
    canAttack, canFortify, reachable, owned, countOwned, holdsCont, missionText, missionDone, missionList,
    capitalDone, capitalNeed, active, fixedValue,
  };
  if (node) module.exports = api; else root.RiskEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
