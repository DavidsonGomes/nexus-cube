import test from 'node:test';
import assert from 'node:assert/strict';
import { ollStates, pllStates, ollCoverage, pllCoverage, ollClass, pllClass } from './cube-cases.mjs';
import { average5Fixtures, inspectionFixtures, largeAverageFixture } from './fixtures.mjs';

test('QA oracle enumerates legal orientation and permutation classes independently', () => {
  assert.equal(ollStates().length, 216);
  assert.equal(pllStates().length, 288);
  assert.equal(ollCoverage.size, 57);
  assert.equal(pllCoverage.size, 21);
  assert.ok(!ollCoverage.has(ollClass({ corners: [0, 0, 0, 0], edges: [0, 0, 0, 0] })));
  assert.ok(!pllCoverage.has(pllClass({ corners: [0, 1, 2, 3], edges: [0, 1, 2, 3] })));
});

test('QA fixtures preserve both exact boundaries and difficult average outcomes', () => {
  assert.equal(inspectionFixtures.find(f => f.elapsedMs === 15000).expected, '+2');
  assert.equal(inspectionFixtures.find(f => f.elapsedMs === 17000).expected, 'DNF');
  assert.equal(new Set(average5Fixtures.map(f => f.id)).size, average5Fixtures.length);
  assert.equal(largeAverageFixture(50, 3, 3).expected, 10000);
  assert.equal(largeAverageFixture(50, 3, 4).expected, 'DNF');
});
