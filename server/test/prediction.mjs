// node --test server/test/prediction.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalSlime } from '../../local-slime.js';
import { createMatch, DT, GROUND, moveSlime } from '../../sim.js';

const tick = DT * 1000;
const neutral = {l:0, r:0, u:false, d:false};
for (const side of [0, 1]) {
  test('immediate controls and reconciliation with 200 ms round trip, side ' + side, () => {
    const prediction = new LocalSlime();
    const match = createMatch();
    const steps = new Map([
      [2, {r:0.5}], [12, {r:0.5,u:true}], [14, {r:0.5}], [26, {l:1,d:true}],
      [28, {l:1}], [35, {}],
    ]);
    const snapshots = [], pending = [];
    let seq = 0, applied = null, input = neutral;
    prediction.reconcile(match, side, null, 0);
    for (let frame = 1; frame <= 120; frame++) {
      const now = frame*tick;
      if (steps.has(frame)) {
        const next = {...neutral,...steps.get(frame)};
        prediction.input(++seq, next, now);
        pending.push({arrival:frame+12, seq, next});
      }
      if (pending[0]?.arrival === frame) {
        const command = pending.shift();
        input = command.next;
        applied = {seq:command.seq, at:match.time};
      }
      moveSlime(match.slimes[side], side, input);
      match.time += DT;
      if (frame % 4 === 0) snapshots.push({arrival:frame+12, state:structuredClone(match), ack:applied});
      if (snapshots[0]?.arrival === frame) {
        const {state,ack} = snapshots.shift();
        prediction.reconcile(state,side,ack,now);
      }
      const local = prediction.sample(now);
      if (frame === 6) {
        assert.equal(local.vx,170);
        assert.equal(match.slimes[side].vx,0);
      }
      if (frame === 14) {
        assert.ok(local.y < GROUND && local.vy < 0, 'jump shown before it reached the server');
        assert.equal(match.slimes[side].y,GROUND);
      }
      if (frame === 28) {
        assert.equal(local.vx,-340);
        assert.ok(local.dive || local.y === GROUND, 'airborne down input shows dive');
      }
      if (frame === 38) assert.equal(local.vx,0);
      if (frame === 120) {
        assert.ok(Math.abs(local.x-match.slimes[side].x)<0.01,'converged after all inputs acknowledged');
        assert.ok(Math.abs(local.y-match.slimes[side].y)<0.01,'landed on the authoritative floor');
      }
    }
    prediction.reset();
    assert.equal(prediction.sample(2000),null);
  });
}

test('authoritative corrections decay; stale packets cannot run movement indefinitely', () => {
  const prediction = new LocalSlime(), state = createMatch();
  prediction.reconcile(state, 0, null, 0);
  prediction.input(1,{...neutral,r:1},0);
  const before = prediction.sample(100);
  const fresh = structuredClone(state);
  fresh.time = 0.1;
  fresh.slimes[0].x = before.x - 10;
  prediction.reconcile(fresh,0,{seq:1,at:0},100);
  assert.ok(Math.abs(prediction.sample(100).x-before.x)<0.01, 'small correction blended');
  prediction.input(2,neutral,100);
  assert.ok(Math.abs(prediction.sample(400).x-fresh.slimes[0].x)<0.01, 'corrected to server');
  prediction.input(3,{...neutral,r:1},410);
  assert.ok(Math.abs(prediction.sample(1000).x-fresh.slimes[0].x)<0.01,'silence beyond the prediction horizon');
});

test('soccer movement crosses midfield, volleyball stops at the net', () => {
  for (const sport of ['volleyball','soccer']) {
    const state = createMatch({sport}), prediction = new LocalSlime();
    state.slimes[0].x = 425;
    prediction.reconcile(state,0,null,0);
    prediction.input(1,{...neutral,r:1},0);
    assert.equal(prediction.sample(200).x > 480, sport === 'soccer');
  }
});
