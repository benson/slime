import {teams} from './teams.js';

export const rounds = ['ROUND OF 64','ROUND OF 32','ROUND OF 16','QUARTERFINAL','SEMIFINAL','FINAL'];
export const rivals = ['sludge','brick','pyro','jinx','jinx','inferno'];

function rgb(hex) {
  return [1,3,5].map(start => parseInt(hex.slice(start,start+2),16));
}

export function matchKits([home, away]) {
  const a = rgb(home.color);
  const distance = color => Math.hypot(...rgb(color).map((channel,i) => channel-a[i]));
  if (distance(away.color) >= 95) return [home,away];
  const alternate = distance(away.kit.panel) >= 110 ? away.kit.panel
    : distance('#fff4de') > distance('#35395b') ? '#fff4de' : '#35395b';
  return [home, {...away, color:alternate, kit:{panel:away.color}, labelColor:away.color}];
}

export function drawCup(country) {
  const field = teams.filter(team => team !== country);
  for (let i=field.length-1; i>0; i--) {
    const j = Math.floor(Math.random() * (i+1));
    [field[i],field[j]] = [field[j],field[i]];
  }
  field.unshift(country);
  return {field, round:0, draws:[field], results:[]};
}

// Resolve each tie once. Only the player's match has a played score.
export function finishCupRound(cup, score) {
  if (cup.results[cup.round]) return;
  const results = [];
  for (let i=0; i<cup.field.length; i+=2) {
    const side = i === 0 ? Number(score[1] > score[0]) : Math.floor(Math.random()*2);
    results.push({winner:cup.field[i+side], score:i === 0 ? [...score] : null});
  }
  cup.results[cup.round] = results;
  cup.draws[cup.round+1] = results.map(tie => tie.winner);
}

export function advanceCup(cup) {
  cup.field = cup.draws[++cup.round];
}
