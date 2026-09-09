import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { integrateFingerTricks, restoreCyclesOf, validateFingerTrickRecord } from '../../../src/data/trainers/finger-tricks';

const directory = fileURLToPath(new URL('../../../src/data/expansion-sources/finger-tricks/', import.meta.url));
const files = readdirSync(directory).filter(name => name.endsWith('.json')).sort();
const records = files.map(name => JSON.parse(readFileSync(`${directory}${name}`, 'utf8')) as Record<string, unknown>);

test('the 14 verified P1 records integrate with grip exposed and domain-proved restore cycles', () => {
  const integrated = integrateFingerTricks(records);
  assert.equal(integrated.length, 14);
  for (const entry of integrated) {
    assert.equal(entry.record.provenance.status, 'verified', entry.record.id);
    assert.equal(entry.showGrip, true, entry.record.id);
    assert.ok(entry.restoreCycles >= 1 && entry.restoreCycles <= 1260, entry.record.id);
  }
  const cycles = new Map(integrated.map(entry => [entry.record.id, entry.restoreCycles]));
  assert.equal(cycles.get('tricks/sexy-right'), 6);
  assert.equal(cycles.get('tricks/sexy-left'), 6);
  assert.equal(cycles.get('tricks/sledgehammer-right'), 6);
  assert.equal(cycles.get('tricks/u'), 4);
  assert.equal(cycles.get('tricks/u2'), 2);
  assert.equal(cycles.get('tricks/m2'), 2);
});

test('restore cycles are the real group order of the sequence', () => {
  assert.equal(restoreCyclesOf('U'), 4);
  assert.equal(restoreCyclesOf('M2'), 2);
  assert.equal(restoreCyclesOf("R U R' U'"), 6);
  assert.equal(restoreCyclesOf("R U2 D' B D'"), 1260);
});

test('integration guards reject divergent tokens, foreign anchors and touch inconsistencies', () => {
  const base = records.find(record => record.id === 'tricks/sexy-right') as { touches: { move: string; moveIndex: number; anchorPieces?: string[]; touchIndex: number }[] } & Record<string, unknown>;
  const clone = () => JSON.parse(JSON.stringify(base)) as typeof base;
  const wrongToken = clone();
  wrongToken.touches[1].move = 'U2';
  assert.throws(() => validateFingerTrickRecord(wrongToken), /token divergente/);
  const wrongAnchor = clone();
  wrongAnchor.touches[1].anchorPieces = ['UFL'];
  assert.throws(() => validateFingerTrickRecord(wrongAnchor), /vocabulario canonico/);
  const duplicatedTouch = clone();
  duplicatedTouch.touches[1].touchIndex = 2;
  assert.throws(() => validateFingerTrickRecord(duplicatedTouch), /touchIndex/);
  const missingTouch = clone();
  missingTouch.touches.splice(2, 1);
  assert.throws(() => validateFingerTrickRecord(missingTouch), /exige 1 toque/);
  const presumedCycles = clone();
  (presumedCycles.loop as { restoreCycles: number | null }).restoreCycles = 6;
  assert.throws(() => validateFingerTrickRecord(presumedCycles), /prova do dominio/);
  assert.throws(() => integrateFingerTricks([base, base]), /duplicado/);
});
