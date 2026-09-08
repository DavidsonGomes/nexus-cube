import type { CubeState } from '../../domain/types';
import type { SolverFrame, ValidatedSolverInput } from '../types';

export type SolverMethod='cfop'|'roux';
export type F2LSlot='FR'|'FL'|'BR'|'BL';
export type MethodStageId='cfop.cross'|`cfop.f2l.${F2LSlot}`|'cfop.oll'|'cfop.pll'|'cfop.auf'|'roux.fb'|'roux.sb'|'roux.cmll'|'roux.cmll-auf'|'roux.eo'|'roux.lr'|'roux.finish';
export type MethodGoal={kind:'cross'|'f2l'|'oll'|'pll-up-to-auf'|'first-block'|'second-block'|'cmll'|'cmll-up-to-auf'|'lse-eo'|'lse-lr'|'solved'}|{kind:'f2l-pair';slot:F2LSlot};
export interface MethodAdjustment {
  kind:'auf'|'rotation';algorithm:string;explanation:string;
  /** Global movement indices: apply tokens[startStep:endStep]. */
  startStep:number;endStep:number;
}
export interface MethodStage {
  id:MethodStageId;title:string;explanation:string;goal:MethodGoal;
  referenceFrame:SolverFrame;centerPolicy:'fixed'|'m-slice-even'|'free';
  /** Solved piece identities such as DF, DFR, UL. Preserved at both endpoints, not every move. */
  preservedPieces:readonly string[];
  initialState:CubeState;finalState:CubeState;
  algorithm:string;tokens:readonly string[];startStep:number;endStep:number;
  adjustments:readonly MethodAdjustment[];
  matchedCaseId?:string;
}
export interface MethodPlan {
  version:1;method:SolverMethod;inputKey:string;referenceFrame:SolverFrame;
  initialState:CubeState;finalState:CubeState;algorithm:string;tokens:readonly string[];stages:readonly MethodStage[];
}
export interface MethodPlannerOptions {signal?:AbortSignal;onStage?:(stage:MethodStage)=>void}
export type MethodPlanner=(input:ValidatedSolverInput,options?:MethodPlannerOptions)=>Promise<MethodPlan>;
export interface MethodStageSpec {
  id:MethodStageId;title:string;explanation:string;goal:MethodGoal;
  preservedPieces?:readonly string[];centerPolicy?:MethodStage['centerPolicy'];matchedCaseId?:string;
  /** Indices here are local to this stage; the builder converts to global indices. */
  adjustments?:readonly MethodAdjustment[];
}
