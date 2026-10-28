// The classic Risk board as data: 42 territories, 6 continents, every
// adjacency (incl. the sea lanes like Alaska-Kamchatka), and the 44-card deck.
// Facts checked in docs/rules-check.md. Shapes live in geo.js (our own drawing).
(function (root) {
  'use strict';

  // continent: [id, name, bonus, colour used for coasts/labels]
  const CONTINENTS = [
    { id: 'na', name: 'North America', bonus: 5, color: '#e3b65a' },
    { id: 'sa', name: 'South America', bonus: 2, color: '#e07a5f' },
    { id: 'eu', name: 'Europe', bonus: 5, color: '#6ea8fe' },
    { id: 'af', name: 'Africa', bonus: 3, color: '#d9915b' },
    { id: 'as', name: 'Asia', bonus: 7, color: '#6fcf97' },
    { id: 'au', name: 'Australia', bonus: 2, color: '#c084fc' },
  ];

  // [key, name, continent, card symbol] - symbol: 'I' infantry, 'C' cavalry, 'A' artillery
  const RAW = [
    ['alaska', 'Alaska', 'na', 'I'],
    ['nwt', 'Northwest Territory', 'na', 'A'],
    ['greenland', 'Greenland', 'na', 'C'],
    ['alberta', 'Alberta', 'na', 'C'],
    ['ontario', 'Ontario', 'na', 'C'],
    ['quebec', 'Quebec', 'na', 'C'],
    ['wus', 'Western United States', 'na', 'A'],
    ['eus', 'Eastern United States', 'na', 'A'],
    ['cam', 'Central America', 'na', 'A'],
    ['venezuela', 'Venezuela', 'sa', 'I'],
    ['peru', 'Peru', 'sa', 'I'],
    ['brazil', 'Brazil', 'sa', 'A'],
    ['argentina', 'Argentina', 'sa', 'I'],
    ['iceland', 'Iceland', 'eu', 'I'],
    ['gb', 'Great Britain', 'eu', 'A'],
    ['scandinavia', 'Scandinavia', 'eu', 'C'],
    ['neu', 'Northern Europe', 'eu', 'A'],
    ['weu', 'Western Europe', 'eu', 'A'],
    ['seu', 'Southern Europe', 'eu', 'A'],
    ['ukraine', 'Ukraine', 'eu', 'C'],
    ['naf', 'North Africa', 'af', 'C'],
    ['egypt', 'Egypt', 'af', 'I'],
    ['eaf', 'East Africa', 'af', 'I'],
    ['congo', 'Congo', 'af', 'I'],
    ['saf', 'South Africa', 'af', 'A'],
    ['madagascar', 'Madagascar', 'af', 'C'],
    ['ural', 'Ural', 'as', 'C'],
    ['siberia', 'Siberia', 'as', 'C'],
    ['yakutsk', 'Yakutsk', 'as', 'C'],
    ['kamchatka', 'Kamchatka', 'as', 'I'],
    ['irkutsk', 'Irkutsk', 'as', 'C'],
    ['mongolia', 'Mongolia', 'as', 'I'],
    ['japan', 'Japan', 'as', 'A'],
    ['afghanistan', 'Afghanistan', 'as', 'C'],
    ['china', 'China', 'as', 'I'],
    ['mideast', 'Middle East', 'as', 'I'],
    ['india', 'India', 'as', 'C'],
    ['siam', 'Siam', 'as', 'I'],
    ['indonesia', 'Indonesia', 'au', 'A'],
    ['newguinea', 'New Guinea', 'au', 'I'],
    ['wau', 'Western Australia', 'au', 'A'],
    ['eau', 'Eastern Australia', 'au', 'A'],
  ];

  // Every border once. Sea lanes marked so the map can draw them as dashes.
  const EDGES = [
    // North America
    ['alaska', 'nwt'], ['alaska', 'alberta'], ['alaska', 'kamchatka', 'sea'],
    ['nwt', 'alberta'], ['nwt', 'ontario'], ['nwt', 'greenland', 'sea'],
    ['greenland', 'ontario', 'sea'], ['greenland', 'quebec', 'sea'], ['greenland', 'iceland', 'sea'],
    ['alberta', 'ontario'], ['alberta', 'wus'],
    ['ontario', 'quebec'], ['ontario', 'wus'], ['ontario', 'eus'],
    ['quebec', 'eus'],
    ['wus', 'eus'], ['wus', 'cam'], ['eus', 'cam'],
    ['cam', 'venezuela'],
    // South America
    ['venezuela', 'peru'], ['venezuela', 'brazil'],
    ['peru', 'brazil'], ['peru', 'argentina'], ['brazil', 'argentina'],
    ['brazil', 'naf', 'sea'],
    // Europe
    ['iceland', 'gb', 'sea'], ['iceland', 'scandinavia', 'sea'],
    ['gb', 'scandinavia', 'sea'], ['gb', 'neu', 'sea'], ['gb', 'weu', 'sea'],
    ['scandinavia', 'neu', 'sea'], ['scandinavia', 'ukraine'],
    ['neu', 'weu'], ['neu', 'seu'], ['neu', 'ukraine'],
    ['weu', 'seu'], ['weu', 'naf', 'sea'],
    ['seu', 'ukraine'], ['seu', 'naf', 'sea'], ['seu', 'egypt', 'sea'], ['seu', 'mideast'],
    ['ukraine', 'ural'], ['ukraine', 'afghanistan'], ['ukraine', 'mideast'],
    // Africa
    ['naf', 'egypt'], ['naf', 'eaf'], ['naf', 'congo'],
    ['egypt', 'eaf'], ['egypt', 'mideast'],
    ['eaf', 'congo'], ['eaf', 'saf'], ['eaf', 'madagascar', 'sea'], ['eaf', 'mideast', 'sea'],
    ['congo', 'saf'], ['saf', 'madagascar', 'sea'],
    // Asia
    ['ural', 'siberia'], ['ural', 'china'], ['ural', 'afghanistan'],
    ['siberia', 'yakutsk'], ['siberia', 'irkutsk'], ['siberia', 'mongolia'], ['siberia', 'china'],
    ['yakutsk', 'irkutsk'], ['yakutsk', 'kamchatka'],
    ['kamchatka', 'irkutsk'], ['kamchatka', 'mongolia'], ['kamchatka', 'japan', 'sea'],
    ['irkutsk', 'mongolia'],
    ['mongolia', 'china'], ['mongolia', 'japan', 'sea'],
    ['afghanistan', 'china'], ['afghanistan', 'india'], ['afghanistan', 'mideast'],
    ['china', 'india'], ['china', 'siam'],
    ['mideast', 'india'], ['india', 'siam'],
    ['siam', 'indonesia', 'sea'],
    // Australia
    ['indonesia', 'newguinea', 'sea'], ['indonesia', 'wau', 'sea'],
    ['newguinea', 'wau', 'sea'], ['newguinea', 'eau', 'sea'],
    ['wau', 'eau'],
  ];

  // Future Earth borders. Land borders follow the drawing (tools/buildgeo-future.mjs checks them);
  // sea lanes, colony links and the two space elevators are marked 'sea'.
  const FUTURE_EDGES = [
    // land (touching on the drawing)
    ['alaska', 'arctic'], ['alaska', 'pacific'], ['arctic', 'east'], ['arctic', 'plains'], ['arctic', 'pacific'], ['pacific', 'plains'],
    ['pacific', 'mexico'], ['plains', 'east'], ['plains', 'mexico'], ['mexico', 'colombia'], ['colombia', 'amazon'], ['colombia', 'andes'],
    ['andes', 'amazon'], ['andes', 'cone'], ['amazon', 'cone'], ['nordic', 'eeu'], ['nordic', 'ceu'], ['weu', 'ceu'],
    ['weu', 'med'], ['ceu', 'eeu'], ['ceu', 'med'], ['med', 'eeu'], ['med', 'mideast'], ['eeu', 'urals'],
    ['eeu', 'mideast'], ['maghreb', 'nile'], ['maghreb', 'caf'], ['maghreb', 'waf'], ['nile', 'caf'], ['nile', 'mideast'],
    ['nile', 'eaf'], ['waf', 'caf'], ['caf', 'eaf'], ['caf', 'saf'], ['eaf', 'saf'], ['urals', 'siberia'],
    ['urals', 'casia'], ['urals', 'mideast'], ['siberia', 'fareast'], ['siberia', 'nchina'], ['siberia', 'casia'], ['fareast', 'nchina'],
    ['casia', 'nchina'], ['casia', 'persia'], ['mideast', 'persia'], ['mideast', 'arabia'], ['persia', 'nchina'], ['persia', 'india'],
    ['india', 'nchina'], ['india', 'schina'], ['india', 'indochina'], ['nchina', 'japan'], ['nchina', 'schina'], ['schina', 'indochina'],
    ['wau', 'eau'], ['tranq', 'shack'], ['tranq', 'farside'], ['shack', 'farside'],
    // sea lanes
    ['alaska', 'fareast', 'sea'], ['fareast', 'japan', 'sea'], ['greenland', 'arctic', 'sea'], ['greenland', 'nordic', 'sea'],
    ['british', 'weu', 'sea'], ['british', 'nordic', 'sea'], ['weu', 'maghreb', 'sea'], ['med', 'maghreb', 'sea'], ['med', 'nile', 'sea'],
    ['arabia', 'nile', 'sea'], ['arabia', 'eaf', 'sea'], ['arabia', 'persia', 'sea'], ['amazon', 'waf', 'sea'],
    ['indochina', 'indonesia', 'sea'], ['indonesia', 'newguinea', 'sea'], ['indonesia', 'wau', 'sea'], ['newguinea', 'wau', 'sea'], ['newguinea', 'eau', 'sea'],
    // ocean colonies
    ['natl', 'east', 'sea'], ['natl', 'british', 'sea'], ['natl', 'weu', 'sea'], ['natl', 'maghreb', 'sea'],
    ['satl', 'cone', 'sea'], ['satl', 'amazon', 'sea'], ['satl', 'caf', 'sea'], ['satl', 'saf', 'sea'],
    ['indoc', 'saf', 'sea'], ['indoc', 'india', 'sea'], ['indoc', 'wau', 'sea'],
    ['pacc', 'pacific', 'sea'], ['pacc', 'mexico', 'sea'], ['pacc', 'japan', 'sea'],
    // space elevators to the Moon
    ['indoc', 'tranq', 'sea'], ['wau', 'shack', 'sea'],
  ];

  const CLASSIC = { id: 'classic', name: 'Classic world', CONTINENTS, RAW, EDGES, missions: true };

  // ------------------------------------------------------------ Future Earth (our own board, not any official map)
  // The world after the seas rose: drowned coasts, four ocean colonies and three bases on the Moon reached by
  // space elevators. Same rules as the classic game; only the board changes. Shapes: js/geo-future.js.
  const FUTURE = {
    id: 'future', name: 'Future Earth', missions: false,
    blurb: 'The world after the seas rose: ocean colonies and a Moon reached by space elevators. Same rules.',
    CONTINENTS: [
      { id: 'fna', name: 'North America', bonus: 5, color: '#e3b65a' },
      { id: 'fsa', name: 'South America', bonus: 2, color: '#e07a5f' },
      { id: 'feu', name: 'Europe', bonus: 4, color: '#6ea8fe' },
      { id: 'faf', name: 'Africa', bonus: 3, color: '#d9915b' },
      { id: 'fas', name: 'Asia', bonus: 7, color: '#6fcf97' },
      { id: 'foc', name: 'Oceania', bonus: 2, color: '#c084fc' },
      { id: 'fsea', name: 'Sea Colonies', bonus: 3, color: '#4fd1c5' },
      { id: 'fmoon', name: 'Moon', bonus: 2, color: '#cbd5e1' },
    ],
    RAW: [
      ['alaska', 'Alaska', 'fna'], ['arctic', 'Arctic Canada', 'fna'], ['greenland', 'Greenland', 'fna'],
      ['pacific', 'Pacific Coast', 'fna'], ['plains', 'Great Plains', 'fna'], ['east', 'East Coast', 'fna'], ['mexico', 'Mexico & Caribbean', 'fna'],
      ['colombia', 'Gran Colombia', 'fsa'], ['andes', 'Andes', 'fsa'], ['amazon', 'Amazonia', 'fsa'], ['cone', 'Southern Cone', 'fsa'],
      ['nordic', 'Nordic Union', 'feu'], ['british', 'British Isles', 'feu'], ['weu', 'Western Europe', 'feu'],
      ['ceu', 'Central Europe', 'feu'], ['med', 'Mediterranean', 'feu'], ['eeu', 'Eastern Europe', 'feu'],
      ['maghreb', 'Maghreb', 'faf'], ['nile', 'Nile', 'faf'], ['waf', 'West Africa', 'faf'],
      ['caf', 'Central Africa', 'faf'], ['eaf', 'East Africa', 'faf'], ['saf', 'Southern Africa', 'faf'],
      ['urals', 'Urals', 'fas'], ['siberia', 'Siberia', 'fas'], ['fareast', 'Far East', 'fas'], ['casia', 'Central Asia', 'fas'],
      ['mideast', 'Middle East', 'fas'], ['arabia', 'Arabia', 'fas'], ['persia', 'Persia', 'fas'], ['india', 'India', 'fas'],
      ['nchina', 'North China', 'fas'], ['schina', 'South China', 'fas'], ['japan', 'Japan & Korea', 'fas'], ['indochina', 'Indochina', 'fas'],
      ['indonesia', 'Indonesia', 'foc'], ['newguinea', 'New Guinea', 'foc'], ['wau', 'West Australia', 'foc'], ['eau', 'East Australia', 'foc'],
      ['natl', 'Atlantic Colony', 'fsea'], ['satl', 'South Atlantic Colony', 'fsea'], ['indoc', 'Indian Ocean Colony', 'fsea'], ['pacc', 'Pacific Colony', 'fsea'],
      ['tranq', 'Tranquility Base', 'fmoon'], ['shack', 'Shackleton', 'fmoon'], ['farside', 'Far Side', 'fmoon'],
    ].map((r, i) => r.concat(['I', 'C', 'A'][i % 3])),
    EDGES: [], // filled below (FUTURE_EDGES)
  };
  FUTURE.EDGES = FUTURE_EDGES;

  function build(def) {
    const T = def.RAW.map(([key, name, cont, sym], id) => ({ id, key, name, cont, sym }));
    const BY_KEY = {}; T.forEach(t => { BY_KEY[t.key] = t.id; });
    const ADJ = T.map(() => []);
    const SEA = {};
    def.EDGES.forEach(([a, b, kind]) => {
      const i = BY_KEY[a], j = BY_KEY[b];
      if (i === undefined || j === undefined) throw new Error('bad edge ' + a + '-' + b);
      ADJ[i].push(j); ADJ[j].push(i);
      if (kind === 'sea') SEA[Math.min(i, j) + '-' + Math.max(i, j)] = true;
    });
    ADJ.forEach(a => a.sort((x, y) => x - y));
    const CONTS = def.CONTINENTS.map(c => Object.assign({}, c));
    const CONT_IDX = {}; CONTS.forEach((c, i) => { CONT_IDX[c.id] = i; c.idx = i; });
    CONTS.forEach(c => { c.terrs = T.filter(t => t.cont === c.id).map(t => t.id); });
    T.forEach(t => { t.ci = CONT_IDX[t.cont]; });
    // a continent's border territories: those with a neighbour outside it
    CONTS.forEach(c => { c.borders = c.terrs.filter(i => ADJ[i].some(j => T[j].cont !== c.id)); });
    // one card per territory (its symbol) + 2 wild
    const n = T.length;
    const CARDS = T.map(t => ({ id: t.id, terr: t.id, sym: t.sym })).concat([
      { id: n, terr: -1, sym: 'W' }, { id: n + 1, terr: -1, sym: 'W' },
    ]);
    return { T, BY_KEY, ADJ, SEA, CONTINENTS: CONTS, CARDS, EDGES: def.EDGES.slice() };
  }
  const DEFS = { classic: CLASSIC, future: FUTURE };
  const BUILT = {};
  const got = id => BUILT[id] || (BUILT[id] = build(DEFS[id]));

  // Every module holds these very arrays, so a board switch refills them in place.
  const T = [], ADJ = [], CONTINENTS_NOW = [], CARDS = [], EDGES_NOW = [], BY_KEY = {};
  let SEA = {};
  const fill = (a, b) => { a.length = 0; b.forEach(x => a.push(x)); };
  function use(id) {
    if (!DEFS[id]) id = 'classic';
    if (api.id === id) return false;
    const b = got(id);
    fill(T, b.T); fill(ADJ, b.ADJ); fill(CONTINENTS_NOW, b.CONTINENTS); fill(CARDS, b.CARDS); fill(EDGES_NOW, b.EDGES);
    Object.keys(BY_KEY).forEach(k => delete BY_KEY[k]); Object.assign(BY_KEY, b.BY_KEY);
    SEA = b.SEA; api.N = b.T.length; api.id = id;
    return true;
  }
  const size = id => got(DEFS[id] ? id : 'classic').T.length;
  const isAdj = (a, b) => ADJ[a].includes(b);
  const isSea = (a, b) => !!SEA[Math.min(a, b) + '-' + Math.max(a, b)];
  const MAPS = [CLASSIC, FUTURE].map(d => ({ id: d.id, name: d.name, missions: d.missions, blurb: d.blurb || '' }));

  const api = { CONTINENTS: CONTINENTS_NOW, T, ADJ, EDGES: EDGES_NOW, CARDS, BY_KEY, isAdj, isSea, N: 0, id: null, use, size, MAPS };
  // the drawing of the board in use (browser: js/geo.js and js/geo-future.js)
  Object.defineProperty(api, 'geo', { get: () => (api.id === 'future' ? root.RiskGeoFuture : root.RiskGeo) });
  use('classic');
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RiskMap = api;
})(typeof window !== 'undefined' ? window : globalThis);
