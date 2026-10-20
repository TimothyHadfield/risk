// Exact battle odds. A battle is a Markov chain over (attacker armies,
// defender armies); each roll moves it by the exact dice probabilities
// below. Nothing here is simulated.
(function (root) {
  'use strict';

  // ---- one roll: enumerate every dice outcome (6^(a+d) of them)
  const ROLL = {};
  function rollTable(a, d) {
    const k = a + ',' + d;
    if (ROLL[k]) return ROLL[k];
    const n = a + d, total = Math.pow(6, n);
    const counts = {};
    const dice = new Array(n).fill(1);
    for (let it = 0; it < total; it++) {
      const A = dice.slice(0, a).sort((x, y) => y - x), D = dice.slice(a).sort((x, y) => y - x);
      let al = 0, dl = 0;
      for (let i = 0; i < Math.min(a, d); i++) { if (A[i] > D[i]) dl++; else al++; }
      const key = al + ',' + dl; counts[key] = (counts[key] || 0) + 1;
      for (let i = 0; i < n; i++) { if (++dice[i] <= 6) break; dice[i] = 1; }
    }
    const out = Object.keys(counts).map(key => { const [al, dl] = key.split(',').map(Number); return { al, dl, count: counts[key], p: counts[key] / total }; });
    out.total = total;
    return (ROLL[k] = out);
  }

  // dice used: attacker up to 3 (needs one more army than dice), defender up to defMax
  const attDice = a => Math.min(3, a - 1);
  const defDice = (d, defMax) => Math.min(defMax || 2, d);

  // battle(A, D): attacker has A armies in the attacking territory (one must stay
  // behind), defender D. Attacker keeps rolling max dice until he wins or is down
  // to `stop` armies (default 1). Returns win chance, the distribution of armies
  // left in the attacking territory on a win (incl. the one left behind), the
  // defender's distribution on a loss, and expected losses.
  const MEMO = new Map();
  function battle(A, D, opts) {
    opts = opts || {};
    const stop = Math.max(1, opts.stop || 1), defMax = opts.defMax || 2;
    const key = A + ',' + D + ',' + stop + ',' + defMax;
    if (MEMO.has(key)) return MEMO.get(key);
    // forward propagation of probability mass. States ordered by a+d decreasing.
    const mass = new Map(); const put = (a, d, p) => { const k = a * 4096 + d; mass.set(k, (mass.get(k) || 0) + p); };
    put(A, D, 1);
    const winDist = new Array(A + 1).fill(0), loseDist = new Array(D + 1).fill(0);
    let eA = 0, eD = 0;
    for (let s = A + D; s >= 0; s--) {
      for (let a = Math.min(A, s); a >= 0; a--) {
        const d = s - a; if (d < 0 || d > D) continue;
        const k = a * 4096 + d; const p = mass.get(k); if (!p) continue;
        mass.delete(k);
        if (d === 0) { winDist[a] += p; continue; }
        if (a <= stop || a < 2) { loseDist[d] += p; eA += p * (A - a); eD += p * (D - d); continue; }
        rollTable(attDice(a), defDice(d, defMax)).forEach(o => put(a - o.al, d - o.dl, p * o.p));
      }
    }
    let win = 0;
    winDist.forEach((p, a) => { win += p; eA += p * (A - a); eD += p * D; });
    const res = { win, winDist, loseDist, expAttLoss: eA, expDefLoss: eD };
    if (MEMO.size > 20000) MEMO.clear();
    MEMO.set(key, res);
    return res;
  }

  // Fast lookups for the computer players: whole tables of win chance and
  // expected attacker loss for "attack until win or one army left", built
  // backwards once (same chain as battle(), just stored for every A and D).
  let TW = [], TL = [], TN = 1;
  function grow(n) {
    if (n < TN) return;
    const size = Math.max(n + 1, TN * 2);
    TW = []; TL = [];
    for (let a = 0; a < size; a++) { TW.push(new Float64Array(size)); TL.push(new Float64Array(size)); }
    for (let a = 1; a < size; a++) {
      TW[a][0] = 1;
      for (let d = 1; d < size; d++) {
        if (a < 2) { TW[a][d] = 0; TL[a][d] = 0; continue; }
        let w = 0, l = 0;
        rollTable(attDice(a), defDice(d, 2)).forEach(o => { w += o.p * TW[a - o.al][d - o.dl]; l += o.p * (o.al + TL[a - o.al][d - o.dl]); });
        TW[a][d] = w; TL[a][d] = l;
      }
    }
    TN = size;
  }
  function winP(A, D) { if (D <= 0) return 1; if (A < 2) return 0; A = Math.min(A, 400); D = Math.min(D, 400); grow(Math.max(A, D)); return TW[A][D]; }
  function lossP(A, D) { if (D <= 0 || A < 2) return 0; A = Math.min(A, 400); D = Math.min(D, 400); grow(Math.max(A, D)); return TL[A][D]; }

  // chain(A, [D1..Dk]): attack along a path, each time moving everything but one
  // army forward (opts.leave = armies to leave behind in each captured
  // territory, default 1). Returns chance to take all, chance to take at least
  // i territories, the expected armies at the end, and expected losses.
  function chain(A, defs, opts) {
    opts = opts || {};
    const leave = Math.max(1, opts.leave || 1);
    let dist = new Map([[A, 1]]);
    const atLeast = [1];
    let expLoss = 0;
    for (let i = 0; i < defs.length; i++) {
      const next = new Map(); let pWin = 0;
      dist.forEach((p, a) => {
        if (a < 2) return;
        const b = battle(a, defs[i], opts);
        expLoss += p * b.expAttLoss;
        b.winDist.forEach((q, rem) => {
          if (!q) return;
          pWin += p * q;
          // rem armies in source; `leave` stay behind there (at least 1), the rest move on.
          const moved = Math.max(0, rem - leave);
          const k = Math.max(moved, 0);
          next.set(k, (next.get(k) || 0) + p * q);
        });
      });
      atLeast.push(pWin);
      dist = next;
    }
    let endArmies = 0; dist.forEach((p, a) => { endArmies += p * a; });
    const all = atLeast[defs.length];
    return { all, atLeast, endArmies: all ? endArmies / all : 0, expLoss };
  }

  // smallest attacking stack with at least `target` chance to win
  function needed(D, target, opts) {
    const win = opts ? (A => battle(A, D, opts).win) : (A => winP(A, D)); // winP: same numbers, cached table
    if (win(399) < target) return Infinity;
    let lo = 2, hi = 399; // the chance only grows with the stack, so halve the range
    while (lo < hi) { const m = (lo + hi) >> 1; if (win(m) >= target) hi = m; else lo = m + 1; }
    return lo;
  }

  const api = { rollTable, battle, chain, needed, attDice, defDice, winP, lossP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RiskOdds = api;
})(typeof window !== 'undefined' ? window : globalThis);
