// Sounds, celebrations and animations: what happened in the game -> which sound / effect.
// Uses the real js/fx.js with a fake AudioContext (counts real plays) and fake elements (count animations).
const test = require('node:test');
const assert = require('node:assert');

// ---- a fake Web Audio, so FX.play really plays (and the Sound switches really gate it)
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
const node = () => ({ gain: param(), frequency: param(), Q: param(), pan: param(), connect() {}, start() {}, stop() {}, buffer: null, loop: false, type: '' });
let clock = 0;
class FakeAC {
  constructor() { this.state = 'running'; this.sampleRate = 8000; this.destination = {}; }
  get currentTime() { clock += 0.2; return clock; } // never trips the same-sound throttle
  createGain() { return node(); } createDynamicsCompressor() { return node(); } createOscillator() { return node(); }
  createBiquadFilter() { return node(); } createBufferSource() { return node(); } createStereoPanner() { return node(); }
  createBuffer(c, n) { const d = new Float32Array(n); return { getChannelData: () => d }; }
  resume() { return Promise.resolve(); }
}
globalThis.AudioContext = FakeAC;
// a bare document, so fx.js's animation helpers really run (and count) in node
let current = { anims: 0 };
globalThis.document = { createElement: () => fakeEl(current), body: { appendChild() {} }, head: { appendChild() {} }, getElementById: () => null, addEventListener() {} };
require('../js/fx.js');
const FX = globalThis.FX;
FX.init({ game: 'risk-test', clicks: false });
FX.unlock();

const E = require('../js/engine.js');
const AI = require('../js/ai.js');
const M = require('../js/map.js');
const RFX = require('../js/fxrisk.js');
const K = M.BY_KEY;

// spy: every sound asked for, every sound that really played, every celebration, every animation started
function spy() {
  const log = { asked: [], played: [], celebrate: [], anims: 0 }; current = log;
  const fx = Object.create(FX);
  fx.play = (n, o) => { log.asked.push(n); const ok = FX.play(n, o); if (ok) log.played.push(n); return ok; };
  fx.celebrate = o => { log.celebrate.push(o.kind); return FX.celebrate(o); };
  return { fx, log };
}
// a fake element: enough for fx.js's helpers to run, counts animate() calls
function fakeEl(log) {
  return {
    getBoundingClientRect: () => ({ left: 10, top: 10, width: 20, height: 20 }),
    animate() { log.anims++; const a = { onfinish: null }; setTimeout(() => a.onfinish && a.onfinish(), 0); return a; },
    cloneNode() { return fakeEl(log); }, removeAttribute() {}, setAttribute() {}, remove() {}, style: {}, textContent: '',
  };
}
function env(fx, log, me) {
  return {
    FX: fx, me, at: (ms, f) => f(), // run every step right away
    badge: () => fakeEl(log), chip: () => fakeEl(log), cont: () => fakeEl(log), panel: () => fakeEl(log), dice: () => fakeEl(log),
    flood: () => { if (fx.settings.animations) log.anims++; }, stamp: () => { if (fx.settings.animations) log.anims++; },
  };
}

// a short scripted game: You (0) own everything but Siam (Purple, 2 armies) and Western Australia (Green, 1)
function scripted() {
  let st = E.newGame([{ name: 'You', kind: 'human' }, { name: 'G', kind: 'cpu', level: 'easy' }, { name: 'B', kind: 'cpu', level: 'easy' }], {}, 11);
  while (['claim', 'place', 'capital'].includes(st.phase)) st = E.apply(st, AI.choose(st, st.turn));
  for (let t = 0; t < 42; t++) { st.owner[t] = 0; st.armies[t] = 3; }
  st.owner[K.siam] = 2; st.armies[K.siam] = 2;
  st.owner[K.wau] = 1; st.armies[K.wau] = 1;
  st.armies[K.india] = 30; st.armies[K.eau] = 30;
  st.players.forEach(p => { p.cards = []; p.out = false; });
  st.players[0].cards = [K.alaska, K.venezuela, K.peru]; // three infantry: a set
  Object.assign(st, { turn: 0, phase: 'reinforce', reserve: 3, mustTrade: false, after: null, captured: false, occupy: null, lastRoll: null });
  return st;
}
function play(me, fx, log) {
  let st = scripted();
  const step = a => { const nx = E.apply(st, a); RFX.run(RFX.events(st, nx, me), env(fx, log, me)); st = nx; return nx; };
  step({ type: 'trade', cards: st.players[0].cards.slice() });
  step({ type: 'place', t: K.india, n: st.reserve });
  step({ type: 'attack', from: K.india, to: K.siam, dice: 3 });
  if (st.owner[K.siam] !== 0) step({ type: 'blitz', from: K.india, to: K.siam });
  if (st.phase === 'occupy') step({ type: 'occupy', n: st.occupy.max });
  step({ type: 'blitz', from: K.eau, to: K.wau });
  if (st.phase === 'occupy') step({ type: 'occupy', n: st.occupy.max });
  return st;
}

test('fx: each game event plays its own sound (scripted short game)', () => {
  const { fx, log } = spy();
  FX.reset(); FX.set('animations', false);
  const end = play([0], fx, log);
  assert.strictEqual(end.phase, 'over'); assert.strictEqual(end.winner, 0);
  for (const n of ['cardSlide', 'place', 'dieRoll', 'diceLand', 'thud', 'stamp', 'explosion'])
    assert.ok(log.asked.includes(n), 'expected sound ' + n + ' in ' + log.asked.join(','));
  // one dice sound per die thrown in the single roll (3 attack + 2 defence)
  const first = log.asked.indexOf('dieRoll'), rolls = log.asked.slice(first, first + 6);
  assert.deepStrictEqual(rolls, ['dieRoll', 'dieRoll', 'dieRoll', 'dieRoll', 'dieRoll', 'diceLand']);
  assert.ok(log.asked.includes('diceShake'), 'blitz is a quick burst');
  assert.ok(log.celebrate.filter(k => k === 'big').length >= 2, 'Asia and Australia taken: big moments');
  assert.strictEqual(log.celebrate[log.celebrate.length - 1], 'win');
  assert.ok(log.played.length > 10, 'sounds really played');
});

test('fx: your turn chimes only when it becomes your turn', () => {
  const st = scripted();
  const theirs = Object.assign(JSON.parse(JSON.stringify(st)), { turn: 2, phase: 'attack', ver: (st.ver | 0) - 1 });
  const ev = RFX.events(theirs, st, [0]).map(e => e.type);
  assert.ok(ev.includes('myTurn'));
  assert.ok(!RFX.events(theirs, st, [1]).some(e => e.type === 'myTurn'), 'not when it is someone else\'s turn');
  const placed = E.apply(st, { type: 'place', t: K.india, n: 1 });
  assert.ok(!RFX.events(st, placed, [0]).some(e => e.type === 'myTurn'), 'not on every move');
});

test('fx: losing player hears lose, a computer-only game shows the win', () => {
  let r = spy(); FX.reset(); play([1], r.fx, r.log);
  assert.strictEqual(r.log.celebrate[r.log.celebrate.length - 1], 'lose');
  r = spy(); play([], r.fx, r.log);
  assert.strictEqual(r.log.celebrate[r.log.celebrate.length - 1], 'win');
});

test('fx: Sound off = no sound; Animations off = no animation', () => {
  let r = spy(); FX.reset(); FX.set('sound', false);
  play([0], r.fx, r.log);
  assert.ok(r.log.asked.length > 10); assert.strictEqual(r.log.played.length, 0, 'nothing plays with Sound off');
  assert.ok(r.log.anims > 0, 'animations still run with only Sound off');
  r = spy(); FX.reset(); FX.set('animations', false);
  play([0], r.fx, r.log);
  assert.strictEqual(r.log.anims, 0, 'no animation with Animations off');
  assert.ok(r.log.played.length > 10);
  r = spy(); FX.reset(); FX.set('moves', false); FX.set('celebrations', false);
  play([0], r.fx, r.log);
  assert.strictEqual(r.log.played.length, 0, 'Game sounds + Celebrations off: silent');
  FX.reset();
});

test('fx: nothing on a fresh game, a reload or a different game', () => {
  const st = scripted();
  assert.deepStrictEqual(RFX.events(null, st, [0]), []);
  assert.deepStrictEqual(RFX.events(st, st, [0]), []);
  const other = E.newGame([{ name: 'A', kind: 'human' }, { name: 'B', kind: 'cpu' }], {}, 3);
  assert.deepStrictEqual(RFX.events(st, other, [0]), []);
  const again = E.newGame([{ name: 'You', kind: 'human' }, { name: 'G', kind: 'cpu', level: 'easy' }, { name: 'B', kind: 'cpu', level: 'easy' }], {}, 12);
  assert.deepStrictEqual(RFX.events(st, again, [0]), [], 'New game with the same seats: no sounds for the old board');
});

test('fx: armies slide from attacker to defender on each attack and on moving in', () => {
  const { fx, log } = spy();
  const slides = [];
  let st = scripted();
  const step = a => { const nx = E.apply(st, a); const en = env(fx, log, [0]); en.slide = (from, to, hex, ms, lunge) => slides.push({ from, to, hex, lunge }); RFX.run(RFX.events(st, nx, [0]), en); st = nx; };
  step({ type: 'trade', cards: st.players[0].cards.slice() });
  step({ type: 'place', t: K.india, n: st.reserve });
  step({ type: 'attack', from: K.india, to: K.siam, dice: 3 });
  assert.ok(slides.some(s => s.from === K.india && s.to === K.siam && s.lunge), 'the attack lunges India -> Siam: ' + JSON.stringify(slides));
  if (st.owner[K.siam] !== 0) step({ type: 'blitz', from: K.india, to: K.siam });
  if (st.phase === 'occupy') step({ type: 'occupy', n: st.occupy.max });
  assert.ok(slides.some(s => s.from === K.india && s.to === K.siam && !s.lunge), 'moving in slides armies into Siam');
  assert.ok(slides.every(s => s.hex === st.players[0].hex), 'in the attacker\'s colour');
});
