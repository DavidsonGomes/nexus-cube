import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlgorithm, solvedCube } from '../../src/domain/cube';
import {
  LEGACY_CASE_IDS, assertFixtureIds, assertTrainerAttempt, assertTrainerContentId, buildTrainerCoverage,
  checkStageCondition, checkStageTransition, computeTrainerCaseStatistics, createEmptyTrainerDataV1,
  isNamespacedTrainerId, migrateTrainerData,
} from '../../src/data/trainers';
import type { TrainerAttempt, TrainerFixtureSpec } from '../../src/data/trainers';
import { assertShape, qaF2L, qaOriented, qaSolved } from './sticker-oracle';
import type { CubeState, Vector3 } from '../../src/domain/types';

const FB_PIECE_POSITIONS: readonly Vector3[] = [[-1, -1, 0], [-1, 0, 1], [-1, 0, -1], [-1, -1, 1], [-1, -1, -1], [-1, 0, 0]];
const FACE_BY_NORMAL: readonly { face: string; normal: Vector3 }[] = [
  { face: 'U', normal: [0, 1, 0] }, { face: 'D', normal: [0, -1, 0] }, { face: 'F', normal: [0, 0, 1] },
  { face: 'B', normal: [0, 0, -1] }, { face: 'R', normal: [1, 0, 0] }, { face: 'L', normal: [-1, 0, 0] },
];
const same = (a: Vector3, b: Vector3) => a.every((v, i) => v === b[i]);
function qaFirstBlockFixed(state: CubeState): boolean {
  return state
    .filter(sticker => FB_PIECE_POSITIONS.some(position => same(sticker.position, position)))
    .every(sticker => sticker.color === FACE_BY_NORMAL.find(entry => same(entry.normal, sticker.normal))!.face);
}

function specFixture(id: string, trainerId: TrainerFixtureSpec['trainerId'], difficulty: TrainerFixtureSpec['difficulty'] = null): TrainerFixtureSpec {
  return {
    id, trainerId, methodId: null, stageId: null, groupId: 'qa', kind: 'execution',
    name: id, objective: 'qa', precondition: null, goal: { predicate: 'any-legal' },
    preserve: [], referenceFrame: 'fixed', setupSubgroup: null, difficulty, focus: null, provenance: [],
  };
}
function attempt(partial: Partial<TrainerAttempt>): TrainerAttempt {
  return {
    id: 'qa-1', trainerId: 'cross', contentId: 'cfop/cross/qa', alternativeId: null, hand: null, slot: null,
    timingMode: 'timed', createdAt: '2026-09-09T12:00:00.000Z', outcome: 'correct', assisted: false,
    rawMs: 700, inspectionMs: null, cycles: null, physicalCycles: null, ...partial,
  };
}

test('legacy 78 IDs stay intact and namespaced trainer IDs cannot collide with them', () => {
  assert.equal(LEGACY_CASE_IDS.length, 78);
  assert.equal(new Set(LEGACY_CASE_IDS).size, 78);
  assert.equal(LEGACY_CASE_IDS.filter(id => id.startsWith('OLL-')).length, 57);
  assert.equal(LEGACY_CASE_IDS.filter(id => id.startsWith('PLL-')).length, 21);
  for (const id of LEGACY_CASE_IDS) {
    assertTrainerContentId(id);
    assert.equal(isNamespacedTrainerId(id), false, id);
  }
  assertTrainerContentId('cfop/f2l/case-01');
  assert.throws(() => assertTrainerContentId('f2l-case-01'), /invalido/);
  assert.throws(() => assertFixtureIds([specFixture('OLL-01' as string, 'oll')]), /namespace/);
  assert.throws(() => assertFixtureIds([specFixture('cfop/f2l/a', 'f2l'), specFixture('cfop/f2l/a', 'f2l')]), /duplicado/);
});

test('stage predicates agree with the QA piece oracle on independent vectors', () => {
  const solved = solvedCube();
  assertShape(solved);
  const vectors: { name: string; state: CubeState }[] = [
    { name: 'solved', state: solved },
    { name: 'auf', state: applyAlgorithm(solved, 'U') },
    { name: 'sexy', state: applyAlgorithm(solved, "R U R' U'") },
    { name: 'sune', state: applyAlgorithm(solved, "R U R' U R U2 R'") },
    { name: 'tperm', state: applyAlgorithm(solved, "R U R' U' R' F R2 U' R' U' R U R' F'") },
    { name: 'left', state: applyAlgorithm(solved, 'L') },
    { name: 'scrambled', state: applyAlgorithm(solved, "R U2 F' L D B") },
  ];
  for (const { name, state } of vectors) {
    assertShape(state);
    assert.equal(checkStageCondition(state, { predicate: 'f2l' }), qaF2L(state), `f2l ${name}`);
    assert.equal(checkStageCondition(state, { predicate: 'oll' }), qaOriented(state), `oll ${name}`);
    assert.equal(checkStageCondition(state, { predicate: 'finish' }), qaSolved(state), `finish ${name}`);
    assert.equal(checkStageCondition(state, { predicate: 'fb', referenceFrame: 'fixed' }), qaFirstBlockFixed(state), `fb ${name}`);
    assert.equal(checkStageCondition(state, { predicate: 'any-legal' }), true, `any-legal ${name}`);
  }
});

test('stage transition accepts only precondition plus goal plus preservation on both extremes', () => {
  const solved = solvedCube();
  const fbSpec = { precondition: { predicate: 'any-legal' } as const, goal: { predicate: 'fb' } as const, preserve: ['U', 'R', 'F', 'D', 'L', 'B'], referenceFrame: 'fixed' as const };
  assert.equal(checkStageTransition(applyAlgorithm(solved, "L U L'"), solved, fbSpec), true);
  assert.equal(checkStageTransition(applyAlgorithm(solved, "L U L'"), applyAlgorithm(solved, "R U R' U'"), fbSpec), true);
  assert.equal(checkStageTransition(applyAlgorithm(solved, 'L'), applyAlgorithm(solved, 'L'), fbSpec), false);
  assert.equal(checkStageTransition(solved, applyAlgorithm(solved, 'M'), fbSpec), false);
  const withPrecondition = { ...fbSpec, precondition: { predicate: 'fb' } as const };
  assert.equal(checkStageTransition(applyAlgorithm(solved, 'L'), solved, withPrecondition), false);
});

test('attempt invariants hold on QA vectors: no timed prep, no invented zero, consult means assisted', () => {
  assertTrainerAttempt(attempt({}));
  assertTrainerAttempt(attempt({ timingMode: 'free', rawMs: null }));
  assertTrainerAttempt(attempt({ timingMode: 'recognition', rawMs: 0 }));
  assertTrainerAttempt(attempt({ timingMode: 'repetitions', rawMs: 4200, cycles: 1 }));
  assertTrainerAttempt(attempt({ timingMode: 'continuous-batch', rawMs: null, cycles: 3 }));
  assertTrainerAttempt(attempt({ timingMode: 'duration', rawMs: null, physicalCycles: 0 }));
  assertTrainerAttempt(attempt({ outcome: 'consulted', assisted: true, rawMs: 999 }));
  assertTrainerAttempt(attempt({ inspectionMs: 15000 }));
  assert.throws(() => assertTrainerAttempt(attempt({ timingMode: 'free', rawMs: 0 })), /livre/);
  assert.throws(() => assertTrainerAttempt(attempt({ timingMode: 'timed', rawMs: null })), /cronometrado/);
  assert.throws(() => assertTrainerAttempt(attempt({ timingMode: 'timed', rawMs: -1 })), /cronometrado/);
  assert.throws(() => assertTrainerAttempt(attempt({ timingMode: 'repetitions', rawMs: 4200, cycles: 2.5 })), /ciclos/);
  assert.throws(() => assertTrainerAttempt(attempt({ timingMode: 'duration', rawMs: null, physicalCycles: -1 })), /duracao|ciclos/);
  assert.throws(() => assertTrainerAttempt(attempt({ timingMode: 'recognition', rawMs: null })), /reconhecimento|resposta/);
  assert.throws(() => assertTrainerAttempt(attempt({ outcome: 'consulted', assisted: false })), /assistida/);
  assert.throws(() => assertTrainerAttempt(attempt({ inspectionMs: Number.NaN })), /inspecao/);
});

test('statistics use clean correct attempts only for best and mean and declare the sample', () => {
  const stats = computeTrainerCaseStatistics([
    attempt({ id: 'a', rawMs: 1000 }),
    attempt({ id: 'b', rawMs: 800 }),
    attempt({ id: 'c', rawMs: 500, outcome: 'consulted', assisted: true }),
    attempt({ id: 'd', rawMs: 400, outcome: 'wrong' }),
    attempt({ id: 'e', timingMode: 'free', rawMs: null }),
  ]);
  assert.deepEqual(stats, { attempts: 5, correctRate: 0.6, lastMs: 400, bestMs: 800, cleanCorrectMeanMs: 900, cleanCorrectSampleSize: 2 });
  assert.deepEqual(computeTrainerCaseStatistics([]), { attempts: 0, correctRate: null, lastMs: null, bestMs: null, cleanCorrectMeanMs: null, cleanCorrectSampleSize: 0 });
});

test('trainer storage is versioned, starts empty, validates attempts and leaves the legacy 78 alone', () => {
  assert.deepEqual(migrateTrainerData(null), createEmptyTrainerDataV1());
  const stored = { version: 1, attempts: [attempt({}), attempt({ id: 'qa-2', timingMode: 'free', rawMs: null })], preferences: [{ contentId: 'cfop/cross/qa', favorite: true, note: 'qa', preferredAlternativeId: null, hand: null, slot: null }] };
  assert.deepEqual(migrateTrainerData(JSON.parse(JSON.stringify(stored))), stored);
  assert.throws(() => migrateTrainerData({ version: 0, attempts: [], preferences: [] }), /versao/);
  assert.throws(() => migrateTrainerData({ version: 1, attempts: [attempt({ timingMode: 'free', rawMs: 1 })], preferences: [] }), /livre/);
  const legacyBefore = JSON.stringify(LEGACY_CASE_IDS);
  migrateTrainerData(JSON.parse(JSON.stringify(stored)));
  assert.equal(JSON.stringify(LEGACY_CASE_IDS), legacyBefore);
});

test('announced minimum without generator proof is rejected at runtime, proven minimum accepted', () => {
  const unproven = specFixture('cfop/cross/easy', 'cross', [{ id: 'd1', name: 'facil', setupMoves: 5, announcedMinimumMoves: 7, minimumProven: false }]);
  assert.throws(() => assertFixtureIds([unproven]), /sem prova/);
  assert.throws(() => buildTrainerCoverage('cross', [unproven]), /sem prova/);
  const proven = specFixture('cfop/cross/easy', 'cross', [{ id: 'd1', name: 'facil', setupMoves: 5, announcedMinimumMoves: 7, minimumProven: true }]);
  const silent = specFixture('cfop/cross/free', 'cross', [{ id: 'd2', name: 'livre', setupMoves: 9, minimumProven: false }]);
  assert.deepEqual(buildTrainerCoverage('cross', [proven, silent]), { trainerId: 'cross', validatedContentCount: 2, declared: 'partial' });
});

test('unknown timing mode fails with the controlled error, never a raw TypeError', () => {
  const bad = attempt({ timingMode: 'warp' as TrainerAttempt['timingMode'] });
  assert.throws(() => assertTrainerAttempt(bad), (error: unknown) => error instanceof Error && /Treino invalido/.test(error.message) && /desconhecido/.test(error.message) && !(error instanceof TypeError));
  assert.throws(() => migrateTrainerData({ version: 1, attempts: [bad], preferences: [] }), /desconhecido/);
});

test('migration rejects unknown extra fields instead of silently filtering them', () => {
  const base = { version: 1, attempts: [attempt({})], preferences: [{ contentId: 'cfop/cross/qa', favorite: false, note: '', preferredAlternativeId: null, hand: null, slot: null }] };
  assert.deepEqual(migrateTrainerData(JSON.parse(JSON.stringify(base))), base);
  assert.throws(() => migrateTrainerData({ ...base, extra: true }), /desconhecidos/);
  assert.throws(() => migrateTrainerData({ ...base, attempts: [{ ...attempt({}), prepMs: 1200 }] }), /desconhecidos/);
  assert.throws(() => migrateTrainerData({ ...base, preferences: [{ ...base.preferences[0], color: 'blue' }] }), /desconhecidos/);
  const { physicalCycles: _dropped, ...incomplete } = attempt({});
  assert.throws(() => migrateTrainerData({ ...base, attempts: [incomplete] }), /ausentes|desconhecidos/);
});

test('coverage never declares complete and counts only fixtures approved for the trainer', () => {
  const many = Array.from({ length: 50 }, (_, i) => specFixture(`cfop/f2l/case-${String(i + 1).padStart(2, '0')}`, 'f2l'));
  const coverage = buildTrainerCoverage('f2l', [...many, specFixture('roux/fb/qa', 'roux')]);
  assert.deepEqual(coverage, { trainerId: 'f2l', validatedContentCount: 50, declared: 'partial' });
  assert.deepEqual(buildTrainerCoverage('cross', []), { trainerId: 'cross', validatedContentCount: 0, declared: 'introductory' });
});
