import type { CubeState, Face } from '../domain/types';
import type { MethodPlan, MethodStageId } from './methods/types';

export type SolverIndex = 0|1|2|3|4|5|6|7|8;
/** V2 binds the unchanged axes to the corrected Y/O/G/W/R/B physical color scheme. */
export type SolverFrame = 'URFDLB-fixed-v2';
export interface SolverSlot { readonly face: Face; readonly index: SolverIndex }
/** Each face is row-major, viewed from outside; index 4 is its fixed center. */
export type DraftFacelets = Readonly<Record<Face, readonly (Face|null)[]>>;
export type SolverIssueCode = 'invalid-shape'|'invalid-color'|'incomplete'|'color-count'|'center-mismatch'|'invalid-piece'|'duplicate-piece'|'corner-twist'|'edge-flip'|'permutation-parity';
export interface SolverIssue {
  readonly code: SolverIssueCode;
  readonly scope: 'slot'|'piece'|'cube';
  /** Associated positions, never a claim that one sticker caused the error. */
  readonly slots: readonly SolverSlot[];
  readonly message: string;
  readonly counts?: Readonly<Record<Face, number>>;
  readonly expected?: 9;
}
export interface SolverCubies {
  readonly corners: { readonly pieces: readonly number[]; readonly orientation: readonly number[] };
  readonly edges: { readonly pieces: readonly number[]; readonly orientation: readonly number[] };
}
export interface ValidatedSolverInput {
  readonly kind: 'valid';
  readonly inputKey: string;
  readonly facelets: DraftFacelets;
  readonly state: CubeState;
  readonly cubies: SolverCubies;
}
export type SolverValidation = ValidatedSolverInput | { readonly kind: 'incomplete'|'invalid'; readonly issues: readonly SolverIssue[] };
export type SolverPhase = 'initializing'|'solving'|'verifying';
export type SolverErrorCode = 'invalid-input'|'input-key-mismatch'|'worker-unavailable'|'worker-error'|'invalid-response'|'calculation-failed'|'verification-failed'|'search-limit'|'timeout'|'disposed';
export type SolverMode='direct'|'cfop'|'roux';
export interface SolverRequest { readonly requestId: string; readonly validated: ValidatedSolverInput; readonly method?:SolverMode }
export interface SolverIdentity { readonly requestId: string; readonly inputKey: string }
type SolverSolution = SolverIdentity & { readonly kind:'solution'; readonly algorithm:string; readonly tokens:readonly string[]; readonly initialState:CubeState };
export type SolverOutcome = (SolverSolution & {readonly method:'direct'; readonly plan?:never})
  | (SolverSolution & {readonly method:'cfop'|'roux';readonly plan:MethodPlan})
  | (SolverIdentity & { readonly kind:'cancelled' })
  | (SolverIdentity & { readonly kind:'error'; readonly code:SolverErrorCode; readonly message:string });
export type SolverProgress = SolverIdentity & { readonly kind:'progress'; readonly phase:SolverPhase;readonly method?:SolverMode;readonly stageId?:MethodStageId };
export interface SolverOptions { signal?: AbortSignal; onProgress?: (progress:SolverProgress)=>void }
export interface SolverClient {
  solve(request:SolverRequest, options?:SolverOptions):Promise<SolverOutcome>;
  cancel():void;
  dispose():void;
}
export interface SolverWorkerRequest extends SolverIdentity { readonly protocol:1; readonly kind:'solve'; readonly frame:SolverFrame; readonly facelets:DraftFacelets;readonly method?:SolverMode }
export interface SolverWorkerCancel extends SolverIdentity { readonly protocol:1; readonly kind:'cancel' }
export type SolverWorkerResponse = (SolverProgress|SolverOutcome) & { readonly protocol:1 };
