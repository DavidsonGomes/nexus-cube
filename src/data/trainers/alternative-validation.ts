import { applyAlgorithm, parseAlgorithm } from '../../domain/cube';
import { validateStage } from '../../domain/stage-validation';
import { getContent } from '../../domain/catalog';
import type { CubeState, ValidationSpec } from '../../domain/types';

const MAX_ALTERNATIVE_TOKENS = 256;

export type AlternativeVerdict =
  | { readonly valid: true; readonly tokens: readonly string[] }
  | { readonly valid: false; readonly reason: 'invalid-notation' | 'too-long' | 'goal-not-reached' };

/** Lab and case-editor contract (spec items 15 and 16): an alternative is valid when,
 * applied to the case's start state, it reaches the case's own validation goal with its
 * declared preservations; the grammar and the stage rules are the shared domain ones,
 * nothing is re-specified here. No judgment of style or length is implied.
 */
export function validateCaseAlternative(item: { readonly initialState: CubeState; readonly validation: ValidationSpec }, algorithm: string): AlternativeVerdict {
  let tokens: readonly string[];
  try { tokens = parseAlgorithm(algorithm); } catch { return { valid: false, reason: 'invalid-notation' }; }
  if (tokens.length > MAX_ALTERNATIVE_TOKENS) return { valid: false, reason: 'too-long' };
  const after = applyAlgorithm(item.initialState, tokens.join(' '));
  if (!validateStage(after, item.validation)) return { valid: false, reason: 'goal-not-reached' };
  return { valid: true, tokens };
}

export function validateAlternativeById(contentId: string, algorithm: string): AlternativeVerdict {
  return validateCaseAlternative(getContent(contentId), algorithm);
}
