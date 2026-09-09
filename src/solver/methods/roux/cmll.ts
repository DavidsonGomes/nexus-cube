import { CMLL_SOURCES } from '../../../data/expansion-sources/cmll';
import { applyAlgorithm, invertAlgorithm, solvedCube } from '../../../domain/cube';
import type { CubeState } from '../../../domain/types';
import { createAnchorModel } from '../anchors';
import { AUF_OPTIONS, methodGoalSatisfied, methodTokens } from '../plan';
import type { MethodAdjustment } from '../types';
import { rouxCentersFixed } from './goals';
import { checkpoint, type SearchContext } from './search';
import { simplifySolverAlgorithm } from '../simplify';

interface Match { algorithm: string; adjustments: MethodAdjustment[]; matchedCaseId?: string }
const model = createAnchorModel('corner', []);
const signature = (state: CubeState) => ['UFR', 'URB', 'UBL', 'ULF'].map(piece => model.locate(state, piece)).join(',');
let completedTable: ReadonlyMap<string, Match> | undefined;
function adjustments(algorithm: string, prefix: string): MethodAdjustment[] {
  const tokens = methodTokens(algorithm), result: MethodAdjustment[] = [];
  if (prefix) result.push({ kind: 'auf', algorithm: prefix, explanation: 'Ajuste U para reconhecer o caso de cantos.', startStep: 0, endStep: 1 });
  tokens.forEach((token, i) => {
    if (/^[xyz]/.test(token)) result.push({ kind: 'rotation', algorithm: token, explanation: 'Gire o cubo inteiro conforme indicado; os giros seguintes usam essa orientação até a rotação de retorno.', startStep: i, endStep: i + 1 });
  });
  return result;
}
/** Index the licensed CMLL corpus by all four labelled corners, including explicit AUF. */
export async function matchCMLL(state: CubeState, context: SearchContext): Promise<Match> {
  await checkpoint(context);
  if (methodGoalSatisfied(state, { kind: 'cmll-up-to-auf' })) return { algorithm: '', adjustments: [] };
  if (!completedTable) {
    const table = new Map<string, Match>();
    for (const source of CMLL_SOURCES) {
      await checkpoint(context);
      for (const y of ['', 'y', 'y2', "y'"]) for (const u of AUF_OPTIONS) {
        // The AUF prefix stays a protected segment; only the conjugated body is simplified.
        const algorithm = [u, simplifySolverAlgorithm([y, source.algorithm, invertAlgorithm(y)].filter(Boolean).join(' '))].filter(Boolean).join(' ');
        const inverse = invertAlgorithm(algorithm);
        for (const post of AUF_OPTIONS) {
          const sample = applyAlgorithm(solvedCube(), [post, inverse].filter(Boolean).join(' '));
          const key = signature(sample), previous = table.get(key);
          if (!previous || methodTokens(algorithm).length < methodTokens(previous.algorithm).length) {
            table.set(key, { algorithm, adjustments: adjustments(algorithm, u), matchedCaseId: source.id });
          }
        }
      }
    }
    await checkpoint(context);
    completedTable = table;
  }
  const match = completedTable.get(signature(state));
  if (!match) throw new Error('Nenhum caso CMLL foi confirmado no referencial dos blocos.');
  const after = applyAlgorithm(state, match.algorithm);
  if (!rouxCentersFixed(after) || !methodGoalSatisfied(after, { kind: 'cmll-up-to-auf' })) throw new Error('O encaixe CMLL não preserva o referencial dos blocos.');
  return structuredClone(match);
}
