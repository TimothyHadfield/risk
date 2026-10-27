// The rules sheet and the guided first game, "Basic Training" (shared kit: js/coach.js, never edit that one here).
// Rules are written in our own words from the classic Risk rulebooks (the same rules the engine plays).
(function (root) {
  'use strict';
  // the guided game: you against two Easy computers, classic rules, a fixed deal
  const SEED = 20261027;
  function setup() {
    return { seed: SEED, seats: [{ name: 'You', kind: 'human', level: 'medium' }, { kind: 'cpu', level: 'easy' }, { kind: 'cpu', level: 'easy' }], rules: { mode: 'classic', setup: 'deal' } };
  }

  function rules() {
    return {
      title: 'Risk rules',
      intro: 'The classic rules. Other options (missions, capitals, card values, how far you may move) are in Settings and apply to the next game.',
      foot: 'Fan-made; not affiliated with the game\'s publisher.',
      sections: [
        { id: 'goal', title: 'Goal', short: 'Goal', html: '<p>Take every territory on the map and wipe out everyone else. Missions and Capitals are shorter goals you can pick before a game.</p><p class="tip">Continents pay a bonus every turn. Australia and South America are small and easy to guard: a good place to start.</p>' },
        { id: 'setup', title: 'Setup', short: 'Setup', html: '<ul><li>2 to 6 players. Everyone gets armies to start: 40 each with 2 players, 35 with 3, 30 with 4, 25 with 5, 20 with 6.</li><li>The territories are dealt out (or claimed one at a time, in Settings).</li><li>Then players take turns putting their armies on their own land, one or a few at a time.</li><li>With 2 players a neutral army holds some land and only defends.</li></ul>' },
        { id: 'turn', title: 'Your turn', short: 'Turn', html: '<ol><li><b>Place</b> new armies on your own land.</li><li><b>Attack</b> your neighbours as often as you like (or not at all).</li><li><b>Move</b> once: shift armies from one territory to another, then your turn ends.</li></ol>' },
        { id: 'place', title: 'New armies', short: 'Place', html: '<ul><li>Your territories divided by 3, rounded down (at least 3).</li><li>Plus the bonus of every continent you hold whole: North America 5, South America 2, Europe 5, Africa 3, Asia 7, Australia 2.</li><li>Plus any card set you trade in.</li></ul>' },
        { id: 'attack', title: 'Attacking', short: 'Attack', html: '<ul><li>Attack from a territory with 2 or more armies into a neighbour you don\'t own (lines across the sea count as neighbours).</li><li>The attacker rolls up to 3 dice, at most one fewer than the armies there. The defender rolls up to 2, at most the armies there.</li><li>Compare the highest dice, then the next highest. The higher die wins each pair; <b>a tie goes to the defender</b>. Each loss removes one army.</li><li>Empty the territory and it\'s yours: move in at least as many armies as dice you rolled.</li><li><b>Blitz</b> keeps rolling for you until you take it or are down to one army.</li></ul><p class="tip">The % on the map is your exact chance to take that territory if you keep attacking.</p>' },
        { id: 'move', title: 'Moving at the end', short: 'Move', html: '<p>Once per turn, at the end, you may move armies from one of your territories to another one joined to it through your own land. Always leave at least one army behind.</p>' },
        { id: 'cards', title: 'Cards', short: 'Cards', html: '<ul><li>Take at least one territory in your turn and you draw one card at the end of it.</li><li>Each card shows infantry, cavalry or artillery (two are wild).</li><li>Trade a set at the start of your turn for extra armies: three of a kind, one of each, or a wild plus any two.</li><li>Sets are worth 4, 6, 8, 10, 12, 15, then 5 more each time anyone trades.</li><li>If a card you trade shows land you hold, you get 2 extra armies there.</li><li>With 5 or more cards you must trade.</li><li>Wipe out a player and you take their cards.</li></ul>' },
        { id: 'options', title: 'Other ways to play', short: 'Options', html: '<ul><li><b>Missions</b>: everyone gets a secret task; the first to finish it wins.</li><li><b>Capitals</b>: everyone picks a headquarters; hold yours and take all the others. Short game: fewer HQs needed.</li><li><b>Card values</b>: rising (standard), fixed by symbol, or +1 each set.</li><li><b>End-of-turn move</b>: along your own land (standard) or to a neighbour only.</li><li><b>Take turns</b> claiming land instead of dealing it.</li></ul>' },
      ],
    };
  }

  // the steps: each points at a real part of the screen and moves on when the game does
  // ctx: { game: () => state|null (only while the guided game runs), app: () => the app state }
  function steps(ctx) {
    const G = () => ctx.game();
    const A = () => ctx.app();
    const ph = p => { const g = G(); return !!g && g.turn === 0 && g.phase === p; };
    const past = () => { const g = G(); return !!g && !['claim', 'place', 'capital'].includes(g.phase); };
    return [
      { title: 'Basic Training', text: 'You against two easy computers. Your armies are red. Tap any territory to see its name; pinch or use + to zoom.', target: '#mapWrap' },
      { title: 'Place your armies', text: 'Before play starts, everyone puts armies on their own land. Tap Finish setup for me and the computer places yours this time.', target: '#panel [data-auto="setup"]', skipIf: past, until: past },
      { title: 'New armies', text: 'Each turn starts with new armies: one per 3 territories, plus continent bonuses. Pick All, then tap one of your territories next to an enemy.', target: '#mapWrap, #amtSeg', when: () => ph('reinforce'), until: () => { const g = G(); return !!g && g.turn === 0 && g.phase !== 'reinforce'; } },
      { title: 'Attack', text: 'Tap your territory with the most armies, then an enemy next to it. The % on the map is your chance to take it.', target: '#mapWrap', when: () => ph('attack'), until: () => { const a = A(); return (a.sel >= 0 && a.to >= 0) || !ph('attack'); } },
      { title: 'Roll or Blitz', text: 'Roll throws the dice once. Blitz keeps rolling until you take it or run out. A tie goes to the defender.', target: '#panel #rollBtn, #panel #blitzBtn', skipIf: () => !document.querySelector('#panel #blitzBtn'), until: () => !ph('attack') || A().to < 0 || ph('occupy') || !!G().lastRoll },
      { title: 'Keep going', text: 'Attack as often as you like. Take at least one territory each turn to earn a card. Then tap Done attacking.', target: '#panel #endAtk', when: () => ph('attack') || ph('occupy'), skipIf: () => !ph('attack') && !ph('occupy'), next: true },
      { title: 'Move armies', text: 'One move at the end of your turn: tap a territory, then another of yours joined to it. Or tap End turn.', target: '#mapWrap, #panel .phase', when: () => ph('fortify'), until: () => !ph('fortify') },
      { title: 'Cards', text: 'Cards you earn lie in your hand here. Three of a kind, or one of each, trades for extra armies at the start of a turn.', target: '#mine' },
      { title: 'Hint and Undo', text: 'Stuck? Hint shows what the Hard computer would do. Undo takes back your last move. Games with either count as "with help" in My stats.', target: '#panel #undoBtn' },
      { title: 'That\'s it', text: 'Play on and take the world. The rules are in Settings whenever you need them.', target: () => document.querySelector('#tabsBottom [data-tab="settings"]') && document.querySelector('#tabsBottom').offsetParent ? '#tabsBottom [data-tab="settings"]' : '#tabsTop [data-tab="settings"]' },
    ];
  }

  root.RiskTutorial = { setup, rules, steps, SEED };
})(typeof window !== 'undefined' ? window : globalThis);
