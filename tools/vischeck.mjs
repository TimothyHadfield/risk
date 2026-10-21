// Browser check that the board and its pieces are easy to see (Safari's engine, five screen sizes).
//   serve the site, then: node tools/vischeck.mjs http://127.0.0.1:<port>/ [webkit|chromium]
// Plays a 6-player game to round 12 (all six alive), attacks out of Ukraine (the busiest spot), then measures:
// board share of the screen, true board shape, army number size, piece size, pieces / odds tags
// overlapping, the attack buttons on screen, taps landing on the right territory, no overflow / errors.
// Exit code 0 = every check passed.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.argv[2] || 'http://127.0.0.1:18963/';
const engine = process.argv[3] || 'webkit';
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
let pw;
try { pw = await import('playwright'); } catch { pw = createRequire(join(homedir(), '.claude/tools/x.js'))('playwright'); }

// ---- the crowded table: six players, round 12, everyone alive, your attack turn
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
// the busiest spot on the board: you attack out of Ukraine (six neighbours: Europe, the Middle East, Asia)
const from = M.T.findIndex(t => t.name === 'Ukraine');
game.owner[from] = 0; game.armies[from] = 24;
M.ADJ[from].forEach((u, i) => { if (game.owner[u] === 0) game.owner[u] = 1 + (i % 5); });
const to = M.T.findIndex(t => t.name === 'Northern Europe');
console.log(`table: 6 players, round ${game.round}, attack ${M.T[from].name} -> ${M.T[to].name}, biggest stack ${Math.max(...game.armies)}`);

const SIZES = [
  { name: 'phone 393x659', viewport: { width: 393, height: 659 }, touch: true, share: 30, num: 9, piece: 15.5 },
  { name: 'small phone 320x568', viewport: { width: 320, height: 568 }, touch: true, share: 28, num: 7.5, piece: 12.5 },
  { name: 'turned phone 659x393', viewport: { width: 659, height: 393 }, touch: true, share: 28, num: 9, piece: 15.5 },
  { name: 'laptop 1280x800', viewport: { width: 1280, height: 800 }, touch: false, share: 43, num: 12, piece: 22 },
  { name: 'laptop 1440x900', viewport: { width: 1440, height: 900 }, touch: false, share: 46, num: 12, piece: 22 },
];
let fails = 0;
const ok = (cond, what) => { console.log((cond ? '  ok   ' : '  FAIL ') + what); if (!cond) fails++; };

const browser = await pw[engine].launch({ headless: true });
for (const s of SIZES) {
  console.log(s.name);
  const ctx = await browser.newContext({ viewport: s.viewport, hasTouch: s.touch, isMobile: s.touch, deviceScaleFactor: s.touch ? 2 : 1 });
  await ctx.addInitScript(g => { try { if (!sessionStorage.getItem('vc')) { sessionStorage.setItem('vc', 1); localStorage.clear(); localStorage.setItem('risk.game', g); localStorage.setItem('fx:risk', '{"sound":false}'); } } catch (e) {} }, JSON.stringify(game));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url + '#play'); await page.waitForTimeout(900);
  // tap the attacker then the target with real (touch / mouse) taps at the pieces' centres: checks taps land where they look
  const tapAt = async t => {
    const p = await page.evaluate(t => { const r = document.querySelector(`#map .badge[data-t="${t}"] circle.face`).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, t);
    if (s.touch) await page.touchscreen.tap(p[0], p[1]); else await page.mouse.click(p[0], p[1]);
    await page.waitForTimeout(300);
  };
  await tapAt(from); await tapAt(to);
  const m = await page.evaluate(([from, to]) => {
    const d = document.scrollingElement, vw = innerWidth, vh = innerHeight;
    const svg = document.querySelector('#map'), wrap = document.querySelector('#mapWrap').getBoundingClientRect(), sb = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
    const sc = Math.min(sb.width / vb.width, sb.height / vb.height), bw = vb.width * sc, bh = vb.height * sc;
    const visW = Math.min(bw, wrap.width), visH = Math.min(bh, wrap.height);
    const pcs = [...document.querySelectorAll('#map .badge:not(.hidden)')].map(g => { const r = g.querySelector('circle.face').getBoundingClientRect(); return { t: +g.dataset.t, x: r.left + r.width / 2, y: r.top + r.height / 2, d: r.width }; });
    let overlaps = 0;
    pcs.forEach((a, i) => pcs.slice(i + 1).forEach(b => { if (Math.hypot(a.x - b.x, a.y - b.y) < (a.d + b.d) / 2) overlaps++; }));
    // an odds tag may not hide a piece (drawn above one), and a piece may not cover a tag's number
    let tagHides = 0;
    const svgKids = [...svg.children], tagLayer = svg.querySelector('.tags'), firstPiece = svg.querySelector('.badge');
    const tagsAbove = svgKids.indexOf(tagLayer) > svgKids.indexOf(firstPiece);
    document.querySelectorAll('#map .tag').forEach(tg => { const b = (tagsAbove ? tg.querySelector('rect') : tg.querySelector('text')).getBoundingClientRect(); pcs.forEach(p => { const cx = Math.max(b.left, Math.min(p.x, b.right)), cy = Math.max(b.top, Math.min(p.y, b.bottom)); if (Math.hypot(cx - p.x, cy - p.y) < p.d / 2 - 1) tagHides++; }); });
    // army number font size on screen = its box height / ~1.2 is fuzzy; use the font size times the drawing scale instead
    const tx = document.querySelector('#map .badge:not(.hidden) text'), fs = parseFloat(getComputedStyle(tx).fontSize);
    const ctm = tx.getScreenCTM(), numPx = fs * Math.hypot(ctm.a, ctm.b);
    const app = window.__risk || {};
    const vis = sel => { const e = [...document.querySelectorAll(sel)].find(b => b.offsetParent); if (!e) return false; const r = e.getBoundingClientRect(), mine = document.querySelector('#mine').getBoundingClientRect(), mineOn = !document.querySelector('#mine').hidden; return r.top >= 0 && r.bottom <= vh && (!mineOn || r.bottom <= mine.top + 1 || r.left >= mine.right - 1); };
    const roll = [...document.querySelectorAll('#panel button')].find(b => /^Roll$/.test(b.textContent.trim()));
    const blitz = [...document.querySelectorAll('#panel button')].find(b => /^Blitz$/.test(b.textContent.trim()));
    const onScreen = e => { if (!e) return false; const r = e.getBoundingClientRect(), mi = document.querySelector('#mine'), mr = mi.getBoundingClientRect(); const covered = !mi.hidden && r.bottom > mr.top + 1 && r.right > mr.left && r.left < mr.right; return r.top >= 0 && r.bottom <= vh + 0.5 && !covered; };
    return {
      share: visW * visH / (vw * vh) * 100, aspect: bw / bh, clipped: bw > wrap.width + 1 || bh > wrap.height + 1, wrapBottom: wrap.bottom,
      numPx, piece: Math.min(...pcs.map(p => p.d)), overlaps, tagHides, tags: document.querySelectorAll('#map .tag').length,
      sel: document.querySelector('#map .badge.sel') ? +document.querySelector('#map .badge.sel').dataset.t : -1,
      arrowTo: document.querySelector('#map .arrow') ? 1 : 0,
      roll: onScreen(roll), blitz: onScreen(blitz),
      over: d.scrollWidth > vw + 1, scroll: d.scrollHeight > d.clientHeight + 1,
    };
  }, [from, to]);
  ok(m.share >= s.share, `board gets ${m.share.toFixed(1)}% of the screen (>= ${s.share}%)`);
  ok(Math.abs(m.aspect / (1000 / 560) - 1) < 0.02 && !m.clipped && m.wrapBottom <= s.viewport.height + 1, `board keeps the real shape (${m.aspect.toFixed(3)}), whole board on screen`);
  ok(m.numPx >= s.num, `army numbers ${m.numPx.toFixed(1)} px (>= ${s.num})`);
  ok(m.piece >= s.piece, `army pieces ${m.piece.toFixed(1)} px (>= ${s.piece})`);
  ok(m.overlaps === 0, `no pieces overlap (${m.overlaps})`);
  ok(m.tags > 0 && m.tagHides === 0, `odds tags (${m.tags}) and pieces don't cover each other (${m.tagHides})`);
  ok(m.sel === from && m.arrowTo === 1, `taps on the pieces picked ${M.T[from].name} -> ${M.T[to].name}`);
  ok(m.roll && m.blitz, `Roll and Blitz on screen, not under your hand (${m.roll}/${m.blitz})`);
  ok(!m.over && !m.scroll && !errs.length, `no sideways overflow, no page scroll, no errors ${errs.join(' | ')}`);
  await ctx.close();
}
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
