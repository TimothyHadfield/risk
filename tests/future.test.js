// The "Future Earth" board (our own design) and the house rules added in wave 3.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const M = require('../js/map.js');
const E = require('../js/engine.js');
const AI = require('../js/ai.js');

const cpu = (n, lvl) => Array.from({ length: n }, (_, i) => ({ name: 'P' + i, kind: 'cpu', level: Array.isArray(lvl) ? lvl[i] : (lvl || 'medium') }));
function play(st, cap) {
  let n = 0;
  while (st.phase !== 'over' && n++ < (cap || 60000)) st = E.apply(st, AI.choose(st, st.turn, { fast: true }));
  return st;
}

test('map list: classic is the default, future is a second board', () => {
  assert.strictEqual(M.id, 'classic');
  assert.deepStrictEqual(M.MAPS.map(m => m.id), ['classic', 'future']);
  assert.strictEqual(E.DEFAULT_RULES.map, 'classic');
  assert.strictEqual(M.size('classic'), 42);
});

test('future board: 40-50 territories in 6-8 regions, every border both ways, all connected', () => {
  M.use('future');
  try {
    assert.strictEqual(M.id, 'future');
    assert.ok(M.T.length >= 40 && M.T.length <= 50, 'territories ' + M.T.length);
    assert.strictEqual(M.size('future'), M.T.length);
    assert.ok(M.CONTINENTS.length >= 6 && M.CONTINENTS.length <= 8);
    M.CONTINENTS.forEach(c => { assert.ok(c.terrs.length >= 2 && c.bonus >= 1, c.name); assert.ok(c.borders.length >= 1, c.name); });
    assert.strictEqual(new Set(M.T.map(t => t.name)).size, M.T.length, 'names unique');
    M.ADJ.forEach((a, i) => { assert.ok(a.length >= 1, M.T[i].name); a.forEach(j => assert.ok(M.ADJ[j].includes(i))); });
    const q = [0], s = new Set([0]);
    while (q.length) { const x = q.pop(); M.ADJ[x].forEach(y => { if (!s.has(y)) { s.add(y); q.push(y); } }); }
    assert.strictEqual(s.size, M.T.length);
    // a card per territory + 2 wild, symbols spread evenly
    assert.strictEqual(M.CARDS.length, M.T.length + 2);
    const c = {}; M.CARDS.forEach(x => { c[x.sym] = (c[x.sym] || 0) + 1; });
    assert.strictEqual(c.W, 2); assert.ok(Math.max(c.I, c.C, c.A) - Math.min(c.I, c.C, c.A) <= 1);
    // no secret missions on this board (they name the classic continents)
    assert.strictEqual(M.MAPS.find(m => m.id === 'future').missions, false);
  } finally { M.use('classic'); }
  // switching back restores the classic board in place (other modules hold the same arrays)
  assert.strictEqual(M.T.length, 42); assert.strictEqual(M.CARDS.length, 44); assert.strictEqual(M.EDGES.length, 83);
});

test('future board: drawn shapes match the borders', () => {
  const G = require('../js/geo-future.js');
  M.use('future');
  try {
    assert.strictEqual(G.terr.length, M.T.length);
    assert.strictEqual(G.cont.length, M.CONTINENTS.length);
    const kb = fs.statSync(path.join(__dirname, '..', 'js', 'geo-future.js')).size / 1024;
    assert.ok(kb < 160, 'geo-future.js is ' + kb.toFixed(0) + ' KB');
    G.terr.forEach((t, i) => assert.ok(t.d && t.hit && t.x > 0 && t.x < 1000 && t.y > 0 && t.y < 560, M.T[i].name));
    // badges never sit on top of each other
    let min = 1e9; G.terr.forEach((a, i) => G.terr.forEach((b, j) => { if (j > i) min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y)); }));
    assert.ok(min >= 28, 'closest badges ' + min.toFixed(1));
  } finally { M.use('classic'); }
});

test('future board: Easy/Medium/Hard computers finish games on it', () => {
  M.use('future');
  try {
    for (const [n, lv, seed] of [[3, ['hard', 'medium', 'easy'], 11], [4, 'hard', 12], [2, ['hard', 'medium'], 13], [6, 'medium', 14]]) {
      const st = play(E.newGame(cpu(n, lv), { map: 'future' }, seed));
      assert.strictEqual(st.phase, 'over', n + ' players');
      assert.strictEqual(st.map, 'future');
      assert.strictEqual(st.owner.length, M.T.length);
      assert.ok(st.armies.every(a => a >= 1));
    }
    const cap = play(E.newGame(cpu(4, 'hard'), { map: 'future', mode: 'capital' }, 21));
    assert.strictEqual(cap.phase, 'over');
  } finally { M.use('classic'); }
});

test('a new game switches the board to its own map (and missions fall back to classic mode there)', () => {
  const st = E.newGame(cpu(3), { map: 'future', mode: 'mission' }, 5);
  try {
    assert.strictEqual(M.id, 'future');
    assert.strictEqual(st.rules.mode, 'classic');
    assert.ok(st.players.every(p => !p.mission));
  } finally { M.use('classic'); }
  const c = E.newGame(cpu(3), {}, 5);
  assert.strictEqual(c.map, 'classic'); assert.strictEqual(M.id, 'classic');
});

// ------------------------------------------------------------ house rules
test('house rule: no attacks in the first round', () => {
  let st = E.newGame(cpu(3), { noFirstAttack: true }, 9);
  while (st.phase !== 'reinforce') st = E.apply(st, AI.choose(st, st.turn, { fast: true }));
  const p = st.turn;
  const t = E.owned(st, p)[0];
  st = E.apply(st, { type: 'place', t, n: st.reserve });
  assert.strictEqual(st.phase, 'fortify', 'straight to the end-of-turn move');
  const from = E.owned(st, p).find(f => st.armies[f] >= 2 && M.ADJ[f].some(u => st.owner[u] !== p));
  if (from >= 0) assert.ok(!E.canAttack(st, from, M.ADJ[from].find(u => st.owner[u] !== p)));
  // play to round 2: attacks open
  let guard = 0;
  while (st.round < 2 && guard++ < 5000) st = E.apply(st, AI.choose(st, st.turn, { fast: true }));
  while (st.phase === 'reinforce' && guard++ < 5000) st = E.apply(st, AI.choose(st, st.turn, { fast: true }));
  assert.strictEqual(st.phase, 'attack');
  // off by default
  let d = E.newGame(cpu(3), {}, 9);
  while (d.phase !== 'reinforce') d = E.apply(d, AI.choose(d, d.turn, { fast: true }));
  d = E.apply(d, { type: 'place', t: E.owned(d, d.turn)[0], n: d.reserve });
  assert.strictEqual(d.phase, 'attack');
});

test('house rule: unlimited end-of-turn moves', () => {
  let st = E.newGame(cpu(3), { fortify: 'unlimited' }, 4);
  while (st.phase !== 'reinforce') st = E.apply(st, AI.choose(st, st.turn, { fast: true }));
  const p = st.turn, mine = E.owned(st, p);
  // find two connected pairs of my own land
  const pairs = [];
  mine.forEach(a => M.ADJ[a].forEach(b => { if (st.owner[b] === p && a < b) pairs.push([a, b]); }));
  assert.ok(pairs.length >= 1);
  st = E.apply(st, { type: 'place', t: pairs[0][0], n: st.reserve });
  st = E.apply(st, { type: 'endAttack' });
  st = E.apply(st, { type: 'fortify', from: pairs[0][0], to: pairs[0][1], n: 1 });
  assert.strictEqual(st.turn, p, 'still my turn after one move');
  assert.strictEqual(st.phase, 'fortify');
  st = E.apply(st, { type: 'fortify', from: pairs[0][1], to: pairs[0][0], n: 1 });
  assert.strictEqual(st.turn, p);
  st = E.apply(st, { type: 'endTurn' });
  assert.notStrictEqual(st.turn, p);
  // computers finish games with it (they stop moving on their own)
  const g = play(E.newGame(cpu(4, ['hard', 'medium', 'easy', 'hard']), { fortify: 'unlimited' }, 8));
  assert.strictEqual(g.phase, 'over');
});

test('house rule: teams of two (4 or 6 players) never attack a partner and win together', () => {
  let st = E.newGame(cpu(4), { teams: true }, 3);
  assert.deepStrictEqual(st.players.map(p => p.team), [0, 1, 0, 1]);
  while (st.phase !== 'attack' && st.phase !== 'over') st = E.apply(st, AI.choose(st, st.turn, { fast: true }));
  const p = st.turn, mate = (p + 2) % 4;
  // hand-build a partner next door
  const f = E.owned(st, p).find(t => M.ADJ[t].some(u => st.owner[u] === mate));
  if (f !== undefined) { st.armies[f] = 9; assert.ok(!E.canAttack(st, f, M.ADJ[f].find(u => st.owner[u] === mate))); }
  const g = play(E.newGame(cpu(4, ['hard', 'easy', 'hard', 'easy']), { teams: true }, 31));
  assert.strictEqual(g.phase, 'over');
  const win = g.players[g.winner].team;
  assert.ok(g.players.every(q => q.out || q.team === win), 'only the winning team is left');
  assert.ok(E.teamWon(g, (g.winner + 2) % 4), 'the partner shares the win');
  // 3 or 5 players: no teams
  assert.ok(E.newGame(cpu(3), { teams: true }, 1).players.every(q => q.team == null));
  // 6 players: three teams of two, partners sit across
  assert.deepStrictEqual(E.newGame(cpu(6), { teams: true }, 1).players.map(q => q.team), [0, 1, 2, 0, 1, 2]);
});

// ------------------------------------------------------------ rules sheet, stats
test('rules sheet: Future Earth + house rules section, and 2-5 learn videos that open in a new tab', () => {
  require('../js/tutorial.js'); const r = globalThis.RiskTutorial.rules();
  const fut = r.sections.find(s => s.id === 'future');
  assert.ok(fut && /Future Earth/.test(fut.html) && /first round/i.test(fut.html) && /team/i.test(fut.html));
  const vids = r.sections.find(s => s.id === 'videos');
  assert.ok(vids, 'videos section');
  const links = vids.html.match(/<a [^>]*>/g) || [];
  assert.ok(links.length >= 2 && links.length <= 5, links.length + ' links');
  links.forEach(a => {
    assert.ok(/href="https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}"/.test(a), a);
    assert.ok(/target="_blank"/.test(a) && /rel="noopener"/.test(a), a);
  });
});

test('my stats: a team win counts as a win for the partner', () => {
  const RP = require('../js/profile-risk.js');
  const g = play(E.newGame([{ name: 'You', kind: 'human', level: 'medium' }].concat(cpu(4, 'easy').slice(1)), { teams: true }, 31), 10);
  const fin = Object.assign({}, g, { phase: 'over', winner: 2, how: 'team' });
  assert.strictEqual(RP.result(fin, 0, {}).won, true);
  assert.strictEqual(RP.result(Object.assign({}, fin, { winner: 1 }), 0, {}).won, false);
});
