import assert from 'node:assert/strict';
import {test} from 'node:test';
import {teams} from '../../teams.js';
import {drawCup, advanceCup, finishCupRound, rounds} from '../../cup.js';
import {encodeCup,decodeCup} from '../../cup-save.js';

test('restores the original draw, canonical teams, scores, and each successive opponent', () => {
  let cup = drawCup(teams.find(team => team.flag === 'gb-sct'));
  const opening = [...cup.field];
  assert.deepEqual(decodeCup(encodeCup(cup)).field,opening);
  for (let i=0;i<rounds.length;i++) {
    finishCupRound(cup,[7,i]);
    const resumed = decodeCup(encodeCup(cup));
    assert.deepEqual(resumed,cup);
    assert.equal(resumed.results[i][0].winner,opening[0]);
    assert.equal(resumed.field,resumed.draws[i]);
    if (i < rounds.length-1) {
      advanceCup(resumed);
      assert.equal(resumed.field[1],cup.draws[i+1][1]);
      cup = resumed;
    }
  }
});

test('restores elimination and rejects inconsistent or unreadable saves', () => {
  const cup = drawCup(teams[0]);
  finishCupRound(cup,[3,7]);
  const raw = encodeCup(cup);
  assert.equal(decodeCup(raw).results[0][0].winner,cup.field[1]);
  for (const change of [
    data => { data.draw[1] = data.draw[0]; },
    data => { data.draw[1] = 'missing-team'; },
    data => { data.played[0].winners[1] = data.draw[0]; },
    data => { data.played[0].score = [7,3]; },
    data => { data.played[0].score = [7,7]; },
    data => { data.played.push(data.played[0]); },
  ]) {
    const data = JSON.parse(raw);
    change(data);
    assert.equal(decodeCup(JSON.stringify(data)),null);
  }
  assert.equal(decodeCup('{'),null);
  assert.equal(decodeCup(null),null);
});
