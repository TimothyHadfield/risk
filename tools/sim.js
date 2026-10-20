// Measures computer strength: plays many full games between levels.
//   node tools/sim.js [games] [players] [mode]
// e.g. node tools/sim.js 300 3        -> hard vs medium vs easy, seats rotated
//      node tools/sim.js 300 2        -> every pair, head to head (with neutral)
const E = require('../js/engine.js');
const AI = require('../js/ai.js');

function play(levels, seed, rules) {
  let st = E.newGame(levels.map((l, i) => ({ name: 'P' + i + '-' + l, kind: 'cpu', level: l })), Object.assign({ maxTurns: 300 }, rules), seed);
  let steps = 0;
  while (st.phase !== 'over' && steps < 200000) {
    const a = AI.choose(st, st.turn);
    st = E.apply(st, a); steps++;
  }
  return { winner: st.winner, rounds: st.round, stopped: !!st.stop || steps >= 200000 };
}
function table(levels, games, rules) {
  const wins = {}; levels.forEach(l => { wins[l] = 0; });
  let stopped = 0, rounds = 0;
  for (let g = 0; g < games; g++) {
    const rot = g % levels.length;
    const seats = levels.slice(rot).concat(levels.slice(0, rot));
    const r = play(seats, 1000 + g * 7919, rules);
    if (r.stopped) stopped++;
    rounds += r.rounds;
    if (r.winner >= 0) wins[seats[r.winner]]++;
  }
  return { wins, stopped, avgRounds: (rounds / games).toFixed(1) };
}
if (require.main === module) {
  const games = +process.argv[2] || 100, n = +process.argv[3] || 3, mode = process.argv[4] || 'classic';
  const t0 = Date.now();
  if (n === 2) {
    [['hard', 'medium'], ['hard', 'easy'], ['medium', 'easy']].forEach(pair => console.log(pair.join(' v '), JSON.stringify(table(pair, games, { mode }))));
  } else if (n === 3) {
    console.log('hard/medium/easy', JSON.stringify(table(['hard', 'medium', 'easy'], games, { mode })));
  } else {
    const lv = ['hard', 'medium', 'easy', 'medium', 'easy', 'easy'].slice(0, n);
    console.log(lv.join('/'), JSON.stringify(table(lv, games, { mode })));
  }
  console.log('seconds', ((Date.now() - t0) / 1000).toFixed(1));
}
module.exports = { play, table };
