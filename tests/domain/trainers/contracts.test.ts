import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlgorithm, solvedCube } from '../../../src/domain/cube';
import {
  LEGACY_CASE_IDS, assertFixtureIds, assertTrainerAttempt, assertTrainerContentId, buildTrainerCoverage,
  checkStageCondition, checkStageTransition, computeTrainerCaseStatistics, createEmptyTrainerDataV1,
  isNamespacedTrainerId, migrateTrainerData,
} from '../../../src/data/trainers';
import type { StagePredicateId, TrainerAttempt, TrainerFixtureSpec } from '../../../src/data/trainers';

const CENTERS = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
const FB = ['DL', 'FL', 'BL', 'DFL', 'DBL', 'L'] as const;

function fixture(id: string, trainerId: TrainerFixtureSpec['trainerId']): TrainerFixtureSpec {
  return {
    id, trainerId, methodId: 'roux', stageId: 'fb', groupId: 'fb', kind: 'execution',
    name: id, objective: 'test', precondition: { predicate: 'any-legal' }, goal: { predicate: 'fb' },
    preserve: CENTERS, referenceFrame: 'fixed', setupSubgroup: null, difficulty: null, focus: null, provenance: [],
  };
}
function attempt(partial: Partial<TrainerAttempt>): TrainerAttempt {
  return {
    id: 'att-1', trainerId: 'roux', contentId: 'roux/fb/block', alternativeId: null, hand: null, slot: null,
    timingMode: 'timed', createdAt: '2026-09-09T00:00:00.000Z', outcome: 'correct', assisted: false,
    rawMs: 1000, inspectionMs: null, cycles: null, physicalCycles: null, ...partial,
  };
}

test('legacy catalog keeps exactly the 78 v1 IDs and trainer IDs stay namespaced apart', () => {
  assert.equal(LEGACY_CASE_IDS.length, 78);
  assert.equal(LEGACY_CASE_IDS.filter(id => id.startsWith('OLL-')).length, 57);
  assert.equal(LEGACY_CASE_IDS.filter(id => id.startsWith('PLL-')).length, 21);
  assert.equal(new Set(LEGACY_CASE_IDS).size, 78);
  for (const id of LEGACY_CASE_IDS) assert.equal(id.includes('/'), false);
  for (const id of ['OLL-01', 'PLL-Aa', 'roux/fb/pieces', 'roux/lse/eo', 'f2l/back-insertions/br']) assertTrainerContentId(id);
  for (const id of ['Roux/FB', 'roux//x', 'oll', 'roux/fb/pieces/extra/deep', '/roux/fb']) {
    assert.equal(isNamespacedTrainerId(id), false);
  }
  assert.throws(() => assertTrainerContentId('oll'), /invalido/);
  assert.throws(() => assertFixtureIds([fixture('roux/fb/full', 'roux'), fixture('roux/fb/full', 'roux')]), /duplicado/);
  const level = { id: 'short', name: 'Curto', setupMoves: 8, announcedMinimumMoves: 6, minimumProven: false };
  assert.throws(() => assertFixtureIds([{ ...fixture('cross/full/free', 'cross'), difficulty: [level] }]), /sem prova/);
  assertFixtureIds([{ ...fixture('cross/full/free', 'cross'), difficulty: [{ ...level, minimumProven: true }] }]);
});

test('stage predicates delegate to the shared validators with Roux names and both frames', () => {
  const solved = solvedCube();
  for (const predicate of ['cross', 'f2l', 'oll', 'pll', 'fb', 'sb', 'cmll', 'cmll-oriented', 'eo', 'lr', 'finish', 'centers', 'any-legal'] as StagePredicateId[]) {
    assert.equal(checkStageCondition(solved, { predicate }), true, predicate);
  }
  const auf = applyAlgorithm(solved, 'U');
  assert.equal(checkStageCondition(auf, { predicate: 'cmll-oriented' }), true);
  assert.equal(checkStageCondition(auf, { predicate: 'cmll' }), false);
  const sune = applyAlgorithm(solved, "R U R' U R U2 R'");
  assert.equal(checkStageCondition(sune, { predicate: 'cmll-oriented' }), false);
  assert.equal(checkStageCondition(applyAlgorithm(solved, 'L'), { predicate: 'cmll-oriented' }), false);
  const brokenLeft = applyAlgorithm(solved, 'L');
  assert.equal(checkStageCondition(brokenLeft, { predicate: 'fb' }), false);
  assert.equal(checkStageCondition(brokenLeft, { predicate: 'any-legal' }), true);
  const sexy = applyAlgorithm(solved, "R U R' U'");
  assert.equal(checkStageCondition(sexy, { predicate: 'fb' }), true);
  assert.equal(checkStageCondition(sexy, { predicate: 'any-legal', preserve: FB }), true);
  assert.equal(checkStageCondition(brokenLeft, { predicate: 'any-legal', preserve: FB }), false);
  const m2 = applyAlgorithm(solved, 'M2');
  assert.equal(checkStageCondition(m2, { predicate: 'eo' }), true);
  assert.equal(checkStageCondition(m2, { predicate: 'lr' }), true);
  assert.equal(checkStageCondition(m2, { predicate: 'finish' }), false);
  assert.throws(() => checkStageCondition(solved, { predicate: 'nope' as StagePredicateId }), /desconhecido/);
});

test('stage transition checks precondition, goal and preservation on both extremes', () => {
  const solved = solvedCube();
  const spec = { precondition: { predicate: 'any-legal' } as const, goal: { predicate: 'fb' } as const, preserve: CENTERS, referenceFrame: 'fixed' as const };
  assert.equal(checkStageTransition(applyAlgorithm(solved, 'L'), solved, spec), true);
  assert.equal(checkStageTransition(applyAlgorithm(solved, 'L'), applyAlgorithm(solved, 'M'), spec), false);
  assert.equal(checkStageTransition(applyAlgorithm(solved, 'L'), applyAlgorithm(solved, 'L'), spec), false);
});

test('attempt invariants: prep never timed, free mode has no invented zero, consult marks assisted', () => {
  assertTrainerAttempt(attempt({}));
  assertTrainerAttempt(attempt({ timingMode: 'free', rawMs: null }));
  assertTrainerAttempt(attempt({ timingMode: 'duration', rawMs: null, physicalCycles: 12 }));
  assertTrainerAttempt(attempt({ timingMode: 'repetitions', cycles: 5 }));
  assertTrainerAttempt(attempt({ timingMode: 'recognition', rawMs: 850 }));
  assertTrainerAttempt(attempt({ outcome: 'consulted', assisted: true }));
  assert.throws(() => assertTrainerAttempt(attempt({ timingMode: 'free' })), /livre/);
  assert.throws(() => assertTrainerAttempt(attempt({ timingMode: 'timed', rawMs: null })), /cronometrado/);
  assert.throws(() => assertTrainerAttempt(attempt({ timingMode: 'duration', rawMs: null })), /duracao/);
  assert.throws(() => assertTrainerAttempt(attempt({ timingMode: 'repetitions', cycles: 0 })), /ciclos/);
  assert.throws(() => assertTrainerAttempt(attempt({ outcome: 'consulted' })), /assistida/);
  assert.throws(() => assertTrainerAttempt(attempt({ inspectionMs: -1 })), /inspecao/);
  assert.throws(() => assertTrainerAttempt(attempt({ timingMode: 'stopwatch' as TrainerAttempt['timingMode'] })), /Treino invalido: modo de cronometragem desconhecido/);
});

test('statistics report a plain mean over clean correct attempts with its sample size', () => {
  const stats = computeTrainerCaseStatistics([
    attempt({ rawMs: 1000 }),
    attempt({ id: 'att-2', rawMs: 800, assisted: true }),
    attempt({ id: 'att-3', rawMs: 1200, outcome: 'wrong' }),
    attempt({ id: 'att-4', rawMs: 900, outcome: 'consulted', assisted: true }),
  ]);
  assert.deepEqual(stats, { attempts: 4, correctRate: 0.5, lastMs: 900, bestMs: 1000, cleanCorrectMeanMs: 1000, cleanCorrectSampleSize: 1 });
  assert.deepEqual(computeTrainerCaseStatistics([]), { attempts: 0, correctRate: null, lastMs: null, bestMs: null, cleanCorrectMeanMs: null, cleanCorrectSampleSize: 0 });
});

test('versioned trainer storage starts empty, validates v1 and never touches the legacy 78', () => {
  assert.deepEqual(migrateTrainerData(undefined), createEmptyTrainerDataV1());
  const stored = { version: 1, attempts: [attempt({})], preferences: [], personalAlgorithms: [], personalExercises: [] };
  assert.deepEqual(migrateTrainerData(stored), stored);
  assert.throws(() => migrateTrainerData({ version: 1, attempts: [], preferences: [] }), /ausentes ou desconhecidos/, 'chave FALTANTE e recusada como a extra');
  assert.throws(() => migrateTrainerData({ version: 2, attempts: [], preferences: [] }), /versao/);
  assert.throws(() => migrateTrainerData({ ...stored, attempts: [attempt({ timingMode: 'free' })] }), /livre/);
  assert.throws(() => migrateTrainerData({ ...stored, extra: true }), /desconhecidos/);
  assert.throws(() => migrateTrainerData({ ...stored, attempts: [{ ...attempt({}), extra: 1 }] }), /desconhecidos/);
  assert.throws(() => migrateTrainerData({ ...stored, preferences: [{ contentId: 'OLL-01', favorite: true, note: '', preferredAlternativeId: null, hand: null, slot: null, extra: 1 }] }), /desconhecidos/);
  const before = [...LEGACY_CASE_IDS];
  migrateTrainerData(stored);
  assert.deepEqual([...LEGACY_CASE_IDS], before);
});

test('coverage counts derive only from approved fixtures of the trainer and stay honest', () => {
  const approved = [fixture('roux/fb/block', 'roux'), fixture('roux/sb/block', 'roux'), fixture('f2l/slots/fr', 'f2l')];
  assert.deepEqual(buildTrainerCoverage('roux', approved), { trainerId: 'roux', validatedContentCount: 2, declared: 'partial' });
  assert.deepEqual(buildTrainerCoverage('cross', approved), { trainerId: 'cross', validatedContentCount: 0, declared: 'introductory' });
});
