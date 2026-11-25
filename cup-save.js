import {teams} from './teams.js';
import {rounds} from './cup.js?v=3';
import {WIN_SCORE} from './sim.js?v=6';

export const cupSaveKey = 'slime-world-cup-v1';
const byCode = new Map(teams.map(team => [team.flag, team]));

export function encodeCup(cup) {
  return JSON.stringify({
    draw: cup.draws[0].map(team => team.flag),
    played: cup.results.map(ties => ({
      winners: ties.map(tie => tie.winner.flag),
      score: ties[0].score,
    })),
  });
}

export function decodeCup(raw) {
  if (!raw) return null;
  try {
    const {draw, played} = JSON.parse(raw);
    if (!Array.isArray(draw) || draw.length !== 2 ** rounds.length ||
        new Set(draw).size !== draw.length || !draw.every(code => byCode.has(code)) ||
        !Array.isArray(played) || played.length > rounds.length) return null;
    const opening = draw.map(code => byCode.get(code));
    const cup = {draws:[opening], field:opening, results:[], round:0};
    for (const [round, {winners, score}] of played.entries()) {
      const field = cup.draws[round];
      if (field[0] !== opening[0] || !Array.isArray(winners) || winners.length !== field.length/2 ||
          !Array.isArray(score) || score.length !== 2 || score[0] === score[1] ||
          !score.every(n => Number.isInteger(n) && n >= 0) || Math.max(...score) !== WIN_SCORE) return null;
      const next = winners.map(code => byCode.get(code));
      if (next[0] !== field[Number(score[1] > score[0])] ||
          !next.every((winner,i) => winner === field[2*i] || winner === field[2*i+1])) return null;
      cup.results.push(next.map((winner,i) => ({winner, score:i === 0 ? score : null})));
      cup.draws.push(next);
      cup.round = round;
      cup.field = field;
    }
    return cup;
  } catch { return null; }
}
