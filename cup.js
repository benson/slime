// An eight-team knockout draw. The player's tie is always the first one.
export const teams = [
  {name:'SCOTLAND', color:'#5276ba', kit:{panel:'#f1e9cf'}, flag:'scotland'},
  {name:'BRAZIL', color:'#ffdc48', kit:{panel:'#268956'}, flag:'brazil'},
  {name:'JAPAN', color:'#4760d6', kit:{panel:'#f6d5dc'}, flag:'japan'},
  {name:'GERMANY', color:'#d0d6d9', kit:{panel:'#313540'}, flag:'germany'},
  {name:'ARGENTINA', color:'#80cef0', kit:{panel:'#fff9eb'}, flag:'argentina'},
  {name:'FRANCE', color:'#385499', kit:{panel:'#d94556'}, flag:'france'},
  {name:'NETHERLANDS', color:'#fc8638', kit:{panel:'#303e68'}, flag:'netherlands'},
  {name:'ENGLAND', color:'#f1eee3', kit:{panel:'#c83a49'}, flag:'england'},
];
export const rounds = ['QUARTERFINAL','SEMIFINAL','FINAL'];
export const rivals = ['brick','jinx','inferno'];

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

export function drawFlag(ctx, team, x, y, w, h) {
  ctx.save(); ctx.translate(x,y); ctx.scale(w/30,h/20);
  ctx.beginPath(); ctx.rect(0,0,30,20); ctx.clip();
  const rect = (color,x,y,w,h) => {ctx.fillStyle=color; ctx.fillRect(x,y,w,h);};
  const disc = (color,r) => {ctx.beginPath(); ctx.arc(15,10,r,0,Math.PI*2); ctx.fillStyle=color; ctx.fill();};
  rect('#f6f2e5',0,0,30,20);
  switch (team.flag) {
    case 'scotland':
      rect('#1754ab',0,0,30,20);
      ctx.strokeStyle='#f6f2e5'; ctx.lineWidth=3.4; ctx.beginPath();
      ctx.moveTo(0,0); ctx.lineTo(30,20); ctx.moveTo(30,0); ctx.lineTo(0,20); ctx.stroke(); break;
    case 'brazil':
      rect('#167850',0,0,30,20); ctx.fillStyle='#ffdc4d'; ctx.beginPath();
      ctx.moveTo(2,10);ctx.lineTo(15,1);ctx.lineTo(28,10);ctx.lineTo(15,19);ctx.fill();disc('#214a96',5);break;
    case 'japan': disc('#bc2845',6);break;
    case 'germany': rect('#242530',0,0,30,7);rect('#c03c42',0,7,30,6);rect('#f2c84c',0,13,30,7);break;
    case 'argentina': rect('#80c8eb',0,0,30,7);rect('#80c8eb',0,13,30,7);disc('#e8ae39',2);break;
    case 'france': rect('#214690',0,0,10,20);rect('#d34a53',20,0,10,20);break;
    case 'netherlands': rect('#ba3946',0,0,30,7);rect('#294b8a',0,13,30,7);break;
    case 'england': rect('#c53047',12.8,0,4.4,20);rect('#c53047',0,8,30,4);break;
  }
  ctx.restore();
}
