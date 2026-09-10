import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlgorithm, solvedCube } from '../../../src/domain/cube';
import { methodStateKey } from '../../../src/solver/methods/plan';
import { draftFromCube } from '../../../src/solver/validation';
import { LEGACY_CASE_IDS } from '../../../src/data/trainers/registry';
import { createEmptyTrainerDataV1, migrateTrainerData } from '../../../src/data/trainers/session';
import {
  assertPersonalIdsUnique, buildPersonalExercise, validatePersonalAlgorithm, validatePersonalExercise,
  withPersonalAlgorithm, withPersonalExercise,
} from '../../../src/data/trainers/personal';
import type { PersonalAlgorithm, PersonalExercise } from '../../../src/data/trainers/types';

const algorithm = (partial: Partial<PersonalAlgorithm> = {}): PersonalAlgorithm => ({
  id: 'personal/meu-sexy', contentId: null, name: 'Meu sexy', moves: "R U R' U'", createdAt: '2026-09-09T12:00:00.000Z', ...partial,
});
const exercise = (partial: Partial<PersonalExercise> = {}): PersonalExercise => ({
  id: 'personal/meu-caso', name: 'Meu caso', objective: 'Praticar', note: '', setup: "R U R'", solution: null, createdAt: '2026-09-09T12:00:00.000Z', ...partial,
});

test('personal records validate every field with controlled errors', () => {
  assert.deepEqual(validatePersonalAlgorithm(algorithm()), algorithm());
  assert.deepEqual(validatePersonalExercise(exercise()), exercise());
  assert.deepEqual(validatePersonalAlgorithm(algorithm({ contentId: 'OLL-01' })).contentId, 'OLL-01', 'contentId legado dos 78 aceito');
  assert.deepEqual(validatePersonalAlgorithm(algorithm({ contentId: 'roux/fb/full' })).contentId, 'roux/fb/full', 'contentId namespaced aceito');
  assert.throws(() => validatePersonalAlgorithm(algorithm({ contentId: 'oll' })), /invalido/, 'referencia orfa recusada');
  assert.throws(() => validatePersonalAlgorithm(algorithm({ id: 'tricks/meu' })), /personal\//, 'prefixo obrigatorio');
  assert.throws(() => validatePersonalAlgorithm(algorithm({ moves: '' })), /vazio/, 'algoritmo vazio proibido');
  assert.throws(() => validatePersonalExercise(exercise({ setup: '   ' })), /vazio/, 'preparo vazio (partir do resolvido) proibido');
  assert.throws(() => validatePersonalAlgorithm(algorithm({ moves: 'Q' })), /gramatica/);
  assert.throws(() => validatePersonalExercise(exercise({ solution: 'Q' })), /gramatica/);
  assert.throws(() => validatePersonalAlgorithm(algorithm({ moves: Array.from({ length: 257 }, () => 'U').join(' ') })), /acima de 256/);
  assert.throws(() => validatePersonalAlgorithm(algorithm({ createdAt: '2026-09-09' })), /data/);
  assert.throws(() => validatePersonalAlgorithm({ ...algorithm(), extra: 1 }), /ausentes ou desconhecidos/);
  const missing = { ...exercise() } as Record<string, unknown>;
  delete missing.solution;
  assert.throws(() => validatePersonalExercise(missing), /ausentes ou desconhecidos/, 'chave faltante recusada');
});

test('personal ids are unique across BOTH collections and attempts may reference them', () => {
  assert.throws(() => assertPersonalIdsUnique([algorithm({ id: 'personal/x' })], [exercise({ id: 'personal/x' })]), /repetido entre as colecoes/);
  let data = withPersonalAlgorithm(createEmptyTrainerDataV1(), algorithm());
  data = withPersonalExercise(data, exercise());
  assert.throws(() => withPersonalExercise(data, exercise({ id: 'personal/meu-sexy' })), /repetido/);
  const roundtrip = migrateTrainerData(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(roundtrip, data, 'roundtrip integral do shape de cinco chaves');
  const before = [...LEGACY_CASE_IDS];
  migrateTrainerData(data);
  assert.deepEqual([...LEGACY_CASE_IDS], before, 'os 78 legados ficam intocados');
});

test('the editor bridge validates physical possibility and reproduces the drafted position', { timeout: 120_000 }, async () => {
  const state = applyAlgorithm(solvedCube(), "R U R' U' F2 D");
  const built = await buildPersonalExercise({ facelets: draftFromCube(state), id: 'personal/montado', name: 'Montado', objective: '', note: '', solution: null, createdAt: '2026-09-09T12:00:00.000Z' });
  assert.equal(built.kind, 'built');
  if (built.kind !== 'built') return;
  assert.equal(methodStateKey(applyAlgorithm(solvedCube(), built.exercise.setup)), methodStateKey(state), 'preparo reproduz a posicao montada');
  const twisted = draftFromCube(state).U.slice();
  const impossible = { ...draftFromCube(state), U: [...twisted.slice(0, 8), 'R'] } as ReturnType<typeof draftFromCube>;
  const rejected = await buildPersonalExercise({ facelets: impossible, id: 'personal/impossivel', name: 'X', objective: '', note: '', solution: null, createdAt: '2026-09-09T12:00:00.000Z' });
  assert.equal(rejected.kind, 'impossible');
  if (rejected.kind === 'impossible') assert.ok(rejected.issues.length >= 1, 'issues do validateDraft expostas');
  await assert.rejects(() => buildPersonalExercise({ facelets: draftFromCube(solvedCube()), id: 'personal/resolvido', name: 'X', objective: '', note: '', solution: null, createdAt: '2026-09-09T12:00:00.000Z' }), /vazio/, 'posicao resolvida recusada pela regra de preparo vazio');
});
