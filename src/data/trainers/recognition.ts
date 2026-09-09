import { applyAlgorithm, solvedCube } from '../../domain/cube';
import { U_CORNERS, arePiecesSolved, pieceStickerIds } from '../../domain/stage-validation';
import type { CubeState } from '../../domain/types';

export interface RecognitionClassifier {
  readonly id: string;
  readonly optionIds: readonly string[];
  readonly classify: (state: CubeState) => string;
}

const AUF = ['', 'U', 'U2', "U'"] as const;
const U_EDGES = ['UF', 'UR', 'UB', 'UL'] as const;
const U_EDGE_POSITIONS: readonly (readonly [number, number, number])[] = [[0, 1, 1], [1, 1, 0], [0, 1, -1], [-1, 1, 0]];

function orientedUpAt(state: CubeState, position: readonly [number, number, number]): boolean {
  const top = state.find(sticker => String(sticker.position) === String(position) && sticker.normal[1] === 1);
  if (!top) throw new Error('Posição de aresta superior sem adesivo para cima.');
  return top.color === 'U';
}
function pairShape(a: readonly [number, number, number], b: readonly [number, number, number]): 'adjacent' | 'opposite' {
  return a[0] + b[0] === 0 && a[2] + b[2] === 0 ? 'opposite' : 'adjacent';
}

const upperCornerHomes = (() => {
  const solved = solvedCube();
  return U_CORNERS.map(piece => {
    const ids = pieceStickerIds([piece]);
    return { piece, ids, home: String(solved.find(sticker => ids.includes(sticker.id))!.position) };
  });
})();
/** Canonical names of the upper corners sitting in their exact home cell, twist ignored. */
export function placedUpperCorners(state: CubeState): string[] {
  return upperCornerHomes
    .filter(({ ids, home }) => state.filter(sticker => ids.includes(sticker.id)).every(sticker => String(sticker.position) === home))
    .map(({ piece }) => piece);
}

/** Registered domain classifiers for app-verified recognition (spec item 8). Each computes
 * the single correct option for a state; generators only ship states whose classification
 * falls inside the fixture's declared options.
 */
export const RECOGNITION_CLASSIFIERS: readonly RecognitionClassifier[] = [
  {
    id: 'll-edge-orientation-pattern',
    optionIds: ['dot', 'hook', 'line', 'cross'],
    classify(state) {
      const oriented = U_EDGE_POSITIONS.filter(position => orientedUpAt(state, position));
      if (oriented.length === 0) return 'dot';
      if (oriented.length === 4) return 'cross';
      if (oriented.length !== 2) throw new Error('Orientação de arestas com paridade ilegal.');
      return pairShape(oriented[0], oriented[1]) === 'opposite' ? 'line' : 'hook';
    },
  },
  {
    id: 'u-edge-match-shape',
    optionIds: ['solved', 'adjacent', 'opposite', 'none'],
    classify(state) {
      let best: { count: number; shape: 'adjacent' | 'opposite' | null } = { count: -1, shape: null };
      for (const u of AUF) {
        const turned = applyAlgorithm(state, u);
        const matched = U_EDGES.filter(edge => arePiecesSolved(turned, [edge]));
        if (matched.length <= best.count) continue;
        const positions = matched.map(edge => U_EDGE_POSITIONS[U_EDGES.indexOf(edge)]);
        best = { count: matched.length, shape: matched.length === 2 ? pairShape(positions[0], positions[1]) : null };
      }
      if (best.count === 4) return 'solved';
      if (best.count === 2) return best.shape!;
      return 'none';
    },
  },
  {
    id: 'u-corner-placed-spot',
    optionIds: ['ufr', 'urb', 'ubl', 'ulf', 'none', 'multiple'],
    classify(state) {
      const placed = placedUpperCorners(state);
      if (placed.length === 0) return 'none';
      if (placed.length === 1) return placed[0].toLowerCase();
      return 'multiple';
    },
  },
];
const byId = new Map(RECOGNITION_CLASSIFIERS.map(classifier => [classifier.id, classifier]));

/** Extension point for classifiers with heavier construction (case-identification tables);
 * registering the same id twice must be the identical intent and is rejected otherwise.
 */
export function registerRecognitionClassifier(classifier: RecognitionClassifier): void {
  const existing = byId.get(classifier.id);
  if (existing && existing !== classifier) throw new Error(`Classificador já registrado com outro conteúdo: ${classifier.id}`);
  byId.set(classifier.id, classifier);
}

export function classifyRecognition(classifierId: string, state: CubeState): string {
  const classifier = byId.get(classifierId);
  if (!classifier) throw new Error(`Classificador de reconhecimento desconhecido: ${classifierId}`);
  return classifier.classify(state);
}
