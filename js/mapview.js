// Draws the board (our own SVG world map) and keeps it in sync with a state.
// Built once; later updates only change fills, numbers and highlights so
// nothing jumps.
(function (root) {
  'use strict';
  const M = root.RiskMap;
  let G = M.geo; // the drawing of the board in use (classic or Future Earth); set again by draw()
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };

  // where each continent's bonus badge sits
  const CONT_LABEL = { na: [70, 250], sa: [330, 470], eu: [600, 30], af: [430, 470], as: [896, 268], au: [968, 380] };
  // the printed board: each continent in its own colour (like the real board); owners show by their armies
  const BOARD = { na: '#e0b648', sa: '#d4683f', eu: '#5d87c2', af: '#b77b47', as: '#7ea558', au: '#9a6cae',
    fna: '#e0b648', fsa: '#d4683f', feu: '#5d87c2', faf: '#b77b47', fas: '#7ea558', foc: '#9a6cae', fsea: '#3fa6a0', fmoon: '#b9bfc9' };
  const EDGE = { na: '#8a6a17', sa: '#7d3219', eu: '#2b4a78', af: '#6a421f', as: '#3f5e26', au: '#573a66',
    fna: '#8a6a17', fsa: '#7d3219', feu: '#2b4a78', faf: '#6a421f', fas: '#3f5e26', foc: '#573a66', fsea: '#1d5e5a', fmoon: '#59606b' };
  // army pieces in the crowded spots sit a little apart (still on their own land) so bigger pieces never touch:
  // Peru / Brazil / Argentina, Western Europe, Egypt / East Africa, Irkutsk / Mongolia, China / Siam. Every pair is 50+ apart.
  const SPOTS = { classic: { 10: [285.6, 407.9], 11: [336.2, 396.8], 12: [290.4, 458.9], 17: [464.7, 221.1], 21: [552.8, 294.2], 22: [568.3, 343.5], 30: [785.5, 166.4], 31: [755.9, 209.7], 34: [761.6, 259.9], 37: [753.1, 310.6] }, future: {} };
  // these arrays are refilled in place when the board changes, so MapView.POS stays the same object
  const POS = [], NEAR = [], SHORT = [];
  function layoutFor() {
    G = M.geo;
    const SPOT = SPOTS[M.id] || {};
    POS.length = 0; G.terr.forEach((t, i) => POS.push(SPOT[i] ? { x: SPOT[i][0], y: SPOT[i][1] } : { x: t.x, y: t.y }));
    NEAR.length = 0; POS.forEach((t, i) => NEAR.push(Math.min(...POS.map((u, j) => (j === i ? 1e9 : Math.hypot(u.x - t.x, u.y - t.y))))));
    const sh = SHORTS[M.id]; SHORT.length = 0; M.T.forEach((t, i) => SHORT.push(Array.isArray(sh) ? sh[i] : (sh && sh[t.key]) || t.name));
  }
  // a small board gets bigger pieces: drawn at least PIECE_PX screen px wide, up to KMAX times the laptop size
  const PIECE_PX = 17.5, KMAX = 1.88;

  function MapView(svg, onTap) {
    this.svg = svg; this.onTap = onTap;
    this.draw();
    if (root.ResizeObserver) new root.ResizeObserver(() => this.setScale()).observe(svg);
    root.addEventListener('resize', () => this.setScale());
    const hit = e => { const t = e.target.closest('[data-t]'); if (t) this.onTap(+t.getAttribute('data-t')); };
    svg.addEventListener('click', hit);
    this.initZoom();
  }
  // (re)draw the whole board for the map in use; the zoom and tap listeners stay on the svg
  MapView.prototype.draw = function () {
    const svg = this.svg;
    layoutFor(); this.mapId = M.id;
    this.tw = {}; this.lastUpdate = null; this.kSet = false; this.contXY = null; this.tagBoxes = [];
    svg.setAttribute('viewBox', '0 0 1000 560');
    svg.innerHTML = '';
    const defs = el('defs', {}, svg);
    defs.innerHTML = `
      <radialGradient id="sea" gradientUnits="userSpaceOnUse" cx="500" cy="252" r="750" gradientTransform="translate(0 110.9) scale(1 .56)"><stop offset="0" stop-color="#b9d5dc"/><stop offset=".7" stop-color="#a3c4cf"/><stop offset="1" stop-color="#8fb2c0"/></radialGradient>
      <pattern id="waves" width="28" height="14" patternUnits="userSpaceOnUse"><path d="M0 10 Q7 6 14 10 T28 10" fill="none" stroke="#7fa3b2" stroke-width=".8"/></pattern>
      <filter id="lift" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#2b3d48" flood-opacity=".35"/></filter>
      <radialGradient id="shine" cx=".36" cy=".3" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".62"/><stop offset=".45" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient>
      <filter id="piece" x="-40%" y="-40%" width="180%" height="190%"><feDropShadow dx=".6" dy="1.8" stdDeviation="1.3" flood-color="#000" flood-opacity=".55"/></filter>`;
    // the sea runs past the frame so a laptop's taller map box shows ocean, not a gap
    el('rect', { x: -1500, y: -400, width: 4000, height: 1360, fill: 'url(#sea)' }, svg);
    el('rect', { x: -1500, y: -400, width: 4000, height: 1360, fill: 'url(#waves)', opacity: .7 }, svg);
    // Future Earth: drowned coasts (shallow water) and the night sky round the Moon
    if (G.shallow) el('path', { d: G.shallow, class: 'shallow' }, svg);
    if (G.moon) {
      const m = G.moon, sky = el('g', { class: 'sky' }, svg);
      el('circle', { cx: m.x, cy: m.y, r: m.r + 16, class: 'space' }, sky);
      el('circle', { cx: m.x, cy: m.y, r: m.r + 9, class: 'orbit' }, sky);
      [[-48, -30], [44, -38], [-56, 18], [52, 26], [-22, 56], [30, 55], [60, -6]].forEach(([dx, dy]) => el('circle', { cx: m.x + dx, cy: m.y + dy, r: .9, class: 'star' }, sky));
    }
    // sea lanes / land links
    const links = el('g', { class: 'links' }, svg);
    G.links.forEach(([a, b]) => {
      const A = POS[a], B = POS[b];
      if (Math.abs(A.x - B.x) > 500) { // Alaska - Kamchatka: off the edges, round the back of the world
        const [w, e] = A.x < B.x ? [A, B] : [B, A];
        el('line', { x1: w.x, y1: w.y, x2: 0, y2: w.y - 6 }, links);
        el('line', { x1: e.x, y1: e.y, x2: 1000, y2: e.y - 6 }, links);
      } else el('line', { x1: A.x, y1: A.y, x2: B.x, y2: B.y }, links);
    });
    // invisible tap areas round each territory (sea near small islands counts); land drawn on top wins
    const hits = el('g', { class: 'hits' }, svg);
    G.terr.forEach((t, i) => { if (t.hit) el('path', { d: t.hit, class: 'hit', 'data-t': i }, hits); });
    // land that is not part of the game (New Zealand, the Philippines...)
    if (G.bg) el('path', { d: G.bg, class: 'bgland' }, svg);
    // land (real coastlines, Natural Earth, public domain)
    this.land = el('g', { class: 'land', filter: 'url(#lift)' }, svg);
    this.paths = G.terr.map((t, i) => {
      const p = el('path', { d: t.d, class: 'terr', 'data-t': i }, this.land);
      return p;
    });
    // coasts: each territory's outline in its continent's colour; the dark inner borders then cover the shared edges
    const coast = el('g', { class: 'coast' }, svg);
    G.terr.forEach((t, i) => el('path', { d: t.d, stroke: EDGE[M.CONTINENTS[M.T[i].ci].id] }, coast));
    const inner = el('g', { class: 'inner' }, svg);
    if (G.inner) el('path', { d: G.inner }, inner);
    // continent bonus badges
    const cl = el('g', { class: 'contlab' }, svg);
    this.contBadges = M.CONTINENTS.map((c, ci) => {
      const [x, y] = G.cont ? G.cont[ci] : CONT_LABEL[c.id];
      (this.contXY = this.contXY || []).push([x, y]);
      const g = el('g', { transform: `translate(${x},${y})` }, cl);
      const s = el('g', { class: 'sc' }, g);
      // printed on the board: a cream label edged in the continent's colour
      el('rect', { x: -16, y: -11, width: 32, height: 22, rx: 3, fill: '#f4ecd6', stroke: BOARD[c.id], 'stroke-width': 2.2 }, s);
      const tx = el('text', { y: 5, fill: EDGE[c.id] }, s); tx.textContent = '+' + c.bonus;
      return g;
    });
    // selection ring + odds labels + army badges
    this.marks = el('g', { class: 'marks' }, svg);
    // odds tags lie under the pieces, so a tag can never hide anyone's armies
    this.tags = el('g', { class: 'tags' }, svg);
    this.badges = POS.map((t, i) => {
      const g = el('g', { class: 'badge', transform: `translate(${t.x},${t.y})`, 'data-t': i }, svg);
      // a bigger invisible tap area, never past halfway to the next badge (sized again in setScale)
      const hit = el('circle', { r: Math.min(24, NEAR[i] / 2).toFixed(1), class: 'hit' }, g);
      // the armies standing on it: a plastic piece in the owner's colour with the count on top
      const s = el('g', { class: 'sc' }, g);
      const c = el('circle', { r: 12.5, class: 'face', filter: 'url(#piece)' }, s);
      el('circle', { r: 12.5, class: 'shine', fill: 'url(#shine)' }, s);
      const tx = el('text', { y: 5.4 }, s);
      return { g, c, tx, hit, star: null };
    });
    this.leads = el('g', { class: 'leads' }, svg);
    this.names = el('g', { class: 'names' }, svg);
    this.nameEls = POS.map((t, i) => { const tx = el('text', { x: t.x, y: t.y + 24 }, this.names); tx.textContent = M.T[i].name; return tx; });
    this.nameMode = { all: true, focus: [] };
    // a small board (a phone shows it at ~0.4x) gets bigger pieces, numbers and labels so they stay readable
    this.k = 1;
    this.setScale();
  };
  MapView.prototype.setScale = function () {
    {
      const svg = this.svg;
      const b = svg.getBoundingClientRect(), s = Math.min(b.width / W, b.height / H);
      if (!(s > 0)) return;
      const k = +Math.max(1, Math.min(KMAX, PIECE_PX / (25 * s))).toFixed(3);
      if (k === this.k && this.kSet) { this.layoutNames(); return; }
      this.k = k; this.kSet = true;
      svg.querySelectorAll('.sc').forEach(g => { if (k === 1) g.removeAttribute('transform'); else g.setAttribute('transform', `scale(${k})`); });
      this.badges.forEach((b, i) => b.hit.setAttribute('r', Math.min(Math.max(24, 12.5 * k + 3), NEAR[i] / 2).toFixed(1)));
      if (this.lastUpdate) this.update(this.lastUpdate[0], this.lastUpdate[1]); else this.layoutNames();
    }
  };
  // switch the drawing to the board of this game (classic or Future Earth); true when it changed
  MapView.prototype.useMap = function (id) {
    M.use(id || 'classic');
    if (this.mapId === M.id) return false;
    this.draw(); this.resetZoom();
    return true;
  };

  // ---- zoom: auto mode fits the whole board; pinch, wheel or + / - zoom in; fit glides back to auto
  const W = 1000, H = 560, ZMAX = 6;
  const BASE = [0, 0, W, H];
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  MapView.prototype.initZoom = function () {
    const svg = this.svg;
    this.vb = BASE.slice(); this.auto = true; this.onZoom = null;
    const pts = new Map(); let last = null, moved = 0, pinchD = 0, swallow = false;
    const xy = e => [e.clientX, e.clientY];
    svg.addEventListener('pointerdown', e => {
      pts.set(e.pointerId, xy(e)); swallow = false; this.stopGlide();
      if (pts.size === 1) { last = xy(e); moved = 0; }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinchD = Math.hypot(a[0] - b[0], a[1] - b[1]); last = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; this.capture(e); swallow = true; }
    });
    svg.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, xy(e));
      if (pts.size >= 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        this.panBy(m[0] - last[0], m[1] - last[1]);
        if (pinchD > 0) this.zoomAt(m[0], m[1], d / pinchD);
        pinchD = d; last = m; return;
      }
      if (this.auto) return; // auto mode: a one-finger drag does nothing (taps still work)
      const p = xy(e); moved += Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]);
      if (moved > 6) { if (!swallow) { swallow = true; this.capture(e); } this.panBy(p[0] - last[0], p[1] - last[1]); }
      last = p;
    });
    const up = e => { pts.delete(e.pointerId); if (pts.size === 1) last = [...pts.values()][0]; };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
    // a drag or pinch is not a tap on a territory
    svg.addEventListener('click', e => { if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); } }, true);
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
      this.zoomAt(e.clientX, e.clientY, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)));
    }, { passive: false });
    // Safari's trackpad pinch on a laptop; on a phone the pointers above already handle it
    let gs = 1;
    svg.addEventListener('gesturestart', e => { e.preventDefault(); gs = 1; });
    svg.addEventListener('gesturechange', e => { e.preventDefault(); if (pts.size) return; this.zoomAt(e.clientX, e.clientY, e.scale / gs); gs = e.scale; });
    // turning the phone goes back to auto
    const mq = root.matchMedia ? root.matchMedia('(orientation: portrait)') : null;
    if (mq) { const r = () => this.resetZoom(); if (mq.addEventListener) mq.addEventListener('change', r); else if (mq.addListener) mq.addListener(r); }
  };
  MapView.prototype.capture = function (e) { try { this.svg.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ } };
  // where the viewBox sits on screen (the board is centred and fitted, like preserveAspectRatio meet)
  MapView.prototype.frame = function (vb) {
    const b = this.svg.getBoundingClientRect(), s = Math.min(b.width / vb[2], b.height / vb[3]);
    return { s, ox: b.left + (b.width - vb[2] * s) / 2, oy: b.top + (b.height - vb[3] * s) / 2 };
  };
  MapView.prototype.setVB = function (vb) {
    const w = clampN(vb[2], W / ZMAX, W), h = w * H / W;
    const auto = w >= W - 0.5;
    this.vb = auto ? BASE.slice() : [clampN(vb[0], 0, W - w), clampN(vb[1], 0, H - h), w, h];
    this.svg.setAttribute('viewBox', this.vb.map(v => +v.toFixed(2)).join(' '));
    if (auto !== this.auto) { this.auto = auto; if (this.onZoom) this.onZoom(auto); }
    if (this.nameEls) this.layoutNames();
  };

  // ---- territory names: always drawn at a readable size on screen (NAME_PX), never over the army pieces,
  // the bonus boxes, the odds tags or each other. A name that has no room is left out (zoom in to see it);
  // a long name tries its short form first. The territories in play (picked, its targets) are always named.
  const SHORTS = {};
  SHORTS.classic = ['Alaska', 'NW Territory', 'Greenland', 'Alberta', 'Ontario', 'Quebec', 'W. US', 'E. US', 'C. America',
    'Venezuela', 'Peru', 'Brazil', 'Argentina', 'Iceland', 'Britain', 'Scandinavia', 'N. Europe', 'W. Europe', 'S. Europe', 'Ukraine',
    'N. Africa', 'Egypt', 'E. Africa', 'Congo', 'S. Africa', 'Madagascar', 'Ural', 'Siberia', 'Yakutsk', 'Kamchatka', 'Irkutsk',
    'Mongolia', 'Japan', 'Afghanistan', 'China', 'Middle East', 'India', 'Siam', 'Indonesia', 'New Guinea', 'W. Australia', 'E. Australia'];
  SHORTS.future = { arctic: 'Arctic', pacific: 'Pacific', plains: 'Plains', mexico: 'Mexico', colombia: 'Colombia', cone: 'S. Cone',
    nordic: 'Nordic', british: 'Britain', weu: 'W. Europe', ceu: 'C. Europe', med: 'Med', eeu: 'E. Europe', caf: 'C. Africa',
    saf: 'S. Africa', casia: 'C. Asia', mideast: 'Mideast', japan: 'Japan', wau: 'W. Australia', eau: 'E. Australia',
    natl: 'Atlantic', satl: 'S. Atlantic', indoc: 'Indian Oc.', pacc: 'Pacific Col.', tranq: 'Tranquility' };
  const NAME_PX = 10, NAME_PX_BIG = 11, ZOOM_ALL = 1.8;
  MapView.SHORT = SHORT; MapView.NAME_PX = NAME_PX;
  MapView.prototype.textW = function (i, short) { // width at font size 10, measured once
    const key = (short ? 's' : 'f') + i; this.tw = this.tw || {};
    if (this.tw[key]) return this.tw[key];
    const s = short ? SHORT[i] : M.T[i].name, tx = this.nameEls[i];
    let w = 0;
    try { const old = tx.textContent, fs = tx.style.fontSize; tx.textContent = s; tx.style.fontSize = '10px'; w = tx.getComputedTextLength(); tx.textContent = old; tx.style.fontSize = fs; } catch (e) { w = 0; }
    if (w > 0) this.tw[key] = w; else w = s.length * 6.1;
    return w;
  };
  MapView.prototype.layoutNames = function () {
    if (!this.nameEls) return;
    const b = this.svg.getBoundingClientRect(), vb = this.vb || BASE;
    const s = Math.min(b.width / vb[2], b.height / vb[3]);
    if (!(s > 0)) return;
    const mode = this.nameMode || { all: true, focus: [] };
    const fu = (b.width >= 600 ? NAME_PX_BIG : NAME_PX) / s; // font size in board units
    const zoomed = W / vb[2] >= ZOOM_ALL;
    const all = mode.all || zoomed;
    const st = this.lastUpdate ? this.lastUpdate[0] : null;
    const k = this.k || 1, R = 12.5 * k;
    // what a name may not cover: pieces, bonus boxes, odds tags
    const block = [], soft = []; // soft: better to cover a bonus box or an odds tag than a piece
    if (st) POS.forEach((p, i) => { if (st.owner[i] >= 0) block.push([p.x - R, p.y - R, p.x + R, p.y + R]); });
    (this.contXY || []).forEach(([x, y]) => soft.push([x - 16 * k, y - 11 * k, x + 16 * k, y + 11 * k]));
    (this.tagBoxes || []).forEach(q => soft.push(q));
    const placed = [];
    if (this.leads) this.leads.innerHTML = '';
    const hits = (bx, list) => list.filter(q => bx[0] < q[2] && bx[2] > q[0] && bx[1] < q[3] && bx[3] > q[1]).length;
    const view = [vb[0], vb[1], vb[0] + vb[2], vb[1] + vb[3]];
    // must: the picked territory and the one it acts on; prefer: its possible targets; then the rest, roomiest first
    const must = new Set(mode.focus || []), prefer = new Set(mode.prefer || []);
    const rank = i => (must.has(i) ? 2 : prefer.has(i) ? 1 : 0);
    const order = POS.map((p, i) => i).sort((a, c) => (rank(c) - rank(a)) || (NEAR[c] - NEAR[a]));
    const pad = fu * 0.12;
    order.forEach(i => {
      const tx = this.nameEls[i], p = POS[i], isF = must.has(i), isP = prefer.has(i);
      const piece = st && st.owner[i] >= 0;
      let done = null;
      if (all || isF || isP) {
        const forms = M.T[i].name.length > 11 ? [false, true] : [false];
        if (b.width < 600 && M.T[i].name.length > 11 && !zoomed) forms.reverse(); // a whole board on a phone: short first
        const tries = [];
        forms.forEach(short => {
          const w = this.textW(i, short) * fu / 10, sx = R + w / 2 + pad * 2;
          const spots = piece ? [[0, R + fu * 0.9], [0, -R - fu * 0.3], [sx, fu * 0.35], [-sx, fu * 0.35]] : [[0, fu * 0.35], [0, fu * 1.2], [0, -fu * 0.5]];
          // a must-name with no room beside its piece moves further out on rings (a thin line points back)
          if (isF) [1.5, 2.1, 2.8, 3.6, 4.5].forEach(m => { for (let a = 0; a < 16; a++) { const an = Math.PI / 2 + a * Math.PI / 8, rr = R * m + fu * 0.6; spots.push([Math.cos(an) * (rr + w / 2 * Math.abs(Math.cos(an))), Math.sin(an) * rr + fu * 0.35, 1]); } });
          spots.forEach(([dx, dy, far]) => {
            const x = p.x + dx, y = p.y + dy;
            const bx = [x - w / 2 - pad, y - fu * 0.8 - pad, x + w / 2 + pad, y + fu * 0.22 + pad];
            const out = bx[0] < view[0] || bx[2] > view[2] || bx[1] < view[1] || bx[3] > view[3];
            tries.push({ x, y, bx, short, far, bad: hits(bx, placed) * 2 + hits(bx, block) + hits(bx, soft) * 0.4 + (out ? 0.5 : 0) });
          });
        });
        done = tries.find(t => t.bad === 0) || (isF ? tries.slice().sort((a, c) => a.bad - c.bad)[0] : null);
      }
      if (done) {
        placed.push(done.bx);
        const txt = done.short ? SHORT[i] : M.T[i].name;
        if (tx.textContent !== txt) tx.textContent = txt;
        tx.setAttribute('x', done.x.toFixed(1)); tx.setAttribute('y', done.y.toFixed(1));
        tx.style.fontSize = fu.toFixed(2) + 'px'; tx.style.strokeWidth = (fu * 0.26).toFixed(2) + 'px';
        tx.classList.add('on'); tx.classList.toggle('focus', isF);
        if (done.far) { // leader from the piece's edge to the nearest point of the name
          const cx = Math.max(done.bx[0], Math.min(p.x, done.bx[2])), cy = Math.max(done.bx[1], Math.min(p.y, done.bx[3])), d = Math.hypot(cx - p.x, cy - p.y) || 1;
          el('line', { x1: (p.x + (cx - p.x) * R / d).toFixed(1), y1: (p.y + (cy - p.y) * R / d).toFixed(1), x2: cx.toFixed(1), y2: cy.toFixed(1), 'stroke-width': (fu * 0.14).toFixed(2) }, this.leads);
        }
      } else tx.classList.remove('on', 'focus');
    });
  };
  // zoom by f keeping the board point under the screen point (cx, cy) still
  MapView.prototype.zoomAt = function (cx, cy, f, glide) {
    const vb = this.glideTo || this.vb, a = this.frame(vb);
    const ux = vb[0] + (cx - a.ox) / a.s, uy = vb[1] + (cy - a.oy) / a.s;
    const w = clampN(vb[2] / f, W / ZMAX, W), h = w * H / W, nb = this.frame([0, 0, w, h]);
    const next = [ux - (cx - nb.ox) / nb.s, uy - (cy - nb.oy) / nb.s, w, h];
    if (glide) this.glide(next); else { this.stopGlide(); this.setVB(next); }
  };
  MapView.prototype.panBy = function (dx, dy) {
    const s = this.frame(this.vb).s;
    this.setVB([this.vb[0] - dx / s, this.vb[1] - dy / s, this.vb[2], this.vb[3]]);
  };
  MapView.prototype.zoomBy = function (f) { const b = this.svg.getBoundingClientRect(); this.zoomAt(b.left + b.width / 2, b.top + b.height / 2, f, true); };
  MapView.prototype.fit = function () { this.glide(BASE); };
  // zoom in with territory t in the middle (the + button while a territory is picked: zoom to the action)
  MapView.prototype.zoomOn = function (t, f) {
    const vb = this.glideTo || this.vb, w = clampN(vb[2] / f, W / ZMAX, W), h = w * H / W, p = POS[t];
    this.glide([p.x - w / 2, p.y - h / 2, w, h]);
  };
  MapView.prototype.resetZoom = function () { this.stopGlide(); this.setVB(BASE); };
  MapView.prototype.stopGlide = function () { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; this.glideTo = null; };
  MapView.prototype.glide = function (to) {
    this.stopGlide();
    // clamp the target first so the glide ends where it will stay
    const w = clampN(to[2], W / ZMAX, W), h = w * H / W;
    to = w >= W - 0.5 ? BASE.slice() : [clampN(to[0], 0, W - w), clampN(to[1], 0, H - h), w, h];
    const from = this.vb.slice(), t0 = performance.now();
    const still = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const D = still ? 0 : 260;
    this.glideTo = to;
    const step = now => {
      const k = D ? Math.min(1, (now - t0) / D) : 1, e = 1 - Math.pow(1 - k, 3);
      // the zoom glides evenly (log scale) so it does not rush at the start
      const wz = from[2] * Math.pow(to[2] / from[2], e);
      const p = (to[2] === from[2]) ? e : (from[2] - wz) / (from[2] - to[2]);
      this.setVB([from[0] + (to[0] - from[0]) * p, from[1] + (to[1] - from[1]) * p, wz, wz * H / W]);
      if (k < 1) this.raf = requestAnimationFrame(step); else { this.raf = 0; this.glideTo = null; this.setVB(to); }
    };
    this.raf = requestAnimationFrame(step);
  };

  MapView.prototype.update = function (st, ui) {
    ui = ui || {};
    const P = st.players;
    for (let i = 0; i < M.N; i++) {
      const o = st.owner[i], path = this.paths[i], b = this.badges[i];
      const col = o >= 0 ? P[o].hex : '#3a4152';
      path.style.fill = ui.heat ? ui.heat[i] : BOARD[M.CONTINENTS[M.T[i].ci].id];
      path.classList.toggle('sel', ui.sel === i);
      path.classList.toggle('tgt', !!(ui.targets && ui.targets.has(i)));
      path.classList.toggle('dim', !!(ui.targets && ui.sel !== undefined && ui.sel !== null && ui.sel >= 0 && ui.sel !== i && !ui.targets.has(i)));
      const n = st.armies[i];
      if (b.tx.textContent !== String(n)) {
        b.tx.textContent = n;
        b.tx.classList.toggle('n3', n >= 100);
        if (b.g.dataset.n !== undefined) { b.c.classList.remove('pop'); void b.c.getBBox(); b.c.classList.add('pop'); }
        b.g.dataset.n = n;
      }
      b.c.style.fill = col;
      b.g.classList.toggle('dark', o >= 0 && (P[o].color === 'yellow' || P[o].color === 'neutral'));
      b.g.classList.toggle('hidden', o < 0);
      b.g.classList.toggle('sel', ui.sel === i);
      b.g.classList.toggle('cap', st.players.some(p => p.capital === i));
    }
    // odds tags beside their targets: each goes to the side of its piece where it hides the fewest other pieces
    this.lastUpdate = [st, ui];
    this.tags.innerHTML = '';
    this.tagBoxes = [];
    if (ui.tags) {
      const k = this.k || 1, tk = Math.max(1, k * 0.8), R = 12.5 * k, hh = 9 * tk, placed = [];
      let hw = 20 * tk;
      const pieces = POS.filter((p, i) => st.owner[i] >= 0);
      const cost = (cx, cy) => {
        let c = 0;
        pieces.forEach(p => { const dx = Math.max(Math.abs(p.x - cx) - hw, 0), dy = Math.max(Math.abs(p.y - cy) - hh, 0), d = Math.hypot(dx, dy); if (d < R + 1) c += 10 + (R + 1 - d); });
        placed.forEach(q => { const ox = hw + q[2] + 2 - Math.abs(q[0] - cx), oy = 2 * hh + 2 - Math.abs(q[1] - cy); if (ox > 0 && oy > 0) c += 10 + ox * oy / 20; });
        if (cx - hw < 0 || cx + hw > W || cy - hh < 0 || cy + hh > H) c += 50;
        return c;
      };
      ui.tags.forEach((txt, t) => {
        // the tag is just wide enough for its text ("97%", ">99%")
        const tw = Math.max(30, String(txt.text).length * 7 + 6); hw = tw / 2 * tk;
        const p = POS[t], up = R + hh + 1, side = R + hw + 1;
        const spots = [[0, -up], [0, up], [side, 0], [-side, 0], [side * .8, -up * .9], [-side * .8, -up * .9], [side * .8, up * .9], [-side * .8, up * .9], [0, -up - 2 * hh], [0, up + 2 * hh]];
        let best = null;
        spots.forEach(([dx, dy], n) => { const c = cost(p.x + dx, p.y + dy) + n * 0.01; if (!best || c < best[0]) best = [c, p.x + dx, p.y + dy]; });
        placed.push([best[1], best[2], hw]);
        this.tagBoxes.push([best[1] - hw, best[2] - hh, best[1] + hw, best[2] + hh]);
        const g = el('g', { transform: `translate(${best[1].toFixed(1)},${(best[2] + tk).toFixed(1)})${tk === 1 ? '' : ` scale(${tk})`}`, class: 'tag', 'data-t': t }, this.tags);
        el('rect', { x: -tw / 2, y: -10, width: tw, height: 18, rx: 5, fill: txt.bg || '#0f1117' }, g);
        const tx = el('text', { y: 4 }, g); tx.textContent = txt.text;
      });
    }
    this.marks.innerHTML = '';
    if (ui.arrow) {
      const [a, b] = ui.arrow, A = POS[a], B = POS[b];
      if (Math.abs(A.x - B.x) < 500) el('line', { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: 'arrow' }, this.marks);
    }
    this.svg.classList.toggle('show-names', !!ui.names);
    this.svg.classList.toggle('ingame', P.length > 0); // owners' colours now carry the map; continent outlines step back
    const focus = new Set();
    if (ui.sel != null && ui.sel >= 0) focus.add(ui.sel);
    if (ui.arrow) ui.arrow.forEach(t => focus.add(t));
    this.nameMode = { all: !!ui.names, focus: [...focus], prefer: ui.targets ? [...ui.targets] : [] };
    this.layoutNames();
  };

  MapView.BOARD = BOARD; MapView.EDGE = EDGE; MapView.POS = POS;
  root.MapView = MapView;
})(window);
