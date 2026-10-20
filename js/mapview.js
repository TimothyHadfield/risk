// Draws the board (our own SVG world map) and keeps it in sync with a state.
// Built once; later updates only change fills, numbers and highlights so
// nothing jumps.
(function (root) {
  'use strict';
  const M = root.RiskMap, G = root.RiskGeo;
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };

  // where each continent's bonus badge sits
  const CONT_LABEL = { na: [70, 250], sa: [330, 470], eu: [600, 30], af: [430, 470], as: [896, 268], au: [968, 380] };
  // the printed board: each continent in its own colour (like the real board); owners show by their armies
  const BOARD = { na: '#e0b648', sa: '#d4683f', eu: '#5d87c2', af: '#b77b47', as: '#7ea558', au: '#9a6cae' };
  const EDGE = { na: '#8a6a17', sa: '#7d3219', eu: '#2b4a78', af: '#6a421f', as: '#3f5e26', au: '#573a66' };

  function MapView(svg, onTap) {
    this.svg = svg; this.onTap = onTap;
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
    // sea lanes / land links
    const links = el('g', { class: 'links' }, svg);
    G.links.forEach(([a, b]) => {
      const A = G.terr[a], B = G.terr[b];
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
      const g = el('g', { transform: `translate(${x},${y})` }, cl);
      const s = el('g', { class: 'sc' }, g);
      // printed on the board: a cream label edged in the continent's colour
      el('rect', { x: -16, y: -11, width: 32, height: 22, rx: 3, fill: '#f4ecd6', stroke: BOARD[c.id], 'stroke-width': 2.2 }, s);
      const tx = el('text', { y: 5, fill: EDGE[c.id] }, s); tx.textContent = '+' + c.bonus;
      return g;
    });
    // selection ring + odds labels + army badges
    this.marks = el('g', { class: 'marks' }, svg);
    this.badges = G.terr.map((t, i) => {
      const g = el('g', { class: 'badge', transform: `translate(${t.x},${t.y})`, 'data-t': i }, svg);
      // a bigger invisible tap area, never past halfway to the next badge
      const near = Math.min(...G.terr.map((u, j) => (j === i ? 1e9 : Math.hypot(u.x - t.x, u.y - t.y))));
      el('circle', { r: Math.min(24, near / 2).toFixed(1), class: 'hit' }, g);
      // the armies standing on it: a plastic piece in the owner's colour with the count on top
      const s = el('g', { class: 'sc' }, g);
      const c = el('circle', { r: 12.5, class: 'face', filter: 'url(#piece)' }, s);
      el('circle', { r: 12.5, class: 'shine', fill: 'url(#shine)' }, s);
      const tx = el('text', { y: 4.6 }, s);
      return { g, c, tx, star: null };
    });
    this.names = el('g', { class: 'names' }, svg);
    G.terr.forEach((t, i) => { const tx = el('text', { x: t.x, y: t.y + 24 }, this.names); tx.textContent = M.T[i].name; });
    this.tags = el('g', { class: 'tags' }, svg);
    // phone: the board is drawn at ~0.4x, so numbers and labels get a size boost
    const mq = root.matchMedia ? root.matchMedia('(max-width: 899px)') : null;
    const setScale = () => {
      this.k = mq && mq.matches ? 1.36 : 1;
      svg.querySelectorAll('.sc').forEach(s => { if (this.k === 1) s.removeAttribute('transform'); else s.setAttribute('transform', `scale(${this.k})`); });
    };
    setScale();
    if (mq) { if (mq.addEventListener) mq.addEventListener('change', setScale); else if (mq.addListener) mq.addListener(setScale); }
    const hit = e => { const t = e.target.closest('[data-t]'); if (t) this.onTap(+t.getAttribute('data-t')); };
    svg.addEventListener('click', hit);
    this.initZoom();
  }

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
        if (b.g.dataset.n !== undefined) { b.c.classList.remove('pop'); void b.c.getBBox(); b.c.classList.add('pop'); }
        b.g.dataset.n = n;
      }
      b.c.style.fill = col;
      b.g.classList.toggle('dark', o >= 0 && (P[o].color === 'yellow' || P[o].color === 'neutral'));
      b.g.classList.toggle('hidden', o < 0);
      b.g.classList.toggle('sel', ui.sel === i);
      b.g.classList.toggle('cap', st.players.some(p => p.capital === i));
    }
    // odds tags over targets
    this.tags.innerHTML = '';
    if (ui.tags) ui.tags.forEach((txt, t) => {
      const k = this.k || 1;
      const g = el('g', { transform: `translate(${G.terr[t].x},${G.terr[t].y - 22 * k})${k === 1 ? '' : ` scale(${k})`}`, class: 'tag' }, this.tags);
      el('rect', { x: -20, y: -10, width: 40, height: 18, rx: 5, fill: txt.bg || '#0f1117' }, g);
      const tx = el('text', { y: 4 }, g); tx.textContent = txt.text;
    });
    this.marks.innerHTML = '';
    if (ui.arrow) {
      const [a, b] = ui.arrow, A = G.terr[a], B = G.terr[b];
      if (Math.abs(A.x - B.x) < 500) el('line', { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: 'arrow' }, this.marks);
    }
    this.svg.classList.toggle('show-names', !!ui.names);
    this.svg.classList.toggle('ingame', P.length > 0); // owners' colours now carry the map; continent outlines step back
  };

  MapView.BOARD = BOARD; MapView.EDGE = EDGE;
  root.MapView = MapView;
})(window);
