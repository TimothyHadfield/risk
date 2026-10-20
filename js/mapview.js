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

  function MapView(svg, onTap) {
    this.svg = svg; this.onTap = onTap;
    svg.setAttribute('viewBox', '0 0 1000 560');
    svg.innerHTML = '';
    const defs = el('defs', {}, svg);
    defs.innerHTML = `
      <radialGradient id="sea" gradientUnits="userSpaceOnUse" cx="500" cy="252" r="750" gradientTransform="translate(0 110.9) scale(1 .56)"><stop offset="0" stop-color="#16213a"/><stop offset="1" stop-color="#0d1322"/></radialGradient>
      <pattern id="waves" width="28" height="14" patternUnits="userSpaceOnUse"><path d="M0 10 Q7 6 14 10 T28 10" fill="none" stroke="#1d2a47" stroke-width="1"/></pattern>
      <filter id="lift" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000" flood-opacity=".55"/></filter>`;
    // the sea runs past the frame so a laptop's taller map box shows ocean, not a gap
    el('rect', { x: -500, y: -400, width: 2000, height: 1360, fill: 'url(#sea)' }, svg);
    el('rect', { x: -500, y: -400, width: 2000, height: 1360, fill: 'url(#waves)', opacity: .7 }, svg);
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
    G.terr.forEach((t, i) => el('path', { d: t.d, stroke: M.CONTINENTS[M.T[i].ci].color }, coast));
    const inner = el('g', { class: 'inner' }, svg);
    if (G.inner) el('path', { d: G.inner }, inner);
    // continent bonus badges
    const cl = el('g', { class: 'contlab' }, svg);
    this.contBadges = M.CONTINENTS.map((c, ci) => {
      const [x, y] = G.cont ? G.cont[ci] : CONT_LABEL[c.id];
      const g = el('g', { transform: `translate(${x},${y})` }, cl);
      const s = el('g', { class: 'sc' }, g);
      el('rect', { x: -16, y: -11, width: 32, height: 22, rx: 6, fill: '#0f1117', stroke: c.color, 'stroke-width': 1.5 }, s);
      const tx = el('text', { y: 5, fill: c.color }, s); tx.textContent = '+' + c.bonus;
      return g;
    });
    // selection ring + odds labels + army badges
    this.marks = el('g', { class: 'marks' }, svg);
    this.badges = G.terr.map((t, i) => {
      const g = el('g', { class: 'badge', transform: `translate(${t.x},${t.y})`, 'data-t': i }, svg);
      // a bigger invisible tap area, never past halfway to the next badge
      const near = Math.min(...G.terr.map((u, j) => (j === i ? 1e9 : Math.hypot(u.x - t.x, u.y - t.y))));
      el('circle', { r: Math.min(24, near / 2).toFixed(1), class: 'hit' }, g);
      const s = el('g', { class: 'sc' }, g);
      const c = el('circle', { r: 12.5, class: 'face' }, s);
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
  }

  MapView.prototype.update = function (st, ui) {
    ui = ui || {};
    const P = st.players;
    for (let i = 0; i < M.N; i++) {
      const o = st.owner[i], path = this.paths[i], b = this.badges[i];
      const col = o >= 0 ? P[o].hex : '#3a4152';
      path.style.fill = ui.heat ? ui.heat[i] : col;
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

  root.MapView = MapView;
})(window);
