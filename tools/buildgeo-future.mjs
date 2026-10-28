// Builds js/geo-future.js: the "Future Earth" board (our own design, not any official map).
// The real world from Natural Earth coastlines (public domain) cut into new territories,
// with low coasts and deltas drowned by the risen seas, four domed ocean colonies drawn
// as hexagons, and the Moon (three bases) drawn in the southern sky. Build time only.
//   npm install                       (once; dev dependencies only)
//   node tools/buildgeo-future.mjs    -> writes js/geo-future.js and prints the border check
// The board's borders live in js/map.js (FUTURE_EDGES); this script checks the drawing against them.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { geoProject, geoMiller } from 'd3-geo-projection';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const topojson = require('topojson-client');
const simp = require('topojson-simplify');
const pc = require('polygon-clipping');
const polylabel = require('polylabel');
const world = require('world-atlas/countries-50m.json');
const lakes = JSON.parse(fs.readFileSync(path.join(here, 'data', 'lakes.json'), 'utf8'));
const M = require('../js/map.js');
M.use('future');
const K = M.BY_KEY;

const W = 1000, H = 560;
const LON0 = 11;                 // centre meridian: Alaska on the left edge, Kamchatka on the right
const LAT_TOP = 85, LAT_BOT = -58;
const SIMPLIFY = 0.012;          // square degrees (planar triangle area); smaller = more detail

// ------------------------------------------------------------ projection (Miller, a touch taller)
const S = W / (2 * Math.PI);
const Yraw = lat => 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat * Math.PI / 180));
const B = H / (S * (Yraw(LAT_TOP) - Yraw(LAT_BOT)));      // vertical stretch (~1.1)
const A = B * S * Yraw(LAT_TOP);
const fy = yd3 => A + B * yd3;                            // d3 gives y = -S*Yraw
const P = (lon, lat) => [W / 2 + (lon - LON0) * Math.PI / 180 * S, fy(-S * Yraw(lat))];
const inv = ([x, y]) => {
  const lon = LON0 + (x - W / 2) / S * 180 / Math.PI;
  const yr = -((y - A) / B) / S;
  const lat = (Math.atan(Math.exp(yr / 1.25)) - Math.PI / 4) / 0.4 * 180 / Math.PI;
  return [lon, lat];
};
const proj = geoMiller().rotate([-LON0, 0]).scale(S).translate([W / 2, 0]).precision(0);
const mapRing = r => r.map(([x, y]) => [x, fy(y)]);
function toPolys(geom) { // projected GeoJSON geometry -> array of polygons (rings)
  if (!geom) return [];
  const g = geoProject(geom, proj);
  const t = g.type === 'Feature' ? g.geometry : g;
  if (!t) return [];
  if (t.type === 'Polygon') return [t.coordinates.map(mapRing)];
  if (t.type === 'MultiPolygon') return t.coordinates.map(p => p.map(mapRing));
  return [];
}
const boxLL = (lo0, la0, lo1, la1) => [[P(lo0, la0), P(lo1, la0), P(lo1, la1), P(lo0, la1), P(lo0, la0)]];
const polyLL = pts => [pts.concat([pts[0]]).map(([lo, la]) => P(lo, la))];

// ------------------------------------------------------------ who owns what
const C = {
  fna: { alaska: 0, arctic: 0, greenland: ['Greenland'], pacific: 0, plains: 0, east: ['Bermuda', 'St. Pierre and Miquelon'],
    mexico: ['Mexico', 'Guatemala', 'Belize', 'Honduras', 'El Salvador', 'Nicaragua', 'Costa Rica', 'Panama', 'Cuba', 'Jamaica', 'Haiti', 'Dominican Rep.', 'Bahamas', 'Puerto Rico', 'Cayman Is.', 'Turks and Caicos Is.', 'U.S. Virgin Is.', 'British Virgin Is.', 'Anguilla', 'St-Martin', 'Sint Maarten', 'St-Barthélemy', 'St. Kitts and Nevis', 'Antigua and Barb.', 'Montserrat', 'Dominica', 'Saint Lucia', 'St. Vin. and Gren.', 'Barbados', 'Grenada'] },
  fsa: { colombia: ['Venezuela', 'Colombia', 'Guyana', 'Suriname', 'Trinidad and Tobago', 'Aruba', 'Curaçao'],
    andes: ['Peru', 'Bolivia'], amazon: 0, cone: ['Argentina', 'Uruguay', 'Paraguay', 'Falkland Is.'] },
  feu: { nordic: ['Norway', 'Sweden', 'Finland', 'Åland', 'Iceland', 'Denmark', 'Faeroe Is.'],
    british: ['United Kingdom', 'Ireland', 'Isle of Man', 'Jersey', 'Guernsey'],
    weu: ['France', 'Spain', 'Portugal', 'Andorra', 'Monaco', 'Belgium', 'Netherlands', 'Luxembourg', 'Switzerland', 'Liechtenstein'],
    ceu: ['Germany', 'Poland', 'Czechia', 'Slovakia', 'Austria', 'Hungary', 'Slovenia', 'Lithuania', 'Latvia', 'Estonia'],
    med: ['Italy', 'Vatican', 'San Marino', 'Malta', 'Croatia', 'Bosnia and Herz.', 'Serbia', 'Montenegro', 'Kosovo', 'Albania', 'Macedonia', 'Greece', 'Bulgaria', 'Romania'],
    eeu: ['Ukraine', 'Belarus', 'Moldova'] },
  faf: { maghreb: ['Morocco', 'W. Sahara', 'Algeria', 'Tunisia', 'Libya'],
    nile: ['Egypt', 'Sudan', 'S. Sudan'],
    waf: ['Mauritania', 'Mali', 'Niger', 'Senegal', 'Gambia', 'Guinea-Bissau', 'Guinea', 'Sierra Leone', 'Liberia', "Côte d'Ivoire", 'Burkina Faso', 'Ghana', 'Togo', 'Benin', 'Nigeria', 'Cabo Verde', 'Saint Helena'],
    caf: ['Chad', 'Central African Rep.', 'Cameroon', 'Eq. Guinea', 'Gabon', 'Congo', 'Dem. Rep. Congo', 'São Tomé and Principe', 'Angola'],
    eaf: ['Ethiopia', 'Eritrea', 'Djibouti', 'Somalia', 'Somaliland', 'Kenya', 'Uganda', 'Rwanda', 'Burundi', 'Tanzania', 'Seychelles'],
    saf: ['South Africa', 'Namibia', 'Botswana', 'Zimbabwe', 'Zambia', 'Mozambique', 'Malawi', 'Lesotho', 'eSwatini', 'Madagascar', 'Comoros', 'Mauritius'] },
  fas: { urals: 0, siberia: 0, fareast: 0,
    casia: ['Kazakhstan', 'Uzbekistan', 'Turkmenistan', 'Kyrgyzstan', 'Tajikistan'],
    mideast: ['Turkey', 'Syria', 'Lebanon', 'Israel', 'Palestine', 'Jordan', 'Iraq', 'Cyprus', 'N. Cyprus', 'Georgia', 'Armenia', 'Azerbaijan'],
    arabia: ['Saudi Arabia', 'Yemen', 'Oman', 'United Arab Emirates', 'Qatar', 'Bahrain', 'Kuwait'],
    persia: ['Iran', 'Afghanistan', 'Pakistan'],
    india: ['India', 'Nepal', 'Bhutan', 'Bangladesh', 'Sri Lanka', 'Siachen Glacier', 'Maldives'],
    nchina: ['Mongolia'], schina: ['Taiwan', 'Hong Kong', 'Macao'],
    japan: ['Japan', 'North Korea', 'South Korea'],
    indochina: ['Myanmar', 'Thailand', 'Laos', 'Cambodia', 'Vietnam', 'Singapore'] },
  foc: { indonesia: ['Brunei', 'Timor-Leste', 'Philippines'], newguinea: ['Papua New Guinea', 'Solomon Is.'], wau: 0, eau: 0 },
};
// land drawn grey (not part of any territory)
const BACKGROUND = ['New Zealand', 'Fiji', 'New Caledonia', 'Vanuatu',
  'Micronesia', 'Marshall Is.', 'N. Mariana Is.', 'Guam', 'American Samoa', 'Br. Indian Ocean Ter.', 'Pitcairn Is.', 'Tonga', 'Samoa', 'Palau', 'Niue', 'Cook Is.', 'Nauru', 'Kiribati',
  'Wallis and Futuna Is.', 'Fr. Polynesia', 'Indian Ocean Ter.', 'Norfolk Island', 'Ashmore and Cartier Is.'];
const OWNER = {};
BACKGROUND.forEach(n => { OWNER[n] = null; });
Object.values(C).forEach(cont => Object.entries(cont).forEach(([key, list]) => { if (list) list.forEach(n => { OWNER[n] = key; }); }));
// overseas bits of a country that belong elsewhere (by the piece's centre, lon/lat)
const PIECE = {
  France: (lo, la) => (lo < -45 && lo > -56 && la > 0 ? 'colombia' : lo < -20 || la < 20 ? null : 'weu'),
  Netherlands: (lo) => (lo < -20 ? null : 'weu'),
  Norway: (lo, la) => (la > 72 && lo < 0 ? null : 'nordic'),
  Ecuador: (lo) => (lo < -85 ? null : 'colombia'),
  Malaysia: (lo) => (lo > 108 ? 'indonesia' : 'indochina'),
};
// cut lines for the big countries: [territory, region (lon/lat polygon) or null = the rest]
const SPLIT = {
  'United States of America': [
    ['alaska', polyLL([[-169, 51], [-129.9, 51], [-129.9, 80], [-169, 80]])],
    ['pacific', polyLL([[-129.9, 24], [-111, 24], [-111, 50], [-129.9, 50]])],
    ['plains', polyLL([[-111, 24], [-92, 24], [-92, 50], [-111, 50]])],
    ['east', polyLL([[-92, 24], [-60, 24], [-60, 50], [-92, 50]])],
    [null, null], // Hawaii, the far Aleutians
  ],
  Canada: [
    ['pacific', polyLL([[-145, 40], [-110, 40], [-110, 58], [-145, 58]])],
    ['plains', polyLL([[-110, 40], [-88, 40], [-88, 56], [-110, 56]])],
    ['east', polyLL([[-88, 40], [-50, 40], [-50, 52], [-88, 52]])],
    ['arctic', null],
  ],
  Russia: [
    ['ceu', polyLL([[19, 54], [23, 54], [23, 56], [19, 56]])], // Kaliningrad
    ['eeu', polyLL([[20, 40], [46, 40], [46, 84], [20, 84]])],
    ['urals', polyLL([[46, 40], [74, 40], [74, 84], [46, 84]])],
    ['siberia', polyLL([[74, 40], [108, 40], [108, 84], [74, 84]])],
    ['fareast', null],
  ],
  China: [
    ['nchina', polyLL([[70, 35], [136, 35], [136, 54], [70, 54]])],
    ['schina', null],
  ],
  Brazil: [
    ['amazon', polyLL([[-75, -13], [-30, -13], [-30, 6], [-75, 6]])],
    ['cone', null],
  ],
  Chile: [
    ['andes', polyLL([[-80, -27], [-60, -27], [-60, -15], [-80, -15]])],
    [null, polyLL([[-120, -60], [-80, -60], [-80, -15], [-120, -15]])], // Pacific islands
    ['cone', null],
  ],
  Indonesia: [
    ['newguinea', polyLL([[130.8, -11], [142, -11], [142, 0], [130.8, 0]])], // west New Guinea
    ['indonesia', null],
  ],
  Australia: [
    ['wau', polyLL([[110, -45], [133, -45], [133, -9], [110, -9]])],
    ['eau', null],
  ],
};
// the seas rose: low coasts and deltas are under water (drawn as shallow sea). [lon, lat, radius in degrees]
const FLOOD = [
  [-81, 25.6, 2.2],    // south Florida
  [-90.5, 29.3, 1.2],  // Mississippi delta
  [-76.2, 36.4, 0.9],  // Chesapeake shore
  [4.9, 52.6, 1.2],    // the Low Countries
  [12.4, 45.3, 0.7],   // Venice lagoon
  [31.2, 31.1, 0.9],   // Nile delta
  [90, 22.4, 1.4],     // Ganges delta
  [106, 9.6, 1.1],     // Mekong delta
  [121.1, 31.4, 1.0],  // Yangtze delta
  [-49.8, -0.4, 1.4],  // Amazon mouth
  [47.8, 29.9, 0.9],   // Shatt al-Arab
];
const circLL = (lo, la, r) => [Array.from({ length: 25 }, (_, k) => { const a = (k % 24) / 24 * 2 * Math.PI; return P(lo + r * Math.cos(a) / Math.cos(la * Math.PI / 180), la + r * Math.sin(a)); })];
// ocean colonies: domed sea platforms (hexagons); the Moon drawn in the southern sky over the Indian Ocean
const COLONY = { natl: [-38, 40], satl: [-15, -22], indoc: [75, -15], pacc: [-150, 18] };
const HEX = 17;
const hexAt = ([x, y]) => [[[0, 1, 2, 3, 4, 5, 0].map(k => [x + HEX * Math.cos(k * Math.PI / 3), y + HEX * Math.sin(k * Math.PI / 3)])]];
const MOON = { x: 712, y: 494, r: 50 };
const sector = (a0, a1) => { const pts = [[MOON.x, MOON.y]]; for (let a = a0; a <= a1 + 1e-9; a += 5) pts.push([MOON.x + MOON.r * Math.cos(a * Math.PI / 180), MOON.y + MOON.r * Math.sin(a * Math.PI / 180)]); pts.push([MOON.x, MOON.y]); return [[pts]]; };
const MOONP = { tranq: sector(-150, -30), farside: sector(-30, 90), shack: sector(90, 210) };

// ------------------------------------------------------------ geometry helpers
const area = r => { let s = 0; for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return s / 2; };
const polyArea = p => Math.abs(area(p[0])) - p.slice(1).reduce((s, h) => s + Math.abs(area(h)), 0);
const cent = r => { let cx = 0, cy = 0, a = 0; for (let i = 0; i < r.length - 1; i++) { const f = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; a += f; cx += (r[i][0] + r[i + 1][0]) * f; cy += (r[i][1] + r[i + 1][1]) * f; } return [cx / (3 * a), cy / (3 * a)]; };
function pip(pt, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; }
const inPoly = (pt, poly) => pip(pt, poly[0]) && !poly.slice(1).some(h => pip(pt, h));
const inMulti = (pt, mp) => mp.some(p => inPoly(pt, p));
const FRAME = [[[0, 0], [W, 0], [W, H], [0, H], [0, 0]]];
const r1 = n => Math.round(n * 10) / 10;
const distSeg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; let t = L2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };


// ------------------------------------------------------------ build
const topo = simp.presimplify(world);
const simple = simp.simplify(topo, SIMPLIFY);
const countries = topojson.feature(simple, simple.objects.countries).features;
function dp(pts, tol) { // Douglas-Peucker on a closed ring (lon/lat)
  if (pts.length < 5) return pts;
  const keep = new Array(pts.length).fill(false); keep[0] = keep[pts.length - 1] = true;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [i, j] = st.pop(); let best = -1, bd = tol;
    for (let k = i + 1; k < j; k++) { const d = distSeg(pts[k], pts[i], pts[j]); if (d > bd) { bd = d; best = k; } }
    if (best > 0) { keep[best] = true; st.push([i, best], [best, j]); }
  }
  const out = pts.filter((_, k) => keep[k]);
  return out.length >= 4 ? out : pts;
}
const lakeGeo = lakes.features.flatMap(f => {
  const g = f.geometry, rings = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return toPolys({ type: 'MultiPolygon', coordinates: rings.map(p => p.map(r => dp(r.slice(0, -1).concat([r[0]]), 0.05))) });
});
const FLOODP = pc.union(...FLOOD.map(([lo, la, r]) => [circLL(lo, la, r)]));
const LAKES = lakeGeo.length ? pc.union(...lakeGeo) : [];

const pieces = M.T.map(() => []); // per territory: list of polygons
const bg = [], drowned = [];
const unowned = new Set();
countries.forEach(f => {
  const name = f.properties.name;
  if (name === 'Antarctica' || name === 'Fr. S. Antarctic Lands' || name === 'Heard I. and McDonald Is.' || name === 'S. Geo. and the Is.') return;
  let polys = toPolys(f.geometry).filter(p => p[0].length > 3);
  if (!polys.length) return;
  polys = pc.intersection(polys, FRAME);
  if (LAKES.length) polys = pc.difference(polys, LAKES);
  const wet = pc.intersection(polys, FLOODP);
  if (wet.length) { drowned.push(...wet); polys = pc.difference(polys, FLOODP); }
  if (SPLIT[name]) {
    let rest = polys;
    SPLIT[name].forEach(([key, region]) => {
      const part = region ? pc.intersection(rest, region) : rest;
      if (region) rest = pc.difference(rest, region);
      part.forEach(p => (key ? pieces[K[key]].push(p) : bg.push(p)));
    });
    return;
  }
  polys.forEach(p => {
    const [lo, la] = inv(cent(p[0]));
    let key = PIECE[name] ? PIECE[name](lo, la) : OWNER[name];
    if (key === undefined) { unowned.add(name); key = null; }
    if (key) pieces[K[key]].push(p); else bg.push(p);
  });
});

const MIN_AREA = 2; // px^2: smaller specks are dropped
const terrs = pieces.map(ps => (ps.length ? pc.union(...ps.map(p => [p])) : []).filter(p => polyArea(p) > MIN_AREA)
  .map(p => [p[0]].concat(p.slice(1).filter(h => Math.abs(area(h)) > MIN_AREA))));
const bgU = bg.length ? pc.union(...bg.map(p => [p])).filter(p => polyArea(p) > 1.5) : [];

// T-junctions: where one side of a border has a vertex the other side lacks, add it,
// so both sides of every border are made of the very same segments
function fixTJunctions(all) {
  const CELL = 4, grid = new Map(), ck = (x, y) => x + ',' + y;
  all.forEach(mp => mp.forEach(p => p.forEach(r => r.forEach(v => {
    const k = ck(Math.floor(v[0] / CELL), Math.floor(v[1] / CELL));
    if (!grid.has(k)) grid.set(k, []); grid.get(k).push(v);
  }))));
  let added = 0;
  all.forEach(mp => mp.forEach(p => p.forEach((r, ri) => {
    const out = [];
    for (let i = 0; i < r.length - 1; i++) {
      const a = r[i], b = r[i + 1]; out.push(a);
      const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
      if (L2 < 1e-12) continue;
      const cand = [];
      const x0 = Math.floor(Math.min(a[0], b[0]) / CELL), x1 = Math.floor(Math.max(a[0], b[0]) / CELL);
      const y0 = Math.floor(Math.min(a[1], b[1]) / CELL), y1 = Math.floor(Math.max(a[1], b[1]) / CELL);
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) (grid.get(ck(gx, gy)) || []).forEach(v => {
        const t = ((v[0] - a[0]) * dx + (v[1] - a[1]) * dy) / L2;
        if (t <= 1e-9 || t >= 1 - 1e-9) return;
        const dist = Math.abs((v[0] - a[0]) * dy - (v[1] - a[1]) * dx) / Math.sqrt(L2);
        if (dist < 1e-4) cand.push([t, v]);
      });
      cand.sort((u, w) => u[0] - w[0]);
      cand.forEach(([, v]) => { const l = out[out.length - 1]; if (Math.abs(l[0] - v[0]) + Math.abs(l[1] - v[1]) > 1e-9) { out.push(v); added++; } });
    }
    out.push(r[r.length - 1]); p[ri] = out;
  })));
  return added;
}
const tj = fixTJunctions(terrs);

// ------------------------------------------------------------ smooth warp: Europe drawn a little larger
// (the real board does the same; one smooth bump, applied to every point so land and borders stay together)
const WARP = [{ c: P(14, 50), s: 95, m: 0.45 }];
function warp([x, y]) {
  let dx = 0, dy = 0;
  WARP.forEach(({ c, s, m }) => {
    const vx = x - c[0], vy = y - c[1], d2 = vx * vx + vy * vy;
    const k = m * Math.exp(-d2 / (2 * s * s));
    dx += vx * k; dy += vy * k;
  });
  return [x + dx, y + dy];
}
// long straight cuts get extra points first so they bend smoothly with the warp
const dens = r => { const o = []; for (let i = 0; i < r.length - 1; i++) { const a = r[i], b = r[i + 1], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 8); for (let k = 0; k < n; k++) o.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); } o.push(r[r.length - 1]); return o; };
const warpMP = mp => mp.map(p => p.map(r => dens(r).map(warp)));
const T = terrs.map(warpMP);
const BG = warpMP(bgU);
const SHALLOW = warpMP(drowned.length ? pc.union(...drowned.map(p => [p])) : []);
// colonies and Moon bases: drawn in board pixels after the warp
Object.entries(COLONY).forEach(([k, ll]) => { T[K[k]] = hexAt(warp(P(...ll))); });
Object.entries(MOONP).forEach(([k, mp]) => { T[K[k]] = mp; });


// ------------------------------------------------------------ visual borders + check
// a stretch of border is shared when its midpoint lies on another territory's outline
const SEGS = [];
T.forEach((mp, t) => mp.forEach(p => p.forEach(r => { for (let i = 0; i < r.length - 1; i++) SEGS.push([r[i], r[i + 1], t]); })));
const SCELL = 3, sgrid = new Map();
SEGS.forEach((s, n) => {
  const [a, b] = s;
  for (let gx = Math.floor(Math.min(a[0], b[0]) / SCELL); gx <= Math.floor(Math.max(a[0], b[0]) / SCELL); gx++)
    for (let gy = Math.floor(Math.min(a[1], b[1]) / SCELL); gy <= Math.floor(Math.max(a[1], b[1]) / SCELL); gy++) {
      const k = gx + ',' + gy; if (!sgrid.has(k)) sgrid.set(k, []); sgrid.get(k).push(n);
    }
});
const shared = new Map(); // "i-j" -> total length
const innerSegs = [];
SEGS.forEach(([a, b, t]) => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 1e-6) return;
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const near = new Set();
  (sgrid.get(Math.floor(m[0] / SCELL) + ',' + Math.floor(m[1] / SCELL)) || []).forEach(n => {
    const s = SEGS[n]; if (s[2] !== t && distSeg(m, s[0], s[1]) < 0.02) near.add(s[2]);
  });
  near.forEach(o => {
    const k = Math.min(t, o) + '-' + Math.max(t, o);
    shared.set(k, (shared.get(k) || 0) + len / 2); // counted once from each side
    if (t < o) innerSegs.push([a, b]);
  });
});
const problems = [];
[...unowned].forEach(n => problems.push('country with no territory: ' + n));
shared.forEach((len, k) => {
  const [a, b] = k.split('-').map(Number);
  if (!M.isAdj(a, b) && len > 1.5) problems.push(`NOT neighbours but share a border: ${M.T[a].name} / ${M.T[b].name} (${len.toFixed(1)}px)`);
});
const TOUCH = 2; // px of shared border needed to count as touching on the drawing
const links = [];
M.EDGES.forEach(([ka, kb]) => {
  const a = Math.min(K[ka], K[kb]), b = Math.max(K[ka], K[kb]);
  if ((shared.get(a + '-' + b) || 0) < TOUCH) links.push([a, b]);
});
// chain inner border segments into polylines
function chain(segs0) {
  const pk = p => r1(p[0]) + ',' + r1(p[1]);
  const segs = segs0.map(([a, b]) => [pk(a), pk(b)]).filter(([a, b]) => a !== b);
  const adj = new Map();
  segs.forEach(([a, b], i) => { [a, b].forEach(p => { if (!adj.has(p)) adj.set(p, []); adj.get(p).push(i); }); });
  const used = new Array(segs.length).fill(false), out = [];
  segs.forEach((s, i) => {
    if (used[i]) return; used[i] = true;
    const line = [s[0], s[1]];
    for (const dir of [1, 0]) {
      for (;;) {
        const end = dir ? line[line.length - 1] : line[0];
        const nx = (adj.get(end) || []).find(j => !used[j]);
        if (nx === undefined) break;
        used[nx] = true;
        const o = segs[nx][0] === end ? segs[nx][1] : segs[nx][0];
        if (dir) line.push(o); else line.unshift(o);
      }
    }
    out.push(line);
  });
  return out;
}
const lineD = pts => { const q = pts.map(k => k.split(',').map(v => Math.round(+v * 10))); let d = 'M' + pair(q[0][0] / 10, q[0][1] / 10) + 'l'; for (let i = 1; i < q.length; i++) { const s = pair((q[i][0] - q[i - 1][0]) / 10, (q[i][1] - q[i - 1][1]) / 10); d += (i > 1 && !s.startsWith('-') ? ' ' : '') + s; } return d; };
let inner;

// ------------------------------------------------------------ labels (badge spots), inside the land
const LABEL_AT = { // lon/lat hints where the widest spot is not the best one
};
const labels = T.map((mp, i) => {
  const k = M.T[i].key;
  if (LABEL_AT[k]) {
    const p = warp(P(...LABEL_AT[k]));
    if (!inMulti(p, mp)) problems.push('label hint outside its land: ' + k);
    return p;
  }
  const big = mp.slice().sort((a, b) => polyArea(b) - polyArea(a))[0];
  const p = polylabel(big, 0.5);
  return [p[0], p[1]];
});
labels.forEach((p, i) => { if (!inMulti(p, T[i])) problems.push('badge outside its land: ' + M.T[i].key); });
let minD = 1e9, minPair = '';
labels.forEach((p, i) => labels.forEach((q, j) => { if (j > i) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < minD) { minD = d; minPair = M.T[i].key + '/' + M.T[j].key; } } }));

// ------------------------------------------------------------ tap areas: sea round each territory's badge,
// never past halfway to another badge (drawn under the land, so land always wins)
function clipHalf(poly, a, b, c) { const out = []; const ins = p => a * p[0] + b * p[1] <= c + 1e-9; for (let k = 0; k < poly.length; k++) { const P1 = poly[k], Q = poly[(k + 1) % poly.length], pi = ins(P1), qi = ins(Q); const I = () => { const dp = a * P1[0] + b * P1[1] - c, dq = a * Q[0] + b * Q[1] - c, t = dp / (dp - dq); return [P1[0] + t * (Q[0] - P1[0]), P1[1] + t * (Q[1] - P1[1])]; }; if (pi) { out.push(P1); if (!qi) out.push(I()); } else if (qi) out.push(I()); } return out; }
const HIT_R = { natl: 34, satl: 34, indoc: 34, pacc: 34, british: 34, japan: 38, indonesia: 44, newguinea: 40, greenland: 40, mexico: 32 };
const hits = labels.map((s, i) => {
  const R = HIT_R[M.T[i].key] || 26;
  let poly = Array.from({ length: 28 }, (_, k) => [s[0] + R * Math.cos(k / 28 * 2 * Math.PI), s[1] + R * Math.sin(k / 28 * 2 * Math.PI)]);
  labels.forEach((o, j) => { if (j !== i) poly = clipHalf(poly, 2 * (o[0] - s[0]), 2 * (o[1] - s[1]), (o[0] ** 2 + o[1] ** 2) - (s[0] ** 2 + s[1] ** 2)); });
  return poly.length > 2 ? 'M' + poly.map(p => r1(p[0]) + ',' + r1(p[1])).join('L') + 'Z' : '';
});

// ------------------------------------------------------------ continent bonus badges: in the sea next to each continent
const CONT_AT = { fna: [-140, 35], fsa: [-100, -32], feu: [-19, 44], faf: [-25, 0], fas: [167, 40], foc: [168, -36], fsea: [-38, 27] };
const CONT_PX = { fmoon: [640, 476] }; // the Moon's badge sits beside it, in board pixels
const allLand = T.concat([BG]).flat();
const cont = M.CONTINENTS.map(c => { const p = CONT_PX[c.id] || warp(P(...CONT_AT[c.id])); if (inMulti(p, allLand)) problems.push('bonus badge on land: ' + c.id); return [r1(p[0]), r1(p[1])]; });

// coasts are drawn in the page by stroking each territory in its continent's colour
const num = v => { const t = (Math.round(v * 10) / 10).toString(); return t.replace(/^(-?)0\./, '$1.'); };
const pair = (x, y) => num(x) + (y < 0 ? '' : ',') + num(y);
function ringD(r) { // relative path, 0.1 px steps, repeated points dropped
  const q = r.slice(0, -1).map(p => [Math.round(p[0] * 10), Math.round(p[1] * 10)]).filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  if (q.length < 3) return '';
  let d = 'M' + pair(q[0][0] / 10, q[0][1] / 10) + 'l';
  for (let i = 1; i < q.length; i++) { const s = pair((q[i][0] - q[i - 1][0]) / 10, (q[i][1] - q[i - 1][1]) / 10); d += (i > 1 && !s.startsWith('-') ? ' ' : '') + s; }
  return d + 'z';
}
inner = chain(innerSegs).map(lineD).join('');
const dOf = mp => mp.map(p => p.map(ringD).join('')).join('');
const out = M.T.map((t, i) => ({ d: dOf(T[i]), x: r1(labels[i][0]), y: r1(labels[i][1]), hit: hits[i] }));
const geo = { w: W, h: H, terr: out, bg: dOf(BG), shallow: dOf(SHALLOW), moon: MOON, inner, cont, links,
  credit: 'Coastlines: Natural Earth (public domain). Future Earth board drawn by tools/buildgeo-future.mjs.' };
const js = '// GENERATED by tools/buildgeo-future.mjs from Natural Earth coastlines (public domain). Do not edit by hand.\n' +
  '(function (root) { const G = ' + JSON.stringify(geo) + ';\n' +
  "if (typeof module !== 'undefined' && module.exports) module.exports = G; else root.RiskGeoFuture = G; })(typeof window !== 'undefined' ? window : globalThis);\n";
fs.writeFileSync(path.join(here, '..', 'js', 'geo-future.js'), js);
console.log('t-junctions fixed', tj, '| size', (js.length / 1024).toFixed(1) + ' KB', '| closest badges', minD.toFixed(1), minPair);
console.log('links (drawn):', links.map(([a, b]) => M.T[a].key + '-' + M.T[b].key).join(' '));
console.log('shared borders:', [...shared].map(([k, l]) => k.split('-').map(n => M.T[n].key).join('-') + ':' + l.toFixed(0)).join(' '));
console.log(problems.length ? 'PROBLEMS:\n  ' + problems.join('\n  ') : 'geometry OK');
process.exitCode = problems.length ? 1 : 0;
