// Browser check of the map zoom (auto fit + manual zoom + fit button), in Safari's engine.
//   serve the site, then: node tools/zoomcheck.mjs http://127.0.0.1:<port>/
// Needs Playwright with WebKit (the copy in ~/.claude/tools is used if the repo has none).
// Exit code 0 = every check passed.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:18963/';
let pw;
try { pw = await import('playwright'); } catch { pw = createRequire(join(homedir(), '.claude/tools/x.js'))('playwright'); }

const SIZES = [
  { name: 'phone 393x659', viewport: { width: 393, height: 659 }, touch: true },
  { name: 'phone rotated 659x393', viewport: { width: 659, height: 393 }, touch: true },
  { name: 'laptop 1280x800', viewport: { width: 1280, height: 800 }, touch: false },
];
let fails = 0;
const ok = (cond, what) => { console.log((cond ? '  ok   ' : '  FAIL ') + what); if (!cond) fails++; };

// the land's box, the board box and the fit button's state
const measure = page => page.evaluate(() => {
  const r = e => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  const fit = document.querySelector('#fitBtn');
  return { land: r(document.querySelector('#map .land')), wrap: r(document.querySelector('#mapWrap')), fit: fit ? fit.classList.contains('lit') : null, fitExists: !!fit, vb: document.querySelector('#map').getAttribute('viewBox'), scrollY: document.scrollingElement.scrollTop };
});
const same = (a, b, tol = 2) => ['l', 't', 'r', 'b'].every(k => Math.abs(a[k] - b[k]) <= tol);
const inside = (a, w) => a.l >= w.l - 1 && a.t >= w.t - 1 && a.r <= w.r + 1 && a.b <= w.b + 1;

// two touch pointers spreading apart over the board (a pinch out)
const pinch = (page, spread) => page.evaluate(spread => {
  const svg = document.querySelector('#map'), b = svg.getBoundingClientRect();
  const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
  const ev = (type, id, x, y) => svg.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 11, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  ev('pointerdown', 11, cx - 20, cy); ev('pointerdown', 12, cx + 20, cy);
  for (let i = 1; i <= 10; i++) { const d = 20 + spread * i / 10; ev('pointermove', 11, cx - d, cy); ev('pointermove', 12, cx + d, cy); }
  ev('pointerup', 11, cx - 20 - spread, cy); ev('pointerup', 12, cx + 20 + spread, cy);
}, spread);
const drag = async (page, dx, dy) => {
  const w = await measure(page); const x = (w.wrap.l + w.wrap.r) / 2, y = (w.wrap.t + w.wrap.b) / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + dx * i / 8, y + dy * i / 8);
  await page.mouse.up();
};

const tap = (page, sel) => page.click(sel, { timeout: 1500 }).catch(() => console.log('  (no ' + sel + ')'));
const browser = await pw.webkit.launch({ headless: true });
for (const s of SIZES) {
  console.log(s.name);
  const ctx = await browser.newContext({ viewport: s.viewport, hasTouch: s.touch, isMobile: s.touch });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url + '#play'); await page.waitForTimeout(800);
  const auto = await measure(page);
  ok(inside(auto.land, auto.wrap), `on load the whole board fits in the board box (land ${auto.land.w.toFixed(0)}x${auto.land.h.toFixed(0)} in ${auto.wrap.w.toFixed(0)}x${auto.wrap.h.toFixed(0)})`);
  ok(auto.wrap.b <= s.viewport.height + 1, `board box is on screen (bottom ${auto.wrap.b.toFixed(0)} <= ${s.viewport.height})`);
  ok(auto.fitExists && auto.fit === false, 'fit button present and dimmed in auto mode');

  await drag(page, 90, 40); await page.waitForTimeout(200);
  ok(same((await measure(page)).land, auto.land, 0.5), 'auto mode: a one-finger drag does not move the board');

  // taps on territories still work in auto mode
  const taps = () => page.evaluate(() => window.__taps || 0);
  const badge = await page.evaluate(() => {
    window.__taps = 0; const g = document.querySelector('#map .badge[data-t="13"]');
    g.addEventListener('click', () => window.__taps++);
    const b = g.querySelector('circle.hit').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2];
  });
  if (s.touch) await page.touchscreen.tap(badge[0], badge[1]); else await page.mouse.click(badge[0], badge[1]);
  ok(await taps() === 1, 'auto mode: tapping a territory still taps it');

  if (s.touch) await pinch(page, 30);
  else { await page.mouse.move((auto.wrap.l + auto.wrap.r) / 2, (auto.wrap.t + auto.wrap.b) / 2); await page.mouse.wheel(0, -400); }
  await page.waitForTimeout(400);
  const z1 = await measure(page);
  ok(z1.land.w > auto.land.w * 1.3, `${s.touch ? 'pinch' : 'wheel'} zooms in (land ${auto.land.w.toFixed(0)} -> ${z1.land.w.toFixed(0)} px wide)`);
  ok(z1.fit === true, 'fit button lit after zooming');

  await tap(page, '#zoomIn'); await page.waitForTimeout(500);
  const z2 = await measure(page);
  ok(z2.land.w > z1.land.w * 1.2, `+ zooms in further (${z1.land.w.toFixed(0)} -> ${z2.land.w.toFixed(0)})`);

  // zoomed: a tap on a territory that is on screen still taps it
  const zb = await page.evaluate(() => {
    const w = document.querySelector('#mapWrap').getBoundingClientRect();
    for (const g of document.querySelectorAll('#map .badge')) { const b = g.querySelector('circle.hit').getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2;
      if (x > w.left + 150 && x < w.right - 20 && y > w.top + 20 && y < w.bottom - 60) { window.__t2 = 0; g.addEventListener('click', () => window.__t2++); return [x, y]; } }
    return null;
  });
  if (zb) { if (s.touch) await page.touchscreen.tap(zb[0], zb[1]); else await page.mouse.click(zb[0], zb[1]); }
  ok(zb && await page.evaluate(() => window.__t2) === 1, 'zoomed: tapping a territory still taps it');

  await drag(page, 120, 60); await page.waitForTimeout(200);
  const z3 = await measure(page);
  ok(!same(z3.land, z2.land, 5), 'zoomed: drag pans the board');
  ok(await taps() === 1, 'a pan drag is not a tap');
  await drag(page, 3000, 3000); await page.waitForTimeout(200);
  const vb = (await measure(page)).vb.split(/\s+/).map(Number);
  ok(vb[0] >= -0.01 && vb[1] >= -0.01 && vb[0] + vb[2] <= 1000.01 && vb[1] + vb[3] <= 560.01, `pan is clamped to the board (viewBox ${vb.map(v => v.toFixed(0)).join(' ')})`);

  await tap(page, '#zoomOut'); await page.waitForTimeout(500);
  ok((await measure(page)).land.w < z2.land.w, '- zooms out');
  for (let i = 0; i < 8; i++) await tap(page, '#zoomOut');
  await page.waitForTimeout(500);
  const zo = await measure(page);
  ok(same(zo.land, auto.land) && zo.fit === false, 'zooming out stops at the auto fit and is auto mode again');

  await tap(page, '#zoomIn'); await page.waitForTimeout(500);
  await tap(page, '#fitBtn'); await page.waitForTimeout(600);
  const back = await measure(page);
  ok(same(back.land, auto.land), 'fit button glides back to the auto box (+-2 px)');
  ok(back.fit === false, 'fit button dimmed again');

  await tap(page, '#zoomIn'); await page.waitForTimeout(500);
  await tap(page, (await page.isVisible('#tabsBottom')) ? '#tabsBottom [data-tab="study"]' : '#tabsTop [data-tab="study"]'); await page.waitForTimeout(300);
  const st = await measure(page);
  ok(same(st.land, auto.land) && st.fit === false, 'tab change returns to auto');
  ok(st.scrollY === 0, 'page did not scroll');
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}
await browser.close();
console.log(fails ? `${fails} check(s) FAILED` : 'all zoom checks passed');
process.exit(fails ? 1 : 0);
