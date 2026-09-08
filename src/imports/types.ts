import type { AppData, Penalty, StoredSolveMode } from '../domain/types';

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
