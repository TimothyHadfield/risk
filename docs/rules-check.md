# Rules check: every number, with its source

Sources (checked 2026-10-19):
- **S1** Parker Brothers "Risk! Continental Game" 1959 rules, Winning Moves reproduction rulebook (licensed by Hasbro, 2008). Sample PDF: https://www.exodusbooks.com/Samples/Games/36735sample.pdf (pages 1-9 read directly).
- **S2** The Risk FAQ v5.61 (Kent): https://www.kent.ac.uk/ims/personal/odl/riskfaq.htm (covers US 1959/1975/1980/1993 and UK editions).
- **S3** Hasbro RISK B7404 (2016) rulebook, as copied at https://manualsnet.com/hasbro/risk-b7404 (third-party copy of the official book).
- **T** = asserted by a test in `tests/`.

| Rule / number | Value used | Sources | Test |
|---|---|---|---|
| Territories | 42 | S1 (lists all 42 by continent), S2 | T map |
| Continents and sizes | N.Am 9, S.Am 4, Europe 7, Africa 6, Asia 12, Australia 4 | S1 (named lists) | T map |
| Continent bonuses | 5, 2, 5, 3, 7, 2 | S1 ("North America 5; South America 2; Europe 5; Africa 3; Asia 7; Australia 2") | T map + income |
| Borders | 83, incl. Alaska-Kamchatka, Brazil-N.Africa, Greenland-Iceland/Quebec/Ontario/NWT | S1 (named examples: N.Africa attacks Brazil, W/S Europe, Egypt, E.Africa, Congo; Alaska-Kamchatka; Greenland from Iceland, Quebec, Ontario, NWT) and the board; 83 is the standard count | T map |
| Cards | 44 = 42 territory + 2 wild; 14 infantry, 14 cavalry, 14 artillery | S1 (44 cards, 2 jokers with all three figures), S2 ("14 of each symbol plus 2 jokers") | T map |
| Which symbol is on which territory card | see `js/map.js` | **single source (common card listing), NOT verified against a physical deck** - the counts (14/14/14) are verified | T counts only |
| Starting armies | 2p 40, 3p 35, 4p 30, 5p 25, 6p 20 | S2 (all), S3 (35/30/25 and 2p 40) | T engine |
| Two players | 3 piles of 14 cards (you, opponent, neutral), 40 each incl. neutral; each turn place 2 own + 1 neutral; neutral never attacks or reinforces; opponent rolls for the neutral (we: neutral always rolls max dice); win by wiping out the opponent | S1 p.9 (1999 rules reprint), S3 | T engine |
| Setup | Deal territory cards (S1, S3) or take turns claiming (US 1975-1993 per S2); then place one army at a time in turn | S1, S2, S3 | T engine |
| Reinforcements | territories / 3, round down, minimum 3, plus held continents | S1 ("fractions do not count", "minimum of three") | T income |
| Attack dice | attacker 1-3 and needs one more army than dice; defender 1-2 (2 needs 2+ armies); ties go to defender; highest vs highest, second vs second | S1, S2 | T odds |
| After a capture | move in at least as many armies as dice rolled in the last attack, leave at least 1 behind | S1 ("at least as many armies as the number of dice he rolled"), S2 | T engine |
| One card per turn | only if you took at least one territory | S1, S3 | T engine |
| Card sets | 3 of a kind, 1 of each, or wild + any 2 | S1 | T engine |
| Escalating values | 4, 6, 8, 10, 12, 15, then +5 each (20, 25, 30 ...); counts every set traded by anyone | S1 (table to 8th set = 25 and "12th set is worth 45"), S2, S3 | T engine |
| Fixed values (option) | 3 infantry 4, 3 cavalry 6, 3 artillery 8, one of each 10 | S2 lists UK fixed values 4/6/8/10 but pairs artillery=4 / cavalry=8; other editions pair infantry=4. **Symbol-to-value pairing NOT verified (sources disagree)**; the four values are verified | T engine |
| +1 option | 4, 5, 6 ... | S1 "Rule variations for experts", S2 (1980 US) | T engine |
| +2 territory bonus | a traded card showing a territory you hold: +2 armies placed there (once per trade) | S2, S3 | T engine |
| Forced trade | 5+ cards at the start of your turn must trade; after wiping out a player and holding 6+, trade down to 4 or fewer at once, place, keep attacking | S1 (five-card limit; elimination: down to 4 or less), S2, S3 | T engine |
| Taking cards on elimination | the eliminator gets all their cards | S1, S3 | T engine |
| End-of-turn move | Along connected own land (S3 "maneuver", S1 expert variant) or one move to a neighbour (S1 1959 free move); one move per turn | S1, S3 | T engine |
| Secret missions | 14: N.Am+Africa, N.Am+Australia, Asia+S.Am, Asia+Africa, Europe+S.Am+one more, Europe+Australia+one more, 24 territories, 18 territories with 2+ armies, destroy each of 6 colours. Destroy-colour becomes "24 territories" if it is your colour or someone else wipes them out. 12-card option drops the two "Europe + ... + one more" | S2 (full list; 1998 US has 12), S3 (12 mission cards, missions for absent colours removed) | T engine |
| Capital game | pick a secret HQ after setup; win by holding your own and taking every enemy HQ; short game 4p need 2, 5p need 3 | S3 (Capital RISK) | T engine |
| Battle odds per roll | 3v2: 2275/2611/2890 of 7776; 3v1: 441/855 of 1296; 2v2: 581/420/295 of 1296; 2v1: 91/125 of 216; 1v2: 161/55 of 216; 1v1: 21/15 of 36 | S2 table; our code enumerates all dice and matches exactly | T odds |

Our choices where the rulebooks leave it open (also in progress.md):
- The defender always rolls the most dice allowed (best for the defender in almost every case; saves a question each roll).
- Two-player: the leftover neutral armies after both players finish are spread evenly (S3 lets players place them).
- Capital game with 6 players uses "all enemy HQs" (S3 covers 3-5 players).
