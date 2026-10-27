// My stats (js/profile-risk.js) and Basic Training (js/tutorial.js): results, Daily game, guided game setup.
const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/engine.js');
const AI = require('../js/ai.js');
const M = require('../js/map.js');
const RP = require('../js/profile-risk.js');
require('../js/tutorial.js');
const TUT = globalThis.RiskTutorial;

function finish(seats, seed) {
  let g = E.newGame(seats, {}, seed), k = 0;
  while (g.phase !== 'over' && k++ < 60000) {
    const h = Object.assign({}, g, { players: g.players.map((p, i) => (i === g.turn && p.kind === 'human' ? Object.assign({}, p, { kind: 'cpu', level: 'hard' }) : p)) });
    g = E.apply(g, AI.choose(h, g.turn, { fast: true }));
  }
  return g;
}

test('profile: a game against computers is rated against the strongest one; Hint/Undo makes it "with help"', () => {
  const g = finish([{ name: 'You', kind: 'human' }, { kind: 'cpu', level: 'easy' }, { kind: 'cpu', level: 'medium' }], 5);
  assert.strictEqual(g.phase, 'over');
  const r = RP.result(g, 0, {});
  assert.strictEqual(r.mode, 'computer'); assert.strictEqual(r.level, 'medium'); assert.strictEqual(r.won, g.winner === 0);
  const h = RP.result(g, 0, { helped: true });
  assert.strictEqual(h.mode, 'help'); assert.strictEqual(h.level, null);
  const f = RP.result(Object.assign({}, g, { players: g.players.map((p, i) => (i === 1 ? Object.assign({}, p, { kind: 'human' }) : p)) }), 0, {});
  assert.strictEqual(f.mode, 'friends');
});

test('profile: what you held during the game counts for achievements', () => {
  let acc = null;
  const g = E.newGame([{ name: 'You', kind: 'human' }, { kind: 'cpu', level: 'easy' }, { kind: 'cpu', level: 'easy' }], {}, 3);
  const au = M.CONTINENTS.find(c => c.id === 'au');
  au.terrs.forEach(t => { g.owner[t] = 0; });
  acc = RP.track(acc, g, 0, M.CONTINENTS, E);
  assert.ok(acc.conts.includes('au'));
  const ach = RP.achievements(), c = { stats: { wins: 0, bestStreak: 0 }, daily: { streak: 0 }, last: { won: false, extra: acc } };
  assert.ok(ach.find(a => a.id === 'aus').test(c));
  assert.ok(!ach.find(a => a.id === 'asia').test(c));
  assert.ok(RP.LEVELS[2].rating > RP.LEVELS[1].rating && RP.LEVELS[1].rating > RP.LEVELS[0].rating);
});

test('Daily game: same deal for everyone that day, against two Hard computers', () => {
  const d = RP.dailyGame(12345);
  assert.deepStrictEqual(d.seats.map(s => s.level), ['medium', 'hard', 'hard']);
  const a = E.newGame(d.seats, d.rules, d.seed), b = E.newGame(d.seats, d.rules, d.seed);
  assert.deepStrictEqual(a.owner, b.owner);
});

test('Basic Training: you against two Easy computers, rules sheet covers the whole game', () => {
  const t = TUT.setup();
  assert.deepStrictEqual(t.seats.map(s => s.kind + ':' + s.level), ['human:medium', 'cpu:easy', 'cpu:easy']);
  const r = TUT.rules();
  for (const id of ['goal', 'setup', 'turn', 'place', 'attack', 'move', 'cards']) assert.ok(r.sections.some(s => s.id === id), id);
  const steps = TUT.steps({ game: () => null, app: () => ({ sel: -1, to: -1 }) });
  assert.ok(steps.length >= 8);
  assert.ok(steps.every(s => s.title && s.text && s.target));
});
