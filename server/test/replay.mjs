import assert from 'node:assert/strict';
import {createMatch, step, GROUND, BALL_R, DT, REPLAY_LEAD, REPLAY_RATE, replayDuration} from '../../sim.js';
import {replayPose} from '../../replay.js';

const idle = [{}, {}];
function score({x = 540, speed = 520, exchanges = 0, fire = false, netAge = null, win = 7} = {}) {
  const state = createMatch({win});
  state.phase = 'play';
  state.ball.x = 180;
  state.ball.y = 40;
  state.ball.vy = -420;
  for (let i = 0; i < 144; i++) step(state, idle);
  Object.assign(state.ball, {x, y: GROUND - BALL_R - 1, vx: 0, vy: speed, fire});
  Object.assign(state, {exchanges, lastHitter: 0, lastNet: netAge == null ? null : state.time - netAge});
  step(state, idle);
  return {state, point: state.events.find(e => e.type === 'point')};
}

for (const normal of [{}, {exchanges: 5}, {netAge: 1.1}, {x: 760, speed: 810, fire: true}]) {
  const {state, point} = score(normal);
  assert.equal(point.highlight, undefined);
  assert.equal(state.timer, 1.5);
}
for (const exchanges of [6, 9]) {
  const {state, point} = score({exchanges});
  assert.equal(point.pointKind, 'rally');
  assert.equal(point.replay, undefined);
  assert.equal(state.timer, 1.5);
}
assert.equal(score({netAge: 0.25}).point.highlight, 'net');
assert.equal(score({x: 930, speed: 810, fire: true}).point.highlight, 'fire');
for (const win of [1, 7]) {
  const {state, point} = score({exchanges: 10, win});
  assert.equal(point.highlight, 'rally');
  const clip = JSON.parse(JSON.stringify(point.replay));
  assert(clip.length >= 34 && clip.length <= 36);
  const duration = replayDuration(clip);
  assert.equal(state.timer, duration);
  assert.equal(replayPose(clip, duration), null);
  const remaining = duration - REPLAY_LEAD - DT * 2 / REPLAY_RATE;
  const pose = replayPose(clip, remaining);
  assert(Math.abs(pose.ball.y - (clip[0][2] + clip[1][2]) / 2) < 0.001);
  assert.equal(replayPose(clip, 0).ball.y, GROUND - BALL_R);
  const x = state.slimes[0].x;
  const inputs = [{r: 1, u: true}, {}];
  for (let frame = 1; frame < Math.floor(duration / DT); frame++) {
    step(state, inputs);
    assert.equal(state.phase, 'point');
    assert.equal(state.slimes[0].x, x);
  }
  while (state.phase === 'point') step(state, inputs);
  assert.equal(state.phase, win === 1 ? 'over' : 'serve');
  assert.deepEqual(state.score, [1, 0]);
  assert.equal(state.events.filter(e => e.type === 'point').length, 1);
}
console.log('Replay triggers, court playback, synchronized hold, serve and match-point transitions passed.');
