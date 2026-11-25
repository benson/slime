import {rounds} from './cup.js?v=3';
import {drawFlag} from './flags.js';

const pageSize = 4;
const tabs = ['64','32','16','QF','SF','FINAL'];

export function bracketView(cup) {
  let round = cup.round, page = 0;
  const count = () => cup.draws[0].length / (2 ** (round+1));
  const pages = () => Math.ceil(count()/pageSize);
  function selectRound(value) {
    round = Math.max(0,Math.min(rounds.length-1,value));
    page = 0;
  }
  function turn(direction) {
    page = (page + direction + pages()) % pages();
  }

  function draw(ctx, txt, buttons, action, leave) {
    const player = cup.draws[0][0];
    const result = cup.results[cup.round][0];
    const opponent = cup.draws[cup.round][1];
    const won = result.winner === player, final = cup.round === rounds.length-1;
    const next = cup.draws[cup.round+1][1];
    const headline = won ? (final ? 'WORLD CHAMPIONS' : 'THROUGH TO THE ' + rounds[cup.round+1]) : 'KNOCKED OUT';
    txt(headline,480,34,38,{fill:'fire',maxWidth:860});
    txt(player.name + '  ' + result.score.join(' – ') + '  ' + opponent.name,480,74,23,{maxWidth:850});
    function control(text,x,y,width,fn,active=false) {
      txt(text,x,y,22,{fill:active?'#ffd23a':'#f5f0e4',maxWidth:width-10});
      buttons.push({x:x-width/2,y:y-21,w:width,h:42,fn});
    }
    tabs.forEach((label,i)=>control(label,218+i*104,118,90,()=>selectRound(i),round===i));

    const columns = Math.min(3,rounds.length+1-round);
    const rows = Math.min(pageSize,count());
    const top = 176, bottom = 424;
    const width = 244, stepX = 300, origin = (960-(columns-1)*stepX-width)/2;
    for (let col=0;col<columns;col++) {
      const stage = round+col, x = origin+col*stepX;
      const n = Math.max(1,rows >> col);
      const first = (page*pageSize) >> col;
      txt(rounds[stage] || 'CHAMPION',x+width/2,155,18,{fill:'chrome'});
      for (let row=0;row<n;row++) {
        const tie = first+row, mid = top+(row+0.5)*(bottom-top)/n;
        const champion = stage===rounds.length;
        const draw = cup.draws[stage], outcome = cup.results[stage]?.[tie];
        const names = champion ? [draw?.[0]] : [draw?.[2*tie],draw?.[2*tie+1]];
        const h = champion ? 26 : 52;
        if (col+1<columns) {
          const destRows = Math.max(1,n>>1);
          const destY = top+(Math.floor(row/2)+0.5)*(bottom-top)/destRows;
          ctx.strokeStyle='#819297';ctx.lineWidth=2;ctx.beginPath();
          ctx.moveTo(x+width,mid);ctx.lineTo(x+width+24,mid);
          ctx.lineTo(x+width+24,destY);ctx.lineTo(x+stepX,destY);ctx.stroke();
        }
        names.forEach((team,j)=>{
          const y = mid-h/2+j*26, lost = outcome && team !== outcome.winner;
          ctx.fillStyle = team === player ? '#3b4962' : '#20293a';
          ctx.fillRect(x,y,width,26);
          if (team) drawFlag(ctx,team,x+6,y+4,26,18);
          const feeder = champion ? 0 : 2*tie+j;
          const entrants = cup.draws[stage-1];
          let name = team?.name;
          if (!name && entrants) name = entrants.slice(feeder*2,feeder*2+2).map(t=>t.name).join(' / ');
          if (!name) name = champion ? 'WINNER OF FINAL' : rounds[stage-1] + ' · MATCH ' + (feeder+1);
          const score = outcome?.score?.[j] ?? '';
          const mark = lost ? ('OUT  ' + score).trim() : String(score);
          txt(name,x+(team?38:9),y+13,19,{align:'left',skew:0,maxWidth:mark?159:team?196:226,
            fill:lost?'#a3a8af':team===player?'#ffdc76':team?'#fff6db':'#a9b8c4'});
          if (mark) txt(mark,x+width-7,y+13,lost?14:18,{align:'right',skew:0,fill:lost?'#aaaeba':'#fff6db'});
        });
      }
    }
    if (pages()>1) {
      control('◀',369,449,76,()=>turn(-1));
      txt('TIES '+(page*pageSize+1)+'–'+Math.min(count(),(page+1)*pageSize)+' / '+count(),480,449,19,{skew:0});
      control('▶',591,449,76,()=>turn(1));
    }
    if (!final || !won) control('MAIN MENU',163,501,185,leave);
    control(!won?'NEW CUP':final?'MAIN MENU':'PLAY '+next.name,final&&won?480:606,501,490,action,true);
  }
  return {
    draw,
    key(k) {
      if (['ArrowLeft','KeyA','PageUp'].includes(k)) turn(-1);
      if (['ArrowRight','KeyD','PageDown'].includes(k)) turn(1);
      if (['ArrowUp','KeyW'].includes(k)) selectRound(round-1);
      if (['ArrowDown','KeyS'].includes(k)) selectRound(round+1);
    }
  };
}
