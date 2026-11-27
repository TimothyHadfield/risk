// Fit check (2026-11-27): "can I actually see everything?" in a crowded late game, five screen sizes, Safari's engine.
//   serve the site, then: node tests/fit-ui.mjs http://127.0.0.1:<port>/ [webkit|chromium] [shotDir]
// Six players with long names, round 12+, everyone alive, you hold 6 cards and attack out of Ukraine.
// Measures: army numbers on the map, every territory tappable at its piece (Europe / SE Asia included), the
// rivals' name plates and numbers, your hand's card names and how much of each card shows, the attack buttons,
// page scroll / sideways overflow / console errors. Exit code 0 = every check passed.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:8712/';
const engine = process.argv[3] || 'webkit';
const shotDir = process.argv[4] || '';
if (shotDir) mkdirSync(shotDir, { recursive: true });
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
let pw;
try { pw = await import('playwright'); } catch { pw = createRequire(join(homedir(), '.claude/tools/x.js'))('playwright'); }

const E = req(join(repo, 'js/engine.js')), AI = req(join(repo, 'js/ai.js')), M = req(join(repo, 'js/map.js'));
const realRandom = Math.random;
let seed = 1; Math.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const seats = Array.from({ length: 6 }, (_, i) => i === 0 ? { name: 'You', kind: 'human', level: 'medium' } : { name: E.COLORS[i].name + ' M', kind: 'cpu', level: 'easy' });
let game = null;
for (let sd = 1; sd < 300 && !game; sd++) {
  seed = sd * 97; let g = E.newGame(seats, {}), k = 0;
  while (!(g.phase === 'attack' && g.turn === 0 && g.round >= 12) && g.phase !== 'over' && k++ < 60000) g = E.apply(g, AI.choose(g, g.turn));
  if (g.phase === 'attack' && new Set(g.owner).size === 6) game = g;
}
Math.random = realRandom;
const from = M.T.findIndex(t => t.name === 'Ukraine'), to = M.T.findIndex(t => t.name === 'Northern Europe');
game.owner[from] = 0; game.armies[from] = 24;
M.ADJ[from].forEach((u, i) => { if (game.owner[u] === 0) game.owner[u] = 1 + (i % 5); });
// long names and big hands: you hold 6 cards, the others 3-5
const LONG = ['Alexandra the Great', 'Bartholomew', 'Christopher K.', 'Maximilian Jr.', 'Guinevere Smith'];
game.players.forEach((p, i) => { if (i) p.name = LONG[i - 1]; });
const pool = game.players.flatMap(p => p.cards).concat(game.deck);
game.players.forEach(p => { p.cards = []; });
const take = n => pool.splice(0, n);
game.players[0].cards = take(6);
game.players.slice(1).forEach((p, i) => { p.cards = take(3 + (i % 3)); });
game.deck = pool;
console.log(`table: 6 players, round ${game.round}, attack ${M.T[from].name} -> ${M.T[to].name}, my hand ${game.players[0].cards.length}`);

// numbers on the map: 12 px wherever the board is phone size or bigger; the 320 px phone is the floor (board ~300 px wide)
const SIZES = [
  { name: 'phone 393x659', key: '393', viewport: { width: 393, height: 659 }, touch: true, num: 12, opp: 12, card: 0 },
  { name: 'small phone 320x568', key: '320', viewport: { width: 320, height: 568 }, touch: true, num: 10, opp: 10, card: 0, strip: 22, sym: 15 },
  { name: 'turned phone 659x393', key: '659', viewport: { width: 659, height: 393 }, touch: true, num: 12, opp: 12, card: 0 },
  { name: 'laptop 1280x800', key: '1280', viewport: { width: 1280, height: 800 }, touch: false, num: 12, opp: 12, card: 10 },
  { name: 'laptop 1440x900', key: '1440', viewport: { width: 1440, height: 900 }, touch: false, num: 12, opp: 12, card: 10 },
];
let fails = 0;
const ok = (cond, what) => { console.log((cond ? '  ok   ' : '  FAIL ') + what); if (!cond) fails++; };

const browser = await pw[engine].launch({ headless: true });
for (const s of SIZES) {
  console.log(s.name);
  const ctx = await browser.newContext({ viewport: s.viewport, hasTouch: s.touch, isMobile: s.touch, deviceScaleFactor: 2 });
  await ctx.addInitScript(g => { try { if (!sessionStorage.getItem('vc')) { sessionStorage.setItem('vc', 1); localStorage.clear(); localStorage.setItem('risk.game', g); localStorage.setItem('fx:risk', '{"sound":false}'); } } catch (e) {} }, JSON.stringify(game));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url + '#play'); await page.waitForTimeout(900);
  const tapAt = async t => {
    const p = await page.evaluate(t => { const r = document.querySelector(`#map .badge[data-t="${t}"] circle.face`).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, t);
    if (s.touch) await page.touchscreen.tap(p[0], p[1]); else await page.mouse.click(p[0], p[1]);
    await page.waitForTimeout(300);
  };
  await tapAt(from); await tapAt(to);
  await page.waitForTimeout(400);
  if (process.env.FITDEBUG) console.log(await page.evaluate(() => ['#mine', '#mine .me', '#hand', '#mine .decks'].map(q => { const r = document.querySelector(q).getBoundingClientRect(); return `${q} ${r.left.toFixed(0)}-${r.right.toFixed(0)}`; }).join(' | ')));
  if (shotDir) await page.screenshot({ path: join(shotDir, `crowded-${s.key}.png`) });
  const m = await page.evaluate(() => {
    const d = document.scrollingElement, vw = innerWidth, vh = innerHeight;
    const px = el => { const c = el.getScreenCTM(); return parseFloat(getComputedStyle(el).fontSize) * Math.hypot(c.a, c.b); };
    // army numbers (two-digit and one-digit; three-digit stacks are rare and drawn smaller)
    const nums = [...document.querySelectorAll('#map .badge:not(.hidden) text')].filter(t => !t.classList.contains('n3'));
    const numPx = Math.min(...nums.map(px));
    // every territory: the point at the middle of its piece belongs to that territory
    let wrongTap = [];
    document.querySelectorAll('#map .badge').forEach(g => {
      const r = g.querySelector('circle.face').getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y), t = hit && hit.closest('[data-t]');
      if (!t || t.dataset.t !== g.dataset.t) wrongTap.push(window.RiskMap.T[+g.dataset.t].name);
    });
    // rivals: names identifiable (at least 6 letters showing), name and number sizes
    const opps = [...document.querySelectorAll('#seats .opp')];
    const nmShow = opps.map(o => { const n = o.querySelector('.nm'); if (!n) return 99; return n.scrollWidth > n.clientWidth + 1 ? Math.floor(n.textContent.length * n.clientWidth / n.scrollWidth) : n.textContent.length; });
    const fs = e => e ? parseFloat(getComputedStyle(e).fontSize) : 99;
    const oppName = Math.min(...opps.map(o => fs(o.querySelector('.tbl-plate'))));
    const oppNum = Math.min(...opps.map(o => Math.min(fs(o.querySelector('.st')), fs(o.querySelector('.backs b')))));
    let oppOver = 0; opps.forEach((a, i) => opps.slice(i + 1).forEach(b => { const A = a.getBoundingClientRect(), B = b.getBoundingClientRect(); if (A.right > B.left + 1 && B.right > A.left + 1) oppOver++; }));
    const seatsBox = document.querySelector('#seats'), seatsScroll = seatsBox.scrollWidth > seatsBox.clientWidth + 1;
    // my hand: every card's name size, and the narrowest strip of a card left showing beside the next one
    const cards = [...document.querySelectorAll('#hand .rk-card')];
    const symPx = cards.length ? Math.min(...cards.map(c => (c.querySelector('.rk-sym, .rk-syms svg') || c).getBoundingClientRect().width)) : 0;
    const cardNm = cards.length ? Math.min(...cards.map(c => fs(c.querySelector('.rk-nm')))) : 0;
    const rs = cards.map(c => c.getBoundingClientRect()).sort((a, b) => a.left - b.left);
    const strip = rs.length > 1 ? Math.min(...rs.slice(0, -1).map((r, i) => rs[i + 1].left - r.left)) : 99;
    const handIn = rs.every(r => r.left >= -0.5 && r.right <= vw + 0.5 && r.bottom <= vh + 0.5);
    const cardW = rs.length ? Math.min(...rs.map(r => r.width)) : 0;
    // attack controls: on screen, not under the hand, big enough to tap
    const mi = document.querySelector('#mine'), mr = mi.getBoundingClientRect();
    const btn = re => [...document.querySelectorAll('#panel button')].find(b => re.test(b.textContent.trim()) && b.offsetParent);
    const onScreen = e => { if (!e) return false; const r = e.getBoundingClientRect(); const covered = !mi.hidden && r.bottom > mr.top + 1 && r.right > mr.left && r.left < mr.right; return r.top >= 0 && r.bottom <= vh + 0.5 && !covered; };
    const ctl = [btn(/^Roll$/), btn(/^Blitz$/), btn(/Done attacking/)];
    const ctlH = Math.min(...ctl.filter(Boolean).map(b => b.getBoundingClientRect().height));
    return {
      numPx, wrongTap, nmShow: Math.min(...nmShow), oppName, oppNum, oppOver, seatsScroll,
      nCards: cards.length, cardNm, symPx, strip, handIn, cardW,
      ctlOn: ctl.map(onScreen), ctlH,
      over: d.scrollWidth > vw + 1, scroll: d.scrollHeight > d.clientHeight + 1,
    };
  });
  ok(m.numPx >= s.num, `army numbers ${m.numPx.toFixed(1)} px (>= ${s.num})`);
  ok(!m.wrongTap.length, `every territory's piece taps that territory (${m.wrongTap.join(', ') || 'all 42'})`);
  ok(m.nmShow >= 6 && m.oppOver === 0 && !m.seatsScroll, `rivals' names show ${m.nmShow}+ letters (>= 6), seats don't overlap (${m.oppOver}) or scroll (${m.seatsScroll})`);
  ok(m.oppName >= 10, `rivals' names ${m.oppName} px (>= 10)`);
  ok(m.oppNum >= s.opp, `rivals' card / land / army numbers ${m.oppNum} px (>= ${s.opp})`);
  ok(m.nCards === 6 && m.handIn, `all 6 of my cards on screen (${m.nCards}, ${m.handIn})`);
  ok(m.cardNm >= s.card && m.symPx >= (s.sym || 16), `my card names ${m.cardNm.toFixed(1)} px (>= ${s.card || 'n/a on a phone'}), troop symbols ${m.symPx.toFixed(1)} px (>= ${s.sym || 16}), cards ${m.cardW.toFixed(0)} px wide`);
  // a laptop has room for the whole hand side by side; a phone overlaps but keeps a strip per card
  const needStrip = s.touch ? (s.strip || 24) : m.cardW - 1;
  ok(m.strip >= needStrip, `each card shows a strip ${m.strip.toFixed(1)} px wide (>= ${needStrip.toFixed(0)})`);
  ok(m.ctlOn.every(Boolean) && m.ctlH >= 36, `Roll / Blitz / Done attacking on screen (${m.ctlOn}), ${m.ctlH.toFixed(0)} px tall (>= 36)`);
  ok(!m.over && !m.scroll && !errs.length, `no sideways overflow, no page scroll, no errors ${errs.join(' | ')}`);
  await ctx.close();
}
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
