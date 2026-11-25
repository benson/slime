import assert from 'node:assert/strict';
import {W, GOAL_TOP, BALL_R, GROUND, DT, createMatch, step, makeBrain, think} from '../../sim.js';

const idle = [{}, {}];
const soccer = () => createMatch({sport: 'soccer'});
for (const side of [0, 1]) {
  const st = soccer();
  while (st.phase === 'serve') step(st, [{r:1}, {l:1}]);
  for (let i = 0; i < 150; i++) step(st, idle);
  assert.equal(st.ball.x, W / 2);
  assert.equal(st.ball.y, GROUND - BALL_R);
  assert.deepEqual(st.score, [0, 0]);

  const sign = side ? -1 : 1, edge = side ? 0 : W, shot = sign * 680;
  Object.assign(st.ball, {x:edge - sign*2, y:GOAL_TOP - 5, vx:shot, vy:0});
  step(st, idle);
  assert(st.ball.vx * sign < 0, 'above the crossbar rebounds into play');
  assert.deepEqual(st.score, [0, 0]);
  Object.assign(st.ball, {x:edge - sign*2, y:GROUND - BALL_R, vx:shot, vy:0});
  st.lastHitter = side;
  st.lastKick = edge - sign*540;
  step(st, idle);
  const goal = st.events.find(e => e.type === 'point');
  assert.equal(goal.scorer, side);
  assert.equal(goal.highlight, 'fire');
  assert(goal.replay.length >= 34);
  while (st.phase === 'point') step(st, idle);
  assert.equal(st.phase, 'serve');
  assert.equal(st.server, 1-side);
  assert(Math.abs(st.slimes[st.server].x - W / 2) < Math.abs(st.slimes[side].x - W / 2));
}
const crossing = soccer();
crossing.phase = 'play';
for (let i=0; i<120; i++) step(crossing, [{r:1}, {l:1}]);
assert(crossing.slimes[0].x > W / 2 && crossing.slimes[1].x < W / 2);
const goalie = soccer();
goalie.phase = 'play';
Object.assign(goalie.ball, {x:200, y:GROUND - BALL_R - 1, vx:100, vy:200});
step(goalie, idle);
assert(goalie.ball.vy < 0, 'floor bounce');
assert.deepEqual(goalie.score, [0, 0]);

function playCPU(left, right) {
  const st = createMatch({sport:'soccer', win:3});
  const players = [left, right].map(kind => kind && makeBrain(kind));
  players.forEach((p,i) => st.slimes[i].speed = p?.cfg.speed ?? 1);
  for (let k = 0; k < 90 / DT && st.phase !== 'over'; k++) {
    step(st, players.map((p,i) => p ? think(st,i,p) : {}));
    st.events.length=0;
  }
  return st;
}
for (const kind of ['sludge','brick','pyro','jinx','inferno']) {
  assert.equal(playCPU(kind, null).winner, 0, kind + ' can finish goals');
}
for (const side of [0,1]) {
  const result = side ? playCPU('sludge','inferno') : playCPU('inferno','sludge');
  assert.equal(result.winner, side, 'Inferno beats Sludge from either end');
}
console.log('Soccer kickoffs, goal lines/crossbars, full-pitch movement, floor bounce, highlights, all CPUs and both attack directions passed.');
