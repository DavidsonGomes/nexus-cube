import { COLORS, solved54, sourceSnapshot, type Facelets54 } from './solver-oracle-fixtures';

export type SolverMode = 'direct' | 'cfop' | 'roux';
export type StageId = 'direct-solved'|'cross'|'f2l-pairs'|'oll'|'pll'|'fb'|'sb'|'cmll'|'lse-eo'|'lse-lr'|'roux-solved';

export interface StageOracle {
  readonly mode: SolverMode;
  readonly stage: StageId;
  readonly fixedStickerIndices: readonly number[];
  readonly fixedCenters: readonly number[];
  readonly preservesInput: boolean;
  readonly requiresSolved54: boolean;
}

export const STAGE_ORACLES: readonly StageOracle[] = Object.freeze([
  { mode:'direct', stage:'direct-solved', fixedStickerIndices:Array.from({length:54},(_,i)=>i), fixedCenters:[4,13,22,31,40,49], preservesInput:true, requiresSolved54:true },
  { mode:'cfop', stage:'cross', fixedStickerIndices:[31,22,13,40,49], fixedCenters:[4,13,22,31,40,49], preservesInput:true, requiresSolved54:false },
  { mode:'cfop', stage:'f2l-pairs', fixedStickerIndices:[31,22,13,40,49], fixedCenters:[4,13,22,31,40,49], preservesInput:true, requiresSolved54:false },
  { mode:'cfop', stage:'oll', fixedStickerIndices:[4,13,22,31,40,49], fixedCenters:[4,13,22,31,40,49], preservesInput:true, requiresSolved54:false },
  { mode:'cfop', stage:'pll', fixedStickerIndices:[4,13,22,31,40,49], fixedCenters:[4,13,22,31,40,49], preservesInput:true, requiresSolved54:false },
  { mode:'roux', stage:'fb', fixedStickerIndices:[31,40,22,49], fixedCenters:[4,13,22,31,40,49], preservesInput:true, requiresSolved54:false },
  { mode:'roux', stage:'sb', fixedStickerIndices:[31,13,22,49], fixedCenters:[4,13,22,31,40,49], preservesInput:true, requiresSolved54:false },
  { mode:'roux', stage:'cmll', fixedStickerIndices:[0,1,2,9,10,11,18,19,20,27,28,29,36,37,38,45,46,47], fixedCenters:[4,13,22,31,40,49], preservesInput:true, requiresSolved54:false },
  { mode:'roux', stage:'lse-eo', fixedStickerIndices:[4,13,22,31,40,49], fixedCenters:[4,13,22,31,40,49], preservesInput:true, requiresSolved54:false },
  { mode:'roux', stage:'lse-lr', fixedStickerIndices:[4,13,22,31,40,49], fixedCenters:[4,13,22,31,40,49], preservesInput:true, requiresSolved54:false },
  { mode:'roux', stage:'roux-solved', fixedStickerIndices:Array.from({length:54},(_,i)=>i), fixedCenters:[4,13,22,31,40,49], preservesInput:true, requiresSolved54:true },
]);

export const SOLVED_STAGE_INPUT = Object.freeze(solved54());
export function stageSourceSnapshot(input:Facelets54):Facelets54 { return sourceSnapshot(input); }
export function stageSolved(input:Facelets54):boolean { return input.length===54 && input.every((sticker,index)=>sticker===COLORS[Math.floor(index/9)]); }
export function preservedInput(before:Facelets54,after:Facelets54):boolean { return JSON.stringify(before)===JSON.stringify(after); }
