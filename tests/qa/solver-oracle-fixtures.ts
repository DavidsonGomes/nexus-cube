/** Independent 54-sticker oracle fixtures. No solver/encoder imports. */
export type Sticker = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';
export type Facelets54 = readonly Sticker[];
export const COLORS: readonly Sticker[] = ['U', 'R', 'F', 'D', 'L', 'B'];
export const CENTERS = Object.freeze({ U: 4, R: 13, F: 22, D: 31, L: 40, B: 49 });

export function solved54(): Sticker[] {
  return COLORS.flatMap(color => Array<Sticker>(9).fill(color));
}
function mutate(source: Facelets54, swaps: readonly [number, number][], cycles: readonly number[][] = []): Sticker[] {
  const next = [...source];
  for (const [a, b] of swaps) [next[a], next[b]] = [next[b], next[a]];
  for (const cycle of cycles) {
    const values = cycle.map(index => next[index]);
    cycle.forEach((index, i) => { next[index] = values[(i + cycle.length - 1) % cycle.length]; });
  }
  return next;
}

export const SOLVED = Object.freeze(solved54());
export const ONE_EDGE_FLIP = Object.freeze(mutate(SOLVED, [[1, 19]]));
export const ONE_CORNER_TWIST = Object.freeze(mutate(SOLVED, [], [[0, 9, 18]]));
export const MIRRORED_CORNER = Object.freeze(mutate(SOLVED, [[0, 19], [9, 20], [18, 1]]));
export const SWAPPED_EDGE_PARITY = Object.freeze(mutate(SOLVED, [[1, 19], [7, 10]]));
export const BAD_COLOR_COUNT = Object.freeze(mutate(SOLVED, [[0, 1], [9, 10]]).map((value, index) => index === 0 ? 'R' as Sticker : value));
export const BAD_CENTER = Object.freeze(mutate(SOLVED, [[4, 13]]));
export const MISSING_STICKER = Object.freeze(SOLVED.slice(0, 53));

export type SolverFixture = Readonly<{ id: string; state: Facelets54; expected: { shape: boolean; colorCounts: boolean; centers: boolean; legal: boolean } }>;
export const SOLVER_FIXTURES: readonly SolverFixture[] = Object.freeze([
  { id: 'solved', state: SOLVED, expected: { shape: true, colorCounts: true, centers: true, legal: true } },
  { id: 'one-edge-flip', state: ONE_EDGE_FLIP, expected: { shape: true, colorCounts: true, centers: true, legal: false } },
  { id: 'one-corner-twist', state: ONE_CORNER_TWIST, expected: { shape: true, colorCounts: true, centers: true, legal: false } },
  { id: 'mirrored-corner', state: MIRRORED_CORNER, expected: { shape: true, colorCounts: true, centers: true, legal: false } },
  { id: 'swapped-edge-parity', state: SWAPPED_EDGE_PARITY, expected: { shape: true, colorCounts: true, centers: true, legal: false } },
  { id: 'bad-color-count', state: BAD_COLOR_COUNT, expected: { shape: true, colorCounts: false, centers: true, legal: false } },
  { id: 'bad-center', state: BAD_CENTER, expected: { shape: true, colorCounts: true, centers: false, legal: false } },
  { id: 'missing-sticker', state: MISSING_STICKER, expected: { shape: false, colorCounts: false, centers: false, legal: false } },
]);

export function independentShape(state: Facelets54): boolean { return state.length === 54 && state.every(sticker => COLORS.includes(sticker)); }
export function independentColorCounts(state: Facelets54): boolean { return COLORS.every(color => state.filter(sticker => sticker === color).length === 9); }
export function independentCenters(state: Facelets54): boolean { return independentShape(state) && COLORS.every(color => state[CENTERS[color]] === color); }
export function sourceSnapshot(state: Facelets54): Facelets54 { return Object.freeze([...state]); }
export function sourceUnchanged(before: Facelets54, after: Facelets54): boolean { return JSON.stringify(before) === JSON.stringify(after); }
