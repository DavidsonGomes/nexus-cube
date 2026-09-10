import test from 'node:test';
import assert from 'node:assert/strict';
import { FINGER_TRICK_TRAINER_COVERAGE, FINGER_TRICK_TRAINER_FIXTURES, ONE_HAND_TRAINER_COVERAGE, ONE_HAND_TRAINER_FIXTURES, validateCustomFingerTrickSequence } from '../../../src/data/trainers/finger-tricks-trainer';
import { assertFixtureIds } from '../../../src/data/trainers/registry';

test('every verified curated sequence becomes a trainer fixture with verbatim texts and honest coverage', () => {
  assert.equal(FINGER_TRICK_TRAINER_FIXTURES.length, 14);
  assertFixtureIds(FINGER_TRICK_TRAINER_FIXTURES);
  for (const fixture of FINGER_TRICK_TRAINER_FIXTURES) {
    assert.equal(fixture.trainerId, 'finger-tricks');
    assert.ok(fixture.name.length > 0 && fixture.objective.length > 0, fixture.id);
    assert.ok(fixture.provenance.length >= 1, fixture.id);
  }
  const sexy = FINGER_TRICK_TRAINER_FIXTURES.find(fixture => fixture.id === 'tricks/sexy-right');
  assert.equal(sexy?.name, 'Sexy move (direito)');
  assert.ok(sexy?.observe && sexy.observe.length > 0, 'watchFor consumido como observe');
  assert.deepEqual(FINGER_TRICK_TRAINER_COVERAGE, { trainerId: 'finger-tricks', validatedContentCount: 14, declared: 'partial' });
  assert.equal(ONE_HAND_TRAINER_FIXTURES.length, 14);
  assert.ok(ONE_HAND_TRAINER_FIXTURES.every(fixture => fixture.trainerId === 'one-handed' && fixture.id.startsWith('tricks-oh/')));
  assert.deepEqual(ONE_HAND_TRAINER_COVERAGE, { trainerId: 'one-handed', validatedContentCount: 14, declared: 'partial' });
});

test('custom sequences validate by the shared grammar and carry the proved restore cycles', () => {
  const custom = validateCustomFingerTrickSequence("R U R' U'  R U R' U'");
  assert.deepEqual(custom.tokens.length, 8);
  assert.equal(custom.restoreCycles, 3);
  assert.equal(custom.moves, "R U R' U' R U R' U'");
  assert.throws(() => validateCustomFingerTrickSequence(''), /vazia/);
  assert.throws(() => validateCustomFingerTrickSequence('Q'), /Movimento invalido/);
  assert.throws(() => validateCustomFingerTrickSequence(Array.from({ length: 65 }, () => 'U').join(' ')), /acima de 64/);
});
