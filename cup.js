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
  return {field:[country, ...field], round:0};
}

export function advanceCup(cup) {
  const winners = [cup.field[0]];
  for (let i=2; i<cup.field.length; i+=2) winners.push(cup.field[i + Math.floor(Math.random()*2)]);
  cup.field = winners;
  cup.round++;
}
