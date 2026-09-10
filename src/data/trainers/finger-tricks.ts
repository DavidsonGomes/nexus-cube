import { applyAlgorithm, parseAlgorithm, solvedCube } from '../../domain/cube';
import { methodStateKey } from '../../solver/methods/plan';
import { isNamespacedTrainerId } from './registry';

export interface FingerTrickTouch {
  readonly move: string;
  readonly moveIndex: number;
  readonly touchIndex: number;
  readonly touchCount: number;
  readonly hand: 'left' | 'right';
  readonly finger: 'thumb' | 'index' | 'middle' | 'ring' | 'pinky' | 'wrist';
  readonly action: string;
  readonly contactPoint: string;
  readonly anchorPieces?: readonly string[];
  readonly direction: string;
  readonly regripAfter: string | null;
}
export interface FingerTrickSource { readonly title: string; readonly url: string; readonly license: string; readonly supports?: string; readonly accessedAt?: string }
export interface FingerTrickRecord {
  readonly id: string;
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly moves: string;
  readonly handedness: 'left' | 'right' | 'both';
  /** One-handed records (spec item 14): in OH the executing hand is also the stabilizing one. */
  readonly solvingHand?: 'left' | 'right';
  readonly mirrorOf: string | null;
  readonly category: string;
  readonly touches: readonly FingerTrickTouch[];
  readonly loop: { readonly continuesFromPreviousState: boolean; readonly restoreCycles: number | null };
  readonly pedagogy?: { readonly objective: string; readonly watchFor: string; readonly commonErrors: readonly string[] };
  readonly provenance: { readonly status: 'proposed' | 'verified' | 'rejected'; readonly sources?: readonly FingerTrickSource[] };
}
export interface IntegratedFingerTrick {
  readonly record: FingerTrickRecord;
  readonly tokens: readonly string[];
  /** Domain proof, never curation guesswork: the order of the sequence in the cube group. */
  readonly restoreCycles: number;
  /** Display contract with Trama: grip and fingers only for verified records; anything else keeps the plain animation. */
  readonly showGrip: boolean;
}

const fail = (id: string, message: string): never => { throw new Error(`Registro de finger trick invalido (${id}): ${message}`); };
/** Canonical piece vocabulary in this codebase's Reid spelling (Sonda's integration guard). */
export const CANONICAL_PIECE_NAMES: readonly string[] = Object.freeze([
  'U', 'R', 'F', 'D', 'L', 'B',
  'UF', 'UR', 'UB', 'UL', 'DF', 'DR', 'DB', 'DL', 'FR', 'FL', 'BR', 'BL',
  'UFR', 'URB', 'UBL', 'ULF', 'DFR', 'DFL', 'DBR', 'DBL',
]);
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky', 'wrist'];
const MAX_RESTORE_CYCLES = 1260;

export function validateFingerTrickRecord(value: unknown): { record: FingerTrickRecord; tokens: readonly string[] } {
  const record = value as FingerTrickRecord;
  const id = typeof record?.id === 'string' ? record.id : '(sem id)';
  if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !isNamespacedTrainerId(record.id)) fail(id, 'id fora do namespace.');
  if (record.mirrorOf !== null && (typeof record.mirrorOf !== 'string' || !isNamespacedTrainerId(record.mirrorOf))) fail(id, 'mirrorOf invalido.');
  if (!['proposed', 'verified', 'rejected'].includes(record.provenance?.status)) fail(id, 'status de proveniencia invalido.');
  if (record.loop?.restoreCycles !== null) fail(id, 'restoreCycles deve nascer null na curadoria; o valor e prova do dominio.');
  const tokens = parseAlgorithm(record.moves);
  if (!tokens.length) fail(id, 'sequencia vazia.');
  if (!Array.isArray(record.touches) || !record.touches.length) fail(id, 'toques ausentes.');
  const perMove = new Map<number, FingerTrickTouch[]>();
  for (const touch of record.touches) {
    if (!Number.isInteger(touch.moveIndex) || touch.moveIndex < 0 || touch.moveIndex >= tokens.length) fail(id, `moveIndex fora da sequencia: ${touch.moveIndex}.`);
    if (parseAlgorithm(touch.move).join(' ') !== tokens[touch.moveIndex]) fail(id, `token divergente em moveIndex ${touch.moveIndex}: ${touch.move} vs ${tokens[touch.moveIndex]}.`);
    if (touch.hand !== 'left' && touch.hand !== 'right') fail(id, 'mao do toque invalida.');
    if (!FINGERS.includes(touch.finger)) fail(id, 'dedo do toque invalido.');
    for (const piece of touch.anchorPieces ?? []) {
      if (!CANONICAL_PIECE_NAMES.includes(piece)) fail(id, `ancora fora do vocabulario canonico: ${piece}.`);
    }
    const group = perMove.get(touch.moveIndex) ?? [];
    group.push(touch);
    perMove.set(touch.moveIndex, group);
  }
  for (const [index, token] of tokens.entries()) {
    const group = perMove.get(index) ?? [];
    const expected = token.endsWith('2') ? 2 : 1;
    if (group.length !== expected) fail(id, `movimento ${token} exige ${expected} toque(s) e recebeu ${group.length}.`);
    if (group.some(touch => touch.touchCount !== expected)) fail(id, `touchCount divergente no movimento ${token}.`);
    const seen = group.map(touch => touch.touchIndex).sort().join(',');
    if (seen !== Array.from({ length: expected }, (_, i) => i + 1).join(',')) fail(id, `touchIndex fora de 1..${expected} no movimento ${token}.`);
  }
  return { record, tokens };
}

export function restoreCyclesOf(moves: string): number {
  const solved = solvedCube(), solvedKey = methodStateKey(solved);
  let state = solved;
  for (let cycle = 1; cycle <= MAX_RESTORE_CYCLES; cycle++) {
    state = applyAlgorithm(state, moves);
    if (methodStateKey(state) === solvedKey) return cycle;
  }
  throw new Error(`Ordem da sequencia acima do maximo do grupo: ${moves}`);
}

export function integrateFingerTricks(values: readonly unknown[]): readonly IntegratedFingerTrick[] {
  const seen = new Set<string>();
  return values.map(value => {
    const { record, tokens } = validateFingerTrickRecord(value);
    if (seen.has(record.id)) fail(record.id, 'id duplicado.');
    seen.add(record.id);
    return { record, tokens, restoreCycles: restoreCyclesOf(tokens.join(' ')), showGrip: record.provenance.status === 'verified' };
  });
}
