import { applyAlgorithm, invertAlgorithm, parseAlgorithm, solvedCube } from '../../domain/cube';
import { methodStateKey } from '../../solver/methods/plan';

const solved = solvedCube();
const LETTERS = 'URFDLBMESxyzurfdlb'.split('');
const SUFFIXES = ['', '2', "'"] as const;
const ALL_TOKENS = LETTERS.flatMap(letter => SUFFIXES.map(suffix => `${letter}${suffix}`));
const tokenKeys = new Map(ALL_TOKENS.map(token => [methodStateKey(applyAlgorithm(solved, token)), token]));
const remapCache = new Map<string, string>();

function remapToken(token: string, rotationPrefix: readonly string[]): string {
  if (!rotationPrefix.length) return token;
  const prefix = rotationPrefix.join(' ');
  const cacheKey = `${methodStateKey(applyAlgorithm(solved, prefix))}|${token}`;
  const cached = remapCache.get(cacheKey);
  if (cached) return cached;
  const conjugated = methodStateKey(applyAlgorithm(solved, `${prefix} ${token} ${invertAlgorithm(prefix)}`));
  const mapped = tokenKeys.get(conjugated);
  if (!mapped) throw new Error(`Movimento sem equivalente sob a rotação: ${token} sob ${prefix}`);
  remapCache.set(cacheKey, mapped);
  return mapped;
}

/** Rewrites a sequence with zero net rotation into the SAME permutation without any rotation
 * token: each move is replaced by its conjugate under the rotations seen so far, and the
 * equivalences are found by state matching against the whole move alphabet, never by a
 * hand-written table. A sequence whose net rotation is not identity is refused, because the
 * centers would end elsewhere and no rotationless spelling exists.
 */
export function deRotateAlgorithm(algorithm: string): string {
  const rotationPrefix: string[] = [];
  const output: string[] = [];
  for (const token of parseAlgorithm(algorithm)) {
    if (/^[xyz]/.test(token)) { rotationPrefix.push(token); continue; }
    output.push(remapToken(token, rotationPrefix));
  }
  if (rotationPrefix.length && methodStateKey(applyAlgorithm(solved, rotationPrefix.join(' '))) !== methodStateKey(solved)) {
    throw new Error('Sequência com rotação líquida não tem variante sem rotação.');
  }
  return output.join(' ');
}
