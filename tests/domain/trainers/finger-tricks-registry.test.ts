import test from 'node:test';
import assert from 'node:assert/strict';
import { FINGER_TRICKS, VERIFIED_FINGER_TRICKS, getFingerTrick, matchFingerTricks, selectFingerTrickCover } from '../../../src/data/trainers/finger-tricks-registry';

test('the static registry loads the whole verified batch at build time', () => {
  assert.equal(FINGER_TRICKS.length, 14);
  assert.equal(VERIFIED_FINGER_TRICKS.length, 14);
  assert.equal(getFingerTrick('tricks/sexy-right').restoreCycles, 6);
  assert.throws(() => getFingerTrick('tricks/none'), /desconhecido/);
});

test('matching maps every occurrence to global parsed-move indices', () => {
  const occurrences = matchFingerTricks("y R U R' U' F R U R' U'");
  const sexy = occurrences.filter(occurrence => occurrence.trick.record.id === 'tricks/sexy-right');
  assert.deepEqual(sexy.map(occurrence => [occurrence.startStep, occurrence.endStep]), [[1, 5], [6, 10]]);
  assert.deepEqual(sexy[1].touches.map(touch => touch.globalMoveIndex), [6, 7, 8, 9]);
  assert.deepEqual(sexy[1].touches.map(touch => touch.move), ['R', 'U', "R'", "U'"]);
  assert.equal(matchFingerTricks('').length, 0);
  assert.equal(matchFingerTricks("F2 B2 L2").length, 0);
});

test('the demo cover prefers the longest trick and fills gaps without overlap', () => {
  const cover = selectFingerTrickCover("R U R' U' L' U' L U D2");
  assert.deepEqual(cover.map(occurrence => [occurrence.trick.record.id, occurrence.startStep, occurrence.endStep]),
    [['tricks/combo-sexy-bilateral', 0, 8], ['tricks/d2', 8, 9]]);
  const partial = selectFingerTrickCover("R U R' U' F L' U' L U");
  assert.deepEqual(partial.map(occurrence => occurrence.trick.record.id), ['tricks/sexy-right', 'tricks/sexy-left']);
  for (const occurrences of [cover, partial]) {
    const steps = occurrences.flatMap(occurrence => Array.from({ length: occurrence.endStep - occurrence.startStep }, (_, i) => occurrence.startStep + i));
    assert.equal(new Set(steps).size, steps.length, 'cobertura sem sobreposição');
  }
});

test('matching normalizes notation before comparing tokens', () => {
  const occurrences = matchFingerTricks("R U R' U'   L' U' L U");
  assert.ok(occurrences.some(occurrence => occurrence.trick.record.id === 'tricks/combo-sexy-bilateral'));
  assert.deepEqual(matchFingerTricks('U2').map(o => o.trick.record.id), ['tricks/u2']);
});
