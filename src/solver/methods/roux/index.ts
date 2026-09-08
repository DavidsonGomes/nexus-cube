import { applyAlgorithm } from '../../../domain/cube';
import type { ValidatedSolverInput } from '../../types';
import { AUF_OPTIONS, createMethodPlanBuilder, methodGoalSatisfied } from '../plan';
import type { MethodPlan, MethodPlannerOptions } from '../types';
import { ROUX_BLOCKS, ROUX_CORNERS, ROUX_LEFT } from './goals';
import { checkpoint, searchBlock, searchContext, searchLSE, turns } from './search';
import { matchCMLL } from './cmll';

/** Call in the solver worker. Cooperatively yields and checks cancellation throughout search. */
export async function planRoux(input: ValidatedSolverInput, options: MethodPlannerOptions = {}): Promise<MethodPlan> {
  const builder = createMethodPlanBuilder('roux', input, options), context = searchContext(options);
  await checkpoint(context);
  const fb = await searchBlock(builder.state, ['DL', 'FL', 'BL', 'DFL', 'DBL'], turns('URFDLB'), context);
  builder.addStage({ id: 'roux.fb', title: 'Primeiro bloco', explanation: 'Construa o bloco esquerdo 1 × 2 × 3: DL, FL, BL, DFL e DBL, alinhado ao centro vermelho. As outras peças permanecem livres.', goal: { kind: 'first-block' } }, fb);
  const sb = await searchBlock(builder.state, ['DR', 'FR', 'BR', 'DFR', 'DBR', 'U'], turns('URMr'), context);
  builder.addStage({ id: 'roux.sb', title: 'Segundo bloco', explanation: 'Construa o bloco direito com U, R, M e r, preservando o bloco esquerdo. Ao terminar, confira ambos os blocos e os centros na referência inicial.', goal: { kind: 'second-block' }, preservedPieces: ROUX_LEFT }, sb);
  const cmll = await matchCMLL(builder.state, context);
  builder.addStage({ id: 'roux.cmll', title: 'CMLL: quatro cantos', explanation: 'Reconheça os quatro cantos superiores e execute o caso confirmado. Os dois blocos voltam a ficar completos ao terminar; as seis arestas livres serão resolvidas em LSE.', goal: { kind: 'cmll-up-to-auf' }, preservedPieces: ROUX_BLOCKS, adjustments: cmll.adjustments, matchedCaseId: cmll.matchedCaseId }, cmll.algorithm);
  const auf = AUF_OPTIONS.find(u => methodGoalSatisfied(applyAlgorithm(builder.state, u), { kind: 'cmll' }));
  if (auf === undefined) throw new Error('Não foi possível alinhar os cantos após CMLL.');
  builder.addStage({ id: 'roux.cmll-auf', title: 'Alinhar os cantos', explanation: 'Ajuste U para alinhar os quatro cantos com os blocos antes de orientar as arestas.', goal: { kind: 'cmll' }, preservedPieces: ROUX_BLOCKS, adjustments: auf ? [{ kind: 'auf', algorithm: auf, explanation: 'Alinhamento final dos cantos com os blocos.', startStep: 0, endStep: 1 }] : [] }, auf);
  for (const part of ['eo', 'lr', 'finish'] as const) {
    await checkpoint(context);
    const algorithm = await searchLSE(builder.state, part, context);
    const details = {
      eo: { title: 'LSE: orientar arestas', explanation: 'Use U e M para orientar as seis arestas. Ao terminar, os adesivos amarelos ou brancos das arestas e seus centros ficam no eixo vertical; M2 pode restar nos centros.', goal: { kind: 'lse-eo' as const } },
      lr: { title: 'LSE: completar esquerda e direita', explanation: 'Coloque UL e UR em suas posições, mantendo as seis arestas orientadas ao terminar.', goal: { kind: 'lse-lr' as const } },
      finish: { title: 'LSE: concluir arestas e centros', explanation: 'Permute as últimas arestas e ajuste os centros. Confira as seis faces completas na referência original.', goal: { kind: 'solved' as const } },
    }[part];
    builder.addStage({ id: `roux.${part}`, ...details, centerPolicy: part === 'finish' ? 'fixed' : 'm-slice-even', preservedPieces: part === 'finish' ? [...ROUX_CORNERS, 'UL', 'UR'] : ROUX_CORNERS }, algorithm);
  }
  await checkpoint(context);
  return builder.finish();
}
