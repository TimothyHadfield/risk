const test = require('node:test');
const assert = require('node:assert');
const O = require('../js/odds.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b}`);

test('one roll: counts match the published table', () => {
  const c = (a, d) => Object.fromEntries(O.rollTable(a, d).map(o => [o.al + '/' + o.dl, o.count]));
  assert.deepStrictEqual(c(3, 2), { '2/0': 2275, '1/1': 2611, '0/2': 2890 });
  assert.deepStrictEqual(c(3, 1), { '1/0': 441, '0/1': 855 });
  assert.deepStrictEqual(c(2, 2), { '2/0': 581, '1/1': 420, '0/2': 295 });
  assert.deepStrictEqual(c(2, 1), { '1/0': 91, '0/1': 125 });
  assert.deepStrictEqual(c(1, 2), { '1/0': 161, '0/1': 55 });
  assert.deepStrictEqual(c(1, 1), { '1/0': 21, '0/1': 15 });
});

test('small battles worked by hand', () => {
  near(O.battle(2, 1).win, 15 / 36, 1e-12, '2v1');
  // 3 vs 1: 2 dice vs 1 die; lose once -> 2 vs 1
  near(O.battle(3, 1).win, 125 / 216 + (91 / 216) * (15 / 36), 1e-12, '3v1');
  // 2 vs 2: one die vs two dice; win needs two straight wins of 1-v-2 then 1-v-1
  near(O.battle(2, 2).win, (55 / 216) * (15 / 36), 1e-12, '2v2');
  const b = O.battle(7, 4); let s = 0; b.winDist.forEach(p => { s += p; }); b.loseDist.forEach(p => { s += p; });
  near(s, 1, 1e-12, 'mass');
});

test('big battles agree with a dice simulation', () => {
  let seed = 12345; const rnd = () => { let t = (seed = (seed + 0x6D2B79F5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const d6 = () => 1 + Math.floor(rnd() * 6);
  function sim(A, D, n) {
    let w = 0, lossA = 0;
    for (let k = 0; k < n; k++) {
      let a = A, d = D;
      while (a > 1 && d > 0) {
        const ad = Math.min(3, a - 1), dd = Math.min(2, d);
        const x = Array.from({ length: ad }, d6).sort((p, q) => q - p), y = Array.from({ length: dd }, d6).sort((p, q) => q - p);
        for (let i = 0; i < Math.min(ad, dd); i++) { if (x[i] > y[i]) d--; else a--; }
      }
      if (d === 0) w++; lossA += A - a;
    }
    return { win: w / n, loss: lossA / n };
  }
  [[5, 3], [10, 10], [20, 12]].forEach(([A, D]) => {
    const s = sim(A, D, 60000), b = O.battle(A, D);
    near(b.win, s.win, 0.01, `${A}v${D} win`);
    near(b.expAttLoss, s.loss, 0.08, `${A}v${D} loss`);
  });
});

test('chain of one equals a single battle; longer chains are harder', () => {
  near(O.chain(12, [4]).all, O.battle(12, 4).win, 1e-12);
  const c = O.chain(15, [3, 3, 3]);
  assert.ok(c.all < c.atLeast[2] && c.atLeast[2] < c.atLeast[1]);
  // two-step chain worked through the battle distribution by hand
  const b1 = O.battle(10, 2); let want = 0;
  b1.winDist.forEach((p, rem) => { if (p && rem - 1 >= 2) want += p * O.battle(rem - 1, 2).win; });
  near(O.chain(10, [2, 2]).all, want, 1e-12);
});

test('needed: smallest stack for a target chance', () => {
  const n = O.needed(5, 0.8);
  assert.ok(O.battle(n, 5).win >= 0.8 && O.battle(n - 1, 5).win < 0.8);
});
