const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const path = require('path');
const M = require('../js/map.js');

test('42 territories in 6 continents with the classic sizes and bonuses', () => {
  assert.strictEqual(M.T.length, 42);
  const want = { na: [9, 5], sa: [4, 2], eu: [7, 5], af: [6, 3], as: [12, 7], au: [4, 2] };
  M.CONTINENTS.forEach(c => assert.deepStrictEqual([c.terrs.length, c.bonus], want[c.id], c.name));
  assert.strictEqual(new Set(M.T.map(t => t.name)).size, 42);
});

test('83 borders, symmetric, whole board connected', () => {
  assert.strictEqual(M.EDGES.length, 83);
  const seen = new Set();
  M.EDGES.forEach(([a, b]) => { const k = [a, b].sort().join('|'); assert.ok(!seen.has(k), 'dup ' + k); seen.add(k); });
  M.ADJ.forEach((a, i) => a.forEach(j => assert.ok(M.ADJ[j].includes(i))));
  const q = [0], s = new Set([0]);
  while (q.length) { const x = q.pop(); M.ADJ[x].forEach(y => { if (!s.has(y)) { s.add(y); q.push(y); } }); }
  assert.strictEqual(s.size, 42);
});

test('known borders from the board', () => {
  const k = M.BY_KEY, adj = (a, b) => M.isAdj(k[a], k[b]);
  assert.ok(adj('alaska', 'kamchatka'));
  assert.ok(adj('brazil', 'naf'));
  assert.ok(adj('greenland', 'iceland') && adj('greenland', 'quebec') && adj('greenland', 'ontario') && adj('greenland', 'nwt'));
  assert.ok(adj('mideast', 'eaf') && adj('mideast', 'egypt') && adj('mideast', 'seu') && adj('mideast', 'ukraine'));
  assert.ok(adj('siam', 'indonesia') && adj('cam', 'venezuela'));
  assert.ok(!adj('alaska', 'greenland') && !adj('egypt', 'congo') && !adj('weu', 'ukraine') && !adj('china', 'kamchatka'));
  // neighbour counts that are easy to check on the board
  const deg = key => M.ADJ[k[key]].length;
  assert.strictEqual(deg('ukraine'), 6); assert.strictEqual(deg('mideast'), 6); assert.strictEqual(deg('china'), 6);
  assert.strictEqual(deg('ontario'), 6); assert.strictEqual(deg('naf'), 6); assert.strictEqual(deg('eau'), 2);
  // Australia is entered only through Siam-Indonesia; South America through Central America and North Africa
  assert.deepStrictEqual(M.CONTINENTS[5].borders.map(i => M.T[i].key), ['indonesia']);
  assert.deepStrictEqual(M.CONTINENTS[1].borders.map(i => M.T[i].key).sort(), ['brazil', 'venezuela']);
});

test('44 cards: 14 infantry, 14 cavalry, 14 artillery, 2 wild', () => {
  assert.strictEqual(M.CARDS.length, 44);
  const c = {}; M.CARDS.forEach(x => { c[x.sym] = (c[x.sym] || 0) + 1; });
  assert.deepStrictEqual(c, { I: 14, C: 14, A: 14, W: 2 });
});

test('drawn map: territories that touch on the drawing are real neighbours', () => {
  // buildgeo exits non-zero and lists problems if any drawn border is not an official one
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'buildgeo.js')], { encoding: 'utf8' });
  assert.match(out, /geometry OK/);
  const G = require('../js/geo.js');
  assert.strictEqual(G.terr.length, 42);
  G.terr.forEach(t => assert.ok(t.d.length > 10));
});
