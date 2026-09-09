import { parseAlgorithm } from '../../domain/cube';

/** Peephole cleanup applied to emitted sequences only, never to the search itself.
 * Adjacent turns of the same layer letter (parseAlgorithm normal form, wide moves lowercase)
 * compose modulo four and identities disappear, cascading through the stack; this cancels
 * adjacent inverses, merges doubles and drops redundant rotations such as y' y y2.
 * The result is the same permutation by construction. No global optimality is implied,
 * and a net rotation or slice left at the end is kept because the final state must match.
 */
const QUARTER_TURNS: Record<string, number> = { '': 1, '2': 2, "'": 3 };
const SUFFIX = ['', '', '2', "'"] as const;

export function simplifySolverAlgorithm(algorithm: string): string {
  const stack: { letter: string; turns: number }[] = [];
  for (const token of parseAlgorithm(algorithm)) {
    const letter = token[0], turns = QUARTER_TURNS[token.slice(1)];
    if (turns === undefined) throw new Error(`Movimento não suportado na simplificação: ${token}`);
    const top = stack[stack.length - 1];
    if (top && top.letter === letter) {
      top.turns = (top.turns + turns) % 4;
      if (top.turns === 0) stack.pop();
    } else {
      stack.push({ letter, turns });
    }
  }
  return stack.map(({ letter, turns }) => letter + SUFFIX[turns]).join(' ');
}
