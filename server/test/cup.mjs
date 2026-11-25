// The bracket viewer and the next match must always use the same recorded winners.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {teams} from '../../teams.js';
import {drawCup, finishCupRound, advanceCup, rounds} from '../../cup.js';

test('every winner follows their original tie and past rounds keep their results', () => {
  const cup = drawCup(teams[0]);
  const openingDraw = [...cup.field];
  for (let round = 0; round < rounds.length; round++) {
    const score = round === rounds.length-1 ? [4,7] : [7,4];
    finishCupRound(cup,score);
    const nextField = cup.draws[round+1];
    assert.equal(nextField.length,cup.field.length/2);
    assert.equal(nextField[0],cup.field[score[0] > score[1] ? 0 : 1]);
    assert.deepEqual(cup.results[round][0].score,score);
    nextField.forEach((winner,i) => {
      assert.ok(cup.field.slice(2*i,2*i+2).includes(winner));
      assert.equal(cup.results[round][i].winner,winner);
    });
    finishCupRound(cup,[0,7]);
    assert.equal(cup.draws[round+1],nextField);
    if (round < rounds.length-1) {
      advanceCup(cup);
      assert.equal(cup.field,nextField);
    }
  }
  assert.deepEqual(cup.draws[0],openingDraw);
  assert.deepEqual(cup.results[0][0].score,[7,4]);
});
