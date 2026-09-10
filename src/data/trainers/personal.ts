import { applyAlgorithm, invertAlgorithm, parseAlgorithm, solvedCube } from '../../domain/cube';
import type { DraftFacelets, SolverIssue } from '../../solver/types';
import { validateDraft } from '../../solver/validation';
import { solveValidatedInput } from '../../solver/solution';
import { methodStateKey } from '../../solver/methods/plan';
import { simplifySolverAlgorithm } from '../../solver/methods/simplify';
import { assertTrainerContentId, isNamespacedTrainerId } from './registry';
import type { PersonalAlgorithm, PersonalExercise, TrainerDataV1 } from './types';

const fail = (message: string): never => { throw new Error(`Conteudo pessoal invalido: ${message}`); };
const MAX_SEQUENCE_TOKENS = 256;
const DATE_PATTERN = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

function exactKeys(value: unknown, keys: readonly string[], what: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object') fail(`${what} invalido.`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some(key => !Object.hasOwn(record, key))) fail(`${what} com campos ausentes ou desconhecidos.`);
}
function personalId(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('personal/') || !isNamespacedTrainerId(value)) fail(`id pessoal fora do namespace personal/: ${String(value)}`);
  return value as string;
}
function text(value: unknown, max: number, what: string, nonempty = false): string {
  if (typeof value !== 'string' || value.length > max || (nonempty && !value.trim())) fail(`${what} invalido.`);
  return value as string;
}
function strictDate(value: unknown): string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('data invalida.');
  return value as string;
}
/** Empty-sequence semantics are explicit: minimum one token after parsing. A personal
 * algorithm with no moves and an exercise starting solved are both refused.
 */
function sequence(value: unknown, what: string): string {
  if (typeof value !== 'string') fail(`${what} invalido.`);
  let tokens: string[];
  try { tokens = parseAlgorithm(value as string); } catch { return fail(`${what} fora da gramatica.`); }
  if (!tokens.length) fail(`${what} vazio.`);
  if (tokens.length > MAX_SEQUENCE_TOKENS) fail(`${what} acima de ${MAX_SEQUENCE_TOKENS} movimentos.`);
  return tokens.join(' ');
}

export function validatePersonalAlgorithm(value: unknown): PersonalAlgorithm {
  exactKeys(value, ['id', 'contentId', 'name', 'moves', 'createdAt'], 'algoritmo pessoal');
  const contentId = value.contentId === null ? null : (() => { assertTrainerContentId(text(value.contentId, 200, 'contentId', true)); return value.contentId as string; })();
  return {
    id: personalId(value.id),
    contentId,
    name: text(value.name, 100, 'nome', true),
    moves: sequence(value.moves, 'algoritmo'),
    createdAt: strictDate(value.createdAt),
  };
}
export function validatePersonalExercise(value: unknown): PersonalExercise {
  exactKeys(value, ['id', 'name', 'objective', 'note', 'setup', 'solution', 'createdAt'], 'exercicio pessoal');
  return {
    id: personalId(value.id),
    name: text(value.name, 100, 'nome', true),
    objective: text(value.objective, 1000, 'objetivo'),
    note: text(value.note, 10000, 'nota'),
    setup: sequence(value.setup, 'preparo'),
    solution: value.solution === null ? null : sequence(value.solution, 'solucao'),
    createdAt: strictDate(value.createdAt),
  };
}
/** Uniqueness across BOTH personal collections (Sonda adjustment 2): attempts reference
 * personal exercises by contentId, so a shared id would make that history ambiguous.
 */
export function assertPersonalIdsUnique(algorithms: readonly PersonalAlgorithm[], exercises: readonly PersonalExercise[]): void {
  const seen = new Set<string>();
  for (const item of [...algorithms, ...exercises]) {
    if (seen.has(item.id)) fail(`id pessoal repetido entre as colecoes: ${item.id}`);
    seen.add(item.id);
  }
}

export function withPersonalAlgorithm(data: TrainerDataV1, algorithm: PersonalAlgorithm): TrainerDataV1 {
  const validated = validatePersonalAlgorithm(algorithm);
  const next = { ...data, personalAlgorithms: [...data.personalAlgorithms, validated] };
  assertPersonalIdsUnique(next.personalAlgorithms, next.personalExercises);
  return next;
}
export function withPersonalExercise(data: TrainerDataV1, exercise: PersonalExercise): TrainerDataV1 {
  const validated = validatePersonalExercise(exercise);
  const next = { ...data, personalExercises: [...data.personalExercises, validated] };
  assertPersonalIdsUnique(next.personalAlgorithms, next.personalExercises);
  return next;
}

export type PersonalExerciseBuild =
  | { readonly kind: 'built'; readonly exercise: PersonalExercise }
  | { readonly kind: 'impossible'; readonly issues: readonly SolverIssue[] };

/** Editor bridge (spec item 16): the drafted position is physically validated by the
 * solver's validateDraft by contract; the preparation comes from the direct solver's own
 * solution (inverted and simplified) and is verified to reproduce the exact state before
 * anything is returned. A solved position is refused by the empty-setup rule above.
 */
export async function buildPersonalExercise(input: { readonly facelets: DraftFacelets; readonly id: string; readonly name: string; readonly objective: string; readonly note: string; readonly solution: string | null; readonly createdAt: string }): Promise<PersonalExerciseBuild> {
  const validated = validateDraft(input.facelets);
  if (validated.kind !== 'valid') return { kind: 'impossible', issues: validated.issues };
  const solved = await solveValidatedInput(validated);
  const setup = simplifySolverAlgorithm(invertAlgorithm(solved.algorithm));
  const exercise = validatePersonalExercise({ id: input.id, name: input.name, objective: input.objective, note: input.note, setup, solution: input.solution, createdAt: input.createdAt });
  if (methodStateKey(applyAlgorithm(solvedCube(), exercise.setup)) !== methodStateKey(validated.state)) fail('preparo gerado nao reproduz a posicao montada.');
  return { kind: 'built', exercise };
}
