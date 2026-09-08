import { applyAlgorithm, solvedCube } from '../../../domain/cube';
import type { CubeState, Sticker } from '../../../domain/types';
import { createAnchorModel } from '../anchors';
import { methodCheckpoint } from '../plan';
import type { MethodPlannerOptions } from '../types';

// Roux-only abstract search. A labelled sticker locates and orients its whole piece.
// Transition tables are derived from the existing geometric engine, never a second move model.
const geometry = solvedCube();
const kind = (s: Sticker) => s.position.filter(n => n !== 0).length;
const pose = (s: Sticker) => `${s.position}:${s.normal}`;
export const turns = (faces: string) => [...faces].flatMap(f => [f, `${f}'`, `${f}2`]);

export class RouxSearchLimit extends Error {
  constructor() { super('Não foi possível concluir este plano Roux dentro do limite de busca. O estado informado continua válido.'); this.name = 'RouxSearchLimit'; }
}
export interface SearchContext { options: MethodPlannerOptions; nodes: number; limit: number; deadline: number }
export function searchContext(options: MethodPlannerOptions): SearchContext {
  return { options, nodes: 0, limit: 30_000_000, deadline: performance.now() + 90_000 };
}
export async function checkpoint(context: SearchContext) {
  await methodCheckpoint(context.options);
  if (context.nodes > context.limit || performance.now() > context.deadline) throw new RouxSearchLimit();
}
export interface Projection {
  ids: string[]; sizes: number[]; targets: number[]; moves: readonly string[];
  transitions: (readonly Uint8Array[])[];
  read(state: CubeState): number[];
  onYAxis(index: number, value: number): boolean;
}
export function projection(pieces: readonly string[], moves: readonly string[]): Projection {
  const edge = createAnchorModel('edge', moves), corner = createAnchorModel('corner', moves);
  // The common model has no center orbit. Roux tracks its six center poses locally.
  const centers = geometry.filter(s => kind(s) === 1), centerIndex = new Map(centers.map((s, i) => [pose(s), i]));
  const centerTransitions = moves.map(move => Uint8Array.from(applyAlgorithm(centers, move).map(s => centerIndex.get(pose(s))!)));
  const centerLocate = (state: CubeState, piece: string) => {
    const s = state.find(s => s.id === `${piece}4`), value = s && centerIndex.get(pose(s));
    if (value === undefined) throw new Error('Centro ausente no estado Roux.');
    return value;
  };
  const models = pieces.map(piece => piece.length === 2 ? edge : piece.length === 3 ? corner : null);
  const yAxis = [edge, corner].map(model => {
    const result = new Set<number>();
    for (const s of geometry.filter(s => kind(s) === (model.kind === 'edge' ? 2 : 3) && Math.abs(s.normal[1]) === 1)) {
      const piece = s.color + geometry.filter(t => String(t.position) === String(s.position) && t.color !== s.color).map(t => t.color).join('');
      result.add(model.goal(piece));
    }
    return result;
  });
  return {
    ids: [...pieces], sizes: pieces.map(piece => piece.length === 1 ? 6 : 24),
    targets: pieces.map((piece, i) => models[i]?.goal(piece) ?? centerLocate(geometry, piece)), moves,
    transitions: models.map(model => model?.transitions ?? centerTransitions),
    onYAxis(index, value) { return models[index] ? yAxis[models[index]!.kind === 'edge' ? 0 : 1].has(value) : Math.abs(centers[value].normal[1]) === 1; },
    read(state) { return pieces.map((piece, i) => models[i]?.locate(state, piece) ?? centerLocate(state, piece)); },
  };
}

/** The finite U/M subgroup: each search stops at its own EO, LR or final goal. */
export async function searchLSE(state: CubeState, goal: 'eo' | 'lr' | 'finish', context: SearchContext): Promise<string> {
  const p = projection(['UF', 'UR', 'UB', 'UL', 'DF', 'DB', 'UFR', 'U'], turns('UM'));
  const key = (s: readonly number[]) => String.fromCharCode(...s);
  const satisfies = (s: readonly number[]) => {
    if (goal === 'finish') return s.every((v, i) => v === p.targets[i]);
    if (s[6] !== p.targets[6] || !p.onYAxis(7, s[7])) return false;
    if (!s.slice(0, 6).every((v, i) => p.onYAxis(i, v))) return false;
    return goal === 'eo' || (s[1] === p.targets[1] && s[3] === p.targets[3]);
  };
  const start = p.read(state);
  if (satisfies(start)) return '';
  const states: number[][] = [start], parents: number[] = [-1], via: number[] = [-1];
  const seen = new Set([key(start)]);
  for (let head = 0; head < states.length; head++) {
    if ((head & 2047) === 0) await checkpoint(context);
    context.nodes++;
    if (states.length > 400_000) throw new RouxSearchLimit();
    const current = states[head];
    for (let m = 0; m < p.moves.length; m++) {
      if (via[head] >= 0 && p.moves[m][0] === p.moves[via[head]][0]) continue;
      const next = current.map((v, i) => p.transitions[i][m][v]);
      const code = key(next);
      if (seen.has(code)) continue;
      const index = states.length; seen.add(code); states.push(next); parents.push(head); via.push(m);
      if (satisfies(next)) {
        const path: string[] = [];
        for (let at = index; parents[at] >= 0; at = parents[at]) path.push(p.moves[via[at]]);
        return path.reverse().join(' ');
      }
    }
  }
  throw new Error('O estado não pertence ao subgrupo LSE esperado após CMLL.');
}
interface PatternTable { indices: readonly number[]; distances: Uint8Array; key(state: readonly number[]): number }
async function patternTable(p: Projection, indices: readonly number[], context: SearchContext): Promise<PatternTable> {
  const size = indices.reduce((n, i) => n * p.sizes[i], 1);
  const key = (state: readonly number[]) => indices.reduce((n, i) => n * p.sizes[i] + state[i], 0);
  const distances = new Uint8Array(size).fill(255), queue = new Uint32Array(size);
  const target = key(p.targets); distances[target] = 0; queue[0] = target;
  let end = 1;
  for (let head = 0; head < end; head++) {
    if ((head & 4095) === 0) await checkpoint(context);
    context.nodes++;
    const code = queue[head], values: number[] = []; let rest = code;
    for (let j = indices.length - 1; j >= 0; j--) { values[j] = rest % p.sizes[indices[j]]; rest = Math.floor(rest / p.sizes[indices[j]]); }
    for (let m = 0; m < p.moves.length; m++) {
      let next = 0;
      for (let j = 0; j < indices.length; j++) { const i = indices[j]; next = next * p.sizes[i] + p.transitions[i][m][values[j]]; }
      if (distances[next] === 255) { distances[next] = distances[code] + 1; queue[end++] = next; }
    }
  }
  return { indices, distances, key };
}

/** IDA* on just the block pieces. No solved-cube sequence is requested or sliced. */
export async function searchBlock(state: CubeState, pieces: readonly string[], moves: readonly string[], context: SearchContext): Promise<string> {
  const p = projection(pieces, moves), initial = p.read(state);
  if (initial.every((v, i) => v === p.targets[i])) return '';
  const groups = [[0, 1, 2], [3, 4, 0], [3, 4, 1], [3, 4, 2]];
  for (let i = 5; i < pieces.length; i++) groups.push([i]);
  const tables: PatternTable[] = [];
  for (const group of groups) tables.push(await patternTable(p, group, context));
  const estimate = (s: readonly number[]) => Math.max(...tables.map(t => t.distances[t.key(s)]));
  const path: number[] = [], states = Array.from({ length: 25 }, () => Array<number>(pieces.length).fill(0));
  states[0] = initial;
  function* visit(depth: number, bound: number, previous: number): Generator<void, boolean> {
    context.nodes++;
    if ((context.nodes & 8191) === 0) yield;
    const current = states[depth], h = estimate(current);
    if (h > bound - depth) return false;
    if (h === 0) return true;
    if (depth === bound) return false;
    for (let m = 0; m < moves.length; m++) {
      if (previous >= 0 && moves[m][0] === moves[previous][0]) continue;
      const next = states[depth + 1];
      for (let i = 0; i < pieces.length; i++) next[i] = p.transitions[i][m][current[i]];
      path[depth] = m;
      if (yield* visit(depth + 1, bound, m)) return true;
    }
    return false;
  }
  for (let bound = estimate(initial); bound <= 23; bound++) {
    await checkpoint(context);
    const iterator = visit(0, bound, -1);
    let result = iterator.next();
    while (!result.done) { await checkpoint(context); result = iterator.next(); }
    if (result.value) return path.slice(0, bound).map(m => moves[m]).join(' ');
  }
  throw new RouxSearchLimit();
}
