const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/engine.js');
const AI = require('../js/ai.js');
const M = require('../js/map.js');
const K = M.BY_KEY;

const seats = n => Array.from({ length: n }, (_, i) => ({ name: 'P' + i, kind: 'cpu', level: 'medium' }));
function runSetup(st) { // let the computer finish setup
  while (['claim', 'place', 'capital'].includes(st.phase)) st = E.apply(st, AI.choose(st, st.turn));
  return st;
}
// hand-built position: give p every territory in list, armies a
function board(st, owners) { // owners: {key: [player, armies]}
  Object.entries(owners).forEach(([k, [p, a]]) => { st.owner[K[k]] = p; st.armies[K[k]] = a; });
  return st;
}

test('starting armies by player count (2p: 40 each + 40 neutral)', () => {
  assert.deepStrictEqual(E.START, { 2: 40, 3: 35, 4: 30, 5: 25, 6: 20 });
  for (const n of [3, 4, 5, 6]) {
    const st = E.newGame(seats(n), {}, 7);
    const total = st.players.reduce((s, p) => s + p.pool, 0) + st.armies.reduce((a, b) => a + b, 0);
    assert.strictEqual(total, n * E.START[n]);
    assert.ok(st.owner.every(o => o >= 0), 'deal covers the board');
    const counts = st.players.map((_, i) => E.countOwned(st, i));
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
  }
  const st = E.newGame(seats(2), {}, 7);
  assert.strictEqual(st.players.length, 3);
  assert.deepStrictEqual(st.players.map((_, i) => E.countOwned(st, i)), [14, 14, 14]);
  assert.deepStrictEqual(st.players.map(p => p.pool), [26, 26, 26]);
  assert.deepStrictEqual(st.quota, { own: 2, neutral: 1 });
  const done = runSetup(st);
  assert.strictEqual(done.armies.reduce((a, b) => a + b, 0), 120);
});

test('claim setup: one territory each in turn, then one army each in turn', () => {
  let st = E.newGame(seats(3), { setup: 'claim' }, 3);
  assert.strictEqual(st.phase, 'claim');
  st = E.apply(st, { type: 'claim', t: 0 });
  assert.strictEqual(st.turn, 1);
  assert.throws(() => E.apply(st, { type: 'claim', t: 0 }), /taken/);
  st = runSetup(st);
  assert.strictEqual(st.phase, 'reinforce');
  assert.strictEqual(st.armies.reduce((a, b) => a + b, 0), 105);
});

test('income: territories / 3 (min 3) plus continent bonuses', () => {
  let st = runSetup(E.newGame(seats(3), {}, 11));
  st.owner.fill(1); st.armies.fill(1);
  const give = keys => keys.forEach(k => { st.owner[K[k]] = 0; });
  give(['alaska', 'peru']); assert.strictEqual(E.income(st, 0).total, 3);
  st.owner.fill(1); M.CONTINENTS[5].terrs.forEach(t => { st.owner[t] = 0; });
  assert.strictEqual(E.income(st, 0).total, 3 + 2, 'Australia');
  st.owner.fill(0); M.CONTINENTS[4].terrs.forEach(t => { st.owner[t] = 1; }); // 30 territories, no Asia
  assert.strictEqual(E.income(st, 0).total, 10 + 5 + 2 + 5 + 3 + 2);
  assert.strictEqual(E.income(st, 1).total, 4 + 7);
});

test('card sets: escalating 4,6,8,10,12,15,20,25 / fixed / plus-one', () => {
  const st = E.newGame(seats(3), {}, 1);
  const seq = []; for (let k = 0; k < 9; k++) { st.sets = k; seq.push(E.setValue(st)); }
  assert.deepStrictEqual(seq, [4, 6, 8, 10, 12, 15, 20, 25, 30]);
  assert.strictEqual(E.fixedValue(['I', 'I', 'I']), 4);
  assert.strictEqual(E.fixedValue(['C', 'C', 'C']), 6);
  assert.strictEqual(E.fixedValue(['A', 'A', 'A']), 8);
  assert.strictEqual(E.fixedValue(['I', 'C', 'A']), 10);
  assert.strictEqual(E.fixedValue(['A', 'A', 'W']), 8, 'wild as a third artillery');
  assert.strictEqual(E.fixedValue(['I', 'C', 'W']), 10, 'wild completes one of each');
  assert.strictEqual(E.fixedValue(['I', 'I', 'W']), 4);
  st.rules.cards = 'plusone'; st.sets = 3; assert.strictEqual(E.setValue(st), 7);
  const id = k => K[k];
  assert.ok(E.isSet([id('alaska'), id('argentina'), id('peru')]), 'three infantry');
  assert.ok(E.isSet([id('alaska'), id('alberta'), id('nwt')]), 'one of each');
  assert.ok(E.isSet([id('alaska'), id('alberta'), 42]), 'wild + any two');
  assert.ok(!E.isSet([id('alaska'), id('peru'), id('alberta')]), 'two infantry + cavalry is not a set');
});

test('trading: value, +2 on a held card territory, forced at 5 cards', () => {
  let st = runSetup(E.newGame(seats(3), {}, 5));
  const p = st.turn;
  const held = E.owned(st, p)[0];
  const sym = M.CARDS[held].sym;
  const same = M.CARDS.filter(c => c.sym === sym && c.terr !== held && st.owner[c.terr] !== p).slice(0, 2).map(c => c.id);
  const other = M.CARDS.filter(c => c.sym !== sym && c.sym !== 'W').slice(0, 2).map(c => c.id);
  st.players[p].cards = [held, ...same, ...other];
  // the turn before ends -> start of p's turn computes the forced-trade flag
  st.phase = 'fortify'; st.captured = false; st.turn = (p + 2) % 3;
  st = E.apply(st, { type: 'endTurn' });
  assert.strictEqual(st.turn, p);
  assert.ok(st.mustTrade, '5 cards: must trade');
  assert.throws(() => E.apply(st, { type: 'place', t: held, n: 1 }), /trade/);
  const before = st.reserve, a0 = st.armies[held];
  st = E.apply(st, { type: 'trade', cards: [held, ...same] });
  assert.strictEqual(st.reserve, before + 4);
  assert.strictEqual(st.armies[held], a0 + 2, '+2 on the matching territory');
  assert.strictEqual(st.sets, 1);
  assert.ok(!st.mustTrade);
});

test('attack: dice limits, must move in at least the dice rolled, one card per turn', () => {
  let st = runSetup(E.newGame(seats(3), {}, 9));
  st.owner.fill(1); st.armies.fill(1);
  board(st, { alaska: [0, 8], kamchatka: [1, 1], nwt: [0, 1] });
  st.turn = 0; st.phase = 'attack'; st.reserve = 0;
  assert.ok(!E.canAttack(st, K.nwt, K.kamchatka), 'not adjacent');
  assert.ok(E.canAttack(st, K.alaska, K.kamchatka));
  let guard = 0;
  while (st.owner[K.kamchatka] !== 0 && guard++ < 100) st = E.apply(st, { type: 'attack', from: K.alaska, to: K.kamchatka, dice: 3 });
  assert.strictEqual(st.phase, 'occupy');
  assert.strictEqual(st.occupy.min, 3);
  assert.throws(() => E.apply(st, { type: 'occupy', n: 2 }), /bad count/);
  st = E.apply(st, { type: 'occupy', n: 3 });
  assert.ok(st.captured);
  const cards = st.players[0].cards.length;
  st = E.apply(st, { type: 'endTurn' });
  assert.strictEqual(st.players[0].cards.length, cards + 1);
});

test('fortify: connected through own land vs adjacent only', () => {
  let st = runSetup(E.newGame(seats(3), {}, 4));
  st.owner.fill(1); st.armies.fill(1);
  board(st, { peru: [0, 6], brazil: [0, 1], venezuela: [0, 1], argentina: [0, 1] });
  st.turn = 0; st.phase = 'fortify';
  assert.ok(E.canFortify(st, K.argentina, K.venezuela) === false, 'one army cannot move');
  st.armies[K.argentina] = 5;
  assert.ok(E.canFortify(st, K.argentina, K.venezuela), 'connected path');
  st.rules.fortify = 'adjacent';
  assert.ok(!E.canFortify(st, K.argentina, K.venezuela));
  assert.ok(E.canFortify(st, K.argentina, K.peru));
});

test('wiping out a player hands over the cards and forces a trade down to 4', () => {
  let st = runSetup(E.newGame(seats(3), {}, 21));
  st.owner.fill(0); st.armies.fill(2);
  board(st, { siam: [2, 1], india: [0, 30] });
  st.players[2].cards = [K.alaska, K.peru, K.argentina];
  st.players[0].cards = [K.alberta, K.ontario, K.quebec];
  st.turn = 0; st.phase = 'attack';
  let g = 0; while (st.owner[K.siam] !== 0 && g++ < 200) st = E.apply(st, { type: 'blitz', from: K.india, to: K.siam });
  if (st.phase === 'occupy') st = E.apply(st, { type: 'occupy', n: st.occupy.min });
  assert.ok(st.players[2].out);
  // only P1 is left alive, it still has land -> game continues
  assert.strictEqual(st.players[0].cards.length, 6);
  assert.strictEqual(st.phase, 'reinforce');
  assert.ok(st.mustTrade);
  st = E.apply(st, { type: 'trade', cards: [K.alberta, K.ontario, K.quebec] });
  assert.ok(!st.mustTrade, 'down to 3 cards');
  const t = E.owned(st, 0)[0];
  st = E.apply(st, { type: 'place', t, n: st.reserve });
  assert.strictEqual(st.phase, 'attack', 'back to attacking');
});

test('missions: kill-colour falls back to 24 territories; mission win', () => {
  const st = E.newGame(seats(4), { mode: 'mission' }, 8);
  st.players.forEach(p => { if (p.mission.kind === 'kill' && p.mission.color === p.color) assert.ok(p.mission.fallback, 'own colour falls back'); });
  assert.strictEqual(E.missionList(E.DEFAULT_RULES, ['red', 'blue', 'yellow', 'green']).length, 8 + 4);
  assert.strictEqual(E.missionList({ missions12: true }, ['red', 'blue', 'yellow', 'green', 'black', 'pink']).length, 12);
  let s2 = runSetup(st);
  s2.players[0].mission = { kind: 'conts', conts: ['na', 'au'] };
  s2.owner.fill(1); s2.armies.fill(1);
  M.CONTINENTS[0].terrs.concat(M.CONTINENTS[5].terrs).forEach(t => { s2.owner[t] = 0; });
  s2.owner[K.alaska] = 1; s2.armies[K.alaska] = 1; s2.armies[K.alberta] = 10;
  s2.turn = 0; s2.phase = 'attack';
  let g = 0; while (s2.owner[K.alaska] !== 0 && g++ < 200) s2 = E.apply(s2, { type: 'blitz', from: K.alberta, to: K.alaska });
  if (s2.phase === 'occupy') s2 = E.apply(s2, { type: 'occupy', n: s2.occupy.min });
  assert.strictEqual(s2.phase, 'over'); assert.strictEqual(s2.winner, 0);
});

test('capital game: take every enemy HQ while holding your own', () => {
  let st = runSetup(E.newGame(seats(3), { mode: 'capital' }, 13));
  assert.ok(st.players.every(p => p.capital >= 0));
  assert.strictEqual(E.capitalNeed(st), 2);
  st.rules.capitalShort = true; assert.strictEqual(E.capitalNeed(st), 2);
  const s4 = runSetup(E.newGame(seats(4), { mode: 'capital', capitalShort: true }, 13));
  assert.strictEqual(E.capitalNeed(s4), 2);
  // P0 owns P1's HQ and its own, and P2's HQ falls -> win
  st.rules.capitalShort = false;
  const [c0, c1, c2] = st.players.map(p => p.capital);
  st.owner[c0] = 0; st.owner[c1] = 0; st.armies[c1] = 3;
  const from = M.ADJ[c2].find(t => t !== c0 && t !== c1) ;
  st.owner[from] = 0; st.armies[from] = 40; st.owner[c2] = 2; st.armies[c2] = 1;
  st.turn = 0; st.phase = 'attack';
  let g = 0; while (st.phase === 'attack' && st.owner[c2] !== 0 && g++ < 200) st = E.apply(st, { type: 'blitz', from, to: c2 });
  if (st.phase === 'occupy') st = E.apply(st, { type: 'occupy', n: st.occupy.min });
  assert.strictEqual(st.winner, 0);
});

test('view hides other hands, missions and the dice seed', () => {
  const st = runSetup(E.newGame(seats(3), { mode: 'mission' }, 2));
  st.players[1].cards = [1, 2];
  const v = E.view(st, 0);
  assert.strictEqual(v.players[1].cards, 2);
  assert.ok(v.players[1].mission.hidden);
  assert.ok(Array.isArray(v.players[0].cards) && v.players[0].mission.kind);
  assert.strictEqual(v.seed, undefined);
  assert.strictEqual(typeof v.deck, 'number');
});

test('computer games finish with board invariants intact', () => {
  for (const [n, mode] of [[2, 'classic'], [3, 'mission'], [4, 'capital'], [6, 'classic']]) {
    let st = E.newGame(Array.from({ length: n }, (_, i) => ({ kind: 'cpu', level: ['hard', 'medium', 'easy'][i % 3] })), { mode, maxTurns: 300 }, 100 + n);
    let steps = 0;
    while (st.phase !== 'over' && steps++ < 100000) {
      st = E.apply(st, AI.choose(st, st.turn));
      if (!['claim'].includes(st.phase)) {
        for (let t = 0; t < 42; t++) assert.ok(st.armies[t] >= 1 || (st.phase === 'occupy' && st.occupy.to === t), 'every territory holds an army');
      }
      const cards = st.deck.length + st.discard.length + st.players.reduce((a, p) => a + p.cards.length, 0);
      assert.strictEqual(cards, 44);
    }
    assert.strictEqual(st.phase, 'over', `${n}p ${mode} finished`);
    assert.ok(st.winner >= 0);
  }
});

test('income rounds down: 14 territories give 4, 17 give 5', () => {
  const st = runSetup(E.newGame(seats(3), {}, 31));
  st.owner.fill(1);
  const spread = ['alaska', 'peru', 'iceland', 'egypt', 'ural', 'siberia', 'yakutsk', 'india', 'china', 'siam', 'japan', 'wau', 'gb', 'quebec', 'brazil', 'congo', 'mongolia'];
  spread.slice(0, 14).forEach(k => { st.owner[K[k]] = 0; });
  assert.strictEqual(E.income(st, 0).total, 4);
  spread.slice(14).forEach(k => { st.owner[K[k]] = 0; });
  assert.strictEqual(E.income(st, 0).total, 5);
});

test('every engine roll follows the dice rule (ties to the defender)', () => {
  let st = runSetup(E.newGame(seats(3), {}, 77));
  st.owner.fill(1); st.armies.fill(2000);
  board(st, { india: [0, 2000] });
  st.turn = 0; st.phase = 'attack';
  let ties = 0;
  for (let k = 0; k < 400; k++) {
    st = E.apply(st, { type: 'attack', from: K.india, to: K.china, dice: 3 });
    const r = st.lastRoll; let al = 0, dl = 0;
    for (let i = 0; i < Math.min(r.att.length, r.def.length); i++) { if (r.att[i] > r.def[i]) dl++; else { al++; if (r.att[i] === r.def[i]) ties++; } }
    assert.deepStrictEqual([r.al, r.dl], [al, dl]);
    assert.deepStrictEqual(r.att, r.att.slice().sort((a, b) => b - a));
  }
  assert.ok(ties > 20, 'ties happened and went to the defender');
});
