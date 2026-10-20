// Risk through the shared online module: bot-only games, secrecy, and a local room played to the end.
import test from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { game, merge } = require('../js/adapter.js');
const { createLocal } = await import('../js/online.js');

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const MODES = ['classic', 'mission', 'capital'];

test('bot-only games through the adapter: every move legal, someone always to act, state survives JSON', () => {
  for (let g = 0; g < 15; g++) {
    const n = 2 + (g % 5), rng = mulberry(g + 1);
    const seats = Array.from({ length: n }, (_, i) => ({ kind: i % 2 ? 'computer' : 'human', name: 'P' + i }));
    let s = game.setup(n, { rules: { mode: MODES[g % 3], setup: g % 2 ? 'claim' : 'deal' }, levels: ['hard', 'medium', 'easy'] }, rng, seats);
    let moves = 0;
    while (!game.isOver(s)) {
      const who = game.toAct(s);
      assert.strictEqual(who.length, 1, 'exactly one seat to act');
      const seat = who[0];
      assert.ok(seat >= 0 && seat < n, 'the neutral army never acts');
      const ctx = { pub: game.publicView(s), mine: game.privateView(s, seat), state: s };
      s = game.apply(JSON.parse(JSON.stringify(s)), seat, game.bot(ctx, seat, rng));
      assert.ok(++moves < 40000, 'game ends');
    }
    assert.ok(s.winner >= 0 || s.turns >= s.rules.maxTurns);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(s)), s);
  }
});

test('a move out of turn is refused', () => {
  const s = game.setup(3, {}, mulberry(5), []);
  const other = (game.toAct(s)[0] + 1) % 3;
  assert.throws(() => game.apply(s, other, game.bot({ state: s }, game.toAct(s)[0])), /Not your turn/);
});

test('secrecy: the public table and other seats never see a hand, a mission, an unrevealed HQ, the deck or the dice seed', () => {
  for (const mode of ['mission', 'capital']) {
    const rng = mulberry(mode.length);
    let s = game.setup(4, { rules: { mode } }, rng, Array.from({ length: 4 }, () => ({ kind: 'computer' })));
    // play until everyone has cards (and, in the capital game, until HQs are being picked)
    let sawCapital = false;
    for (let k = 0; k < 6000 && !game.isOver(s); k++) {
      const seat = game.toAct(s)[0];
      s = game.apply(s, seat, game.bot({ state: s }, seat));
      if (s.phase === 'capital' && s.players.some(p => p.capital >= 0)) {
        sawCapital = true;
        const pub = game.publicView(s);
        s.players.forEach((p, i) => { if (p.capital >= 0) assert.strictEqual(pub.players[i].capital, -2, 'chosen HQ hidden'); });
      }
      if (s.players.filter(p => p.cards.length).length >= 2) break;
    }
    if (mode === 'capital') assert.ok(sawCapital, 'reached the HQ picks');
    const pub = game.publicView(s);
    const txt = JSON.stringify(pub);
    assert.ok(!('seed' in pub), 'no seed');
    assert.strictEqual(typeof pub.deck, 'number', 'deck is a count');
    pub.players.forEach((p, i) => {
      assert.strictEqual(typeof p.cards, 'number', 'hand is a count');
      assert.strictEqual(p.cards, s.players[i].cards.length);
      if (mode === 'mission') assert.deepStrictEqual(p.mission, { hidden: true });
    });
    assert.ok(!/"kind":"conts"|"kind":"kill"|"kind":"count"/.test(txt), 'no mission details in public');
    for (let j = 0; j < 4; j++) {
      const mine = game.privateView(s, j);
      assert.deepStrictEqual(Object.keys(mine).sort(), ['capital', 'cards', 'mission']);
      assert.deepStrictEqual(mine.cards, s.players[j].cards.slice().sort((a, b) => a - b));
      // what seat j's screen draws holds only seat j's hand
      const g = merge(pub, mine, j);
      g.players.forEach((p, i) => { if (i !== j) assert.ok(p.cards.every(c => c === -1), 'other hands are blanks'); });
    }
  }
});

test('a local room with computers in every seat plays to the end', async () => {
  const room = createLocal({ game, seats: ['computer', 'computer', 'computer'], options: { rules: { mode: 'classic' }, levels: ['easy', 'easy', 'hard'] }, botDelayMs: 0, rng: mulberry(9) });
  const end = await new Promise((resolve, reject) => {
    room.on('error', reject);
    room.on('change', snap => { if (snap.status === 'finished') resolve(snap); });
    room.start();
  });
  room.close();
  assert.ok(end.pub.winner >= 0);
  assert.strictEqual(end.pub.phase, 'over');
});
