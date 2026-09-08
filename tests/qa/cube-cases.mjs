// Oraculo abstrato independente. Nao importa codigo nem algoritmos do produto.
// Posicoes em ordem circular vista de U; orientacao 0 = sticker U na face U.
const rotate = (xs, n) => xs.map((_, i) => xs[(i + n) % 4]);
const minKey = keys => keys.sort()[0];
export function ollClass({ corners, edges }) {
  return minKey(Array.from({ length: 4 }, (_, n) => rotate(corners, n).join('') + '/' + rotate(edges, n).join('')));
}
export function pllClass({ corners, edges }) {
  const keys = [];
  for (let before = 0; before < 4; before++) {
    for (let after = 0; after < 4; after++) {
      const key = xs => rotate(xs, before).map(v => (v + after) % 4).join('');
      keys.push(key(corners) + '/' + key(edges));
    }
  }
  return minKey(keys);
}
export function ollStates() {
  const states = [];
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) {
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
      states.push({ corners: [a, b, c, (9 - a - b - c) % 3], edges: [x, y, z, (x + y + z) % 2] });
    }
  }
  return states;
}
const permutations = xs => xs.length ? xs.flatMap((x, i) => permutations(xs.filter((_, j) => i !== j)).map(rest => [x, ...rest])) : [[]];
const parity = xs => xs.reduce((sum, x, i) => sum + xs.slice(i + 1).filter(y => x > y).length, 0) % 2;
export function pllStates() {
  const perms = permutations([0, 1, 2, 3]);
  return perms.flatMap(corners => perms.filter(edges => parity(corners) === parity(edges)).map(edges => ({ corners, edges })));
}
export const ollCoverage = new Map(ollStates().map(state => [ollClass(state), state]));
export const pllCoverage = new Map(pllStates().map(state => [pllClass(state), state]));
ollCoverage.delete(ollClass({ corners: [0, 0, 0, 0], edges: [0, 0, 0, 0] }));
pllCoverage.delete(pllClass({ corners: [0, 1, 2, 3], edges: [0, 1, 2, 3] }));
