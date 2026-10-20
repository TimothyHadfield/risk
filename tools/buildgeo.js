// Builds js/geo.js: our own drawing of the world board.
// Each landmass is a hand-drawn outline; it is cut into territories by
// (weighted) nearest-seed regions. The script then checks that every pair of
// territories that visually share a border really are neighbours in map.js,
// and lists the official neighbours that need a drawn sea/land link instead.
//   node tools/buildgeo.js          -> writes js/geo.js, prints the check
const fs = require('fs');
const path = require('path');
const M = require('../js/map.js');
const K = M.BY_KEY;

// viewBox 0 0 1000 560
const LAND = [
  { name: 'na', pts: [[14,74],[30,56],[58,44],[88,50],[112,40],[140,34],[170,40],[196,30],[226,40],[246,58],[262,50],[286,62],[302,84],[296,104],[310,118],[318,140],[304,154],[288,160],[276,178],[268,200],[258,214],[244,222],[232,236],[222,250],[208,256],[198,268],[204,282],[214,292],[206,298],[192,292],[178,280],[164,268],[150,252],[138,236],[124,224],[114,204],[110,180],[106,156],[98,132],[84,116],[64,110],[44,112],[26,104],[16,92]],
    seeds: [['alaska',52,80],['nwt',140,66],['alberta',138,118],['ontario',196,118],['quebec',262,112],['wus',146,180],['eus',214,184],['cam',176,256]] },
  { name: 'greenland', pts: [[300,30],[332,16],[372,12],[404,20],[398,44],[382,66],[364,88],[344,100],[328,84],[318,62],[306,48]], seeds: [['greenland',356,48]] },
  { name: 'sa', pts: [[214,304],[236,294],[262,296],[288,308],[316,320],[340,334],[342,354],[328,380],[310,402],[292,422],[282,448],[270,476],[262,502],[256,530],[244,532],[238,504],[236,474],[230,444],[220,414],[210,384],[204,356],[204,328]],
    seeds: [['venezuela',248,312],['peru',230,370],['brazil',292,352],['argentina',254,452]] },
  { name: 'iceland', pts: [[394,74],[412,64],[432,68],[436,82],[418,90],[400,88]], seeds: [['iceland',414,78]] },
  { name: 'gb', pts: [[426,112],[440,102],[450,118],[452,140],[448,160],[434,166],[424,156],[430,138],[422,126]], seeds: [['gb',438,136]] },
  { name: 'eu', pts: [[468,104],[474,78],[488,56],[510,40],[536,36],[548,46],[538,64],[526,86],[522,104],[534,100],[548,86],[572,70],[600,62],[626,60],[636,90],[634,124],[628,160],[620,188],[606,206],[584,212],[566,222],[552,238],[538,226],[526,214],[514,232],[502,240],[490,226],[476,224],[462,232],[452,222],[454,200],[462,180],[470,160],[478,140],[490,124],[480,114]],
    seeds: [['scandinavia',506,72],['neu',504,150],['weu',468,204],['seu',530,200],['ukraine',590,128]] },
  { name: 'af', pts: [[436,276],[452,258],[478,250],[506,246],[530,252],[558,256],[582,276],[598,302],[622,316],[636,322],[624,350],[604,378],[592,404],[584,436],[572,468],[556,494],[536,512],[518,512],[506,490],[502,458],[496,424],[484,396],[468,378],[448,364],[434,342],[424,312]],
    seeds: [['naf',468,318],['egypt',548,266],['eaf',584,352],['congo',512,404],['saf',540,470]] },
  { name: 'madagascar', pts: [[612,418],[626,406],[634,422],[630,450],[618,474],[606,462],[608,438]], seeds: [['madagascar',620,440]] },
  { name: 'as', pts: [[644,64],[676,44],[712,36],[748,30],[784,22],[822,18],[862,22],[902,26],[940,34],[972,48],[988,64],[976,86],[952,92],[934,110],[920,128],[904,142],[890,160],[878,184],[866,208],[856,232],[846,256],[836,278],[830,302],[820,322],[808,334],[796,318],[784,302],[770,300],[756,312],[744,330],[730,334],[716,316],[702,296],[688,284],[672,290],[656,300],[640,304],[622,296],[610,278],[618,256],[634,240],[642,222],[642,196],[646,166],[648,136],[648,104],[640,84]],
    seeds: [['ural',670,92],['ural',684,152],['siberia',734,62],['siberia',748,138],['yakutsk',836,48],['kamchatka',934,62],['irkutsk',818,110],['mongolia',846,172],['afghanistan',680,214],['china',768,214],['china',812,236],['mideast',636,272],['india',726,292],['siam',812,306]] },
  { name: 'japan', pts: [[920,150],[934,140],[944,156],[940,186],[928,206],[916,200],[922,178]], seeds: [['japan',930,172]] },
  { name: 'indonesia', pts: [[780,370],[800,358],[826,362],[846,374],[838,390],[812,394],[790,388]], seeds: [['indonesia',812,376]] },
  { name: 'newguinea', pts: [[880,350],[904,342],[932,348],[954,360],[944,372],[914,372],[890,366]], seeds: [['newguinea',916,358]] },
  { name: 'au', pts: [[820,454],[838,428],[866,416],[892,422],[912,410],[930,420],[946,404],[962,428],[978,456],[980,488],[966,514],[940,528],[908,524],[884,512],[858,516],[836,508],[822,486]],
    seeds: [['wau',856,470],['eau',934,468]] },
];

const LABEL = {}; // optional manual label positions: key -> [x,y]

// ------------------------------------------------------------ geometry
function clipHalf(poly, a, b, c, tag) { // keep a*x+b*y <= c
  const out = [];
  const inside = p => a * p[0] + b * p[1] <= c + 1e-9;
  for (let k = 0; k < poly.length; k++) {
    const P = poly[k], Q = poly[(k + 1) % poly.length];
    const pin = inside(P), qin = inside(Q);
    const inter = () => {
      const dp = a * P[0] + b * P[1] - c, dq = a * Q[0] + b * Q[1] - c;
      const t = dp / (dp - dq);
      return [P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])];
    };
    if (pin) { out.push([P[0], P[1], P[2]]); if (!qin) { const I = inter(); out.push([I[0], I[1], tag]); } }
    else if (qin) { const I = inter(); out.push([I[0], I[1], P[2]]); }
  }
  return out;
}
function pip(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function area(poly) { let s = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; }
function centroid(poly) {
  let cx = 0, cy = 0, A = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; const f = p[0] * q[1] - q[0] * p[1]; A += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f; }
  A /= 2; return [cx / (6 * A), cy / (6 * A)];
}
const r1 = n => Math.round(n * 10) / 10;

const terr = M.T.map(() => ({ pieces: [], borders: [] }));
const seen = new Set(); // visual neighbours "i-j"
const problems = [];
const coasts = [];

LAND.forEach(L => {
  coasts.push({ land: L.name, d: 'M' + L.pts.map(p => p.join(',')).join('L') + 'Z' });
  const seeds = L.seeds.map(([key, x, y, w]) => { if (K[key] === undefined) throw new Error(key); return { t: K[key], x, y, w: w || 0 }; });
  seeds.forEach((s, i) => {
    if (!pip([s.x, s.y], L.pts)) problems.push(`seed ${M.T[s.t].key} outside ${L.name}`);
    let poly = L.pts.map(p => [p[0], p[1], 'coast']);
    seeds.forEach((o, j) => {
      if (i === j) return;
      // |p-s|^2 - ws <= |p-o|^2 - wo  ->  2(o-s).p <= |o|^2-|s|^2 - wo + ws
      const a = 2 * (o.x - s.x), b = 2 * (o.y - s.y);
      const c = (o.x * o.x + o.y * o.y) - (s.x * s.x + s.y * s.y) - o.w + s.w;
      poly = clipHalf(poly, a, b, c, j);
    });
    if (poly.length < 3) { problems.push(`empty cell ${M.T[s.t].key}`); return; }
    for (let k = 0; k < poly.length; k++) {
      const P = poly[k], Q = poly[(k + 1) % poly.length];
      if (P[2] === 'coast') continue;
      const o = seeds[P[2]];
      const len = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
      const mid = [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2];
      if (len > 0.5 && !pip(mid, L.pts)) problems.push(`cut across water: ${M.T[s.t].key}/${M.T[o.t].key}`);
      if (o.t !== s.t && len > 2) {
        const a = Math.min(s.t, o.t), b = Math.max(s.t, o.t);
        seen.add(a + '-' + b);
        if (s.t < o.t) terr[s.t].borders.push([P[0], P[1], Q[0], Q[1]]);
      }
    }
    terr[s.t].pieces.push(poly.map(p => [p[0], p[1]]));
  });
});

// visual borders must be real neighbours
seen.forEach(k => { const [a, b] = k.split('-').map(Number); if (!M.isAdj(a, b)) problems.push(`NOT neighbours but share a border: ${M.T[a].name} / ${M.T[b].name}`); });
// official neighbours with no shared border -> drawn as a link
const links = [];
M.EDGES.forEach(([ka, kb]) => {
  const a = Math.min(K[ka], K[kb]), b = Math.max(K[ka], K[kb]);
  if (!seen.has(a + '-' + b)) links.push([a, b]);
});

const out = M.T.map((t, i) => {
  const ps = terr[i].pieces;
  if (!ps.length) { problems.push('no shape: ' + t.key); return null; }
  let ax = 0, ay = 0, at = 0;
  ps.forEach(p => { const a = Math.abs(area(p)), c = centroid(p); ax += c[0] * a; ay += c[1] * a; at += a; });
  const lab = LABEL[t.key] || [ax / at, ay / at];
  return {
    d: ps.map(p => 'M' + p.map(q => r1(q[0]) + ',' + r1(q[1])).join('L') + 'Z').join(''),
    b: terr[i].borders.map(s => `M${r1(s[0])},${r1(s[1])}L${r1(s[2])},${r1(s[3])}`).join(''),
    x: r1(lab[0]), y: r1(lab[1]),
  };
});
const geo = { w: 1000, h: 560, terr: out, coasts, links };
const js = '// GENERATED by tools/buildgeo.js - our own drawing of the board. Do not edit by hand.\n' +
  '(function (root) { const G = ' + JSON.stringify(geo) + ';\n' +
  "if (typeof module !== 'undefined' && module.exports) module.exports = G; else root.RiskGeo = G; })(typeof window !== 'undefined' ? window : globalThis);\n";
fs.writeFileSync(path.join(__dirname, '..', 'js', 'geo.js'), js);
console.log('links (drawn):', links.map(([a, b]) => M.T[a].key + '-' + M.T[b].key).join(' '));
console.log(problems.length ? 'PROBLEMS:\n  ' + problems.join('\n  ') : 'geometry OK');
process.exitCode = problems.length ? 1 : 0;
