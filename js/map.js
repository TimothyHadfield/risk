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

  const T = RAW.map(([key, name, cont, sym], id) => ({ id, key, name, cont, sym }));
  const BY_KEY = {}; T.forEach(t => { BY_KEY[t.key] = t.id; });
  const ADJ = T.map(() => []);
  const SEA = {};
  EDGES.forEach(([a, b, kind]) => {
    const i = BY_KEY[a], j = BY_KEY[b];
    if (i === undefined || j === undefined) throw new Error('bad edge ' + a + '-' + b);
    ADJ[i].push(j); ADJ[j].push(i);
    if (kind === 'sea') SEA[Math.min(i, j) + '-' + Math.max(i, j)] = true;
  });
  ADJ.forEach(a => a.sort((x, y) => x - y));
  const CONT_IDX = {}; CONTINENTS.forEach((c, i) => { CONT_IDX[c.id] = i; c.idx = i; });
  CONTINENTS.forEach(c => { c.terrs = T.filter(t => t.cont === c.id).map(t => t.id); });
  T.forEach(t => { t.ci = CONT_IDX[t.cont]; });
  // A continent's border territories: those with a neighbour outside it.
  CONTINENTS.forEach(c => { c.borders = c.terrs.filter(i => ADJ[i].some(j => T[j].cont !== c.id)); });

  // 44 cards: one per territory (its symbol) + 2 wild.
  const CARDS = T.map(t => ({ id: t.id, terr: t.id, sym: t.sym })).concat([
    { id: 42, terr: -1, sym: 'W' }, { id: 43, terr: -1, sym: 'W' },
  ]);

  const isAdj = (a, b) => ADJ[a].includes(b);
  const isSea = (a, b) => !!SEA[Math.min(a, b) + '-' + Math.max(a, b)];

  const api = { CONTINENTS, T, ADJ, EDGES, CARDS, BY_KEY, isAdj, isSea, N: T.length };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RiskMap = api;
})(typeof window !== 'undefined' ? window : globalThis);
