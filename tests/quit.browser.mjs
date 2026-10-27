// Browser test: ending a game against the computers after your first move counts as a loss in My stats;
// a game you haven't moved in yet and the guided game (Basic Training) never count.
//   node tests/quit.browser.mjs        (needs Playwright in ~/.claude/tools; WebKit)
//   RISK_ROOT=<other checkout> runs it against older code.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
const require = createRequire(join(homedir(), '.claude/tools/') + 'x.js');
const pw = require('playwright');
const ROOT = process.env.RISK_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');

const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' }); r.end(d); } });
});
await new Promise(ok => srv.listen(0, ok));
const url = 'http://localhost:' + srv.address().port + '/?nosw#play';
let failed = 0;
const check = (ok, msg) => { console.log((ok ? '  PASS  ' : '  FAIL  ') + msg); if (!ok) failed++; };

const browser = await pw.webkit.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 659 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('coach-offer:risk-first', '1'); } catch (e) {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.RiskApp && window.Profile);
  const stats = () => page.evaluate(() => Profile.stats());
  // your first move: one army on one of your own lands (setup or reinforce)
  const move = async () => {
    await page.waitForFunction(() => RiskApp.app.game && RiskApp.isHumanTurn(), null, { timeout: 30000 });
    const ok = await page.evaluate(() => { const g = RiskApp.app.game, t = g.owner.indexOf(g.turn); return RiskApp.act({ type: 'place', t }); });
    check(ok, 'you placed an army');
  };
  const endGame = async () => {
    await page.click('#quitBtn');
    await page.waitForSelector('#quitYes', { state: 'visible' });
    await page.waitForTimeout(300);
    await page.click('#quitYes');
    await page.waitForFunction(() => !RiskApp.app.game);
  };

  await page.waitForSelector('#startBtn', { state: 'visible' });
  await page.waitForTimeout(500);
  await page.click('#startBtn');
  await page.waitForFunction(() => RiskApp.app.game);
  await endGame();
  let s = await stats();
  check(s.games === 0, 'a game ended before your first move is not counted (' + s.games + ' games)');

  await page.click('#startBtn');
  await move();
  check((await stats()).games === 0, 'nothing counted while the game is on');
  await endGame();
  s = await stats();
  check(s.games === 1 && s.losses === 1, 'ending a game after a move counts as a loss (' + s.games + ' games, ' + s.losses + ' lost)');

  // Basic Training, ended after a move: never counts
  await page.evaluate(() => RiskApp.startTutorial());
  await page.waitForFunction(() => RiskApp.app.gm && RiskApp.app.gm.tutorial);
  await page.addStyleTag({ content: '.coach-layer{display:none!important}' });   // the guide's bubbles sit over the buttons
  await move();
  await endGame();
  s = await stats();
  check(s.games === 1 && s.losses === 1, 'ending the guided game is not counted (' + s.games + ' games, ' + s.losses + ' lost)');
  check(!errs.length, 'no page errors ' + errs.join(' | '));
  await ctx.close();
} finally {
  await browser.close();
  srv.close();
}
console.log(failed ? failed + ' FAILED' : 'all passed');
process.exit(failed ? 1 : 0);
