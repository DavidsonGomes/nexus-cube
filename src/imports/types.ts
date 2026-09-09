import type { AppData, Penalty, StoredSolveMode } from '../domain/types';
import type { ImportPlanningService } from './plan-types';

export type ImportFormat = 'nexus-backup' | 'cstimer-json' | 'cube-timer-sqlite';
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key:string]:JsonValue };
export interface ImportIssue {
  code:string;
  severity:'blocking' | 'decision' | 'informational';
  sourceKey:string | null;
  message:string;
}
export interface ImportOrigin {
  kind:'imported';
  format:ImportFormat;
  variant:string;
  captureSource:'timer' | 'manual' | 'unknown';
}
export interface ImportedSessionCandidate {
  sourceKey:string;
  sourceOrder:number;
  name:string | null;
  createdAt:string | null;
  mode:StoredSolveMode;
  modeEvidence:'source-explicit' | 'absent';
  original:JsonValue;
}
export interface ImportedSolveCandidate {
  sourceKey:string;
  sourceSessionKey:string | null;
  sourceOrder:number;
  rawMs:number | null;
  penalty:Penalty | null;
  scramble:string | null;
  note:string | null;
  createdAt:string | null;
  mode:StoredSolveMode;
  puzzle:'333' | 'other' | 'unknown';
  origin:ImportOrigin;
  original:JsonValue;
}
export interface ImportedAuxiliaryRecord {
  sourceKey:string;
  table:string;
  original:JsonValue;
}
export interface ParsedImport {
  kind:'parsed';
  format:ImportFormat;
  variant:string;
  sessions:ImportedSessionCandidate[];
  solves:ImportedSolveCandidate[];
  auxiliary:ImportedAuxiliaryRecord[];
  metadata:JsonValue;
  issues:ImportIssue[];
  /** Only Nexus already has a compatible full snapshot. No implicit persistence. */
  nexusData?:AppData;
}
export type ImportParseResult = ParsedImport
  | {kind:'invalid';issues:ImportIssue[]}
  | {kind:'unrecognized';reason:string}
  | {kind:'requires-sqlite-reader';format:'cube-timer-sqlite';reason:string};

/** Projection from a future local read-only SQLite worker. Never raw SQL. */
export interface CubeTimerProjection {
  userVersion:number;
  tables:Record<string,Record<string,JsonValue>[]>;
}

declare const importSourceBrand: unique symbol;
/** Local authority only. Serialization or cloning cannot reconstruct a handle. */
export interface ImportSourceHandle { readonly [importSourceBrand]: true }
export interface InspectedImportSource {
  kind:'inspected';
  sourceHandle:ImportSourceHandle;
  byteLength:number;
  /** SHA256 of the exact file bytes, not a semantic digest or consent. */
  rawSHA256:string;
  /** Null for invalid/unrecognized input and SQLite awaiting its reader. */
  semanticSHA256:string|null;
  parserVersion:string;
  result:ImportParseResult;
}
export type ImportInspectionResult = InspectedImportSource
  | {kind:'cancelled'|'closed'|'source-limit'|'retention-limit'|'inspection-error'};
export interface ImportInspectionService extends ImportPlanningService {
  inspect(source:Uint8Array, options?:{signal?:AbortSignal}):Promise<ImportInspectionResult>;
  /** Each successful read returns an independent copy. Invalid/released handles return null. */
  readSourceBytes(handle:ImportSourceHandle):Uint8Array|null;
  readParseResult(handle:ImportSourceHandle):ImportParseResult|null;
  releaseSource(handle:ImportSourceHandle):boolean;
  dispose():void;
}
