import { applyAlgorithm, faceColors, parseAlgorithm } from '../domain/cube';
import type { CubeState } from '../domain/types';
import type { SolverErrorCode, SolverOutcome, SolverPhase, ValidatedSolverInput } from './types';
import { SOLVER_FACES, validateDraft } from './validation';

export const MAX_SOLVER_MOVES=256;
export class SolverFailure extends Error {
  constructor(public readonly code:SolverErrorCode,message:string){super(message);this.name='SolverFailure';}
}
export function solverTokens(algorithm:string):string[] {
  if(typeof algorithm!=='string'||algorithm.length>MAX_SOLVER_MOVES*4)throw new SolverFailure('invalid-response','A solução retornada tem formato inválido.');
  const tokens=parseAlgorithm(algorithm);
  if(tokens.length>MAX_SOLVER_MOVES||tokens.some(t=>! /^[URFDLB](2|')?$/.test(t)))throw new SolverFailure('invalid-response','A solução contém movimentos não suportados.');
  // Do not silently accept alternate notation such as R2' or wide turns.
  if(algorithm.trim()&&algorithm.trim().split(/\s+/).some(t=>! /^[URFDLB](2|')?$/.test(t)))throw new SolverFailure('invalid-response','A solução contém movimentos não suportados.');
  return tokens;
}
export function solverStateAtStep(initialState:CubeState,algorithm:string,step:number):CubeState {
  const tokens=solverTokens(algorithm);
  if(!Number.isInteger(step)||step<0||step>tokens.length)throw new Error('Passo inválido.');
  return applyAlgorithm(initialState,tokens.slice(0,step).join(' '));
}
export function verifySolverSolution(initialState:CubeState,algorithm:string):boolean {
  const final=solverStateAtStep(initialState,algorithm,solverTokens(algorithm).length);
  return final.length===54&&SOLVER_FACES.every(f=>faceColors(final,f).every(c=>c===f));
}
/** Revalidate facelets, never trust cached cubies/state or a caller-provided key. */
export function revalidateSolverInput(input:ValidatedSolverInput):ValidatedSolverInput {
  const valid=validateDraft(input?.facelets);
  if(valid.kind!=='valid')throw new SolverFailure('invalid-input','Confira o preenchimento antes de resolver.');
  if(input.inputKey!==valid.inputKey)throw new SolverFailure('input-key-mismatch','O preenchimento mudou. Solicite uma nova solução.');
  return valid;
}
export async function solveValidatedInput(input:ValidatedSolverInput,onPhase?:(phase:SolverPhase)=>void):Promise<{algorithm:string;tokens:readonly string[];initialState:CubeState}> {
  const validated=revalidateSolverInput(input);
  if(verifySolverSolution(validated.state,''))return {algorithm:'',tokens:[],initialState:validated.state};
  onPhase?.('initializing');
  const [{puzzles},{KPattern},{experimentalSolve3x3x3IgnoringCenters}]=await Promise.all([import('cubing/puzzles'),import('cubing/kpuzzle'),import('cubing/search')]);
  const kpuzzle=await puzzles['3x3x3'].kpuzzle(),data=structuredClone(kpuzzle.defaultPattern().patternData);
  data.CORNERS={pieces:[...validated.cubies.corners.pieces],orientation:[...validated.cubies.corners.orientation]};
  data.EDGES={pieces:[...validated.cubies.edges.pieces],orientation:[...validated.cubies.edges.orientation]};
  onPhase?.('solving');
  const algorithm=(await experimentalSolve3x3x3IgnoringCenters(new KPattern(kpuzzle,data))).toString();
  const tokens=solverTokens(algorithm);
  onPhase?.('verifying');
  if(!verifySolverSolution(validated.state,algorithm))throw new SolverFailure('verification-failed','Não foi possível confirmar a solução para as 54 cores informadas.');
  return {algorithm:tokens.join(' '),tokens,initialState:validated.state};
}
export function solverError(requestId:string,inputKey:string,error:unknown):SolverOutcome {
  return {kind:'error',requestId,inputKey,code:error instanceof SolverFailure?error.code:'calculation-failed',message:error instanceof SolverFailure?error.message:'Não foi possível calcular a solução. Tente novamente.'};
}
