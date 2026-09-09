import { applyAlgorithm, canonicalOrientation, invertAlgorithm, parseAlgorithm, solvedCube } from '../../domain/cube';
import { CROSS_PIECES, arePiecesSolved, f2lSignature, validateStage } from '../../domain/stage-validation';
import type { CubeState } from '../../domain/types';
import { F2L_CASES } from '../f2l-compiled';
import { simplifySolverAlgorithm } from '../../solver/methods/simplify';
import { isF2LPairFormed } from './stage-validators';
import type { TargetSlot } from './types';
import type { TrainerRandom } from './cross-generator';

export interface F2LSetup {
  readonly caseId: string;
  readonly slot: TargetSlot;
  readonly setup: string;
  readonly state: CubeState;
  readonly solution: string;
  readonly rotation: string;
  readonly auf: string;
}
export interface F2LSetupGenerator {
  readonly caseIds: readonly string[];
  readonly generate: (caseId: string, slot: TargetSlot, random: TrainerRandom) => F2LSetup;
  /** Cases whose solution passes through a formed pair strictly before insertion; the honest
   * pool of the two-step exercise, derived from the solutions themselves.
   */
  readonly twoStepCaseIds: readonly string[];
  readonly generateTwoStep: (caseId: string, slot: TargetSlot, random: TrainerRandom) => F2LSetup & { readonly steps: readonly { readonly checkpointId: string | null; readonly algorithm: string }[] };
}

/** Index of the first solution prefix after which the pair is formed and stays formed until
 * insertion; null when the solution never shows a strictly earlier formed state.
 */
export function findPairFormationSplit(state: CubeState, solution: string, slot: TargetSlot): number | null {
  const tokens = parseAlgorithm(solution);
  for (let cut = 1; cut < tokens.length; cut++) {
    if (isF2LPairFormed(applyAlgorithm(state, tokens.slice(0, cut).join(' ')), slot)) return cut;
  }
  return null;
}

const SLOTS: readonly TargetSlot[] = ['FR', 'FL', 'BR', 'BL'];
const ROTATIONS = ['', 'y', 'y2', "y'"] as const;
const AUF = ['', 'U', 'U2', "U'"] as const;
const join = (...parts: string[]) => parts.filter(Boolean).join(' ');
const conjugate = (rotation: string, algorithm: string) => join(rotation, algorithm, invertAlgorithm(rotation));
const othersOf = (slot: TargetSlot) => [...CROSS_PIECES, ...SLOTS.filter(s => s !== slot).flatMap(s => [s, `D${s}`])];

/** Slot presentation reuses the Cube Coach 856b269c MIT algorithms already compiled in
 * F2L_CASES, mapped to each slot by y conjugation and to varied presentations by AUF.
 * Every generated setup is revalidated here: the case identity at the slot is AUF invariant,
 * the paired solution really completes the slot, and cross plus the other three pairs hold
 * at both extremes. Divergence throws instead of shipping an unproven exercise.
 */
export function createF2LSetupGenerator(): F2LSetupGenerator {
  const solved = solvedCube();
  const bySlot = new Map<string, Map<TargetSlot, { rotation: string; solution: string; signature: string }>>();
  for (const item of F2L_CASES) {
    const slots = new Map<TargetSlot, { rotation: string; solution: string; signature: string }>();
    for (const rotation of ROTATIONS) {
      const solution = conjugate(rotation, canonicalOrientation(item.algorithm));
      const state = applyAlgorithm(solved, invertAlgorithm(solution));
      const slot = SLOTS.find(candidate => !validateStage(state, { goal: 'f2l-pair', targetSlot: candidate }) && arePiecesSolved(state, othersOf(candidate)));
      if (!slot || slots.has(slot)) continue;
      slots.set(slot, { rotation, solution, signature: f2lSignature(state, slot) });
    }
    bySlot.set(item.id, slots);
  }
  const generate = (caseId: string, slot: TargetSlot, random: TrainerRandom): F2LSetup => {
    const mapped = bySlot.get(caseId)?.get(slot);
    if (!mapped) throw new Error(`Caso F2L sem apresentação validada no slot: ${caseId}/${slot}`);
    const auf = AUF[Math.floor(random.next() * AUF.length)];
    const solution = simplifySolverAlgorithm(join(invertAlgorithm(auf), mapped.solution));
    const setup = simplifySolverAlgorithm(invertAlgorithm(solution));
    const state = applyAlgorithm(solved, setup);
    const others = othersOf(slot);
    const after = applyAlgorithm(state, solution);
    if (f2lSignature(state, slot) !== mapped.signature) throw new Error(`Identidade do caso divergente: ${caseId}/${slot}`);
    if (!validateStage(after, { goal: 'f2l-pair', targetSlot: slot })) throw new Error(`Solução não conclui o par: ${caseId}/${slot}`);
    if (!arePiecesSolved(state, others) || !arePiecesSolved(after, others)) throw new Error(`Preservação violada: ${caseId}/${slot}`);
    return { caseId, slot, setup, state, solution, rotation: mapped.rotation, auf };
  };
  const twoStepCaseIds = F2L_CASES.filter(item => {
    const mapped = bySlot.get(item.id)?.get('FR');
    if (!mapped) return false;
    const state = applyAlgorithm(solved, invertAlgorithm(mapped.solution));
    return !isF2LPairFormed(state, 'FR') && findPairFormationSplit(state, mapped.solution, 'FR') !== null;
  }).map(item => item.id);
  const generateTwoStep = (caseId: string, slot: TargetSlot, random: TrainerRandom) => {
    if (!twoStepCaseIds.includes(caseId)) throw new Error(`Caso F2L sem etapa de formação separável: ${caseId}`);
    for (let attempt = 0; attempt < 50; attempt++) {
      const setup = generate(caseId, slot, random);
      if (isF2LPairFormed(setup.state, slot)) continue;
      const cut = findPairFormationSplit(setup.state, setup.solution, slot);
      if (cut === null) continue;
      const tokens = parseAlgorithm(setup.solution);
      return {
        ...setup,
        steps: [
          { checkpointId: 'pair-formed', algorithm: tokens.slice(0, cut).join(' ') },
          { checkpointId: null, algorithm: tokens.slice(cut).join(' ') },
        ],
      };
    }
    throw new Error(`Não foi possível separar formação e inserção: ${caseId}/${slot}`);
  };
  return { caseIds: F2L_CASES.map(item => item.id), generate, twoStepCaseIds, generateTwoStep };
}
